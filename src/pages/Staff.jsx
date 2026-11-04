import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { UserPlus, Upload, Search, Users, MessageSquare, FlaskConical, Clock, Table2, Columns3, ArrowRight, Paperclip, Inbox } from "lucide-react";
import { useStore, genToken } from "../lib/store";
import { Shell, Modal, useToast, spring, Avatar, initials, STATUS_TONE } from "../lib/Shell";

const STATUSES = ["Waiting", "In consult", "Labs pending", "Done"];

export default function Staff() {
  const store = useStore();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("All");
  const [showReg, setShowReg] = useState(false);
  const [showLab, setShowLab] = useState(false);
  const [labFor, setLabFor] = useState(null);
  const [form, setForm] = useState({ name: "", age: "", sex: "F", doctorId: "d1" });
  const [labForm, setLabForm] = useState({ filename: "", note: "", data: null, mime: null });
  const [view, setView] = useState("table");
  const [dragToken, setDragToken] = useState(null);

  const rows = useMemo(() => {
    let r = store.patients;
    if (filter !== "All") r = r.filter((p) => p.status === filter);
    if (q) r = r.filter((p) => (p.name + p.token).toLowerCase().includes(q.toLowerCase()));
    return r;
  }, [store.patients, q, filter]);

  const stats = [
    { icon: Users, label: "Patients today", value: store.patients.length, tone: "bg-ever-100 text-ever-800" },
    { icon: MessageSquare, label: "Open threads", value: Object.values(store.threads).filter((t) => t.length).length, tone: "bg-sky-100 text-sky-700" },
    { icon: FlaskConical, label: "Lab files", value: store.labs.length, tone: "bg-celadon text-ever-900" },
    { icon: Clock, label: "Waiting now", value: store.patients.filter((p) => p.status === "Waiting").length, tone: "bg-marigold-100 text-marigold-600" },
  ];

  const register = async () => {
    if (!form.name.trim() || !form.age) return toast("Name and age are required");
    const token = await store.registerPatient({ ...form, age: +form.age });
    setShowReg(false);
    setForm({ name: "", age: "", sex: "F", doctorId: "d1" });
    toast(`Registered — token ${token} issued`);
  };

  const pickFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setLabForm((lf) => ({
      ...lf, filename: lf.filename || f.name,
      data: r.result.split(",")[1], mime: f.type || "application/octet-stream",
    }));
    r.readAsDataURL(f);
  };

  const uploadLab = async () => {
    if (!labForm.filename.trim()) return toast("Add a file name or attach a file");
    await store.addLab({ token: labFor, ...labForm });
    await store.updatePatient(labFor, { status: "Labs pending" });
    setShowLab(false); setLabForm({ filename: "", note: "", data: null, mime: null });
    toast(`Lab filed under ${labFor}`);
  };

  const advance = (p) => {
    const i = STATUSES.indexOf(p.status);
    if (i < STATUSES.length - 1) store.updatePatient(p.token, { status: STATUSES[i + 1] });
  };

  const docName = (id) => store.doctors.find((d) => d.id === id)?.name;

  return (
    <Shell title="Reception desk" sub="Register patients, issue tokens and route cases. Names live here and nowhere else."
      online={store.online}
      actions={<button onClick={() => setShowReg(true)} className="btn btn-primary"><UserPlus className="h-4 w-4" /> Register patient</button>}>
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
                  onDrop={() => { if (dragToken) { store.updatePatient(dragToken, { status: col }); toast(`${dragToken} → ${col}`); setDragToken(null); } }}
                  className="rounded-xl border border-hairline bg-porcelain p-3">
                  <div className="flex items-center justify-between px-1 pb-3">
                    <span className="text-[13px] font-semibold">{col}</span>
                    <span className={`badge h-5 px-2 text-[11px] ${STATUS_TONE[col]}`}>{cards.length}</span>
                  </div>
                  <div className="flex min-h-[72px] flex-col gap-2">
                    <AnimatePresence initial={false}>
                      {cards.map((p) => (
                        <motion.div key={p.token} layout draggable
                          onDragStart={() => setDragToken(p.token)}
                          initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                          transition={spring}
                          className="surface cursor-grab p-3 active:cursor-grabbing">
                          <div className="flex items-center gap-2.5">
                            <Avatar label={initials(p.name)} seed={p.token} size={30} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13.5px] font-semibold">{p.name}</p>
                              <p className="text-[11.5px] text-ink-mute">{p.age} yrs · {p.sex}</p>
                            </div>
                            <span className="font-mono text-[12px] font-medium text-ever-800">{p.token}</span>
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
            <div className="hidden grid-cols-[1.6fr_90px_1.3fr_150px_96px] gap-4 border-b border-hairline bg-porcelain/60 px-5 py-2.5 text-[12px] font-semibold text-ink-mute md:grid">
              <span>Patient</span><span>Token</span><span>Assigned doctor</span><span>Status</span><span className="text-right">Actions</span>
            </div>
            <AnimatePresence initial={false}>
              {rows.map((p) => (
                <motion.div key={p.token} layout
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  transition={spring}
                  className="grid grid-cols-2 items-center gap-3 border-b border-hairline px-5 py-3.5 last:border-0 hover:bg-porcelain/50 md:grid-cols-[1.6fr_90px_1.3fr_150px_96px] md:gap-4">
                  <div className="col-span-2 flex items-center gap-3 md:col-span-1">
                    <Avatar label={initials(p.name)} seed={p.token} />
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold">{p.name}</p>
                      <p className="text-[12.5px] text-ink-mute">{p.age} yrs · {p.sex === "F" ? "Female" : p.sex === "M" ? "Male" : p.sex}</p>
                    </div>
                  </div>
                  <span className="w-fit rounded-md bg-ever-50 px-2 py-1 font-mono text-[12.5px] font-medium text-ever-800">{p.token}</span>
                  <select value={p.doctorId} aria-label={`Doctor for ${p.token}`}
                    onChange={(e) => { store.updatePatient(p.token, { doctorId: e.target.value }); }}
                    className="field h-9 bg-porcelain text-[13px]">
                    {store.doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  <label className="relative">
                    <span className="sr-only">Status for {p.token}</span>
                    <select value={p.status}
                      onChange={(e) => store.updatePatient(p.token, { status: e.target.value })}
                      className={`h-8 w-full cursor-pointer appearance-none rounded-full pl-3 pr-7 text-[12.5px] font-semibold outline-none ${STATUS_TONE[p.status]}`}>
                      {STATUSES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                    <svg className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 opacity-60" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m3 4.5 3 3 3-3" /></svg>
                  </label>
                  <div className="col-span-2 flex justify-end md:col-span-1">
                    <button onClick={() => { setLabFor(p.token); setShowLab(true); }}
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
        description="The name stays at reception. Everyone else sees only the token.">
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
            <select id="reg-doc" value={form.doctorId} onChange={(e) => setForm({ ...form, doctorId: e.target.value })} className="field">
              {store.doctors.map((d) => <option key={d.id} value={d.id}>{d.name} — {d.dept}</option>)}
            </select>
          </div>
          <p className="rounded-lg bg-porcelain px-3 py-2.5 text-[12.5px] text-ink-mute">
            A token like <span className="font-mono font-medium text-ink">{genToken()}</span> will be issued on save.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setShowReg(false)} className="btn btn-secondary">Cancel</button>
            <button onClick={register} className="btn btn-primary">Issue token</button>
          </div>
        </div>
      </Modal>

      {/* lab modal */}
      <Modal open={showLab} onClose={() => setShowLab(false)} title="Upload lab report"
        description={labFor ? `Filed against token ${labFor}. The doctor and patient will see it instantly.` : ""}>
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
            <button onClick={uploadLab} className="btn btn-primary">File under token</button>
          </div>
        </div>
      </Modal>
    </Shell>
  );
}
