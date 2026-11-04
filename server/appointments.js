import { Router } from "express";
import { requireStaff } from "./auth.js";
import { audit } from "./audit.js";
import { resolvePatient } from "./patients.js";
import { createVisit } from "./visits.js";

const isUuid = (s) => /^[0-9a-f-]{36}$/i.test(String(s));
const STATUS = { BOOKED: "Booked", CHECKED_IN: "Checked in", CANCELLED: "Cancelled", NO_SHOW: "No-show" };
const HOLDS_SLOT = ["BOOKED", "CHECKED_IN"];

const out = (a) => ({
  id: a.id, doctorId: a.doctorId, patientId: a.patientId, startsAt: a.startsAt.getTime(), endsAt: a.endsAt.getTime(),
  status: STATUS[a.status], note: a.note, visitId: a.visitId,
  ...(a.patient ? { patient: { name: a.patient.name, age: a.patient.age, sex: a.patient.sex } } : {}),
});

/** Parses startsAt + durationMin; returns { error } or { startsAt, endsAt }. */
function parseSlot(body, { allowPast = false } = {}) {
  const startsAt = new Date(body?.startsAt);
  const mins = body?.durationMin === undefined ? 15 : Number(body.durationMin);
  if (isNaN(startsAt)) return { error: "startsAt must be a date and time" };
  if (!Number.isInteger(mins) || mins < 5 || mins > 120) return { error: "Duration must be 5–120 minutes" };
  if (!allowPast && startsAt < new Date(Date.now() - 5 * 60e3)) return { error: "That time has already passed" };
  return { startsAt, endsAt: new Date(startsAt.getTime() + mins * 60e3) };
}

class Conflict extends Error {}

/** Throws Conflict if the doctor already holds an overlapping slot. Must run in a serializable transaction. */
async function assertFree(tx, doctorId, { startsAt, endsAt }, ignoreId) {
  const clash = await tx.appointment.findFirst({
    where: { doctorId, status: { in: HOLDS_SLOT }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt }, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
  });
  if (clash) throw new Conflict("The doctor already has an appointment that overlaps this time. Pick another slot.");
}

/** Serializable so two simultaneous bookings of one slot cannot both pass the overlap check. */
async function serializable(db, fn) {
  try { return await db.$transaction(fn, { isolationLevel: "Serializable" }); }
  catch (e) {
    if (e instanceof Conflict) return { conflict: e.message };
    if (e.code === "P2034") return { conflict: "Someone else just booked around this time. Please try again." };
    throw e;
  }
}

export function appointmentRoutes(db, { notify }) {
  const r = Router();

  async function findOwn(req, id) {
    if (!isUuid(id)) return null;
    return db.appointment.findFirst({ where: { id, hospitalId: req.auth.hospitalId } });
  }

  // ?from=ISO&to=ISO. Reception/admin see all doctors (with patient names); doctors see their own, without names.
  r.get("/appointments", requireStaff(), async (req, res) => {
    const from = new Date(String(req.query.from)), to = new Date(String(req.query.to));
    if (isNaN(from) || isNaN(to) || to <= from || to - from > 31 * 864e5) return res.status(400).json({ error: "from/to must be a range of up to 31 days" });
    const isDoctor = req.auth.user.role === "DOCTOR";
    const rows = await db.appointment.findMany({
      where: { hospitalId: req.auth.hospitalId, startsAt: { gte: from, lt: to }, ...(isDoctor ? { doctorId: req.auth.user.id } : {}) },
      orderBy: { startsAt: "asc" },
      include: { patient: !isDoctor },
    });
    res.json({ appointments: rows.map(out) });
  });

  r.post("/appointments", requireStaff("ADMIN", "RECEPTIONIST"), async (req, res) => {
    const hospitalId = req.auth.hospitalId;
    const doctor = isUuid(req.body?.doctorId) && await db.user.findFirst({ where: { id: req.body.doctorId, hospitalId, role: "DOCTOR" } });
    if (!doctor) return res.status(400).json({ error: "Choose a doctor from this hospital" });
    const slot = parseSlot(req.body);
    if (slot.error) return res.status(400).json({ error: slot.error });
    const p = await resolvePatient(db, hospitalId, req.body);
    if (!p.patient) return res.status(p.status).json(p.body);
    const note = typeof req.body?.note === "string" ? req.body.note.slice(0, 500) : null;
    const result = await serializable(db, async (tx) => {
      await assertFree(tx, doctor.id, slot);
      return { appt: await tx.appointment.create({ data: { hospitalId, patientId: p.patient.id, doctorId: doctor.id, ...slot, note } }) };
    });
    if (result.conflict) return res.status(409).json({ error: result.conflict });
    if (p.created) audit(db, req, "patient.create", { entityType: "patient", entityId: p.patient.id });
    audit(db, req, "appointment.create", { entityType: "appointment", entityId: result.appt.id });
    notify({ hospitalId, id: null, doctorId: doctor.id });
    res.status(201).json(out(result.appt));
  });

  // Reschedule (startsAt/durationMin) or mark Cancelled / No-show. Only booked appointments can change.
  r.patch("/appointments/:id", requireStaff("ADMIN", "RECEPTIONIST"), async (req, res) => {
    const a = await findOwn(req, req.params.id);
    if (!a) return res.status(404).json({ error: "Appointment not found" });
    if (a.status !== "BOOKED") return res.status(409).json({ error: `This appointment is already ${STATUS[a.status].toLowerCase()}` });
    const body = req.body || {};
    let data = {};
    if (body.status !== undefined) {
      const s = { Cancelled: "CANCELLED", "No-show": "NO_SHOW" }[body.status];
      if (!s) return res.status(400).json({ error: "Status can only be set to Cancelled or No-show" });
      data.status = s;
    }
    if (body.startsAt !== undefined || body.durationMin !== undefined) {
      const slot = parseSlot({
        startsAt: body.startsAt ?? a.startsAt,
        durationMin: body.durationMin ?? Math.round((a.endsAt - a.startsAt) / 60e3),
      });
      if (slot.error) return res.status(400).json({ error: slot.error });
      data = { ...data, ...slot };
    }
    if (!Object.keys(data).length) return res.status(400).json({ error: "Nothing to change" });
    const result = await serializable(db, async (tx) => {
      if (data.startsAt) await assertFree(tx, a.doctorId, data, a.id);
      return { appt: await tx.appointment.update({ where: { id: a.id }, data }) };
    });
    if (result.conflict) return res.status(409).json({ error: result.conflict });
    audit(db, req, "appointment.update", { entityType: "appointment", entityId: a.id, meta: { status: data.status, rescheduled: !!data.startsAt } });
    notify({ hospitalId: a.hospitalId, id: null, doctorId: a.doctorId });
    res.json(out(result.appt));
  });

  // Patient arrived: open a visit in the doctor's queue and issue the patient's access code.
  r.post("/appointments/:id/check-in", requireStaff("ADMIN", "RECEPTIONIST"), async (req, res) => {
    const a = await findOwn(req, req.params.id);
    if (!a) return res.status(404).json({ error: "Appointment not found" });
    if (a.status !== "BOOKED") return res.status(409).json({ error: `This appointment is already ${STATUS[a.status].toLowerCase()}` });
    const v = await db.$transaction(async (tx) => {
      const created = await createVisit(tx, { hospitalId: a.hospitalId, patientId: a.patientId, doctorId: a.doctorId, actorUserId: req.auth.user.id });
      await tx.appointment.update({ where: { id: a.id }, data: { status: "CHECKED_IN", visitId: created.visit.id } });
      return created;
    });
    audit(db, req, "appointment.check_in", { entityType: "appointment", entityId: a.id, meta: { visitId: v.visit.id } });
    notify(v.visit);
    res.status(201).json({ id: v.visit.id, label: v.visit.label, accessCode: v.accessCode, accessExpiresAt: v.accessExpiresAt });
  });

  return r;
}
