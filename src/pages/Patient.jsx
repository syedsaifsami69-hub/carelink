import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Send, Download, KeyRound, FlaskConical, FileText, ShieldCheck, ArrowRight, Lock } from "lucide-react";
import { api, useSession, useWorkspace, fmtTime } from "../lib/store";
import { Shell, useToast, spring, Avatar, initials, StatusBadge } from "../lib/Shell";

export default function Patient() {
  const { me } = useSession();
  if (me === undefined) return null;
  return me?.kind === "patient" ? <PatientVisit /> : <PatientGate />;
}

function PatientGate() {
  const { setMe } = useSession();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const enter = async () => {
    if (!code.trim() || busy) return;
    setBusy(true); setError("");
    try { setMe(await api("/api/patient/access", { method: "POST", body: { code } })); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
      <Shell title="Patient portal" sub="Everything here runs on your access code — never your name." online>
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={spring}
          className="surface mx-auto grid max-w-3xl overflow-hidden md:grid-cols-2">
          <div className="relative hidden flex-col justify-between overflow-hidden bg-ever-900 p-8 text-white md:flex">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_60%_at_100%_0%,rgba(242,147,125,0.55),transparent_70%)]" />
            <div className="relative">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15"><ShieldCheck className="h-5 w-5" /></span>
              <h2 className="mt-6 font-display text-[22px] font-bold leading-snug">Your care, without your name on it.</h2>
            </div>
            <ul className="relative flex flex-col gap-3 text-[13.5px] text-white/80">
              {["Message your doctor directly", "Download lab reports", "Nothing to install or sign up for"].map((x) => (
                <li key={x} className="flex items-center gap-2.5"><Lock className="h-3.5 w-3.5 opacity-70" />{x}</li>
              ))}
            </ul>
          </div>
          <div className="p-8">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-ever-100"><KeyRound className="h-5 w-5 text-ever-800" /></span>
            <h2 className="mt-5 font-display text-[22px] font-bold">Enter your access code</h2>
            <p className="mt-1.5 text-[14px] text-ink-soft">Reception gave you a 16-character code like <span className="font-mono">7K2M-…</span>. Dashes and capitals are optional.</p>
            <label className="label mt-6" htmlFor="code">Access code</label>
            <input id="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && enter()}
              placeholder="XXXX-XXXX-XXXX-XXXX" maxLength={24} autoComplete="off" spellCheck={false}
              aria-invalid={!!error} aria-describedby={error ? "code-error" : undefined}
              className="field h-14 text-center font-mono text-[18px] font-medium tracking-[0.12em]" />
            {error && <p id="code-error" role="alert" className="mt-3 rounded-lg bg-rose-100 px-3 py-2.5 text-[13px] font-medium text-rose-600">{error}</p>}
            <button onClick={enter} disabled={busy} className="btn btn-lg btn-primary mt-4 w-full disabled:opacity-60">
              {busy ? "Checking…" : <>Open my visit <ArrowRight className="h-4 w-4" /></>}
            </button>
            <p className="mt-4 text-center text-[12.5px] text-ink-mute">Lost your code? Reception can issue a new one.</p>
          </div>
        </motion.div>
      </Shell>
  );
}

function PatientVisit() {
  const { data, online, refresh, error } = useWorkspace();
  const toast = useToast();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);
  const thread = data?.messages || [];
  const labs = data?.labs || [];
  const doctor = data?.doctor;
  const patient = data?.visit;

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [thread.length]);

  const send = async () => {
    if (!draft.trim() || !patient || sending) return;
    setSending(true);
    try { await api(`/api/visits/${patient.id}/messages`, { method: "POST", body: { text: draft.trim() } }); setDraft(""); await refresh(); }
    catch (e) { toast(e.message); }
    finally { setSending(false); }
  };

  if (error) return (
    <Shell title="Patient portal" online={online}>
      <p role="alert" className="rounded-lg bg-rose-100 px-4 py-3 text-[13.5px] font-medium text-rose-600">Couldn't load your visit: {error.message}</p>
    </Shell>
  );

  return (
    <Shell title={patient ? `Visit #${patient.label}` : "Your visit"} sub="Only your doctor can read this thread." online={online}>
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* thread */}
        <div className="surface flex h-[calc(100vh-230px)] min-h-[480px] flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-3.5">
            <div className="flex items-center gap-3">
              <Avatar label={initials(doctor?.name)} seed={doctor?.name} size={38} />
              <div className="leading-tight">
                <p className="text-[14.5px] font-semibold">{doctor?.name || "Your doctor"}</p>
                <p className="text-[12.5px] text-ink-mute">{doctor?.department}</p>
              </div>
            </div>
            {patient && <StatusBadge status={patient.status} />}
          </div>
          <div className="scroll-thin flex flex-1 flex-col gap-3 overflow-y-auto bg-porcelain/40 p-5">
            {thread.map((m) => {
              const mine = m.from === "patient";
              return (
                <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring}
                  className={`max-w-[78%] ${mine ? "self-end" : "self-start"}`}>
                  <div className={`px-4 py-2.5 text-[14px] leading-relaxed shadow-sm ${
                    mine ? "rounded-2xl rounded-br-md bg-ever-800 text-white" : "rounded-2xl rounded-bl-md border border-hairline bg-paper"}`}>
                    {m.text}
                  </div>
                  <p className={`mt-1 px-1 text-[11px] text-ink-mute ${mine ? "text-right" : ""}`}>{mine ? "You" : "Doctor"} · {fmtTime(m.ts)}</p>
                </motion.div>
              );
            })}
            {thread.length === 0 && (
              <p className="m-auto max-w-xs text-center text-[13.5px] text-ink-mute">No messages yet. Describe how you're feeling and your doctor will reply here.</p>
            )}
            <div ref={endRef} />
          </div>
          <div className="flex items-center gap-2 border-t border-hairline bg-paper p-3">
            <input value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Message your doctor" aria-label="Message"
              className="field h-11 bg-porcelain" />
            <button onClick={send} aria-label="Send" disabled={!draft.trim() || sending}
              className="btn btn-primary h-11 w-11 shrink-0 px-0 disabled:opacity-50"><Send className="h-4 w-4" /></button>
          </div>
        </div>

        {/* side */}
        <div className="flex flex-col gap-5">
          <div className="surface p-5">
            <p className="eyebrow">Visit</p>
            <dl className="mt-3 flex flex-col gap-2.5 text-[13.5px]">
              <div className="flex justify-between"><dt className="text-ink-mute">Visit</dt><dd className="font-mono font-semibold">{patient?.label}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-mute">Department</dt><dd className="font-medium">{doctor?.department}</dd></div>
              <div className="flex items-center justify-between"><dt className="text-ink-mute">Status</dt><dd>{patient && <StatusBadge status={patient.status} />}</dd></div>
            </dl>
          </div>

          <div className="surface overflow-hidden">
            <div className="flex items-center justify-between border-b border-hairline px-5 py-3.5">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-ever-700" />
                <span className="text-[14px] font-bold">My reports</span>
              </div>
              <span className="badge h-5 bg-porcelain px-2 text-[11px] text-ink-mute">{labs.length}</span>
            </div>
            {labs.length === 0 ? (
              <p className="px-5 py-10 text-center text-[13px] text-ink-mute">Reports uploaded by the lab will appear here.</p>
            ) : (
              <div className="flex flex-col p-2">
                <AnimatePresence initial={false}>
                  {labs.map((l) => (
                    <motion.div key={l.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-porcelain">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-sky-100"><FileText className="h-4 w-4 text-sky-700" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-semibold">{l.filename}</p>
                        <p className="truncate text-[12px] text-ink-mute">{fmtTime(l.ts)}{l.note ? ` · ${l.note}` : ""}</p>
                      </div>
                      {l.stored
                        ? <a href={`/api/labs/${l.id}/download`} aria-label={`Download ${l.filename}`} className="btn btn-sm btn-secondary w-9 px-0"><Download className="h-4 w-4" /></a>
                        : <span className="text-[11.5px] text-ink-mute" title="Collect the printed copy at the lab counter">Paper copy</span>}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}
