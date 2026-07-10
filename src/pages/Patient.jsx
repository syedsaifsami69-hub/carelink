import { useMemo, useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@heroui/react";
import { Send, Download, KeyRound, LogOut, FlaskConical } from "lucide-react";
import { useStore, fmtTime, DOCTORS } from "../lib/store";
import { Shell, useToast, spring } from "../lib/Shell";

export default function Patient() {
  const store = useStore();
  const toast = useToast();
  const [token, setToken] = useState("");
  const [entered, setEntered] = useState(null);
  const [draft, setDraft] = useState("");
  const endRef = useRef(null);

  const patient = useMemo(
    () => store.patients.find((p) => p.token === entered),
    [store.patients, entered]
  );
  const thread = entered ? store.threads[entered] || [] : [];
  const labs = useMemo(() => store.labs.filter((l) => l.token === entered), [store.labs, entered]);
  const doctor = DOCTORS.find((d) => d.id === patient?.doctorId);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [thread.length]);

  const enter = () => {
    const t = token.trim().toUpperCase();
    if (store.patients.some((p) => p.token === t)) { setEntered(t); }
    else toast("Token not found — check the slip from reception (try A417)");
  };

  const send = async () => {
    if (!draft.trim()) return;
    await store.sendMessage(entered, "patient", draft.trim());
    setDraft("");
  };

  if (!entered) {
    return (
      <Shell title="Patient portal" sub="Everything here runs on your token — never your name." online={store.online}>
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={spring}
          className="mx-auto max-w-sm rounded-2xl border border-hairline bg-paper p-6 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-ever-100">
            <KeyRound className="h-5 w-5 text-ever-800" />
          </div>
          <h2 className="mt-4 font-display text-xl font-bold">Enter your token</h2>
          <p className="mt-1.5 text-[13px] text-ink-soft">It's on the slip reception gave you — one letter, three digits.</p>
          <input value={token} onChange={(e) => setToken(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && enter()}
            placeholder="A417" maxLength={4}
            className="mt-4 w-full rounded-xl border border-hairline bg-porcelain px-3 py-3 text-center font-mono text-lg tracking-[0.3em] outline-none focus:border-ever-600" />
          <Button onPress={enter} fullWidth className="mt-3 rounded-xl bg-ever-800 text-ever-50">Open my file</Button>
          <p className="mt-3 font-mono text-[10.5px] text-ink-mute">DEMO TOKENS: A417 · K208 · M551</p>
        </motion.div>
      </Shell>
    );
  }

  return (
    <Shell title={`Token #${entered}`} sub={doctor ? `Your doctor: ${doctor.name} · ${doctor.dept}` : ""} online={store.online}>
      <div className="mb-4 flex items-center justify-between">
        <span className={`rounded-full px-3 py-1 text-[12px] font-semibold ${
          patient?.status === "Done" ? "bg-porcelain border border-hairline text-ink-mute" : "bg-marigold-100 text-marigold-600"}`}>
          Visit status: {patient?.status}
        </span>
        <button onClick={() => { setEntered(null); setToken(""); }}
          className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-mute hover:text-ink">
          <LogOut className="h-3.5 w-3.5" /> Exit
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        {/* thread */}
        <div className="flex min-h-[440px] flex-col rounded-2xl border border-hairline bg-paper">
          <div className="border-b border-hairline px-4 py-3 font-mono text-[10.5px] tracking-wide text-ink-mute">
            YOUR THREAD · ONLY YOUR DOCTOR READS THIS
          </div>
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
            {thread.map((m, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring}
                className={`max-w-[80%] ${m.from === "patient" ? "self-end" : "self-start"}`}>
                <div className={`rounded-xl px-3.5 py-2.5 text-[13.5px] leading-relaxed ${
                  m.from === "patient" ? "bg-ever-800 text-ever-50" : "border border-hairline bg-porcelain"}`}>
                  {m.text}
                </div>
                <p className={`mt-0.5 px-1 font-mono text-[10px] text-ink-mute ${m.from === "patient" ? "text-right" : ""}`}>{fmtTime(m.ts)}</p>
              </motion.div>
            ))}
            {thread.length === 0 && (
              <p className="m-auto text-center text-[13px] text-ink-mute">No messages yet. Describe how you're feeling — your doctor will reply here.</p>
            )}
            <div ref={endRef} />
          </div>
          <div className="flex items-center gap-2 p-3">
            <input value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Message your doctor"
              className="flex-1 rounded-xl border border-hairline bg-porcelain px-3.5 py-2.5 text-[13.5px] outline-none focus:border-ever-600" />
            <Button isIconOnly onPress={send} aria-label="Send"
              className="rounded-xl bg-ever-800 text-ever-50"><Send className="h-4 w-4" /></Button>
          </div>
        </div>

        {/* labs */}
        <div className="rounded-2xl border border-hairline bg-paper">
          <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
            <FlaskConical className="h-4 w-4 text-ever-700" />
            <span className="font-mono text-[10.5px] tracking-wide text-ink-mute">MY REPORTS</span>
          </div>
          {labs.length === 0 ? (
            <p className="px-4 py-8 text-center text-[12.5px] text-ink-mute">Reports uploaded by the lab will appear here, filed to your token.</p>
          ) : (
            <AnimatePresence initial={false}>
              {labs.map((l) => (
                <motion.div key={l.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring}
                  className="flex items-center justify-between border-b border-hairline px-4 py-3 last:border-0">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-[12.5px] font-medium">{l.filename}</p>
                    <p className="text-[11px] text-ink-mute">{fmtTime(l.ts)}{l.note ? ` · ${l.note}` : ""}</p>
                  </div>
                  <button onClick={() => { store.downloadLab(l) ? toast(`Downloading ${l.filename}`) : toast("This entry has no stored file \u2014 collect it at the lab counter"); }} aria-label="Download"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-hairline bg-porcelain text-ink-soft hover:border-ever-600">
                    <Download className="h-3.5 w-3.5" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>
    </Shell>
  );
}
