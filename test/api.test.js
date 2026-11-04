import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createServer } from "http";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import WebSocket from "ws";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../server/app.js";
import { attachRealtime } from "../server/realtime.js";

const PW = "test-password-123";
const db = new PrismaClient();
let server, base, realtime;

async function login(email) {
  const agent = request.agent(server);
  const r = await agent.post("/api/auth/login").send({ email, password: PW });
  expect(r.status).toBe(200);
  return agent;
}
const cookieOf = (res) => res.headers["set-cookie"][0].split(";")[0];
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]).toString("base64");

let slimsRec, harbourRec, meera, arjun, slimsVisits;

beforeAll(async () => {
  const storageDir = mkdtempSync(path.join(tmpdir(), "carelink-test-"));
  const app = createApp(db, { notify: (v) => realtime.notify(v), storageDir });
  server = createServer(app);
  realtime = attachRealtime(server, db);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
  slimsRec = await login("reception@slims.dev");
  harbourRec = await login("reception@harbour.dev");
  meera = await login("meera@slims.dev");
  arjun = await login("arjun@slims.dev");
  slimsVisits = (await slimsRec.get("/api/workspace")).body.visits;
});
afterAll(async () => { realtime.close(); server.close(); await db.$disconnect(); });

const visitByLabel = (label) => slimsVisits.find((v) => v.label === label);

describe("authentication", () => {
  it("rejects a wrong password and unknown email the same way", async () => {
    const a = await request(server).post("/api/auth/login").send({ email: "reception@slims.dev", password: "nope" });
    const b = await request(server).post("/api/auth/login").send({ email: "ghost@slims.dev", password: "nope" });
    expect([a.status, b.status]).toEqual([401, 401]);
    expect(a.body.error).toBe(b.body.error);
  });

  it("sets an HttpOnly, SameSite cookie and never returns the password hash", async () => {
    const r = await request(server).post("/api/auth/login").send({ email: "admin@slims.dev", password: PW });
    expect(r.headers["set-cookie"][0]).toMatch(/HttpOnly/i);
    expect(r.headers["set-cookie"][0]).toMatch(/SameSite=Lax/i);
    expect(JSON.stringify(r.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
  });

  it("requires a session for workspace data", async () => {
    expect((await request(server).get("/api/workspace")).status).toBe(401);
  });

  it("logout invalidates the session server-side", async () => {
    const agent = await login("sana@slims.dev");
    await agent.post("/api/auth/logout").set("Content-Type", "application/json").send({});
    expect((await agent.get("/api/auth/me")).status).toBe(401);
  });

  it("expired sessions are rejected", async () => {
    const r = await request(server).post("/api/auth/login").send({ email: "sana@slims.dev", password: PW });
    await db.session.updateMany({ where: { user: { email: "sana@slims.dev" } }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await request(server).get("/api/auth/me").set("Cookie", cookieOf(r))).status).toBe(401);
  });

  it("rate-limits repeated failed logins", async () => {
    let last;
    for (let i = 0; i < 11; i++) last = await request(server).post("/api/auth/login").send({ email: "limit@test.dev", password: "x" });
    expect(last.status).toBe(429);
  });

  it("the old global state endpoint is gone", async () => {
    expect((await request(server).get("/api/state")).status).toBe(404);
  });

  it("rejects non-JSON writes (CSRF guard)", async () => {
    const r = await slimsRec.post("/api/visits").type("form").send("name=x");
    expect(r.status).toBe(415);
  });
});

describe("tenant isolation", () => {
  it("each hospital only sees its own visits", async () => {
    const h = (await harbourRec.get("/api/workspace")).body.visits.map((v) => v.label);
    expect(h).toEqual(["H120"]);
    expect(slimsVisits.map((v) => v.label)).not.toContain("H120");
  });

  it("Hospital B cannot change, message, re-issue access for or read labs of Hospital A visits", async () => {
    const a417 = visitByLabel("A417");
    expect((await harbourRec.patch(`/api/visits/${a417.id}`).send({ status: "Done" })).status).toBe(404);
    expect((await harbourRec.post(`/api/visits/${a417.id}/access`).send({})).status).toBe(404);
    expect((await harbourRec.post(`/api/visits/${a417.id}/labs`).send({ filename: "x.png", data: PNG })).status).toBe(404);
    const harbourDoc = await login("doctor@harbour.dev");
    expect((await harbourDoc.post(`/api/visits/${a417.id}/messages`).send({ text: "hi" })).status).toBe(404);
  });

  it("Hospital B cannot download Hospital A lab files", async () => {
    const up = await slimsRec.post(`/api/visits/${visitByLabel("M551").id}/labs`).send({ filename: "scan.png", data: PNG });
    expect(up.status).toBe(201);
    expect((await harbourRec.get(`/api/labs/${up.body.id}/download`)).status).toBe(404);
    const ok = await slimsRec.get(`/api/labs/${up.body.id}/download`);
    expect(ok.status).toBe(200);
    expect(ok.headers["content-disposition"]).toBe('attachment; filename="scan.png"');
  });

  it("cannot assign a doctor from another hospital", async () => {
    const harbourDocId = (await harbourRec.get("/api/workspace")).body.doctors[0].id;
    expect((await slimsRec.patch(`/api/visits/${visitByLabel("B093").id}`).send({ doctorId: harbourDocId })).status).toBe(400);
  });
});

describe("doctor scope", () => {
  it("doctors see only their own visits and never patient names", async () => {
    const w = (await meera.get("/api/workspace")).body;
    expect(w.visits.map((v) => v.label)).toEqual(["A417"]);
    expect(JSON.stringify(w.visits)).not.toContain("Lakshmi");
    expect(w.visits[0].name).toBeUndefined();
  });

  it("a doctor cannot read or message another doctor's patient", async () => {
    const k208 = visitByLabel("K208"); // Dr. Arjun's
    expect((await meera.post(`/api/visits/${k208.id}/messages`).send({ text: "hello" })).status).toBe(404);
    expect((await arjun.post(`/api/visits/${k208.id}/messages`).send({ text: "Please continue." })).status).toBe(201);
  });

  it("reception cannot post clinical messages or see their content", async () => {
    expect((await slimsRec.post(`/api/visits/${visitByLabel("A417").id}/messages`).send({ text: "x" })).status).toBe(403);
    expect(visitByLabel("A417").messages).toBeUndefined();
  });

  it("doctors may set status on their own visits but cannot reassign, prioritise or touch others", async () => {
    expect((await meera.patch(`/api/visits/${visitByLabel("A417").id}`).send({ doctorId: visitByLabel("K208").doctorId })).status).toBe(403);
    expect((await meera.patch(`/api/visits/${visitByLabel("A417").id}`).send({ priority: true })).status).toBe(403);
    expect((await meera.patch(`/api/visits/${visitByLabel("K208").id}`).send({ status: "Done" })).status).toBe(404);
    expect((await meera.patch(`/api/visits/${visitByLabel("A417").id}`).send({ status: "Labs pending" })).status).toBe(200);
  });
});

describe("patient access codes", () => {
  let visit, code;

  it("reception registers a patient and gets a one-time access code", async () => {
    const doctorId = (await slimsRec.get("/api/workspace")).body.doctors.find((d) => d.name.includes("Meera")).id;
    const r = await slimsRec.post("/api/visits").send({ name: "Test Patient", age: 30, sex: "F", doctorId, confirmNew: true });
    expect(r.status).toBe(201);
    expect(r.body.accessCode).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/);
    visit = r.body; code = r.body.accessCode;
    const row = await db.visitAccess.findFirst({ where: { visitId: visit.id } });
    expect(row.codeHash).not.toContain(code.replace(/-/g, ""));
  });

  it("validates registration input", async () => {
    expect((await slimsRec.post("/api/visits").send({ name: "", age: 5, sex: "F" })).status).toBe(400);
    expect((await slimsRec.post("/api/visits").send({ name: "A", age: -1, sex: "F" })).status).toBe(400);
  });

  it("the visit label alone does not grant access", async () => {
    expect((await request(server).post("/api/patient/access").send({ code: visit.label })).status).toBe(401);
  });

  it("a valid code opens only that patient's visit; lower-case and spaces are accepted", async () => {
    const patient = request.agent(server);
    const r = await patient.post("/api/patient/access").send({ code: code.toLowerCase().replace(/-/g, " ") });
    expect(r.status).toBe(200);
    const w = (await patient.get("/api/workspace")).body;
    expect(w.visit.label).toBe(visit.label);
    expect(w.doctor.name).toBe("Dr. Meera Krishnan");
    expect(JSON.stringify(w)).not.toContain("Test Patient");
    expect((await patient.post(`/api/visits/${visit.id}/messages`).send({ text: "I have a cough." })).status).toBe(201);
    expect((await patient.post(`/api/visits/${visitByLabel("A417").id}/messages`).send({ text: "x" })).status).toBe(404);
    expect((await patient.patch(`/api/visits/${visit.id}`).send({ status: "Done" })).status).toBe(401);
  });

  it("revoking access kills existing patient sessions and the code", async () => {
    const patient = request.agent(server);
    await patient.post("/api/patient/access").send({ code });
    expect((await slimsRec.delete(`/api/visits/${visit.id}/access`).set("Content-Type", "application/json")).status).toBe(200);
    expect((await patient.get("/api/workspace")).status).toBe(401);
    expect((await request(server).post("/api/patient/access").send({ code })).status).toBe(401);
  });

  it("re-issuing gives a new working code", async () => {
    const r = await slimsRec.post(`/api/visits/${visit.id}/access`).send({});
    expect(r.status).toBe(200);
    expect((await request(server).post("/api/patient/access").send({ code: r.body.accessCode })).status).toBe(200);
    code = r.body.accessCode;
  });

  it("expired codes are rejected", async () => {
    await db.visitAccess.updateMany({ where: { visitId: visit.id, revokedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await request(server).post("/api/patient/access").send({ code })).status).toBe(401);
  });

  it("marking a visit Done caps access to the after-done window", async () => {
    const r = await slimsRec.post(`/api/visits/${visit.id}/access`).send({});
    await slimsRec.patch(`/api/visits/${visit.id}`).send({ status: "Done" });
    const row = await db.visitAccess.findFirst({ where: { visitId: visit.id, revokedAt: null } });
    expect(row.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(24 * 36e5 + 5000);
    expect(r.status).toBe(200);
  });
});

describe("lab uploads", () => {
  const id = () => visitByLabel("A417").id;
  it("rejects files that are not PDF/PNG/JPEG by content", async () => {
    const r = await slimsRec.post(`/api/visits/${id()}/labs`).send({ filename: "x.pdf", data: Buffer.from("<script>").toString("base64") });
    expect(r.status).toBe(400);
  });
  it("rejects files over 10 MB", async () => {
    const big = Buffer.alloc(10 * 1024 * 1024 + 10); big.set([0x25, 0x50, 0x44, 0x46]);
    expect((await slimsRec.post(`/api/visits/${id()}/labs`).send({ filename: "big.pdf", data: big.toString("base64") })).status).toBe(413);
  });
  it("the assigned doctor can download; other doctors cannot", async () => {
    const up = await slimsRec.post(`/api/visits/${id()}/labs`).send({ filename: 'evil"\r\nX: y.png', data: PNG });
    expect(up.status).toBe(201);
    const ok = await meera.get(`/api/labs/${up.body.id}/download`);
    expect(ok.status).toBe(200);
    expect(ok.headers["content-disposition"]).not.toMatch(/[\r\n]/);
    expect((await arjun.get(`/api/labs/${up.body.id}/download`)).status).toBe(404);
  });
});

describe("realtime", () => {
  const open = (cookie) => new Promise((resolve, reject) => {
    const ws = new WebSocket(base.replace("http", "ws") + "/ws", { headers: { Cookie: cookie } });
    const got = [];
    ws.on("message", (m) => got.push(String(m)));
    ws.on("open", () => resolve({ ws, got }));
    ws.on("error", reject);
  });
  const cookieFor = async (email) => cookieOf(await request(server).post("/api/auth/login").send({ email, password: PW }));

  it("refuses unauthenticated sockets", async () => {
    await expect(open("cl_session=bogus")).rejects.toThrow(/401/);
  });

  it("events reach the right hospital and doctor only", async () => {
    const slims = await open(await cookieFor("reception@slims.dev"));
    const harbour = await open(await cookieFor("reception@harbour.dev"));
    const otherDoc = await open(await cookieFor("sana@slims.dev"));
    await meera.post(`/api/visits/${visitByLabel("A417").id}/messages`).send({ text: "Realtime check" });
    await new Promise((r) => setTimeout(r, 400));
    expect(slims.got).toContain("update");
    expect(harbour.got).toEqual([]);
    expect(otherDoc.got).toEqual([]);
    [slims, harbour, otherDoc].forEach((s) => s.ws.close());
  });
});

describe("persistence", () => {
  it("data written through the API is in Postgres", async () => {
    const m = await db.message.findFirst({ where: { text: "Realtime check" } });
    expect(m).not.toBeNull();
  });
});
