import { Router } from "express";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import { createReadStream, existsSync } from "fs";
import path from "path";
import { requireStaff, requireAuth } from "./auth.js";
import { newAccessCode, hashAccessCode, newVisitLabel } from "./security.js";

const STATUS = { WAITING: "Waiting", IN_CONSULT: "In consult", LABS_PENDING: "Labs pending", DONE: "Done" };
const STATUS_IN = Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [v, k]));
const MAX_FILE_BYTES = 10 * 1024 * 1024;
// checked against the file's first bytes, not the client-declared type
const SIGNATURES = [
  { mime: "application/pdf", ext: ".pdf", magic: [0x25, 0x50, 0x44, 0x46] },
  { mime: "image/png", ext: ".png", magic: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/jpeg", ext: ".jpg", magic: [0xff, 0xd8, 0xff] },
];

const ttlMs = () => Number(process.env.PATIENT_ACCESS_TTL_HOURS || 72) * 36e5;
const afterDoneMs = () => Number(process.env.PATIENT_ACCESS_AFTER_DONE_HOURS || 24) * 36e5;
const safeName = (s) => String(s).replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "file";
const bad = (res, msg) => res.status(400).json({ error: msg });

const msgOut = (m) => ({ id: m.id, from: m.sender === "DOCTOR" ? "doctor" : "patient", text: m.text, ts: m.createdAt.getTime() });
const labOut = (l) => ({ id: l.id, visitId: l.visitId, filename: l.filename, note: l.note, ts: l.createdAt.getTime(), stored: !!l.storageKey, sizeBytes: l.sizeBytes });

export function visitRoutes(db, { notify, storageDir }) {
  const r = Router();

  /** Loads a visit only if the caller may see it; otherwise null (callers answer 404, never 403, to avoid confirming it exists). */
  async function visibleVisit(auth, id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const v = await db.visit.findFirst({ where: { id, hospitalId: auth.hospitalId } });
    if (!v) return null;
    if (auth.kind === "patient") return auth.visit.id === v.id ? v : null;
    if (auth.user.role === "DOCTOR") return v.doctorId === auth.user.id ? v : null;
    return v;
  }

  async function issueAccess(tx, visitId) {
    const code = newAccessCode();
    const expiresAt = new Date(Date.now() + ttlMs());
    await tx.visitAccess.create({ data: { visitId, codeHash: hashAccessCode(code), expiresAt } });
    return { accessCode: code, accessExpiresAt: expiresAt.getTime() };
  }

  // Everything the caller is allowed to see, in one scoped response.
  // shortcut: unpaginated snapshot of the caller's scope; paginate once a hospital has hundreds of open visits.
  r.get("/workspace", requireAuth, async (req, res) => {
    const a = req.auth;
    if (a.kind === "patient") {
      const v = await db.visit.findUnique({ where: { id: a.visit.id }, include: { doctor: true, messages: { orderBy: { createdAt: "asc" } }, labs: { orderBy: { createdAt: "desc" } } } });
      return res.json({
        visit: { id: v.id, label: v.label, status: STATUS[v.status] },
        doctor: { name: v.doctor.name, department: v.doctor.department },
        messages: v.messages.map(msgOut), labs: v.labs.map(labOut),
      });
    }
    const isDoctor = a.user.role === "DOCTOR";
    const visits = await db.visit.findMany({
      where: { hospitalId: a.hospitalId, ...(isDoctor ? { doctorId: a.user.id } : {}) },
      orderBy: { createdAt: "desc" },
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
        id: v.id, label: v.label, status: STATUS[v.status], doctorId: v.doctorId, createdAt: v.createdAt.getTime(),
        age: v.patient.age, sex: v.patient.sex,
        // names stay with reception and admin
        ...(isDoctor ? { messages: v.messages.map(msgOut) } : {
          name: v.patient.name, messageCount: v.messages.length,
          accessExpiresAt: v.accesses[0]?.expiresAt.getTime() ?? null,
        }),
        labs: v.labs.map(labOut),
      })),
    });
  });

  r.post("/visits", requireStaff("ADMIN", "RECEPTIONIST"), async (req, res) => {
    const { name, sex, doctorId } = req.body || {};
    const age = Number(req.body?.age);
    if (typeof name !== "string" || !name.trim() || name.length > 120) return bad(res, "Name is required (max 120 characters)");
    if (!Number.isInteger(age) || age < 0 || age > 130) return bad(res, "Age must be a whole number between 0 and 130");
    if (!["F", "M", "Other"].includes(sex)) return bad(res, "Sex must be F, M or Other");
    const doctor = await db.user.findFirst({ where: { id: String(doctorId), hospitalId: req.auth.hospitalId, role: "DOCTOR" } }).catch(() => null);
    if (!doctor) return bad(res, "Choose a doctor from this hospital");

    const out = await db.$transaction(async (tx) => {
      const patient = await tx.patient.create({ data: { hospitalId: req.auth.hospitalId, name: name.trim(), age, sex } });
      let visit;
      for (let i = 0; !visit; i++) {
        const label = newVisitLabel();
        if (await tx.visit.findFirst({ where: { hospitalId: req.auth.hospitalId, label } })) { if (i > 50) throw new Error("No free visit label"); continue; }
        visit = await tx.visit.create({ data: { hospitalId: req.auth.hospitalId, patientId: patient.id, doctorId: doctor.id, label } });
      }
      return { visit, ...(await issueAccess(tx, visit.id)) };
    });
    notify(out.visit);
    res.status(201).json({ id: out.visit.id, label: out.visit.label, accessCode: out.accessCode, accessExpiresAt: out.accessExpiresAt });
  });

  r.patch("/visits/:id", requireStaff("ADMIN", "RECEPTIONIST"), async (req, res) => {
    const v = await visibleVisit(req.auth, req.params.id);
    if (!v) return res.status(404).json({ error: "Visit not found" });
    const data = {};
    if (req.body?.status !== undefined) {
      if (!STATUS_IN[req.body.status]) return bad(res, "Unknown status");
      data.status = STATUS_IN[req.body.status];
    }
    if (req.body?.doctorId !== undefined) {
      const d = await db.user.findFirst({ where: { id: String(req.body.doctorId), hospitalId: req.auth.hospitalId, role: "DOCTOR" } }).catch(() => null);
      if (!d) return bad(res, "Choose a doctor from this hospital");
      data.doctorId = d.id;
    }
    const updated = await db.$transaction(async (tx) => {
      const u = await tx.visit.update({ where: { id: v.id }, data });
      // a finished visit must not stay reachable for the full code lifetime
      if (data.status === "DONE") {
        const cap = new Date(Date.now() + afterDoneMs());
        await tx.visitAccess.updateMany({ where: { visitId: v.id, revokedAt: null, expiresAt: { gt: cap } }, data: { expiresAt: cap } });
      }
      return u;
    });
    notify({ ...updated, previousDoctorId: v.doctorId });
    res.json({ ok: true });
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

  // shortcut: file arrives base64 in JSON (≤10 MB); switch to streamed multipart + object storage in milestone 2.
  r.post("/visits/:id/labs", requireStaff("ADMIN", "RECEPTIONIST"), async (req, res) => {
    const v = await visibleVisit(req.auth, req.params.id);
    if (!v) return res.status(404).json({ error: "Visit not found" });
    const filename = safeName(req.body?.filename || "");
    if (!req.body?.filename) return bad(res, "File name is required");
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
      await tx.visit.update({ where: { id: v.id }, data: { status: "LABS_PENDING" } });
      return l;
    });
    notify(v);
    res.status(201).json(labOut(lab));
  });

  r.get("/labs/:id/download", requireAuth, async (req, res) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(404).json({ error: "File not found" });
    const lab = await db.labReport.findUnique({ where: { id: req.params.id } });
    const v = lab && (await visibleVisit(req.auth, lab.visitId));
    if (!v || !lab.storageKey) return res.status(404).json({ error: "File not found" });
    const file = path.join(storageDir, lab.storageKey);
    if (!existsSync(file)) return res.status(404).json({ error: "File not found" });
    res.setHeader("Content-Type", lab.mime || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName(lab.filename).replace(/"/g, "")}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    createReadStream(file).pipe(res);
  });

  return r;
}
