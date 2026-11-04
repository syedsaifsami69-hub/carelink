import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Send, ChevronLeft, FlaskConical, MessagesSquare, FileText, Sparkles, Download } from "lucide-react";
import { api, useWorkspace, fmtTime } from "../lib/store";
import { Shell, spring, Avatar, useToast, STATUS_TONE } from "../lib/Shell";

const DOCTOR_STATUSES = ["In consult", "Labs pending", "Follow-up", "Done"];

const SNIPPETS = [
  "Continue same medication. Review after 3 days.",
  "Increase fluids, monitor temperature 6-hourly.",
  "Come to OPD tomorrow morning, fasting, for repeat labs.",
  "Report immediately if breathing difficulty or drowsiness.",
];

export default function Doctor() {
  const { data, online, refresh, error } = useWorkspace();
  const toast = useToast();
  const [active, setActive] = useState(null); // visit id
  const [draft, setDraft] = useState("");
  const [showLabs, setShowLabs] = useState(false);
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  const myPatients = data?.visits || [];
  const activePatient = myPatients.find((p) => p.id === active);
  const activeLabel = activePatient?.label;
  const thread = activePatient?.messages || [];
  const labs = activePatient?.labs || [];

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [thread.length, active]);

  const setStatus = async (status) => {
    setSending(true);
    try { await api(`/api/visits/${active}`, { method: "PATCH", body: { status } }); await refresh(); }
    catch (e) { toast(e.message, "error"); }
    finally { setSending(false); }
  };

  const send = async () => {
    if (!draft.trim() || !active || sending) return;
    setSending(true);
    try { await api(`/api/visits/${active}/messages`, { method: "POST", body: { text: draft.trim() } }); setDraft(""); await refresh(); }
    catch (e) { toast(e.message, "error"); }
    finally { setSending(false); }
  };

  return (
    <Shell title="Consult room" sub="Cases arrive as visit labels. The person stays a person, not a headline." online={online}>
      {error && <p role="alert" className="mb-4 rounded-lg bg-rose-100 px-4 py-3 text-[13.5px] font-medium text-rose-600">Couldn't load your cases: {error.message}</p>}
      <div className="surface grid h-[calc(100vh-230px)] min-h-[540px] min-w-0 overflow-hidden lg:grid-cols-[320px_1fr]">
        {/* inbox */}
        <div className={`flex min-h-0 min-w-0 flex-col border-hairline lg:border-r ${active ? "hidden lg:flex" : "flex"}`}>
          <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
            <div>
              <p className="text-[15px] font-bold">Inbox</p>
              <p className="text-[12.5px] text-ink-mute">{myPatients.length} {myPatients.length === 1 ? "case" : "cases"} assigned</p>
            </div>
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-ever-50"><MessagesSquare className="h-4 w-4 text-ever-700" /></span>
          </div>
          <div className="scroll-thin flex-1 overflow-y-auto p-2">
            {myPatients.length === 0 && (
              <p className="px-4 py-10 text-center text-[13px] text-ink-mute">No cases assigned yet. Reception routes them here.</p>
            )}
            {myPatients.map((p) => {
              const t = p.messages;
              const last = t[t.length - 1];
              const unread = last?.from === "patient";
              const on = active === p.id;
              return (
                <button key={p.id} onClick={() => setActive(p.id)}
                  className={`flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors ${on ? "bg-ever-50" : "hover:bg-porcelain"}`}>
                  <Avatar label={p.label.slice(0, 1)} seed={p.id} size={38} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[13.5px] font-semibold">#{p.label}</span>
                      <span className="text-[11.5px] text-ink-mute">{last ? fmtTime(last.ts) : ""}</span>
                    </div>
                    <p className="text-[12px] text-ink-mute">{p.age} yrs · {p.sex} · {p.status}{p.queue ? ` · #${p.queue.position} in line` : ""}{p.priority ? " · Priority" : ""}</p>
                    <p className={`mt-1 truncate text-[13px] ${unread ? "font-semibold text-ink" : "text-ink-soft"}`}>
                      {last ? last.text : "No messages yet"}
                    </p>
                  </div>
                  {unread && <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-marigold-500" aria-label="Unread" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* chat pane */}
        <div className={`min-h-0 min-w-0 flex-col ${!active ? "hidden lg:flex" : "flex"}`}>
          {!active ? (
            <div className="grid flex-1 place-items-center bg-porcelain/40 p-8 text-center">
              <div>
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-paper shadow-sm ring-1 ring-hairline">
                  <FileText className="h-6 w-6 text-ever-700" />
                </span>
                <p className="mt-4 text-[15px] font-semibold">Select a case</p>
                <p className="mt-1 text-[13.5px] text-ink-mute">Pick a token from the inbox to open its thread and lab files.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-3.5">
                <div className="flex min-w-0 items-center gap-3">
                  <button onClick={() => setActive(null)} className="btn btn-sm btn-ghost -ml-2 w-8 px-0 lg:hidden" aria-label="Back to inbox">
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <Avatar label={activeLabel?.slice(0, 1)} seed={active} size={38} />
                  <div className="min-w-0 leading-tight">
                    <p className="font-mono text-[14.5px] font-semibold">Case #{activeLabel}</p>
                    <p className="text-[12.5px] text-ink-mute">{activePatient?.age} yrs · {activePatient?.sex}</p>
                  </div>
                  {activePatient && (
                    <label>
                      <span className="sr-only">Visit status</span>
                      <select value={activePatient.status} disabled={sending} onChange={(e) => setStatus(e.target.value)}
                        className={`h-8 cursor-pointer appearance-none rounded-full px-3 text-[12.5px] font-semibold outline-none ${STATUS_TONE[activePatient.status] || ""}`}>
                        {[activePatient.status, ...DOCTOR_STATUSES.filter((s) => s !== activePatient.status)].map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </label>
                  )}
                </div>
                <button onClick={() => setShowLabs((v) => !v)} aria-expanded={showLabs}
                  className={`btn btn-sm ${showLabs ? "btn-primary" : "btn-secondary"}`}>
                  <FlaskConical className="h-3.5 w-3.5" /> Labs <span className="opacity-70">{labs.length}</span>
                </button>
              </div>

              <AnimatePresence>
                {showLabs && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}
                    className="overflow-hidden border-b border-hairline bg-porcelain/60">
                    <div className="flex flex-col gap-2 p-3">
                      {labs.length === 0 ? (
                        <p className="px-2 py-2 text-[13px] text-ink-mute">No lab files against this token yet.</p>
                      ) : labs.map((l) => (
                        <div key={l.id} className="surface flex items-center gap-3 px-3.5 py-2.5">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-sky-100"><FileText className="h-4 w-4 text-sky-700" /></span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13.5px] font-semibold">{l.filename}</p>
                            {l.note && <p className="truncate text-[12px] text-ink-mute">{l.note}</p>}
                          </div>
                          <span className="text-[12px] text-ink-mute">{fmtTime(l.ts)}</span>
                          {l.stored
                            ? <a href={`/api/labs/${l.id}/download`} aria-label={`Download ${l.filename}`} className="btn btn-sm btn-secondary w-9 px-0"><Download className="h-4 w-4" /></a>
                            : <span className="text-[11.5px] text-ink-mute">Paper copy</span>}
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="scroll-thin flex flex-1 flex-col gap-3 overflow-y-auto bg-porcelain/40 p-5">
                {thread.map((m, i) => {
                  const mine = m.from === "doctor";
                  return (
                    <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring}
                      className={`max-w-[78%] ${mine ? "self-end" : "self-start"}`}>
                      <div className={`px-4 py-2.5 text-[14px] leading-relaxed shadow-sm ${
                        mine ? "rounded-2xl rounded-br-md bg-ever-800 text-white" : "rounded-2xl rounded-bl-md border border-hairline bg-paper"}`}>
                        {m.text}
                      </div>
                      <p className={`mt-1 px-1 text-[11px] text-ink-mute ${mine ? "text-right" : ""}`}>{mine ? "You" : `#${activeLabel}`} · {fmtTime(m.ts)}</p>
                    </motion.div>
                  );
                })}
                {thread.length === 0 && (
                  <p className="m-auto text-[13.5px] text-ink-mute">This thread is empty. Your reply starts it.</p>
                )}
                <div ref={endRef} />
              </div>

              {/* composer */}
              <div className="border-t border-hairline bg-paper p-3">
                <div className="scroll-thin mb-2.5 flex items-center gap-1.5 overflow-x-auto pb-0.5">
                  <Sparkles className="h-3.5 w-3.5 shrink-0 text-ink-mute" />
                  {SNIPPETS.map((s) => (
                    <button key={s} onClick={() => setDraft(s)} title={s}
                      className="whitespace-nowrap rounded-full border border-hairline bg-porcelain px-3 py-1 text-[12px] font-medium text-ink-soft hover:border-ever-600/50 hover:text-ink">
                      {s.length > 34 ? s.slice(0, 34) + "…" : s}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input value={draft} onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && send()}
                    placeholder={`Reply to #${activeLabel}`} aria-label="Reply"
                    className="field h-11 bg-porcelain" />
                  <button onClick={send} aria-label="Send" disabled={!draft.trim() || sending}
                    className="btn btn-primary h-11 w-11 shrink-0 px-0 disabled:opacity-50"><Send className="h-4 w-4" /></button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </Shell>
  );
}
