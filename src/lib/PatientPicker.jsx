import { useEffect, useState } from "react";
import { Search, UserPlus, UserCheck, AlertTriangle } from "lucide-react";
import { api, fmtDateTime } from "./store";
import { Avatar, initials } from "./Shell";

export const EMPTY_PATIENT = { name: "", age: "", sex: "F", phone: "" };

/**
 * Pick an existing patient (search) or enter a new one.
 * value: { patientId, name, age, sex } for existing, or { name, age, sex, phone } for new.
 * duplicates: likely matches the server returned (409); the user picks one or confirms a new record.
 */
export function PatientPicker({ value, onChange, duplicates, onConfirmNew }) {
  const [mode, setMode] = useState(value.patientId ? "existing" : "new");
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [searchError, setSearchError] = useState("");

  useEffect(() => {
    if (mode !== "existing" || q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(() => {
      api(`/api/patients?q=${encodeURIComponent(q.trim())}`)
        .then((r) => { setResults(r.patients); setSearchError(""); }, (e) => setSearchError(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [q, mode]);

  const pick = (p) => onChange({ patientId: p.id, name: p.name, age: p.age, sex: p.sex });
  const set = (k) => (e) => onChange({ ...value, patientId: undefined, [k]: e.target.value });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex rounded-xl bg-porcelain p-1" role="tablist">
        {[["new", UserPlus, "New patient"], ["existing", Search, "Returning patient"]].map(([m, Icon, label]) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m}
            onClick={() => { setMode(m); onChange(m === "new" ? EMPTY_PATIENT : { ...EMPTY_PATIENT }); }}
            className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] font-semibold ${
              mode === m ? "bg-paper text-ink shadow-sm ring-1 ring-hairline" : "text-ink-mute hover:text-ink"}`}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {mode === "existing" ? (
        value.patientId ? (
          <div className="flex items-center gap-3 rounded-xl border border-ever-600/40 bg-ever-50 px-3.5 py-3">
            <Avatar label={initials(value.name)} seed={value.patientId} size={34} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold">{value.name}</p>
              <p className="text-[12.5px] text-ink-mute">{value.age} yrs · {value.sex}</p>
            </div>
            <button type="button" onClick={() => onChange({ ...EMPTY_PATIENT })} className="btn btn-sm btn-ghost">Change</button>
          </div>
        ) : (
          <div>
            <label className="label" htmlFor="pp-search">Search by name or phone</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
              <input id="pp-search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} className="field pl-9" placeholder="At least 2 characters" />
            </div>
            {searchError && <p className="mt-2 text-[12.5px] text-rose-600">{searchError}</p>}
            <div className="mt-2 flex max-h-56 flex-col overflow-y-auto">
              {results.map((p) => <PatientRow key={p.id} p={p} onPick={pick} />)}
              {q.trim().length >= 2 && !results.length && !searchError && <p className="px-1 py-3 text-[13px] text-ink-mute">No match. Switch to New patient.</p>}
            </div>
          </div>
        )
      ) : (
        <>
          <div>
            <label className="label" htmlFor="pp-name">Full name</label>
            <input id="pp-name" autoFocus placeholder="e.g. R. Lakshmi" value={value.name} onChange={set("name")} className="field" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label" htmlFor="pp-age">Age</label>
              <input id="pp-age" type="number" min="0" placeholder="Years" value={value.age} onChange={set("age")} className="field" />
            </div>
            <div>
              <label className="label" htmlFor="pp-sex">Sex</label>
              <select id="pp-sex" value={value.sex} onChange={set("sex")} className="field">
                <option value="F">Female</option><option value="M">Male</option><option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="pp-phone">Phone <span className="font-normal text-ink-mute">(opt.)</span></label>
              <input id="pp-phone" type="tel" inputMode="tel" placeholder="10 digits" value={value.phone} onChange={set("phone")} className="field" />
            </div>
          </div>
        </>
      )}

      {duplicates?.length > 0 && !value.patientId && (
        <div role="alert" className="rounded-xl border border-marigold-500/50 bg-marigold-100 p-3.5">
          <p className="flex items-center gap-2 text-[13.5px] font-semibold text-marigold-600">
            <AlertTriangle className="h-4 w-4" /> This looks like an existing patient
          </p>
          <div className="mt-2 flex flex-col">
            {duplicates.map((p) => <PatientRow key={p.id} p={p} onPick={pick} />)}
          </div>
          <button type="button" onClick={onConfirmNew} className="btn btn-sm btn-secondary mt-2">It's a different person — create new</button>
        </div>
      )}
    </div>
  );
}

function PatientRow({ p, onPick }) {
  return (
    <button type="button" onClick={() => onPick(p)}
      className="flex items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-paper">
      <Avatar label={initials(p.name)} seed={p.id} size={30} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-semibold">{p.name}</span>
        <span className="block text-[12px] text-ink-mute">
          {p.age} yrs · {p.sex}{p.phone ? ` · ${p.phone}` : ""}{p.lastVisitAt ? ` · last visit ${fmtDateTime(p.lastVisitAt)}` : ""}
        </span>
      </span>
      <UserCheck className="h-4 w-4 text-ever-700" />
    </button>
  );
}

/** Body fields for the API from a picker value. */
export const patientBody = (v, confirmNew = false) =>
  v.patientId ? { patientId: v.patientId } : { name: v.name, age: Number(v.age), sex: v.sex, phone: v.phone || undefined, confirmNew };
