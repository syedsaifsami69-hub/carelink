import { useEffect, useState, useCallback } from "react";

// ---- seed data (mirror of server seed; used when no backend is running) ----
export const DOCTORS = [
  { id: "d1", name: "Dr. Meera Krishnan", dept: "Pediatrics" },
  { id: "d2", name: "Dr. Arjun Rao", dept: "General Medicine" },
  { id: "d3", name: "Dr. Sana Iqbal", dept: "Dermatology" },
];

const seed = () => ({
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
    K208: [
      { from: "patient", text: "BP tablet finished. Same one to continue?", ts: Date.now() - 30e5 },
    ],
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
});

// ---- transport: try server, fall back to local ----
let local = null;
let ws = null;
const listeners = new Set();

function notify() { listeners.forEach((fn) => fn()); }

async function fetchState() {
  try {
    const r = await fetch("/api/state");
    if (!r.ok) throw 0;
    return { data: await r.json(), online: true };
  } catch {
    if (!local) local = seed();
    return { data: local, online: false };
  }
}

async function mutate(path, body) {
  try {
    const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) throw 0;
    return true;
  } catch {
    return false; // caller applies local mutation
  }
}

export function useStore() {
  const [state, setState] = useState({ patients: [], threads: {}, labs: [] });
  const [online, setOnline] = useState(false);
  const [, force] = useState(0);

  const refresh = useCallback(async () => {
    const { data, online } = await fetchState();
    setState({ ...data });
    setOnline(online);
  }, []);

  useEffect(() => {
    refresh();
    const fn = () => refresh();
    listeners.add(fn);
    // websocket for realtime when server exists
    try {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}/ws`);
      ws.onmessage = () => refresh();
      ws.onerror = () => {};
    } catch {}
    return () => { listeners.delete(fn); try { ws && ws.close(); } catch {} };
  }, [refresh]);

  const api = {
    online,
    ...state,
    doctors: DOCTORS,
    async registerPatient(p) {
      const token = p.token || genToken();
      const patient = { ...p, token, status: "Waiting", registered: Date.now() };
      if (!(await mutate("/api/patients", patient))) {
        local.patients.unshift(patient); local.threads[token] = [];
      }
      notify(); await refresh(); return token;
    },
    async updatePatient(token, patch) {
      if (!(await mutate("/api/patients/update", { token, patch }))) {
        const p = local.patients.find((x) => x.token === token); if (p) Object.assign(p, patch);
      }
      notify(); await refresh();
    },
    async sendMessage(token, from, text) {
      const msg = { from, text, ts: Date.now() };
      if (!(await mutate("/api/messages", { token, msg }))) {
        (local.threads[token] ||= []).push(msg);
      }
      notify(); await refresh();
    },
    async addLab(lab) {
      const rec = { id: "l" + Date.now(), ts: Date.now(), ...lab };
      if (!(await mutate("/api/labs", rec))) {
        if (rec.data) { rec.stored = true; rec.size = Math.round((rec.data.length * 3) / 4 / 1024) + " KB"; }
        local.labs.unshift(rec);
      }
      notify(); await refresh();
    },
    downloadLab(lab) {
      if (!lab.stored) return false;
      if (this.online && !lab.data) { window.open(`/api/labs/${lab.id}/download`, "_blank"); return true; }
      if (lab.data) {
        const a = document.createElement("a");
        a.href = `data:${lab.mime || "application/octet-stream"};base64,${lab.data}`;
        a.download = lab.filename; a.click(); return true;
      }
      return false;
    },
  };
  return api;
}

export function genToken() {
  const L = "ABCDEFGHJKMNPQRSTUVWXYZ";
  return L[Math.floor(Math.random() * L.length)] + String(Math.floor(100 + Math.random() * 900));
}

export const fmtTime = (ts) =>
  new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
