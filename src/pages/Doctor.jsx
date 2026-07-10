import { useMemo, useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@heroui/react";
import { Send, FileText, ChevronLeft, FlaskConical } from "lucide-react";
import { useStore, fmtTime, DOCTORS } from "../lib/store";
import { Shell, useToast, spring } from "../lib/Shell";

const SNIPPETS = [
  "Continue same medication. Review after 3 days.",
  "Increase fluids, monitor temperature 6-hourly.",
  "Come to OPD tomorrow morning, fasting, for repeat labs.",
  "Report immediately if breathing difficulty or drowsiness.",
];

export default function Doctor() {
  const store = useStore();
  const toast = useToast();
  const [me, setMe] = useState("d1");
  const [active, setActive] = useState(null);
  const [draft, setDraft] = useState("");
  const [showLabs, setShowLabs] = useState(false);
  const endRef = useRef(null);

  const myPatients = useMemo(
    () => store.patients.filter((p) => p.doctorId === me),
    [store.patients, me]
  );
  const thread = active ? store.threads[active] || [] : [];
  const labs = useMemo(() => store.labs.filter((l) => l.token === active), [store.labs, active]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [thread.length, active]);

  const send = async () => {
    if (!draft.trim() || !active) return;
    await store.sendMessage(active, "doctor", draft.trim());
    setDraft("");
  };

  return (
    <Shell title="Consult room" sub="Cases arrive as tokens. The person stays a person, not a headline." online={store.online}>
      {/* doctor switcher */}
      <div className="mb-4 flex gap-1.5 overflow-x-auto">
        {DOCTORS.map((d) => (
          <button key={d.id} onClick={() => { setMe(d.id); setActive(null); }}
            className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold ${
              me === d.id ? "bg-ever-800 text-ever-50" : "border border-hairline bg-paper text-ink-soft"}`}>
            {d.name}
          </button>
        ))}
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[300px_1fr]">
        {/* inbox */}
        <div className={`min-w-0 rounded-2xl border border-hairline bg-paper ${active ? "hidden lg:block" : ""}`}>
          <div className="border-b border-hairline px-4 py-3 font-mono text-[10.5px] tracking-wide text-ink-mute">
            INBOX · {myPatients.length} {myPatients.length === 1 ? "CASE" : "CASES"}
          </div>
          {myPatients.length === 0 && (
            <p className="px-4 py-8 text-center text-[13px] text-ink-mute">No cases assigned yet. Reception routes them here.</p>
          )}
          {myPatients.map((p) => {
            const t = store.threads[p.token] || [];
            const last = t[t.length - 1];
            const unread = last?.from === "patient";
            return (
              <button key={p.token} onClick={() => setActive(p.token)}
                className={`block w-full border-b border-hairline px-4 py-3 text-left last:border-0 ${
                  active === p.token ? "bg-ever-50" : "hover:bg-porcelain"}`}>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[13px] font-medium text-ever-800">#{p.token}</span>
                  <div className="flex items-center gap-2">
                    {unread && <span className="h-2 w-2 rounded-full bg-marigold-500" />}
                    <span className="text-[11px] text-ink-mute">{p.age}{p.sex} · {p.status}</span>
                  </div>
                </div>
                <p className="mt-1 truncate text-[12.5px] text-ink-soft">
                  {last ? last.text : "No messages yet"}
                </p>
              </button>
            );
          })}
        </div>

        {/* chat pane */}
        <div className={`flex min-h-[480px] min-w-0 flex-col overflow-hidden rounded-2xl border border-hairline bg-paper ${!active ? "hidden lg:flex" : ""}`}>
          {!active ? (
            <div className="grid flex-1 place-items-center p-8 text-center">
              <div>
                <FileText className="mx-auto h-8 w-8 text-celadon" />
                <p className="mt-3 text-[13.5px] text-ink-mute">Select a case from the inbox to open its thread.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
                <div className="flex items-center gap-2">
                  <button onClick={() => setActive(null)} className="lg:hidden" aria-label="Back">
                    <ChevronLeft className="h-5 w-5 text-ink-soft" />
                  </button>
                  <span className="font-mono text-[13px] font-semibold text-ever-800">CASE #{active}</span>
                </div>
                <button onClick={() => setShowLabs((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-porcelain px-2.5 py-1.5 text-[12px] font-semibold text-ink-soft">
                  <FlaskConical className="h-3.5 w-3.5" /> Labs ({labs.length})
                </button>
              </div>

              <AnimatePresence>
                {showLabs && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}
                    className="overflow-hidden border-b border-hairline bg-ever-50">
                    {labs.length === 0 ? (
                      <p className="px-4 py-3 text-[12.5px] text-ink-mute">No lab files against this token yet.</p>
                    ) : labs.map((l) => (
                      <div key={l.id} className="flex items-center justify-between px-4 py-2.5">
                        <div>
                          <p className="font-mono text-[12.5px] font-medium">{l.filename}</p>
                          {l.note && <p className="text-[11.5px] text-ink-mute">{l.note}</p>}
                        </div>
                        <span className="font-mono text-[10.5px] text-ink-mute">{fmtTime(l.ts)}</span>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
                {thread.map((m, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring}
                    className={`max-w-[80%] ${m.from === "doctor" ? "self-end" : "self-start"}`}>
                    <div className={`rounded-xl px-3.5 py-2.5 text-[13.5px] leading-relaxed ${
                      m.from === "doctor" ? "bg-ever-800 text-ever-50" : "border border-hairline bg-porcelain"}`}>
                      {m.text}
                    </div>
                    <p className={`mt-0.5 px-1 font-mono text-[10px] text-ink-mute ${m.from === "doctor" ? "text-right" : ""}`}>{fmtTime(m.ts)}</p>
                  </motion.div>
                ))}
                {thread.length === 0 && (
                  <p className="m-auto text-[13px] text-ink-mute">Thread is empty. Your reply starts it.</p>
                )}
                <div ref={endRef} />
              </div>

              {/* snippets */}
              <div className="flex gap-1.5 overflow-x-auto border-t border-hairline px-3 pt-2.5">
                {SNIPPETS.map((s) => (
                  <button key={s} onClick={() => setDraft(s)}
                    className="whitespace-nowrap rounded-full border border-hairline bg-porcelain px-3 py-1 text-[11.5px] text-ink-soft hover:border-ever-600">
                    {s.slice(0, 34)}…
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 p-3">
                <input value={draft} onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send()}
                  placeholder={`Reply to #${active}`}
                  className="flex-1 rounded-xl border border-hairline bg-porcelain px-3.5 py-2.5 text-[13.5px] outline-none focus:border-ever-600" />
                <Button isIconOnly onPress={send} aria-label="Send"
                  className="rounded-xl bg-ever-800 text-ever-50"><Send className="h-4 w-4" /></Button>
              </div>
            </>
          )}
        </div>
      </div>
    </Shell>
  );
}
