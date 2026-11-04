import { Router } from "express";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import { createReadStream, existsSync } from "fs";
import path from "path";
import { requireStaff, requireAuth } from "./auth.js";
import { newAccessCode, hashAccessCode, newVisitLabel } from "./security.js";
import { audit } from "./audit.js";
import { resolvePatient } from "./patients.js";

export const STATUS = {
  WAITING: "Waiting", IN_CONSULT: "In consult", LABS_PENDING: "Labs pending", FOLLOW_UP: "Follow-up",
  DONE: "Done", CANCELLED: "Cancelled", NO_SHOW: "No-show",
};
const STATUS_IN = Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [v, k]));
const ACTIVE = ["WAITING", "IN_CONSULT", "LABS_PENDING", "FOLLOW_UP"];
const CLOSED = ["DONE", "CANCELLED", "NO_SHOW"];
const MAX_FILE_BYTES = 10 * 1024 * 1024;
// checked against the file's first bytes, not the client-declared type
const SIGNATURES = [
  { mime: "application/pdf", ext: ".pdf", magic: [0x25, 0x50, 0x44, 0x46] },
  { mime: "image/png", ext: ".png", magic: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/jpeg", ext: ".jpg", magic: [0xff, 0xd8, 0xff] },
];
const MIN_SAMPLES = 3; // below this, no wait estimate is shown rather than a made-up one

const ttlMs = () => Number(process.env.PATIENT_ACCESS_TTL_HOURS || 72) * 36e5;
const afterDoneMs = () => Number(process.env.PATIENT_ACCESS_AFTER_DONE_HOURS || 24) * 36e5;
const safeName = (s) => String(s).replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "file";
const bad = (res, msg) => res.status(400).json({ error: msg });
const isUuid = (s) => /^[0-9a-f-]{36}$/i.test(String(s));

const msgOut = (m) => ({ id: m.id, from: m.sender === "DOCTOR" ? "doctor" : "patient", text: m.text, ts: m.createdAt.getTime() });
const labOut = (l) => ({ id: l.id, visitId: l.visitId, filename: l.filename, note: l.note, ts: l.createdAt.getTime(), stored: !!l.storageKey, sizeBytes: l.sizeBytes });

async function issueAccess(tx, visitId) {
  const code = newAccessCode();
  const expiresAt = new Date(Date.now() + ttlMs());
  await tx.visitAccess.create({ data: { visitId, codeHash: hashAccessCode(code), expiresAt } });
  return { accessCode: code, accessExpiresAt: expiresAt.getTime() };
}

/** Creates a WAITING visit with a fresh label, its first status event and an access code. Run inside a transaction. */
export async function createVisit(tx, { hospitalId, patientId, doctorId, priority = false, actorUserId }) {
  let visit;
  for (let i = 0; !visit; i++) {
    const label = newVisitLabel();
    if (await tx.visit.findFirst({ where: { hospitalId, label } })) { if (i > 50) throw new Error("No free visit label"); continue; }
    visit = await tx.visit.create({ data: { hospitalId, patientId, doctorId, label, priority } });
  }
  await tx.visitStatusEvent.create({ data: { visitId: visit.id, toStatus: "WAITING", actorUserId } });
  return { visit, ...(await issueAccess(tx, visit.id)) };
}

/** Status change with history, consult timing and access-window cap for closed visits. Run inside a transaction. */
async function changeStatus(tx, visit, to, actorUserId) {
  if (visit.status === to) return visit;
  const now = new Date();
  const timing = {};
  if (to === "IN_CONSULT") Object.assign(timing, { consultStartedAt: now, consultEndedAt: null });
  else if (visit.status === "IN_CONSULT") timing.consultEndedAt = now;
  const u = await tx.visit.update({ where: { id: visit.id }, data: { status: to, ...timing } });
  await tx.visitStatusEvent.create({ data: { visitId: visit.id, fromStatus: visit.status, toStatus: to, actorUserId } });
  // a finished visit must not stay reachable for the full code lifetime
  if (CLOSED.includes(to)) {
    const cap = new Date(Date.now() + afterDoneMs());
    await tx.visitAccess.updateMany({ where: { visitId: visit.id, revokedAt: null, expiresAt: { gt: cap } }, data: { expiresAt: cap } });
  }
  return u;
}

/**
 * Waiting-queue position per visit and an estimate built only from this hospital's own consult times
 * over the last 30 days. Estimate is null when there is too little history.
 */
async function queueInfo(db, hospitalId) {
  const [waiting, inConsult, stats] = await Promise.all([
    db.visit.findMany({ where: { hospitalId, status: "WAITING" }, orderBy: [{ priority: "desc" }, { checkedInAt: "asc" }], select: { id: true, doctorId: true } }),
    db.visit.groupBy({ by: ["doctorId"], where: { hospitalId, status: "IN_CONSULT" }, _count: true }),
    db.$queryRaw`
      SELECT "doctorId", AVG(EXTRACT(EPOCH FROM ("consultEndedAt" - "consultStartedAt"))) / 60 AS mins, COUNT(*)::int AS n
      FROM "Visit"
      WHERE "hospitalId" = ${hospitalId}::uuid AND "consultEndedAt" > now() - interval '30 days' AND "consultStartedAt" IS NOT NULL
      GROUP BY "doctorId"`,
  ]);
  const avg = Object.fromEntries(stats.filter((s) => s.n >= MIN_SAMPLES).map((s) => [s.doctorId, Number(s.mins)]));
  const busy = Object.fromEntries(inConsult.map((g) => [g.doctorId, g._count]));
  const seen = {}, out = {};
  for (const v of waiting) {
    const ahead = seen[v.doctorId] = (seen[v.doctorId] ?? -1) + 1;
    const per = avg[v.doctorId];
    out[v.id] = {
      position: ahead + 1, ahead,
      estimateMinutes: per === undefined ? null : Math.round((ahead + (busy[v.doctorId] || 0)) * per),
    };
  }
  return out;
}

export function visitRoutes(db, { notify, storageDir }) {
  const r = Router();

  /** Loads a visit only if the caller may see it; otherwise null (callers answer 404, never 403, to avoid confirming it exists). */
  async function visibleVisit(auth, id) {
    if (!isUuid(id)) return null;
    const v = await db.visit.findFirst({ where: { id, hospitalId: auth.hospitalId } });
    if (!v) return null;
    if (auth.kind === "patient") return auth.visit.id === v.id ? v : null;
    if (auth.user.role === "DOCTOR") return v.doctorId === auth.user.id ? v : null;
    return v;
  }

  // Everything the caller may see: open visits plus those closed in the last 24 h.
  // shortcut: unpaginated within that window; paginate once a hospital has hundreds of visits a day.
  r.get("/workspace", requireAuth, async (req, res) => {
    const a = req.auth;
    const queue = await queueInfo(db, a.hospitalId);
    if (a.kind === "patient") {
      const v = await db.visit.findUnique({ where: { id: a.visit.id }, include: { doctor: true, messages: { orderBy: { createdAt: "asc" } }, labs: { orderBy: { createdAt: "desc" } } } });
      return res.json({
        visit: { id: v.id, label: v.label, status: STATUS[v.status], queue: queue[v.id] || null },
        doctor: { name: v.doctor.name, department: v.doctor.department },
        messages: v.messages.map(msgOut), labs: v.labs.map(labOut),
      });
    }
    const isDoctor = a.user.role === "DOCTOR";
    const visits = await db.visit.findMany({
      where: {
        hospitalId: a.hospitalId, ...(isDoctor ? { doctorId: a.user.id } : {}),
        OR: [{ status: { in: ACTIVE } }, { updatedAt: { gt: new Date(Date.now() - 24 * 36e5) } }],
      },
      orderBy: [{ priority: "desc" }, { checkedInAt: "asc" }],
      include: {
        patient: true, labs: { orderBy: { createdAt: "desc" } },
        messages: isDoctor ? { orderBy: { createdAt: "asc" } } : { select: { id: true } },
        accesses: { where: { revokedAt: null }, orderBy: { expiresAt: "desc" }, take: 1 },
      },
    });
    const doctors = await db.user.findMany({ where: { hospitalId: a.hospitalId, role: "DOCTOR" }, orderBy: { name: "asc" } });
    res.json({
      doctors: doctors.map((d) => ({ id: d.id, name: d.name, department: d.department })),
      visits: visits.map((v) => ({
        id: v.id, label: v.label, status: STATUS[v.status], doctorId: v.doctorId, priority: v.priority,
        checkedInAt: v.checkedInAt.getTime(), queue: queue[v.id] || null,
        age: v.patient.age, sex: v.patient.sex,
        // names stay with reception and admin
        ...(isDoctor ? { messages: v.messages.map(msgOut) } : {
          name: v.patient.name, patientId: v.patientId, messageCount: v.messages.length,
          accessExpiresAt: v.accesses[0]?.expiresAt.getTime() ?? null,
        }),
        labs: v.labs.map(labOut),
      })),
    });
  });

  // New visit for an existing patient (patientId) or a new one (name/age/sex/phone; 409 lists likely duplicates unless confirmNew).
  r.post("/visits", requireStaff("ADMIN", "RECEPTIONIST"), async (req, res) => {
    const hospitalId = req.auth.hospitalId;
    const doctor = isUuid(req.body?.doctorId) && await db.user.findFirst({ where: { id: req.body.doctorId, hospitalId, role: "DOCTOR" } });
    if (!doctor) return bad(res, "Choose a doctor from this hospital");
    const p = await resolvePatient(db, hospitalId, req.body);
    if (!p.patient) return res.status(p.status).json(p.body);
    const out = await db.$transaction((tx) => createVisit(tx, {
      hospitalId, patientId: p.patient.id, doctorId: doctor.id, priority: req.body?.priority === true, actorUserId: req.auth.user.id,
    }));
    if (p.created) audit(db, req, "patient.create", { entityType: "patient", entityId: p.patient.id });
    audit(db, req, "visit.create", { entityType: "visit", entityId: out.visit.id, meta: { priority: out.visit.priority } });
    notify(out.visit);
    res.status(201).json({ id: out.visit.id, label: out.visit.label, patientId: p.patient.id, accessCode: out.accessCode, accessExpiresAt: out.accessExpiresAt });
  });

  // Reception: status, doctor, priority. Assigned doctor: status only.
  r.patch("/visits/:id", requireStaff(), async (req, res) => {
    const v = await visibleVisit(req.auth, req.params.id);
    if (!v) return res.status(404).json({ error: "Visit not found" });
    const isDoctor = req.auth.user.role === "DOCTOR";
    const body = req.body || {};
    if (isDoctor && (body.doctorId !== undefined || body.priority !== undefined))
      return res.status(403).json({ error: "Only reception can reassign or prioritise visits" });
    const data = {};
    let to;
    if (body.status !== undefined) { to = STATUS_IN[body.status]; if (!to) return bad(res, "Unknown status"); }
    if (body.priority !== undefined) { if (typeof body.priority !== "boolean") return bad(res, "priority must be true or false"); data.priority = body.priority; }
    if (body.doctorId !== undefined) {
      const d = isUuid(body.doctorId) && await db.user.findFirst({ where: { id: body.doctorId, hospitalId: req.auth.hospitalId, role: "DOCTOR" } });
      if (!d) return bad(res, "Choose a doctor from this hospital");
      data.doctorId = d.id;
    }
    const updated = await db.$transaction(async (tx) => {
      let u = Object.keys(data).length ? await tx.visit.update({ where: { id: v.id }, data }) : v;
      if (to) u = await changeStatus(tx, u, to, req.auth.user.id);
      return u;
    });
    audit(db, req, "visit.update", { entityType: "visit", entityId: v.id, meta: { ...data, ...(to ? { status: to, from: v.status } : {}) } });
    notify({ ...updated, previousDoctorId: v.doctorId });
    res.json({ ok: true });
  });

  r.get("/visits/:id/history", requireStaff(), async (req, res) => {
    const v = await visibleVisit(req.auth, req.params.id);
    if (!v) return res.status(404).json({ error: "Visit not found" });
    const events = await db.visitStatusEvent.findMany({ where: { visitId: v.id }, orderBy: { createdAt: "asc" } });
    const names = Object.fromEntries((await db.user.findMany({ where: { id: { in: events.map((e) => e.actorUserId).filter(Boolean) } } })).map((u) => [u.id, u.name]));
    res.json({ events: events.map((e) => ({ from: e.fromStatus && STATUS[e.fromStatus], to: STATUS[e.toStatus], by: names[e.actorUserId] || null, ts: e.createdAt.getTime() })) });
  });

  // Issue a fresh access code (old ones are revoked). The code is only ever shown in this response.
  r.post("/visits/:id/access", requireStaff("ADMIN", "RECEPTIONIST"), async (req, res) => {
    const v = await visibleVisit(req.auth, req.params.id);
    if (!v) return res.status(404).json({ error: "Visit not found" });
    const out = await db.$transaction(async (tx) => {
      await tx.visitAccess.updateMany({ where: { visitId: v.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.session.deleteMany({ where: { visitId: v.id } });
      return issueAccess(tx, v.id);
    });
    audit(db, req, "visit.access_issued", { entityType: "visit", entityId: v.id });
    notify(v);
    res.json(out);
  });

  r.delete("/visits/:id/access", requireStaff("ADMIN", "RECEPTIONIST"), async (req, res) => {
    const v = await visibleVisit(req.auth, req.params.id);
    if (!v) return res.status(404).json({ error: "Visit not found" });
    await db.$transaction([
      db.visitAccess.updateMany({ where: { visitId: v.id, revokedAt: null }, data: { revokedAt: new Date() } }),
      db.session.deleteMany({ where: { visitId: v.id } }),
    ]);
    audit(db, req, "visit.access_revoked", { entityType: "visit", entityId: v.id });
    notify(v);
    res.json({ ok: true });
  });

  r.post("/visits/:id/messages", requireAuth, async (req, res) => {
    const a = req.auth;
    const isDoctor = a.kind === "staff" && a.user.role === "DOCTOR";
    if (a.kind !== "patient" && !isDoctor) return res.status(403).json({ error: "Only the patient and their doctor can message" });
    const v = await visibleVisit(a, req.params.id);
    if (!v) return res.status(404).json({ error: "Visit not found" });
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text || text.length > 4000) return bad(res, "Message must be 1–4000 characters");
    const m = await db.message.create({ data: { visitId: v.id, sender: isDoctor ? "DOCTOR" : "PATIENT", text } });
    notify(v);
    res.status(201).json(msgOut(m));
  });

  // shortcut: file arrives base64 in JSON (≤10 MB) and lands on local disk; switch to streamed multipart + object storage before multi-instance deploys.
  r.post("/visits/:id/labs", requireStaff("ADMIN", "RECEPTIONIST"), async (req, res) => {
    const v = await visibleVisit(req.auth, req.params.id);
    if (!v) return res.status(404).json({ error: "Visit not found" });
    if (!req.body?.filename) return bad(res, "File name is required");
    const filename = safeName(req.body.filename);
    const note = typeof req.body?.note === "string" ? req.body.note.slice(0, 1000) : null;
    let stored = {};
    if (req.body?.data) {
      const buf = Buffer.from(String(req.body.data), "base64");
      if (buf.length > MAX_FILE_BYTES) return res.status(413).json({ error: "File is larger than 10 MB" });
      const sig = SIGNATURES.find((s) => s.magic.every((b, i) => buf[i] === b));
      if (!sig) return bad(res, "Only PDF, PNG and JPEG files are accepted");
      const key = path.posix.join(v.hospitalId, randomUUID() + sig.ext);
      await mkdir(path.join(storageDir, v.hospitalId), { recursive: true });
      await writeFile(path.join(storageDir, key), buf, { flag: "wx" });
      stored = { storageKey: key, mime: sig.mime, sizeBytes: buf.length };
    }
    const lab = await db.$transaction(async (tx) => {
      const l = await tx.labReport.create({ data: { visitId: v.id, filename, note, ...stored } });
      if (ACTIVE.includes(v.status)) await changeStatus(tx, v, "LABS_PENDING", req.auth.user.id);
      return l;
    });
    audit(db, req, "lab.upload", { entityType: "lab", entityId: lab.id, meta: { visitId: v.id, bytes: stored.sizeBytes ?? 0 } });
    notify(v);
    res.status(201).json(labOut(lab));
  });

  r.get("/labs/:id/download", requireAuth, async (req, res) => {
    if (!isUuid(req.params.id)) return res.status(404).json({ error: "File not found" });
    const lab = await db.labReport.findUnique({ where: { id: req.params.id } });
    const v = lab && (await visibleVisit(req.auth, lab.visitId));
    if (!v || !lab.storageKey) return res.status(404).json({ error: "File not found" });
    const file = path.join(storageDir, lab.storageKey);
    if (!existsSync(file)) return res.status(404).json({ error: "File not found" });
    audit(db, req, "lab.download", { entityType: "lab", entityId: lab.id });
    res.setHeader("Content-Type", lab.mime || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName(lab.filename).replace(/"/g, "")}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    createReadStream(file).pipe(res);
  });

  return r;
}
