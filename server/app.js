import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { authRoutes, sessionMiddleware } from "./auth.js";
import { visitRoutes } from "./visits.js";
import { patientRoutes } from "./patients.js";
import { appointmentRoutes } from "./appointments.js";
import { auditRoutes } from "./audit.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp(db, { notify = () => {}, storageDir }) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1); // Render/Railway sit behind one proxy; needed for per-IP rate limits
  app.use(express.json({ limit: "15mb" }));

  // CSRF: session cookie is SameSite=Lax and state-changing calls must be JSON,
  // which a cross-site form cannot send without a CORS preflight we never allow.
  app.use("/api", (req, res, next) => {
    if (!["GET", "HEAD"].includes(req.method) && !/^application\/json\b/i.test(req.headers["content-type"] || ""))
      return res.status(415).json({ error: "Send JSON" });
    next();
  });

  app.get("/api/health", async (_req, res) => {
    try { await db.$queryRaw`SELECT 1`; res.json({ ok: true }); }
    catch { res.status(503).json({ ok: false }); }
  });

  app.use("/api", sessionMiddleware(db), authRoutes(db), visitRoutes(db, { notify, storageDir }),
    patientRoutes(db), appointmentRoutes(db, { notify }), auditRoutes(db));
  app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

  app.use(express.static(path.join(__dirname, "../dist")));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === "entity.too.large") return res.status(413).json({ error: "Request too large" });
    if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON" });
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  });
  return app;
}
