import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createServer } from "http";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../server/app.js";

const PW = "test-password-123";
const db = new PrismaClient();
let server, rec, harbour, admin, sana, arjun, doctors, harbourDoctor;

const login = async (email) => {
  const agent = request.agent(server);
  expect((await agent.post("/api/auth/login").send({ email, password: PW })).status).toBe(200);
  return agent;
};
const doc = (name) => doctors.find((d) => d.name.includes(name)).id;
// a slot on a fixed future day, so tests never collide with "now"
const at = (dayOffset, hh, mm = 0) => { const d = new Date(); d.setDate(d.getDate() + dayOffset); d.setHours(hh, mm, 0, 0); return d.toISOString(); };

beforeAll(async () => {
  server = createServer(createApp(db, { storageDir: mkdtempSync(path.join(tmpdir(), "carelink-opd-")) }));
  rec = await login("reception@slims.dev");
  harbour = await login("reception@harbour.dev");
  admin = await login("admin@slims.dev");
  sana = await login("sana@slims.dev");
  arjun = await login("arjun@slims.dev");
  doctors = (await rec.get("/api/workspace")).body.doctors;
  harbourDoctor = (await harbour.get("/api/workspace")).body.doctors[0].id;
});
afterAll(async () => { server.close(); await db.$disconnect(); });

describe("patients and duplicate detection", () => {
  it("flags a likely duplicate by name + age and by phone", async () => {
    const byName = await rec.post("/api/visits").send({ name: "r lakshmi", age: 7, sex: "F", doctorId: doc("Meera") });
    expect(byName.status).toBe(409);
    expect(byName.body.duplicates.map((d) => d.name)).toContain("R. Lakshmi");
    const byPhone = await rec.post("/api/visits").send({ name: "Someone Else", age: 40, sex: "F", phone: "+91 98400 12345", doctorId: doc("Meera") });
    expect(byPhone.status).toBe(409);
  });

  it("creates a new visit for an existing patient, keeping one patient record", async () => {
    const lakshmi = (await rec.get("/api/patients?q=laksh")).body.patients[0];
    const r = await rec.post("/api/visits").send({ patientId: lakshmi.id, doctorId: doc("Meera") });
    expect(r.status).toBe(201);
    expect(r.body.patientId).toBe(lakshmi.id);
  });

  it("confirmNew creates a separate patient on purpose", async () => {
    expect((await rec.post("/api/visits").send({ name: "R Lakshmi", age: 7, sex: "F", doctorId: doc("Meera"), confirmNew: true })).status).toBe(201);
  });

  it("search is scoped to the hospital and to reception/admin", async () => {
    expect((await harbour.get("/api/patients?q=laksh")).body.patients).toEqual([]);
    expect((await sana.get("/api/patients?q=laksh")).status).toBe(403);
    expect((await rec.get("/api/patients?q=l")).status).toBe(400);
    const lakshmi = (await rec.get("/api/patients?q=laksh")).body.patients[0];
    expect((await harbour.post("/api/visits").send({ patientId: lakshmi.id, doctorId: harbourDoctor })).status).toBe(400);
  });

  it("rejects malformed phone numbers", async () => {
    expect((await rec.post("/api/visits").send({ name: "Phone Test", age: 30, sex: "M", phone: "123", doctorId: doc("Arjun") })).status).toBe(400);
  });
});

describe("status lifecycle and history", () => {
  it("records every transition with consult timing", async () => {
    const v = (await rec.post("/api/visits").send({ name: "History Case", age: 50, sex: "M", doctorId: doc("Arjun"), confirmNew: true })).body;
    expect((await arjun.patch(`/api/visits/${v.id}`).send({ status: "In consult" })).status).toBe(200);
    expect((await arjun.patch(`/api/visits/${v.id}`).send({ status: "Follow-up" })).status).toBe(200);
    expect((await rec.patch(`/api/visits/${v.id}`).send({ status: "Done" })).status).toBe(200);
    const h = (await rec.get(`/api/visits/${v.id}/history`)).body.events;
    expect(h.map((e) => e.to)).toEqual(["Waiting", "In consult", "Follow-up", "Done"]);
    expect(h[1].by).toBe("Dr. Arjun Rao");
    const row = await db.visit.findUnique({ where: { id: v.id } });
    expect(row.consultStartedAt).not.toBeNull();
    expect(row.consultEndedAt.getTime()).toBeGreaterThanOrEqual(row.consultStartedAt.getTime());
  });

  it("supports cancelled and no-show and rejects unknown statuses", async () => {
    const v = (await rec.post("/api/visits").send({ name: "No Show Case", age: 33, sex: "F", doctorId: doc("Arjun"), confirmNew: true })).body;
    expect((await rec.patch(`/api/visits/${v.id}`).send({ status: "No-show" })).status).toBe(200);
    expect((await rec.patch(`/api/visits/${v.id}`).send({ status: "Teleported" })).status).toBe(400);
  });

  it("closed visits drop out of the workspace after 24 hours", async () => {
    const v = (await rec.post("/api/visits").send({ name: "Old Case", age: 61, sex: "M", doctorId: doc("Arjun"), confirmNew: true })).body;
    await rec.patch(`/api/visits/${v.id}`).send({ status: "Done" });
    expect((await rec.get("/api/workspace")).body.visits.some((x) => x.id === v.id)).toBe(true);
    await db.$executeRaw`UPDATE "Visit" SET "updatedAt" = now() - interval '2 days' WHERE id = ${v.id}::uuid`;
    expect((await rec.get("/api/workspace")).body.visits.some((x) => x.id === v.id)).toBe(false);
  });
});

describe("live queue", () => {
  it("orders by arrival, lets priority jump ahead, and shows the patient their place", async () => {
    const first = (await rec.post("/api/visits").send({ name: "Queue One", age: 20, sex: "F", doctorId: doc("Sana"), confirmNew: true })).body;
    const second = (await rec.post("/api/visits").send({ name: "Queue Two", age: 21, sex: "F", doctorId: doc("Sana"), confirmNew: true })).body;
    let q = Object.fromEntries((await rec.get("/api/workspace")).body.visits.map((v) => [v.id, v.queue]));
    expect(q[second.id].position).toBe(q[first.id].position + 1);

    await rec.patch(`/api/visits/${second.id}`).send({ priority: true });
    q = Object.fromEntries((await rec.get("/api/workspace")).body.visits.map((v) => [v.id, v.queue]));
    expect(q[second.id].position).toBe(1);
    expect(q[first.id].position).toBe(2);

    const patient = request.agent(server);
    await patient.post("/api/patient/access").send({ code: first.accessCode });
    const mine = (await patient.get("/api/workspace")).body.visit.queue;
    expect(mine.position).toBe(2);
  });

  it("estimates only from real consult history, and gives none without it", async () => {
    const w = (await rec.get("/api/workspace")).body.visits.find((v) => v.queue && v.doctorId === doc("Sana"));
    expect(typeof w.queue.estimateMinutes).toBe("number"); // seed has ≥3 finished consults per SLIMS doctor
    const h = (await harbour.get("/api/workspace")).body.visits.find((v) => v.queue);
    expect(h.queue.estimateMinutes).toBeNull(); // Harbour has no history
  });
});

describe("appointments", () => {
  let booked;
  it("books a slot and rejects an overlapping one for the same doctor", async () => {
    const r = await rec.post("/api/appointments").send({ name: "Appt Patient", age: 44, sex: "M", confirmNew: true, doctorId: doc("Arjun"), startsAt: at(2, 10), durationMin: 15 });
    expect(r.status).toBe(201);
    booked = r.body;
    const clash = await rec.post("/api/appointments").send({ patientId: booked.patientId, doctorId: doc("Arjun"), startsAt: at(2, 10, 10) });
    expect(clash.status).toBe(409);
    const adjacent = await rec.post("/api/appointments").send({ patientId: booked.patientId, doctorId: doc("Arjun"), startsAt: at(2, 10, 15) });
    expect(adjacent.status).toBe(201);
    const otherDoctor = await rec.post("/api/appointments").send({ patientId: booked.patientId, doctorId: doc("Meera"), startsAt: at(2, 10) });
    expect(otherDoctor.status).toBe(201);
  });

  it("validates time and duration", async () => {
    expect((await rec.post("/api/appointments").send({ patientId: booked.patientId, doctorId: doc("Arjun"), startsAt: at(-1, 10) })).status).toBe(400);
    expect((await rec.post("/api/appointments").send({ patientId: booked.patientId, doctorId: doc("Arjun"), startsAt: at(3, 9), durationMin: 500 })).status).toBe(400);
  });

  it("only one of several simultaneous bookings for the same slot succeeds", async () => {
    const tries = await Promise.all(Array.from({ length: 5 }, () =>
      rec.post("/api/appointments").send({ patientId: booked.patientId, doctorId: doc("Sana"), startsAt: at(4, 11) })));
    expect(tries.filter((t) => t.status === 201)).toHaveLength(1);
    expect(tries.filter((t) => t.status === 409)).toHaveLength(4);
  });

  it("reschedule respects conflicts; cancel frees the slot", async () => {
    expect((await rec.patch(`/api/appointments/${booked.id}`).send({ startsAt: at(2, 10, 15) })).status).toBe(409);
    expect((await rec.patch(`/api/appointments/${booked.id}`).send({ status: "Cancelled" })).status).toBe(200);
    expect((await rec.patch(`/api/appointments/${booked.id}`).send({ status: "No-show" })).status).toBe(409);
    expect((await rec.post("/api/appointments").send({ patientId: booked.patientId, doctorId: doc("Arjun"), startsAt: at(2, 10) })).status).toBe(201);
  });

  it("check-in opens a queued visit with an access code, once", async () => {
    const a = (await rec.post("/api/appointments").send({ patientId: booked.patientId, doctorId: doc("Arjun"), startsAt: at(5, 9) })).body;
    const c = await rec.post(`/api/appointments/${a.id}/check-in`).send({});
    expect(c.status).toBe(201);
    expect(c.body.accessCode).toBeTruthy();
    const v = (await rec.get("/api/workspace")).body.visits.find((x) => x.id === c.body.id);
    expect(v.status).toBe("Waiting");
    expect(v.queue.position).toBeGreaterThan(0);
    expect((await rec.post(`/api/appointments/${a.id}/check-in`).send({})).status).toBe(409);
  });

  it("is tenant-scoped, and doctors see only their own without names", async () => {
    const range = `from=${encodeURIComponent(at(0, 0))}&to=${encodeURIComponent(at(7, 0))}`;
    expect((await harbour.get(`/api/appointments?${range}`)).body.appointments).toEqual([]);
    expect((await harbour.patch(`/api/appointments/${booked.id}`).send({ status: "Cancelled" })).status).toBe(404);
    expect((await harbour.post(`/api/appointments/${booked.id}/check-in`).send({})).status).toBe(404);
    expect((await harbour.post("/api/appointments").send({ patientId: booked.patientId, doctorId: harbourDoctor, startsAt: at(2, 12) })).status).toBe(400);
    const mine = (await arjun.get(`/api/appointments?${range}`)).body.appointments;
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((a) => a.doctorId === doc("Arjun") && a.patient === undefined)).toBe(true);
    expect((await arjun.post("/api/appointments").send({ patientId: booked.patientId, doctorId: doc("Arjun"), startsAt: at(6, 9) })).status).toBe(403);
  });
});

describe("audit log", () => {
  it("records actions for admins only, scoped to the hospital, without names or message text", async () => {
    await request(server).post("/api/auth/login").send({ email: "reception@slims.dev", password: "wrong" });
    await harbour.post("/api/visits").send({ name: "Harbour Audit", age: 30, sex: "F", doctorId: harbourDoctor, confirmNew: true });
    const r = await admin.get("/api/audit");
    expect(r.status).toBe(200);
    const actions = r.body.entries.map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["visit.create", "visit.update", "auth.login_failed", "appointment.create", "appointment.check_in", "patient.search"]));
    const harbourId = (await db.hospital.findFirst({ where: { name: "Harbour Clinic" } })).id;
    const harbourVisitIds = (await db.visit.findMany({ where: { hospitalId: harbourId } })).map((v) => v.id);
    expect(r.body.entries.some((e) => harbourVisitIds.includes(e.entityId))).toBe(false);
    const text = JSON.stringify(r.body);
    expect(text).not.toMatch(/Lakshmi|History Case|sore throat/);
    expect((await rec.get("/api/audit")).status).toBe(403);
    expect((await sana.get("/api/audit")).status).toBe(403);
  });
});
