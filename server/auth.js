import { Router } from "express";
import bcrypt from "bcryptjs";
import { randomToken, sha256, hashAccessCode, rateLimiter } from "./security.js";
import { audit } from "./audit.js";

export const COOKIE = "cl_session";
const STAFF_TTL_MS = 12 * 36e5;
const PATIENT_TTL_MS = 2 * 36e5;
// compared against when the email is unknown, so response time does not reveal which emails exist
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

export function parseCookies(header = "") {
  return Object.fromEntries(header.split(";").map((c) => c.trim().split("=")).filter(([k]) => k)
    .map(([k, ...v]) => [k, decodeURIComponent(v.join("="))]));
}

const cookieOpts = (maxAge) => ({
  httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge,
});

/** Resolves the cookie to { kind: "staff", user, hospitalId } or { kind: "patient", visit, hospitalId }. */
export async function resolveSession(db, token) {
  if (!token) return null;
  const s = await db.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true, visit: true } });
  if (!s || s.expiresAt < new Date()) return null;
  if (s.user) return { kind: "staff", sessionId: s.id, user: s.user, hospitalId: s.user.hospitalId, expiresAt: s.expiresAt };
  if (s.visit) return { kind: "patient", sessionId: s.id, visit: s.visit, hospitalId: s.visit.hospitalId, expiresAt: s.expiresAt };
  return null;
}

export const sessionMiddleware = (db) => async (req, _res, next) => {
  req.auth = await resolveSession(db, parseCookies(req.headers.cookie)[COOKIE]);
  next();
};

export const requireStaff = (...roles) => (req, res, next) => {
  if (req.auth?.kind !== "staff") return res.status(401).json({ error: "Sign in required" });
  if (roles.length && !roles.includes(req.auth.user.role)) return res.status(403).json({ error: "Not allowed for your role" });
  next();
};

export const requireAuth = (req, res, next) =>
  req.auth ? next() : res.status(401).json({ error: "Sign in required" });

export const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, department: u.department });

export function authRoutes(db) {
  const r = Router();
  const loginLimit = rateLimiter({ max: 10, windowMs: 15 * 60e3 });
  const accessLimit = rateLimiter({ max: 10, windowMs: 15 * 60e3 });

  async function startSession(res, data, ttl) {
    const token = randomToken();
    await db.session.create({ data: { ...data, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttl) } });
    res.cookie(COOKIE, token, cookieOpts(ttl));
  }

  r.post("/auth/login", async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    if (!email || !password) return res.status(400).json({ error: "Email and password are required" });
    const key = `${req.ip}|${email}`;
    if (!loginLimit.hit(key)) return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
    const user = await db.user.findUnique({ where: { email } });
    const ok = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
    if (!user || !ok) {
      audit(db, req, "auth.login_failed", { hospitalId: user?.hospitalId ?? null, meta: { email } });
      return res.status(401).json({ error: "Email or password is incorrect" });
    }
    loginLimit.reset(key);
    await startSession(res, { userId: user.id }, STAFF_TTL_MS);
    audit(db, { ip: req.ip, auth: { kind: "staff", user, hospitalId: user.hospitalId } }, "auth.login");
    const hospital = await db.hospital.findUnique({ where: { id: user.hospitalId } });
    res.json({ kind: "staff", user: publicUser(user), hospital: { id: hospital.id, name: hospital.name } });
  });

  r.post("/patient/access", async (req, res) => {
    if (!accessLimit.hit(req.ip)) return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
    const access = await db.visitAccess.findUnique({
      where: { codeHash: hashAccessCode(req.body?.code) }, include: { visit: true },
    });
    if (!access || access.revokedAt || access.expiresAt < new Date()) {
      // known-but-dead codes are attributable to a hospital; unknown ones are not
      audit(db, req, "patient.access_failed", { hospitalId: access?.visit.hospitalId ?? null, entityType: access ? "visit" : undefined, entityId: access?.visitId });
      return res.status(401).json({ error: "This access code is invalid or has expired. Ask reception for a new one." });
    }
    await startSession(res, { visitId: access.visitId }, Math.min(PATIENT_TTL_MS, access.expiresAt - Date.now()));
    audit(db, { ip: req.ip, auth: { kind: "patient", visit: access.visit, hospitalId: access.visit.hospitalId } }, "patient.access", { entityType: "visit", entityId: access.visitId });
    res.json({ kind: "patient", visit: { id: access.visit.id, label: access.visit.label } });
  });

  r.post("/auth/logout", async (req, res) => {
    if (req.auth) await db.session.delete({ where: { id: req.auth.sessionId } }).catch(() => {});
    res.clearCookie(COOKIE, { path: "/" });
    res.json({ ok: true });
  });

  r.get("/auth/me", async (req, res) => {
    const a = req.auth;
    if (!a) return res.status(401).json({ error: "Not signed in" });
    if (a.kind === "patient") return res.json({ kind: "patient", visit: { id: a.visit.id, label: a.visit.label } });
    const hospital = await db.hospital.findUnique({ where: { id: a.hospitalId } });
    res.json({ kind: "staff", user: publicUser(a.user), hospital: { id: hospital.id, name: hospital.name } });
  });

  return r;
}
