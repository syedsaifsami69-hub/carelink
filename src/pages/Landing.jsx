import { Link } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import {
  ShieldCheck, ArrowRight, Stethoscope, ClipboardList, UserRound, Send,
  FlaskConical, EyeOff, Zap, FileCheck2, Smartphone, Moon, Sun, Check, KeyRound,
} from "lucide-react";
import { Logo, useTheme } from "../lib/Shell";

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
    return <span className="text-[11.5px] font-semibold text-ever-700">Dr. Krishnan · Pediatrics</span>;
  return (
    <span className="relative inline-block h-[15px] w-[96px]">
      <AnimatePresence mode="wait" initial={false}>
        {revealed ? (
          <motion.span key="t" className="absolute inset-0 font-mono text-[11px] font-medium text-ink-soft"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            Token #A417
          </motion.span>
        ) : (
          <motion.span key="r" className="redact absolute inset-y-[2px] left-0 w-[72px] text-[11px]"
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
    <div className="relative">
      <div className="absolute -inset-6 -z-10 rounded-[32px] bg-gradient-to-br from-ever-500/20 via-transparent to-marigold-500/15 blur-2xl" />
      <div className="surface overflow-hidden shadow-[0_30px_80px_-30px_rgba(74,26,16,0.35)]">
        <div className="flex items-center justify-between border-b border-hairline px-5 py-3.5">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-ever-100 text-[12px] font-bold text-ever-800">MK</span>
            <div className="leading-tight">
              <p className="text-[14px] font-semibold">Dr. Meera Krishnan</p>
              <p className="text-[12px] text-ink-mute">Case #A417 · Pediatrics</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ever-700"><span className="h-2 w-2 rounded-full bg-ever-500" />Online</span>
        </div>
        <div className="flex min-h-[318px] flex-col gap-3.5 bg-porcelain/60 p-5">
          {DEMO.slice(0, count).map((m, i) => (
            <motion.div key={i}
              initial={reduce ? false : { opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={spring}
              className={`max-w-[84%] ${m.from === "doctor" ? "self-end" : "self-start"}`}>
              <div className={`mb-1 px-1 ${m.from === "doctor" ? "text-right" : ""}`}><SenderChip role={m.from} /></div>
              <div className={`px-4 py-2.5 text-[14px] leading-relaxed shadow-sm ${
                m.from === "doctor"
                  ? "rounded-2xl rounded-br-md bg-ever-800 text-white"
                  : "rounded-2xl rounded-bl-md border border-hairline bg-paper text-ink"}`}>
                {m.text}
              </div>
            </motion.div>
          ))}
        </div>
        <div className="flex items-center gap-2 border-t border-hairline bg-paper px-4 py-3">
          <div className="flex h-10 flex-1 items-center rounded-xl border border-hairline bg-porcelain px-3 text-[13px] text-ink-mute">Write a message…</div>
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-ever-800 text-white"><Send className="h-4 w-4" /></div>
        </div>
      </div>

      {/* floating chips */}
      <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring, delay: 0.9 }}
        className="surface absolute -bottom-7 -left-8 hidden items-center gap-2.5 px-3.5 py-2.5 shadow-lg sm:flex">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-marigold-100"><EyeOff className="h-4 w-4 text-marigold-600" /></span>
        <div className="leading-tight">
          <p className="text-[12.5px] font-semibold">Name hidden</p>
          <p className="text-[11px] text-ink-mute">Stored at reception only</p>
        </div>
      </motion.div>
      <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring, delay: 1.1 }}
        className="surface absolute -right-6 -top-8 hidden items-center gap-2.5 px-3.5 py-2.5 shadow-lg sm:flex">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-sky-100"><FileCheck2 className="h-4 w-4 text-sky-700" /></span>
        <div className="leading-tight">
          <p className="text-[12.5px] font-semibold">chest_xray_AP.jpg</p>
          <p className="text-[11px] text-ink-mute">Filed to #A417</p>
        </div>
      </motion.div>
    </div>
  );
}

/* ---------- page ---------- */
const fade = {
  hidden: { opacity: 0, y: 14 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { ...spring, delay: i * 0.06 } }),
};
const inView = (i = 0) => ({
  initial: { opacity: 0, y: 16 }, whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" }, transition: { ...spring, delay: i * 0.07 },
});

const PORTALS = [
  { to: "/staff", icon: ClipboardList, name: "Reception & staff", desc: "Register patients, issue tokens, assign doctors and file lab reports.", points: ["Live queue board", "One-click lab upload"], accent: "bg-marigold-100 text-marigold-600" },
  { to: "/doctor", icon: Stethoscope, name: "Doctor", desc: "Answer cases by token with quick replies and every lab file in context.", points: ["Unified case inbox", "Reply snippets"], accent: "bg-ever-100 text-ever-800" },
  { to: "/patient", icon: UserRound, name: "Patient", desc: "Message your doctor and download reports with the access code from reception.", points: ["No sign-up needed", "Reports on your phone"], accent: "bg-sky-100 text-sky-700" },
];

const FEATURES = [
  { icon: EyeOff, t: "Pseudonymous by design", d: "Names are written once at the front desk. The server never sends them to doctors or patients' screens." },
  { icon: Zap, t: "Real-time by default", d: "Replies, status changes and new reports appear on the right screens as they happen, and only there." },
  { icon: FlaskConical, t: "Labs as files", d: "PDF and image reports are checked by content, stored privately and downloadable only by those allowed." },
  { icon: KeyRound, t: "Codes expire with the visit", d: "Access codes expire, can be revoked by reception, and stop working shortly after the visit is closed." },
  { icon: Smartphone, t: "Built for any screen", d: "Reception desktops, doctors' tablets and patients' phones all get a layout made for them." },
  { icon: ShieldCheck, t: "Privacy without friction", d: "Patients need no app and no account. Staff sign in; every permission is checked on the server." },
];

export default function Landing() {
  const [dark, toggle] = useTheme();
  return (
    <div className="min-h-screen bg-porcelain">
      {/* nav */}
      <nav className="sticky top-0 z-30 border-b border-hairline/70 bg-porcelain/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <Link to="/"><Logo /></Link>
          <div className="hidden items-center gap-1 md:flex">
            <a href="#how" className="btn btn-sm btn-ghost">How it works</a>
            <a href="#features" className="btn btn-sm btn-ghost">Features</a>
            <a href="#portals" className="btn btn-sm btn-ghost">Portals</a>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggle} aria-label="Toggle theme" className="btn btn-sm btn-ghost w-9 px-0">
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <Link to="/login" className="btn btn-sm btn-secondary hidden sm:inline-flex">Staff sign-in</Link>
            <Link to="/patient" className="btn btn-sm btn-primary">Patient portal</Link>
          </div>
        </div>
      </nav>

      {/* hero */}
      <header className="hero-bg relative overflow-hidden">
        <div className="grid-bg pointer-events-none absolute inset-0" />
        <div className="relative mx-auto grid max-w-6xl gap-14 px-5 pb-24 pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pt-24">
          <div>
            <motion.p variants={fade} initial="hidden" animate="show" custom={0}
              className="badge mb-6 h-8 border border-ever-100 bg-paper px-3 text-ever-800 shadow-sm">
              <ShieldCheck className="h-3.5 w-3.5" /> Pseudonymous care messaging for OPDs
            </motion.p>
            <motion.h1 variants={fade} initial="hidden" animate="show" custom={1}
              className="font-display text-[clamp(2.5rem,5.6vw,4.25rem)] font-extrabold leading-[1.04] tracking-[-0.035em] text-ink">
              Talk to your doctor.{" "}
              <span className="text-ever-700">Keep your name out of it.</span>
            </motion.h1>
            <motion.p variants={fade} initial="hidden" animate="show" custom={2}
              className="mt-6 max-w-[520px] text-[17px] leading-relaxed text-ink-soft">
              CareLink relays every message through a reception-issued visit code. Doctors see the case,
              labs travel as files, and your name stays in one place: the front desk.
            </motion.p>
            <motion.div variants={fade} initial="hidden" animate="show" custom={3} className="mt-9 flex flex-wrap items-center gap-3">
              <Link to="/patient" className="btn btn-lg btn-primary group">
                Open patient portal <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link to="/login" className="btn btn-lg btn-secondary">I work here</Link>
            </motion.div>
            <motion.ul variants={fade} initial="hidden" animate="show" custom={4}
              className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-[13.5px] text-ink-soft">
              {["No sign-up for patients", "Real-time sync", "Works on any phone"].map((x) => (
                <li key={x} className="flex items-center gap-2">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-ever-100"><Check className="h-3 w-3 text-ever-800" strokeWidth={3} /></span>{x}
                </li>
              ))}
            </motion.ul>
          </div>
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.25 }}>
            <LiveThread />
          </motion.div>
        </div>
      </header>

      {/* stats band */}
      <section className="border-y border-hairline bg-paper">
        <div className="mx-auto grid max-w-6xl grid-cols-2 divide-hairline px-5 md:grid-cols-4 md:divide-x">
          {[
            ["0", "patient names shown to doctors"], ["80-bit", "patient access codes"],
            ["72 h", "default code lifetime"], ["3", "roles, one shared record"],
          ].map(([v, l], i) => (
            <motion.div key={l} {...inView(i)} className="px-4 py-8 text-center md:py-10">
              <p className="font-display text-[30px] font-extrabold tracking-tight text-ever-800">{v}</p>
              <p className="mt-1 text-[13.5px] text-ink-mute">{l}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* how it works */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow text-ever-700">How it works</p>
          <h2 className="mt-3 font-display text-[clamp(1.9rem,3.6vw,2.6rem)] font-bold leading-tight">Three hands, one file. Identity stops at step one.</h2>
        </div>
        <div className="relative mt-14 grid gap-6 md:grid-cols-3">
          <div className="absolute left-[16%] right-[16%] top-7 hidden h-px bg-gradient-to-r from-transparent via-hairline to-transparent md:block" />
          {[
            { t: "Reception issues a token", d: "The patient's name is written once, at reception. They leave with a private access code for this visit.", i: ClipboardList },
            { t: "The visit does the talking", d: "Messages and follow-ups travel under a visit label like A417. The doctor answers the case, not the person.", i: Send },
            { t: "Labs land in the file", d: "Reports are filed to the visit, readable by the assigned doctor and downloadable by the patient.", i: FlaskConical },
          ].map((s, i) => (
            <motion.div key={s.t} {...inView(i)} className="relative text-center">
              <div className="relative mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-hairline bg-paper shadow-sm">
                <s.i className="h-6 w-6 text-ever-700" />
                <span className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-ever-800 text-[11px] font-bold text-white">{i + 1}</span>
              </div>
              <h3 className="mt-6 font-display text-[18px] font-bold">{s.t}</h3>
              <p className="mx-auto mt-2 max-w-[300px] text-[14.5px] leading-relaxed text-ink-soft">{s.d}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* features */}
      <section id="features" className="scroll-mt-20 border-y border-hairline bg-paper">
        <div className="mx-auto max-w-6xl px-5 py-24">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="lg:sticky lg:top-28 lg:self-start">
              <p className="eyebrow text-ever-700">Features</p>
              <h2 className="mt-3 font-display text-[clamp(1.9rem,3.6vw,2.6rem)] font-bold leading-tight">Privacy that patients feel and staff don't notice.</h2>
              <p className="mt-4 max-w-md text-[15.5px] leading-relaxed text-ink-soft">
                Designed around the realities of a busy outpatient department: shared screens, crowded corridors and sensitive questions.
              </p>
              <Link to="/login" className="btn btn-primary mt-7">Staff sign-in <ArrowRight className="h-4 w-4" /></Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {FEATURES.map((f, i) => (
                <motion.div key={f.t} {...inView(i % 2)} className="rounded-2xl border border-hairline bg-porcelain/60 p-6">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-paper shadow-sm ring-1 ring-hairline">
                    <f.icon className="h-5 w-5 text-ever-700" />
                  </span>
                  <h3 className="mt-5 text-[16px] font-bold">{f.t}</h3>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">{f.d}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* portals */}
      <section id="portals" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow text-ever-700">Portals</p>
          <h2 className="mt-3 font-display text-[clamp(1.9rem,3.6vw,2.6rem)] font-bold leading-tight">Three doors, one record</h2>
          <p className="mt-3 text-[15.5px] text-ink-soft">Each role sees exactly what it needs and nothing more.</p>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {PORTALS.map((p, i) => (
            <motion.div key={p.to} {...inView(i)}>
              <Link to={p.to} className="surface surface-hover group flex h-full flex-col p-7">
                <span className={`grid h-12 w-12 place-items-center rounded-xl ${p.accent}`}>
                  <p.icon className="h-6 w-6" />
                </span>
                <h3 className="mt-6 font-display text-[19px] font-bold">{p.name}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-ink-soft">{p.desc}</p>
                <ul className="mt-5 flex flex-col gap-2 border-t border-hairline pt-5 text-[13.5px] text-ink-soft">
                  {p.points.map((x) => (
                    <li key={x} className="flex items-center gap-2"><Check className="h-4 w-4 text-ever-600" />{x}</li>
                  ))}
                </ul>
                <span className="mt-auto inline-flex items-center gap-1.5 pt-6 text-[14px] font-semibold text-ever-800">
                  Open portal <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-5 pb-24">
        <motion.div {...inView()} className="relative overflow-hidden rounded-3xl bg-ever-900 px-8 py-14 text-center sm:px-14">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_80%_at_80%_0%,rgba(242,147,125,0.55),transparent_70%),radial-gradient(40%_60%_at_0%_100%,rgba(246,185,138,0.35),transparent_70%)]" />
          <div className="relative">
            <h2 className="font-display text-[clamp(1.8rem,3.4vw,2.5rem)] font-bold text-white">Have an access code from reception?</h2>
            <p className="mx-auto mt-3 max-w-md text-[15.5px] text-white/80">Open your file, message your doctor and collect your reports in under a minute.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link to="/patient" className="btn btn-lg bg-white text-ever-900 hover:bg-ever-50">Enter my code <ArrowRight className="h-4 w-4" /></Link>
              <Link to="/login" className="btn btn-lg border border-white/20 text-white hover:bg-white/10">Staff sign-in</Link>
            </div>
          </div>
        </motion.div>
      </section>

      {/* footer */}
      <footer className="border-t border-hairline bg-paper">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-[14px] leading-relaxed text-ink-mute">Pseudonymous messaging between patients, reception and doctors.</p>
          </div>
          <div>
            <p className="eyebrow">Portals</p>
            <ul className="mt-4 flex flex-col gap-2.5 text-[14px]">
              {PORTALS.map((p) => <li key={p.to}><Link to={p.to} className="text-ink-soft hover:text-ever-800">{p.name}</Link></li>)}
            </ul>
          </div>
          <div>
            <p className="eyebrow">Product</p>
            <ul className="mt-4 flex flex-col gap-2.5 text-[14px]">
              <li><a href="#how" className="text-ink-soft hover:text-ever-800">How it works</a></li>
              <li><a href="#features" className="text-ink-soft hover:text-ever-800">Features</a></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-hairline">
          <p className="mx-auto max-w-6xl px-5 py-5 text-[12.5px] text-ink-mute">© 2026 CareLink · Built for the OPD queue · SLIMS, Puducherry</p>
        </div>
      </footer>
    </div>
  );
}
