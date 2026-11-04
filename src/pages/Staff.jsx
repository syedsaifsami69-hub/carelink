import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { UserPlus, Upload, Search, Users, MessageSquare, FlaskConical, Clock, Table2, Columns3, ArrowRight, Paperclip, Inbox, KeyRound, Copy } from "lucide-react";
import { api, useWorkspace, fmtDateTime } from "../lib/store";
import { Shell, Modal, useToast, spring, Avatar, initials, STATUS_TONE } from "../lib/Shell";

const STATUSES = ["Waiting", "In consult", "Labs pending", "Done"];
const EMPTY_FORM = { name: "", age: "", sex: "F", doctorId: "" };

export default function Staff() {
  const { data, online, refresh, error } = useWorkspace();
  const visits = useMemo(() => data?.visits || [], [data]);
  const doctors = data?.doctors || [];
  const toast = useToast();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("All");
  const [showReg, setShowReg] = useState(false);
  const [showLab, setShowLab] = useState(false);
  const [labFor, setLabFor] = useState(null);
  const [accessFor, setAccessFor] = useState(null); // { visit, code?, expiresAt? }
  const [form, setForm] = useState(EMPTY_FORM);
  const [labForm, setLabForm] = useState({ filename: "", note: "", data: null });
  const [view, setView] = useState("table");
  const [dragId, setDragId] = useState(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    let r = visits;
    if (filter !== "All") r = r.filter((p) => p.status === filter);
    if (q) r = r.filter((p) => (p.name + p.label).toLowerCase().includes(q.toLowerCase()));
    return r;
  }, [visits, q, filter]);

  const stats = [
    { icon: Users, label: "Visits", value: visits.length, tone: "bg-ever-100 text-ever-800" },
    { icon: MessageSquare, label: "Open threads", value: visits.filter((v) => v.messageCount > 0).length, tone: "bg-sky-100 text-sky-700" },
    { icon: FlaskConical, label: "Lab files", value: visits.reduce((n, v) => n + v.labs.length, 0), tone: "bg-celadon text-ever-900" },
    { icon: Clock, label: "Waiting now", value: visits.filter((p) => p.status === "Waiting").length, tone: "bg-marigold-100 text-marigold-600" },
  ];

  // every write goes through here so failures surface instead of silently diverging
  const run = async (fn, ok) => {
    setBusy(true);
    try { const out = await fn(); if (ok) toast(ok); await refresh(); return out; }
    catch (e) { toast(e.message); return null; }
    finally { setBusy(false); }
  };
  const update = (id, patch) => run(() => api(`/api/visits/${id}`, { method: "PATCH", body: patch }));

  const register = async () => {
    const out = await run(() => api("/api/visits", { method: "POST", body: { ...form, age: Number(form.age), doctorId: form.doctorId || doctors[0]?.id } }));
    if (!out) return;
    setShowReg(false);
    setForm(EMPTY_FORM);
    setAccessFor({ visit: { id: out.id, label: out.label, name: form.name }, code: out.accessCode, expiresAt: out.accessExpiresAt });
  };

  const reissue = async (visit) => {
    const out = await run(() => api(`/api/visits/${visit.id}/access`, { method: "POST" }), "New access code issued; the old one no longer works");
    if (out) setAccessFor({ visit, code: out.accessCode, expiresAt: out.accessExpiresAt });
  };
  const revoke = async (visit) => {
    if (await run(() => api(`/api/visits/${visit.id}/access`, { method: "DELETE" }), `Access revoked for ${visit.label}`)) setAccessFor(null);
  };

  const pickFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setLabForm((lf) => ({ ...lf, filename: lf.filename || f.name, data: r.result.split(",")[1] }));
    r.readAsDataURL(f);
  };

  const uploadLab = async () => {
    if (!labForm.filename.trim()) return toast("Add a file name or attach a file");
    const out = await run(() => api(`/api/visits/${labFor.id}/labs`, { method: "POST", body: labForm }), `Lab filed under ${labFor.label}`);
    if (out) { setShowLab(false); setLabForm({ filename: "", note: "", data: null }); }
  };

  const advance = (p) => {
    const i = STATUSES.indexOf(p.status);
    if (i < STATUSES.length - 1) update(p.id, { status: STATUSES[i + 1] });
  };

  const docName = (id) => doctors.find((d) => d.id === id)?.name;

  return (
    <Shell title="Reception desk" sub="Register patients, issue access codes and route cases. Names live here and nowhere else."
      online={online}
      actions={<button onClick={() => setShowReg(true)} className="btn btn-primary"><UserPlus className="h-4 w-4" /> Register patient</button>}>
      {error && <p role="alert" className="mb-4 rounded-lg bg-rose-100 px-4 py-3 text-[13.5px] font-medium text-rose-600">Couldn't load visits: {error.message}</p>}
      {/* stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: i * 0.05 }}
            className="surface p-5">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-medium text-ink-mute">{s.label}</p>
              <span className={`grid h-8 w-8 place-items-center rounded-lg ${s.tone}`}><s.icon className="h-4 w-4" /></span>
            </div>
            <p className="mt-3 font-display text-[30px] font-bold leading-none">{s.value}</p>
          </motion.div>
        ))}
      </div>

      {/* patient list surface */}
      <div className="surface mt-6 overflow-hidden">
        {/* toolbar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-hairline p-4">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or token"
              aria-label="Search patients" className="field h-10 bg-porcelain pl-9" />
          </div>
          <div className="flex gap-1 overflow-x-auto rounded-xl bg-porcelain p-1">
            {["All", ...STATUSES].map((s) => (
              <button key={s} onClick={() => setFilter(s)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                  filter === s ? "bg-paper text-ink shadow-sm ring-1 ring-hairline" : "text-ink-mute hover:text-ink"}`}>
                {s}
              </button>
            ))}
          </div>
          <div className="flex rounded-xl bg-porcelain p-1">
            {[["table", Table2, "Table"], ["board", Columns3, "Board"]].map(([v, Icon, label]) => (
              <button key={v} onClick={() => setView(v)} aria-label={label + " view"} aria-pressed={view === v}
                className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold ${
                  view === v ? "bg-paper text-ink shadow-sm ring-1 ring-hairline" : "text-ink-mute hover:text-ink"}`}>
                <Icon className="h-4 w-4" /> <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* board view */}
        {view === "board" && (
          <div className="grid gap-4 bg-porcelain/50 p-4 md:grid-cols-2 xl:grid-cols-4">
            {STATUSES.map((col) => {
              const cards = rows.filter((p) => p.status === col);
              return (
                <div key={col}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => { if (dragId) { update(dragId, { status: col }); setDragId(null); } }}
                  className="rounded-xl border border-hairline bg-porcelain p-3">
                  <div className="flex items-center justify-between px-1 pb-3">
                    <span className="text-[13px] font-semibold">{col}</span>
                    <span className={`badge h-5 px-2 text-[11px] ${STATUS_TONE[col]}`}>{cards.length}</span>
                  </div>
                  <div className="flex min-h-[72px] flex-col gap-2">
                    <AnimatePresence initial={false}>
                      {cards.map((p) => (
                        <motion.div key={p.id} layout draggable
                          onDragStart={() => setDragId(p.id)}
                          initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                          transition={spring}
                          className="surface cursor-grab p-3 active:cursor-grabbing">
                          <div className="flex items-center gap-2.5">
                            <Avatar label={initials(p.name)} seed={p.id} size={30} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13.5px] font-semibold">{p.name}</p>
                              <p className="text-[11.5px] text-ink-mute">{p.age} yrs · {p.sex}</p>
                            </div>
                            <span className="font-mono text-[12px] font-medium text-ever-800">{p.label}</span>
                          </div>
                          <p className="mt-2.5 truncate border-t border-hairline pt-2 text-[12px] text-ink-mute">{docName(p.doctorId)}</p>
                          {col !== "Done" && (
                            <button onClick={() => advance(p)}
                              className="btn btn-sm btn-secondary mt-2 h-7 text-[11.5px] md:hidden">
                              Move to next <ArrowRight className="h-3 w-3" />
                            </button>
                          )}
                        </motion.div>
                      ))}
                    </AnimatePresence>
                    {cards.length === 0 && <p className="rounded-lg border border-dashed border-hairline px-2 py-4 text-center text-[12px] text-ink-mute">Drop a surface here</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* table */}
        {view === "table" && (
          <>
            <div className="hidden grid-cols-[1.6fr_90px_1.3fr_150px_132px] gap-4 border-b border-hairline bg-porcelain/60 px-5 py-2.5 text-[12px] font-semibold text-ink-mute md:grid">
              <span>Patient</span><span>Token</span><span>Assigned doctor</span><span>Status</span><span className="text-right">Actions</span>
            </div>
            <AnimatePresence initial={false}>
              {rows.map((p) => (
                <motion.div key={p.id} layout
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  transition={spring}
                  className="grid grid-cols-2 items-center gap-3 border-b border-hairline px-5 py-3.5 last:border-0 hover:bg-porcelain/50 md:grid-cols-[1.6fr_90px_1.3fr_150px_132px] md:gap-4">
                  <div className="col-span-2 flex items-center gap-3 md:col-span-1">
                    <Avatar label={initials(p.name)} seed={p.id} />
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold">{p.name}</p>
                      <p className="text-[12.5px] text-ink-mute">{p.age} yrs · {p.sex === "F" ? "Female" : p.sex === "M" ? "Male" : p.sex}</p>
                    </div>
                  </div>
                  <span className="w-fit rounded-md bg-ever-50 px-2 py-1 font-mono text-[12.5px] font-medium text-ever-800">{p.label}</span>
                  <select value={p.doctorId} aria-label={`Doctor for ${p.label}`} disabled={busy}
                    onChange={(e) => update(p.id, { doctorId: e.target.value })}
                    className="field h-9 bg-porcelain text-[13px]">
                    {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  <label className="relative">
                    <span className="sr-only">Status for {p.label}</span>
                    <select value={p.status}
                      onChange={(e) => update(p.id, { status: e.target.value })} disabled={busy}
                      className={`h-8 w-full cursor-pointer appearance-none rounded-full pl-3 pr-7 text-[12.5px] font-semibold outline-none ${STATUS_TONE[p.status]}`}>
                      {STATUSES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                    <svg className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 opacity-60" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m3 4.5 3 3 3-3" /></svg>
                  </label>
                  <div className="col-span-2 flex justify-end gap-2 md:col-span-1">
                    <button onClick={() => setAccessFor({ visit: p })} aria-label={`Patient access for ${p.label}`} title="Patient access code"
                      className={`btn btn-sm btn-secondary w-9 px-0 ${p.accessExpiresAt && p.accessExpiresAt > Date.now() ? "" : "text-rose-600"}`}>
                      <KeyRound className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => { setLabFor(p); setShowLab(true); }}
                      className="btn btn-sm btn-secondary">
                      <Upload className="h-3.5 w-3.5" /> Lab
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {rows.length === 0 && (
              <div className="flex flex-col items-center px-4 py-14 text-center">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-porcelain"><Inbox className="h-5 w-5 text-ink-mute" /></span>
                <p className="mt-3 text-[14px] font-semibold">No patients match</p>
                <p className="mt-1 text-[13px] text-ink-mute">Try a different search, or register a patient to issue a token.</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* register modal */}
      <Modal open={showReg} onClose={() => setShowReg(false)} title="Register patient"
        description="The name stays at reception. Doctors and the patient portal see only the visit label.">
        <div className="flex flex-col gap-4">
          <div>
            <label className="label" htmlFor="reg-name">Full name</label>
            <input id="reg-name" autoFocus placeholder="e.g. R. Lakshmi" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} className="field" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="reg-age">Age</label>
              <input id="reg-age" type="number" min="0" placeholder="Years" value={form.age}
                onChange={(e) => setForm({ ...form, age: e.target.value })} className="field" />
            </div>
            <div>
              <label className="label" htmlFor="reg-sex">Sex</label>
              <select id="reg-sex" value={form.sex} onChange={(e) => setForm({ ...form, sex: e.target.value })} className="field">
                <option value="F">Female</option><option value="M">Male</option><option value="Other">Other</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="reg-doc">Assign doctor</label>
            <select id="reg-doc" value={form.doctorId || doctors[0]?.id || ""} onChange={(e) => setForm({ ...form, doctorId: e.target.value })} className="field">
              {doctors.map((d) => <option key={d.id} value={d.id}>{d.name} — {d.department}</option>)}
            </select>
          </div>
          <p className="rounded-lg bg-porcelain px-3 py-2.5 text-[12.5px] text-ink-mute">
            Saving creates a visit and a one-time patient access code to hand to the patient.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setShowReg(false)} className="btn btn-secondary">Cancel</button>
            <button onClick={register} disabled={busy} className="btn btn-primary disabled:opacity-60">Register & issue code</button>
          </div>
        </div>
      </Modal>

      {/* lab modal */}
      <Modal open={showLab} onClose={() => setShowLab(false)} title="Upload lab report"
        description={labFor ? `Filed against visit ${labFor.label}. The doctor and patient will see it straight away.` : ""}>
        <div className="flex flex-col gap-4">
          <label className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center text-[13.5px] transition-colors ${
            labForm.data ? "border-ever-600 bg-ever-50 text-ever-800" : "border-hairline bg-porcelain text-ink-mute hover:border-ever-600/50"}`}>
            <span className="grid h-10 w-10 place-items-center rounded-full bg-paper shadow-sm"><Paperclip className="h-4 w-4" /></span>
            {labForm.data ? <span className="font-semibold">Attached · {labForm.filename}</span>
              : <span><span className="font-semibold text-ink">Click to attach</span> a PDF or image</span>}
            <input type="file" className="sr-only" onChange={pickFile} />
          </label>
          <div>
            <label className="label" htmlFor="lab-name">File name</label>
            <input id="lab-name" placeholder="e.g. CBC_report.pdf" value={labForm.filename}
              onChange={(e) => setLabForm({ ...labForm, filename: e.target.value })} className="field" />
          </div>
          <div>
            <label className="label" htmlFor="lab-note">Note for the doctor <span className="font-normal text-ink-mute">(optional)</span></label>
            <textarea id="lab-note" rows={3} value={labForm.note}
              onChange={(e) => setLabForm({ ...labForm, note: e.target.value })} className="field" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setShowLab(false)} className="btn btn-secondary">Cancel</button>
            <button onClick={uploadLab} disabled={busy} className="btn btn-primary disabled:opacity-60">File report</button>
          </div>
        </div>
      </Modal>
      {/* access code modal */}
      <Modal open={!!accessFor} onClose={() => setAccessFor(null)} title={`Patient access · ${accessFor?.visit.label || ""}`}
        description={accessFor?.code ? "Give this code to the patient. It is shown only once." : "Codes are stored only as hashes, so an existing code cannot be shown again."}>
        {accessFor && (
          <div className="flex flex-col gap-4">
            {accessFor.code ? (
              <div className="rounded-xl border border-hairline bg-porcelain p-4 text-center">
                <p className="font-mono text-[24px] font-semibold tracking-wider">{accessFor.code}</p>
                <p className="mt-1 text-[12.5px] text-ink-mute">Valid until {fmtDateTime(accessFor.expiresAt)}</p>
                <button onClick={() => navigator.clipboard?.writeText(accessFor.code).then(() => toast("Code copied"))}
                  className="btn btn-sm btn-secondary mt-3"><Copy className="h-3.5 w-3.5" /> Copy</button>
              </div>
            ) : (
              <p className="rounded-lg bg-porcelain px-3 py-2.5 text-[13px] text-ink-soft">
                {accessFor.visit.accessExpiresAt && accessFor.visit.accessExpiresAt > Date.now()
                  ? <>Current code is valid until <b>{fmtDateTime(accessFor.visit.accessExpiresAt)}</b>.</>
                  : <>This visit has <b>no working access code</b>.</>}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => revoke(accessFor.visit)} disabled={busy} className="btn btn-secondary text-rose-600 disabled:opacity-60">Revoke access</button>
              <button onClick={() => reissue(accessFor.visit)} disabled={busy} className="btn btn-primary disabled:opacity-60">Issue new code</button>
            </div>
          </div>
        )}
      </Modal>
    </Shell>
  );
}
