import { useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import { api, fmtDateTime } from "../lib/store";
import { Shell } from "../lib/Shell";

const LABEL = {
  "auth.login": "Signed in", "auth.login_failed": "Failed sign-in", "patient.access": "Patient opened visit",
  "patient.access_failed": "Rejected access code", "patient.create": "Patient created", "patient.search": "Patient search",
  "visit.create": "Visit opened", "visit.update": "Visit updated", "visit.access_issued": "Access code issued",
  "visit.access_revoked": "Access revoked", "lab.upload": "Lab report uploaded", "lab.download": "Lab report downloaded",
  "appointment.create": "Appointment booked", "appointment.update": "Appointment changed", "appointment.check_in": "Checked in",
};
const FAILED = new Set(["auth.login_failed", "patient.access_failed"]);

export default function Audit() {
  const [entries, setEntries] = useState([]);
  const [next, setNext] = useState(undefined); // undefined = first load pending
  const [error, setError] = useState("");

  const load = async (before) => {
    try {
      const r = await api(`/api/audit${before ? `?before=${encodeURIComponent(before)}` : ""}`);
      setEntries((e) => (before ? [...e, ...r.entries] : r.entries));
      setNext(r.next);
    } catch (e) { setError(e.message); }
  };
  useEffect(() => { load(); }, []);

  return (
    <Shell title="Audit log" sub="Who did what, newest first. Names and message content are never recorded here." online>
      {error && <p role="alert" className="mb-4 rounded-lg bg-rose-100 px-4 py-3 text-[13.5px] font-medium text-rose-600">{error}</p>}
      <div className="surface overflow-hidden">
        <div className="hidden grid-cols-[170px_1.3fr_1.2fr_1fr_120px] gap-4 border-b border-hairline bg-porcelain/60 px-5 py-2.5 text-[12px] font-semibold text-ink-mute md:grid">
          <span>When</span><span>Action</span><span>By</span><span>Record</span><span>IP</span>
        </div>
        {entries.map((e) => (
          <div key={e.id} className="grid grid-cols-2 gap-x-4 gap-y-1 border-b border-hairline px-5 py-3 text-[13px] last:border-0 md:grid-cols-[170px_1.3fr_1.2fr_1fr_120px]">
            <span className="text-ink-mute">{fmtDateTime(e.ts)}</span>
            <span className={`font-semibold ${FAILED.has(e.action) ? "text-rose-600" : ""}`}>{LABEL[e.action] || e.action}</span>
            <span className="truncate">{e.actor}</span>
            <span className="truncate font-mono text-[12px] text-ink-mute" title={e.entityId || ""}>{e.entityType ? `${e.entityType} ${e.entityId?.slice(0, 8) ?? ""}` : "—"}</span>
            <span className="truncate font-mono text-[12px] text-ink-mute">{e.ip || "—"}</span>
          </div>
        ))}
        {next === undefined && !error && <p className="px-5 py-10 text-center text-[13px] text-ink-mute">Loading…</p>}
        {next !== undefined && entries.length === 0 && (
          <div className="flex flex-col items-center px-4 py-14 text-center">
            <ScrollText className="h-6 w-6 text-ink-mute" />
            <p className="mt-3 text-[14px] font-semibold">No activity yet</p>
          </div>
        )}
      </div>
      {next && <div className="mt-4 flex justify-center"><button onClick={() => load(next)} className="btn btn-secondary">Load older</button></div>}
    </Shell>
  );
}
