import { Router } from "express";
import { requireStaff } from "./auth.js";
import { audit } from "./audit.js";

export const normName = (s) => String(s || "").toLowerCase().replace(/[^a-z]/g, "");
export const normPhone = (s) => { const d = String(s || "").replace(/\D/g, ""); return d ? d.slice(-10) : null; };

/** Validates new-patient fields; returns { error } or { data }. */
export function parsePatient(body) {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const age = Number(body?.age);
  if (!name || name.length > 120) return { error: "Name is required (max 120 characters)" };
  if (!Number.isInteger(age) || age < 0 || age > 130) return { error: "Age must be a whole number between 0 and 130" };
  if (!["F", "M", "Other"].includes(body?.sex)) return { error: "Sex must be F, M or Other" };
  const phone = normPhone(body?.phone);
  if (body?.phone && (!phone || phone.length < 10)) return { error: "Phone must have at least 10 digits" };
  return { data: { name, age, sex: body.sex, phone } };
}

/** Same phone, or same name (ignoring case, spaces and dots) with age within a year. */
export async function findDuplicates(db, hospitalId, { name, age, phone }) {
  const rows = await db.$queryRaw`
    SELECT id FROM "Patient"
    WHERE "hospitalId" = ${hospitalId}::uuid
      AND ((${phone}::text IS NOT NULL AND phone = ${phone}::text)
        OR (regexp_replace(lower(name), '[^a-z]', '', 'g') = ${normName(name)} AND abs(age - ${age}) <= 1))
    LIMIT 5`;
  if (!rows.length) return [];
  const ps = await db.patient.findMany({
    where: { id: { in: rows.map((r) => r.id) } },
    include: { visits: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  return ps.map(patientOut);
}

export const patientOut = (p) => ({
  id: p.id, name: p.name, age: p.age, sex: p.sex, phone: p.phone,
  lastVisitAt: p.visits?.[0]?.createdAt.getTime() ?? null, lastVisitLabel: p.visits?.[0]?.label ?? null,
});

/**
 * Resolves body.patientId (must be in this hospital) or creates a patient from body fields.
 * Returns { patient } | { status, body } for the caller to send.
 */
export async function resolvePatient(db, hospitalId, body) {
  if (body?.patientId) {
    const patient = await db.patient.findFirst({ where: { id: String(body.patientId), hospitalId } }).catch(() => null);
    return patient ? { patient } : { status: 400, body: { error: "Patient not found in this hospital" } };
  }
  const { error, data } = parsePatient(body);
  if (error) return { status: 400, body: { error } };
  if (!body.confirmNew) {
    const duplicates = await findDuplicates(db, hospitalId, data);
    if (duplicates.length) return { status: 409, body: { error: "This may be an existing patient", duplicates } };
  }
  return { patient: await db.patient.create({ data: { hospitalId, ...data } }), created: true };
}

export function patientRoutes(db) {
  const r = Router();
  r.get("/patients", requireStaff("ADMIN", "RECEPTIONIST"), async (req, res) => {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) return res.status(400).json({ error: "Type at least 2 characters" });
    const phone = q.replace(/\D/g, "");
    const ps = await db.patient.findMany({
      where: {
        hospitalId: req.auth.hospitalId,
        OR: [{ name: { contains: q, mode: "insensitive" } }, ...(phone.length >= 4 ? [{ phone: { contains: phone } }] : [])],
      },
      include: { visits: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { createdAt: "desc" }, take: 20,
    });
    audit(db, req, "patient.search", { meta: { results: ps.length } });
    res.json({ patients: ps.map(patientOut) });
  });
  return r;
}
