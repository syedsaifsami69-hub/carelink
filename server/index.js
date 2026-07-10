import express from "express";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "15mb" }));
const fileBlobs = {}; // id -> { data(base64), mime }

// in-memory db (mirrors client seed)
const db = {
  patients: [
    { token: "A417", name: "R. Lakshmi", age: 6, sex: "F", doctorId: "d1", status: "In consult", registered: Date.now() - 86e5 },
    { token: "K208", name: "S. Prakash", age: 34, sex: "M", doctorId: "d2", status: "Waiting", registered: Date.now() - 42e5 },
    { token: "M551", name: "V. Anitha", age: 27, sex: "F", doctorId: "d3", status: "Labs pending", registered: Date.now() - 21e5 },
    { token: "B093", name: "M. Ismail", age: 58, sex: "M", doctorId: "d2", status: "Waiting", registered: Date.now() - 9e5 },
  ],
  threads: {
    A417: [
      { from: "patient", text: "Fever came back last night, 101.2°F even after the syrup.", ts: Date.now() - 72e5 },
      { from: "doctor", text: "Noted. Continue paracetamol 6-hourly. If it crosses 102°F or she becomes drowsy, come in immediately.", ts: Date.now() - 70e5 },
      { from: "patient", text: "Okay doctor. Appetite is slightly better today.", ts: Date.now() - 40e5 },
    ],
    K208: [{ from: "patient", text: "BP tablet finished. Same one to continue?", ts: Date.now() - 30e5 }],
    M551: [
      { from: "patient", text: "Uploaded the skin patch photo and CBC report.", ts: Date.now() - 20e5 },
      { from: "doctor", text: "Received. CBC looks fine. Reviewing the photo — likely contact dermatitis, will confirm in person.", ts: Date.now() - 18e5 },
    ],
    B093: [],
  },
  labs: [
    { id: "l1", token: "M551", filename: "CBC_report.pdf", size: "182 KB", ts: Date.now() - 20e5, note: "Routine CBC" },
    { id: "l2", token: "A417", filename: "chest_xray_AP.jpg", size: "1.4 MB", ts: Date.now() - 68e5, note: "Follow-up X-ray" },
  ],
};

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
const broadcast = () => wss.clients.forEach((c) => c.readyState === 1 && c.send("update"));

app.get("/api/state", (_, res) => res.json(db));
app.post("/api/patients", (req, res) => {
  db.patients.unshift(req.body);
  db.threads[req.body.token] = [];
  broadcast(); res.json({ ok: true });
});
app.post("/api/patients/update", (req, res) => {
  const p = db.patients.find((x) => x.token === req.body.token);
  if (p) Object.assign(p, req.body.patch);
  broadcast(); res.json({ ok: true });
});
app.post("/api/messages", (req, res) => {
  (db.threads[req.body.token] ||= []).push(req.body.msg);
  broadcast(); res.json({ ok: true });
});
app.post("/api/labs", (req, res) => {
  const { data, mime, ...meta } = req.body;
  if (data) {
    fileBlobs[meta.id] = { data, mime: mime || "application/octet-stream" };
    meta.size = Math.round((data.length * 3) / 4 / 1024) + " KB";
    meta.stored = true;
  }
  db.labs.unshift(meta);
  broadcast(); res.json({ ok: true });
});
app.get("/api/labs/:id/download", (req, res) => {
  const blob = fileBlobs[req.params.id];
  const meta = db.labs.find((l) => l.id === req.params.id);
  if (!blob || !meta) return res.status(404).json({ error: "File not stored on server" });
  res.setHeader("Content-Type", blob.mime);
  res.setHeader("Content-Disposition", `attachment; filename="${meta.filename}"`);
  res.send(Buffer.from(blob.data, "base64"));
});

app.use(express.static(path.join(__dirname, "../dist")));
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`CareLink server → http://localhost:${PORT}`));
