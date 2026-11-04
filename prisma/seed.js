// Development / demo seed. Refuses to run in production.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { newAccessCode, hashAccessCode } from "../server/security.js";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed demo accounts with NODE_ENV=production.");
  process.exit(1);
}

const db = new PrismaClient();
const PASSWORD = process.env.SEED_PASSWORD || "carelink-dev-2026";
const ago = (ms) => new Date(Date.now() - ms);
const ttlHours = Number(process.env.PATIENT_ACCESS_TTL_HOURS || 72);

async function main() {
  // wipe in dependency order so the seed is repeatable
  await db.auditLog.deleteMany(); await db.appointment.deleteMany(); await db.visitStatusEvent.deleteMany();
  await db.session.deleteMany(); await db.visitAccess.deleteMany(); await db.message.deleteMany();
  await db.labReport.deleteMany(); await db.visit.deleteMany(); await db.patient.deleteMany();
  await db.user.deleteMany(); await db.hospital.deleteMany();

  const hash = await bcrypt.hash(PASSWORD, 10);
  const codes = [];

  async function hospital(name, staff, patients, { history = 0, appointments = [] } = {}) {
    const h = await db.hospital.create({ data: { name } });
    const users = {};
    for (const u of staff) {
      users[u.key] = await db.user.create({
        data: { hospitalId: h.id, email: u.email, name: u.name, role: u.role, department: u.dept, passwordHash: hash },
      });
    }
    for (const p of patients) {
      const patient = await db.patient.create({ data: { hospitalId: h.id, name: p.name, age: p.age, sex: p.sex, phone: p.phone } });
      const visit = await db.visit.create({
        data: { hospitalId: h.id, patientId: patient.id, doctorId: users[p.doctor].id, label: p.label, status: p.status,
          createdAt: ago(p.ago), checkedInAt: ago(p.ago), ...(p.status === "IN_CONSULT" ? { consultStartedAt: ago(6e5) } : {}) },
      });
      await db.visitStatusEvent.create({ data: { visitId: visit.id, toStatus: "WAITING", createdAt: ago(p.ago) } });
      if (p.status !== "WAITING") await db.visitStatusEvent.create({ data: { visitId: visit.id, fromStatus: "WAITING", toStatus: p.status, createdAt: ago(p.ago / 2) } });
      for (const [sender, text, t] of p.messages || [])
        await db.message.create({ data: { visitId: visit.id, sender, text, createdAt: ago(t) } });
      for (const [filename, note, t] of p.labs || [])
        await db.labReport.create({ data: { visitId: visit.id, filename, note, createdAt: ago(t) } });
      const code = newAccessCode();
      await db.visitAccess.create({ data: { visitId: visit.id, codeHash: hashAccessCode(code), expiresAt: new Date(Date.now() + ttlHours * 36e5) } });
      codes.push(`${name.padEnd(22)} ${p.label}  ${code}`);
    }
    // Past, finished consultations so queue wait estimates have real history to work from.
    const doctorIds = Object.values(users).filter((u) => u.role === "DOCTOR").map((u) => u.id);
    for (let i = 0; i < history; i++) {
      const doctorId = doctorIds[i % doctorIds.length];
      const start = ago((i + 3) * 864e5 / 2); // 1.5–7 days ago, outside the 24 h workspace window
      const mins = 8 + (i * 7) % 10; // 8–17 minute consults
      const patient = await db.patient.create({ data: { hospitalId: h.id, name: `Past Patient ${i + 1}`, age: 20 + i, sex: i % 2 ? "M" : "F" } });
      await db.visit.create({ data: {
        hospitalId: h.id, patientId: patient.id, doctorId, label: `Z${String(100 + i)}`, status: "DONE",
        checkedInAt: new Date(start - 15 * 60e3), consultStartedAt: start, consultEndedAt: new Date(start.getTime() + mins * 60e3),
        createdAt: new Date(start - 15 * 60e3), updatedAt: new Date(start.getTime() + mins * 60e3),
      } });
    }
    for (const a of appointments) {
      const patient = await db.patient.create({ data: { hospitalId: h.id, name: a.name, age: a.age, sex: a.sex, phone: a.phone } });
      const startsAt = new Date(Math.ceil((Date.now() + a.inMinutes * 60e3) / 9e5) * 9e5); // round to the quarter hour
      await db.appointment.create({ data: { hospitalId: h.id, patientId: patient.id, doctorId: users[a.doctor].id, startsAt, endsAt: new Date(startsAt.getTime() + 15 * 60e3) } });
    }
  }

  await hospital("SLIMS Puducherry", [
    { key: "admin", email: "admin@slims.dev", name: "Hospital Admin", role: "ADMIN" },
    { key: "rec", email: "reception@slims.dev", name: "Front Desk", role: "RECEPTIONIST" },
    { key: "d1", email: "meera@slims.dev", name: "Dr. Meera Krishnan", role: "DOCTOR", dept: "Pediatrics" },
    { key: "d2", email: "arjun@slims.dev", name: "Dr. Arjun Rao", role: "DOCTOR", dept: "General Medicine" },
    { key: "d3", email: "sana@slims.dev", name: "Dr. Sana Iqbal", role: "DOCTOR", dept: "Dermatology" },
  ], [
    { label: "A417", name: "R. Lakshmi", age: 6, sex: "F", phone: "9840012345", doctor: "d1", status: "IN_CONSULT", ago: 86e5,
      messages: [["PATIENT", "Fever came back last night, 101.2°F even after the syrup.", 72e5],
        ["DOCTOR", "Noted. Continue paracetamol 6-hourly. If it crosses 102°F or she becomes drowsy, come in immediately.", 70e5],
        ["PATIENT", "Okay doctor. Appetite is slightly better today.", 40e5]],
      labs: [["chest_xray_AP.jpg", "Follow-up X-ray", 68e5]] },
    { label: "K208", name: "S. Prakash", age: 34, sex: "M", phone: "9443098765", doctor: "d2", status: "WAITING", ago: 42e5,
      messages: [["PATIENT", "BP tablet finished. Same one to continue?", 30e5]] },
    { label: "M551", name: "V. Anitha", age: 27, sex: "F", doctor: "d3", status: "LABS_PENDING", ago: 21e5,
      messages: [["PATIENT", "Uploaded the skin patch photo and CBC report.", 20e5],
        ["DOCTOR", "Received. CBC looks fine. Reviewing the photo — likely contact dermatitis, will confirm in person.", 18e5]],
      labs: [["CBC_report.pdf", "Routine CBC", 20e5]] },
    { label: "B093", name: "M. Ismail", age: 58, sex: "M", doctor: "d2", status: "WAITING", ago: 9e5 },
  ], { history: 12, appointments: [
    { name: "K. Devi", age: 41, sex: "F", phone: "9894055501", doctor: "d2", inMinutes: 60 },
    { name: "P. Raman", age: 67, sex: "M", doctor: "d1", inMinutes: 120 },
  ] });

  // second tenant, used to demonstrate and test isolation
  await hospital("Harbour Clinic", [
    { key: "rec", email: "reception@harbour.dev", name: "Harbour Desk", role: "RECEPTIONIST" },
    { key: "d1", email: "doctor@harbour.dev", name: "Dr. Kavya Menon", role: "DOCTOR", dept: "General Medicine" },
  ], [
    { label: "H120", name: "J. Fernandes", age: 45, sex: "M", doctor: "d1", status: "WAITING", ago: 5e5,
      messages: [["PATIENT", "Need a refill for my thyroid tablets.", 4e5]] },
  ]);

  console.log(`Seeded. Staff password for every demo account: ${PASSWORD}`);
  console.log("Patient access codes (shown once, only hashes are stored):");
  console.log(codes.join("\n"));
}

main().finally(() => db.$disconnect());
