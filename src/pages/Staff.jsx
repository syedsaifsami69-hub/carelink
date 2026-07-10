import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Button, Input, TextArea } from "@heroui/react";
import { UserPlus, Upload, Search, Users, MessageSquare, FlaskConical, Clock, Table2, Columns3, ArrowRight, Paperclip } from "lucide-react";
import { useStore, genToken, fmtTime } from "../lib/store";
import { Shell, Modal, useToast, spring } from "../lib/Shell";

const STATUSES = ["Waiting", "In consult", "Labs pending", "Done"];
const statusTone = {
  "Waiting": "bg-marigold-100 text-marigold-600",
  "In consult": "bg-ever-100 text-ever-800 dark:text-ever-500",
  "Labs pending": "bg-celadon text-ever-900 dark:text-ever-500",
  "Done": "bg-porcelain text-ink-mute border border-hairline",
};

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
    { icon: Users, label: "Patients today", value: store.patients.length },
    { icon: MessageSquare, label: "Open threads", value: Object.values(store.threads).filter((t) => t.length).length },
    { icon: FlaskConical, label: "Lab files", value: store.labs.length },
    { icon: Clock, label: "Waiting", value: store.patients.filter((p) => p.status === "Waiting").length },
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

  return (
    <Shell title="Reception desk" sub="Names live here and nowhere else." online={store.online}>
      {/* stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: i * 0.05 }}
            className="rounded-2xl border border-hairline bg-paper p-4">
            <s.icon className="h-4 w-4 text-ever-700" />
            <p className="mt-2 font-display text-2xl font-bold">{s.value}</p>
            <p className="text-[12px] text-ink-mute">{s.label}</p>
          </motion.div>
        ))}
      </div>

      {/* toolbar */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mute" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or token"
            className="w-full rounded-xl border border-hairline bg-paper py-2.5 pl-9 pr-3 text-[13.5px] outline-none focus:border-ever-600" />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {["All", ...STATUSES].map((s) => (
            <button key={s} onClick={() => setFilter(s)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-semibold ${
                filter === s ? "bg-ink text-porcelain" : "bg-paper text-ink-soft border border-hairline"}`}>
              {s}
            </button>
          ))}
        </div>
        <div className="flex rounded-xl border border-hairline bg-paper p-0.5">
          {[["table", Table2], ["board", Columns3]].map(([v, Icon]) => (
            <button key={v} onClick={() => setView(v)} aria-label={v + " view"}
              className={`grid h-8 w-9 place-items-center rounded-[10px] ${view === v ? "bg-ever-800 text-ever-50" : "text-ink-mute"}`}>
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
        <Button size="sm" onPress={() => setShowReg(true)}
          className="rounded-xl bg-ever-800 px-4 text-ever-50">
          <UserPlus className="h-4 w-4" /> Register
        </Button>
      </div>

      {/* board view */}
      {view === "board" && (
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {STATUSES.map((col) => {
            const cards = rows.filter((p) => p.status === col);
            return (
              <div key={col}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragToken) { store.updatePatient(dragToken, { status: col }); toast(`${dragToken} \u2192 ${col}`); setDragToken(null); } }}
                className="rounded-2xl border border-hairline bg-paper p-2.5">
                <div className="flex items-center justify-between px-1.5 pb-2">
                  <span className="font-mono text-[10.5px] tracking-wide text-ink-mute">{col.toUpperCase()}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${statusTone[col]}`}>{cards.length}</span>
                </div>
                <div className="flex min-h-[60px] flex-col gap-2">
                  <AnimatePresence initial={false}>
                    {cards.map((p) => (
                      <motion.div key={p.token} layout draggable
                        onDragStart={() => setDragToken(p.token)}
                        initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                        transition={spring}
                        className="cursor-grab rounded-xl border border-hairline bg-porcelain p-3 active:cursor-grabbing">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[12.5px] font-semibold text-ever-800">{p.token}</span>
                          <span className="text-[11px] text-ink-mute">{p.age}{p.sex}</span>
                        </div>
                        <p className="mt-1 truncate text-[13px] font-medium">{p.name}</p>
                        <p className="truncate text-[11px] text-ink-mute">{store.doctors.find((d) => d.id === p.doctorId)?.name}</p>
                        {col !== "Done" && (
                          <button onClick={() => advance(p)}
                            className="mt-2 inline-flex items-center gap-1 rounded-lg border border-hairline bg-paper px-2 py-1 text-[11px] font-semibold text-ink-soft md:hidden">
                            Next <ArrowRight className="h-3 w-3" />
                          </button>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {cards.length === 0 && <p className="px-1.5 py-3 text-center text-[11.5px] text-ink-mute">Drop here</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* table */}
      {view === "table" && (
      <div className="mt-4 overflow-hidden rounded-2xl border border-hairline bg-paper">
        <div className="hidden grid-cols-[80px_1.4fr_60px_1.2fr_1fr_120px] gap-2 border-b border-hairline px-4 py-2.5 font-mono text-[10.5px] tracking-wide text-ink-mute md:grid">
          <span>TOKEN</span><span>NAME</span><span>AGE</span><span>DOCTOR</span><span>STATUS</span><span></span>
        </div>
        <AnimatePresence initial={false}>
          {rows.map((p) => (
            <motion.div key={p.token} layout
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={spring}
              className="grid grid-cols-2 gap-2 border-b border-hairline px-4 py-3 last:border-0 md:grid-cols-[80px_1.4fr_60px_1.2fr_1fr_120px] md:items-center">
              <span className="font-mono text-[13px] font-medium text-ever-800">{p.token}</span>
              <span className="text-[13.5px] font-medium">{p.name}</span>
              <span className="text-[13px] text-ink-soft">{p.age}{p.sex}</span>
              <select value={p.doctorId}
                onChange={(e) => { store.updatePatient(p.token, { doctorId: e.target.value }); }}
                className="rounded-lg border border-hairline bg-porcelain px-2 py-1 text-[12.5px]">
                {store.doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <select value={p.status}
                onChange={(e) => store.updatePatient(p.token, { status: e.target.value })}
                className={`rounded-lg px-2 py-1 text-[12px] font-semibold ${statusTone[p.status]}`}>
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
              <button onClick={() => { setLabFor(p.token); setShowLab(true); }}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-hairline bg-porcelain px-2.5 py-1.5 text-[12px] font-semibold text-ink-soft hover:border-ever-600">
                <Upload className="h-3.5 w-3.5" /> Lab
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
        {rows.length === 0 && (
          <div className="px-4 py-10 text-center text-[13.5px] text-ink-mute">
            No patients match. Register one to issue a token.
          </div>
        )}
      </div>
      )}

      {/* register modal */}
      <Modal open={showReg} onClose={() => setShowReg(false)} title="Register patient">
        <div className="flex flex-col gap-3">
          <input autoFocus placeholder="Full name (stays at reception)" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="rounded-xl border border-hairline bg-porcelain px-3 py-2.5 text-[13.5px] outline-none focus:border-ever-600" />
          <div className="grid grid-cols-2 gap-3">
            <input type="number" placeholder="Age" value={form.age}
              onChange={(e) => setForm({ ...form, age: e.target.value })}
              className="rounded-xl border border-hairline bg-porcelain px-3 py-2.5 text-[13.5px] outline-none focus:border-ever-600" />
            <select value={form.sex} onChange={(e) => setForm({ ...form, sex: e.target.value })}
              className="rounded-xl border border-hairline bg-porcelain px-3 py-2.5 text-[13.5px]">
              <option>F</option><option>M</option><option>Other</option>
            </select>
          </div>
          <select value={form.doctorId} onChange={(e) => setForm({ ...form, doctorId: e.target.value })}
            className="rounded-xl border border-hairline bg-porcelain px-3 py-2.5 text-[13.5px]">
            {store.doctors.map((d) => <option key={d.id} value={d.id}>{d.name} — {d.dept}</option>)}
          </select>
          <p className="font-mono text-[11px] text-ink-mute">A token like {genToken()} will be issued on save.</p>
          <Button onPress={register} className="rounded-xl bg-ever-800 text-ever-50">Issue token</Button>
        </div>
      </Modal>

      {/* lab modal */}
      <Modal open={showLab} onClose={() => setShowLab(false)} title={`Upload lab · ${labFor || ""}`}>
        <div className="flex flex-col gap-3">
          <label className={`flex cursor-pointer items-center gap-2 rounded-xl border border-dashed px-3 py-3 text-[13px] ${labForm.data ? "border-ever-600 bg-ever-50 text-ever-800" : "border-hairline bg-porcelain text-ink-mute"}`}>
            <Paperclip className="h-4 w-4" />
            {labForm.data ? `Attached \u00b7 ${labForm.filename}` : "Attach report file (PDF, image\u2026)"}
            <input type="file" className="hidden" onChange={pickFile} />
          </label>
          <input placeholder="File name, e.g. CBC_report.pdf" value={labForm.filename}
            onChange={(e) => setLabForm({ ...labForm, filename: e.target.value })}
            className="rounded-xl border border-hairline bg-porcelain px-3 py-2.5 text-[13.5px] outline-none focus:border-ever-600" />
          <textarea placeholder="Note for the doctor (optional)" rows={3} value={labForm.note}
            onChange={(e) => setLabForm({ ...labForm, note: e.target.value })}
            className="rounded-xl border border-hairline bg-porcelain px-3 py-2.5 text-[13.5px] outline-none focus:border-ever-600" />
          <Button onPress={uploadLab} className="rounded-xl bg-ever-800 text-ever-50">File under token</Button>
        </div>
      </Modal>
    </Shell>
  );
}
