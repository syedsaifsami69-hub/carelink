import { Link } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import {
  ShieldCheck, ArrowRight, FileText, Stethoscope, ClipboardList,
  UserRound, Lock, Send, FlaskConical,
} from "lucide-react";

const spring = { type: "spring", stiffness: 380, damping: 30 };

/* ---------- signature: live anonymized thread ---------- */
const DEMO = [
  { from: "patient", text: "Fever came back last night, 101.2°F even after the syrup." },
  { from: "doctor", text: "Continue paracetamol 6-hourly. If it crosses 102°F, come in immediately." },
  { from: "patient", text: "Okay doctor. Appetite is slightly better today." },
  { from: "doctor", text: "Good sign. Sending the X-ray review to your file now." },
];

function SenderChip({ role }) {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setRevealed((v) => !v), 2600);
    return () => clearInterval(t);
  }, []);
  if (role === "doctor")
    return <span className="font-mono text-[11px] text-ever-700">DR · PEDIATRICS</span>;
  return (
    <span className="relative inline-block h-[14px] w-[92px]">
      <AnimatePresence mode="wait" initial={false}>
        {revealed ? (
          <motion.span key="t" className="absolute inset-0 font-mono text-[11px] text-ink-soft"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            PATIENT #A417
          </motion.span>
        ) : (
          <motion.span key="r" className="redact absolute inset-0 text-[11px]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            ████████
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

function LiveThread() {
  const [count, setCount] = useState(1);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (count >= DEMO.length) return;
    const t = setTimeout(() => setCount((c) => c + 1), 1700);
    return () => clearTimeout(t);
  }, [count]);
  return (
    <div className="rounded-2xl border border-hairline bg-paper shadow-[0_24px_60px_-30px_rgba(14,95,76,0.35)] overflow-hidden">
      <div className="flex items-center justify-between border-b border-hairline bg-ever-50 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Lock className="h-3.5 w-3.5 text-ever-700" />
          <span className="font-mono text-[11px] tracking-wide text-ever-800">THREAD A417 · NAME NEVER LEAVES RECEPTION</span>
        </div>
        <span className="h-2 w-2 rounded-full bg-ever-500" />
      </div>
      <div className="flex min-h-[300px] flex-col gap-3 p-4">
        {DEMO.slice(0, count).map((m, i) => (
          <motion.div key={i}
            initial={reduce ? false : { opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={spring}
            className={`max-w-[85%] ${m.from === "doctor" ? "self-end" : "self-start"}`}>
            <div className={`mb-1 px-1 ${m.from === "doctor" ? "text-right" : ""}`}><SenderChip role={m.from} /></div>
            <div className={`rounded-xl px-3.5 py-2.5 text-[13.5px] leading-relaxed ${
              m.from === "doctor" ? "bg-ever-800 text-ever-50" : "bg-porcelain text-ink border border-hairline"}`}>
              {m.text}
            </div>
          </motion.div>
        ))}
      </div>
      <div className="flex items-center gap-2 border-t border-hairline px-4 py-3">
        <div className="h-8 flex-1 rounded-lg border border-hairline bg-porcelain" />
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-marigold-500"><Send className="h-3.5 w-3.5 text-ink" /></div>
      </div>
    </div>
  );
}

/* ---------- page ---------- */
const fade = {
  hidden: { opacity: 0, y: 14 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { ...spring, delay: i * 0.06 } }),
};

const PORTALS = [
  { to: "/staff", icon: ClipboardList, name: "Reception & Staff", desc: "Register patients, issue tokens, assign doctors, upload lab files.", accent: "bg-marigold-100 text-marigold-600" },
  { to: "/doctor", icon: Stethoscope, name: "Doctor", desc: "Answer threads by token. See labs, never the queue's names.", accent: "bg-ever-100 text-ever-800" },
  { to: "/patient", icon: UserRound, name: "Patient", desc: "Message your doctor and collect reports with just your token.", accent: "bg-celadon text-ever-900" },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-porcelain">
      {/* nav */}
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-ever-800 font-display text-lg font-bold text-ever-50">+</div>
          <span className="font-display text-lg font-semibold tracking-tight">CareLink</span>
        </div>
        <div className="flex items-center gap-1.5">
          {PORTALS.map((p) => (
            <Link key={p.to} to={p.to}
              className="rounded-full px-3.5 py-1.5 text-[13px] font-medium text-ink-soft hover:bg-celadon/60">
              {p.name.split(" ")[0]}
            </Link>
          ))}
        </div>
      </nav>

      {/* hero */}
      <header className="mx-auto grid max-w-6xl gap-10 px-5 pb-20 pt-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div>
          <motion.p variants={fade} initial="hidden" animate="show" custom={0}
            className="mb-4 inline-flex items-center gap-2 rounded-full border border-ever-100 bg-ever-50 px-3 py-1 font-mono text-[11px] tracking-wide text-ever-800">
            <ShieldCheck className="h-3.5 w-3.5" /> ANONYMOUS CARE MESSAGING
          </motion.p>
          <motion.h1 variants={fade} initial="hidden" animate="show" custom={1}
            className="font-display text-[clamp(2.4rem,6vw,4.2rem)] font-bold leading-[1.03] tracking-tight text-ink">
            Talk to your doctor.<br />
            <span className="text-ever-800">Keep your name</span><br />
            out of it.
          </motion.h1>
          <motion.p variants={fade} initial="hidden" animate="show" custom={2}
            className="mt-5 max-w-md text-[15.5px] leading-relaxed text-ink-soft">
            CareLink relays every message through a reception-issued token. Doctors see the case,
            labs travel as files, and your identity stays in one drawer — at the front desk.
          </motion.p>
          <motion.div variants={fade} initial="hidden" animate="show" custom={3} className="mt-7 flex flex-wrap items-center gap-3">
            <Link to="/patient" className="lift inline-flex items-center gap-2 rounded-xl bg-ever-800 px-5 py-3 text-[14px] font-semibold text-ever-50">
              Open patient portal <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/staff" className="lift inline-flex items-center gap-2 rounded-xl border border-hairline bg-paper px-5 py-3 text-[14px] font-semibold text-ink">
              I work here
            </Link>
          </motion.div>
          <motion.p variants={fade} initial="hidden" animate="show" custom={4}
            className="mt-8 font-mono text-[11px] tracking-wide text-ink-mute">
            NO NAMES ON THE WIRE · LABS AS FILES, NOT GOSSIP · TOKENS EXPIRE WITH THE VISIT
          </motion.p>
        </div>
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.25 }}>
          <LiveThread />
        </motion.div>
      </header>

      {/* relay — a real sequence, so numbering carries meaning */}
      <section className="border-y border-hairline bg-paper">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="font-display text-3xl font-bold tracking-tight">The relay</h2>
          <p className="mt-2 max-w-lg text-[14.5px] text-ink-soft">Three hands, one file. Identity stops at step one.</p>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              { n: "1", t: "Reception issues a token", d: "Your name is written once, in the reception register. You leave with a four-character token like A417.", i: ClipboardList },
              { n: "2", t: "The token does the talking", d: "Messages, follow-ups and photos travel under the token. The doctor answers the case, not the person.", i: Send },
              { n: "3", t: "Labs land in your file", d: "Reports are uploaded against the token as files — collected by you, readable by your doctor, gossip-proof.", i: FlaskConical },
            ].map((s, i) => (
              <motion.div key={s.n} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }} transition={{ ...spring, delay: i * 0.07 }}
                className="rounded-2xl border border-hairline bg-porcelain p-6">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[12px] text-ever-700">STEP {s.n}</span>
                  <s.i className="h-4.5 w-4.5 text-ever-700" />
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold">{s.t}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">{s.d}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* portals */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="font-display text-3xl font-bold tracking-tight">Three doors, one record</h2>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {PORTALS.map((p, i) => (
            <motion.div key={p.to} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }} transition={{ ...spring, delay: i * 0.07 }}>
              <Link to={p.to} className="lift group block rounded-2xl border border-hairline bg-paper p-6">
                <div className={`inline-grid h-10 w-10 place-items-center rounded-xl ${p.accent}`}>
                  <p.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold">{p.name}</h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">{p.desc}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ever-800">
                  Enter portal <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* footer */}
      <footer className="border-t border-hairline bg-ever-950">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-10 text-ever-100 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-md bg-ever-800 font-display font-bold text-ever-50">+</div>
            <span className="font-display font-semibold">CareLink</span>
          </div>
          <p className="font-mono text-[11px] tracking-wide text-ever-100/70">
            BUILT FOR THE OPD QUEUE · SLNIMS, PONDICHERRY · 2026
          </p>
        </div>
      </footer>
    </div>
  );
}
