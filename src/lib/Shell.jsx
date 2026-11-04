import { Link, NavLink, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { CheckCircle2, X, Sun, Moon, ClipboardList, Stethoscope, ShieldCheck, LogOut } from "lucide-react";
import { useSession } from "./store";

const spring = { type: "spring", stiffness: 400, damping: 32 };

/* ---- brand mark ---- */
export function Logo({ size = 32, withText = true, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span style={{ width: size, height: size }}
        className="grid shrink-0 place-items-center rounded-[10px] bg-gradient-to-br from-ever-600 to-ever-900 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
        <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </span>
      {withText && <span className="font-display text-[17px] font-bold tracking-tight">CareLink</span>}
    </span>
  );
}

/* ---- avatar from a token / name ---- */
const TONES = [
  "bg-ever-100 text-ever-800", "bg-marigold-100 text-marigold-600",
  "bg-sky-100 text-sky-700", "bg-rose-100 text-rose-600", "bg-celadon text-ever-900",
];
export function Avatar({ label, seed = label, size = 36, className = "" }) {
  const n = [...String(seed)].reduce((a, c) => a + c.charCodeAt(0), 0);
  return (
    <span style={{ width: size, height: size, fontSize: size * 0.36 }}
      className={`grid shrink-0 place-items-center rounded-full font-semibold ${TONES[n % TONES.length]} ${className}`}>
      {label}
    </span>
  );
}
export const initials = (name = "") =>
  name.replace(/^Dr\.?\s*/i, "").split(/[\s.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

/* ---- status badge ---- */
export const STATUS_TONE = {
  "Waiting": "bg-marigold-100 text-marigold-600",
  "In consult": "bg-ever-100 text-ever-800",
  "Labs pending": "bg-sky-100 text-sky-700",
  "Done": "bg-porcelain text-ink-mute border border-hairline",
};
export function StatusBadge({ status }) {
  return <span className={`badge badge-dot ${STATUS_TONE[status] || STATUS_TONE.Done}`}>{status}</span>;
}

/* ---- theme ---- */
export function useTheme() {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem("cl-theme") === "dark"; } catch { return false; }
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try { localStorage.setItem("cl-theme", dark ? "dark" : "light"); } catch {}
  }, [dark]);
  return [dark, () => setDark((d) => !d)];
}

/* ---- toasts ---- */
const ToastCtx = createContext(null);
export const useToast = () => useContext(ToastCtx);

export function ToastHost({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((msg) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-[min(92vw,360px)] flex-col gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div key={t.id} role="status"
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8 }}
              transition={spring}
              className="surface pointer-events-auto flex items-center gap-3 px-4 py-3 text-[13.5px] font-medium shadow-xl">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ever-100">
                <CheckCircle2 className="h-4 w-4 text-ever-700" />
              </span>
              {t.msg}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

/* ---- modal ---- */
export function Modal({ open, onClose, title, description, children, wide }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40 grid place-items-center p-4" role="dialog" aria-modal="true">
          <motion.div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }} onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={spring}
            className={`surface relative w-full ${wide ? "max-w-2xl" : "max-w-md"} p-6 shadow-2xl`}>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-lg font-bold">{title}</h3>
                {description && <p className="mt-1 text-[13.5px] text-ink-soft">{description}</p>}
              </div>
              <button onClick={onClose} aria-label="Close"
                className="-mr-1 -mt-1 grid h-8 w-8 place-items-center rounded-lg text-ink-mute hover:bg-porcelain hover:text-ink">
                <X className="h-4 w-4" />
              </button>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/* ---- app shell ---- */
const TABS = [
  { to: "/staff", label: "Reception", icon: ClipboardList, hint: "Register & route", roles: ["ADMIN", "RECEPTIONIST"] },
  { to: "/doctor", label: "Consult room", icon: Stethoscope, hint: "Your cases", roles: ["DOCTOR"] },
];
const ROLE_LABEL = { ADMIN: "Administrator", RECEPTIONIST: "Reception", DOCTOR: "Doctor" };

function LiveDot({ online }) {
  return (
    <span className={`inline-flex items-center gap-2 text-[12px] font-semibold ${online ? "text-ever-700" : "text-ink-mute"}`}>
      <span className="relative flex h-2 w-2">
        {online && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ever-500 opacity-60" />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${online ? "bg-ever-500" : "bg-ink-mute"}`} />
      </span>
      {online ? "Live" : "Reconnecting…"}
    </span>
  );
}

export function Shell({ title, sub, actions, children, online }) {
  const [dark, toggle] = useTheme();
  const { me, logout } = useSession();
  const nav = useNavigate();
  const signOut = async () => { await logout(); nav(me?.kind === "patient" ? "/patient" : "/login"); };
  const tabs = me?.kind === "staff" ? TABS.filter((t) => t.roles.includes(me.user.role)) : [];
  const SignOutBtn = (
    <button onClick={signOut} aria-label="Sign out" title="Sign out"
      className="grid h-9 w-9 place-items-center rounded-lg border border-hairline bg-paper text-ink-soft hover:text-ink">
      <LogOut className="h-4 w-4" />
    </button>
  );
  const ThemeBtn = (
    <button onClick={toggle} aria-label="Toggle theme"
      className="grid h-9 w-9 place-items-center rounded-lg border border-hairline bg-paper text-ink-soft hover:text-ink">
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );

  return (
    <div className="min-h-screen bg-porcelain lg:grid lg:grid-cols-[248px_1fr]">
      {/* sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-hairline bg-paper px-4 py-5 lg:flex">
        <Link to="/" className="px-2"><Logo /></Link>
        {me?.kind === "staff" && <p className="mt-6 truncate px-2 text-[13px] font-semibold text-ink-soft">{me.hospital.name}</p>}
        {tabs.length > 0 && <p className="eyebrow mt-6 px-2">Workspace</p>}
        <nav className="mt-2 flex flex-col gap-1">
          {tabs.map((t) => (
            <NavLink key={t.to} to={t.to}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                  isActive ? "bg-ever-50 text-ever-800" : "text-ink-soft hover:bg-porcelain hover:text-ink"}`}>
              {({ isActive }) => (
                <>
                  {isActive && <motion.span layoutId="side-pill" transition={spring}
                    className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-ever-600" />}
                  <t.icon className="h-[18px] w-[18px]" />
                  <span className="flex flex-col leading-tight">
                    <span className="text-[14px] font-semibold">{t.label}</span>
                    <span className="text-[11.5px] text-ink-mute">{t.hint}</span>
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-3">
          <div className="rounded-xl border border-hairline bg-porcelain p-3.5">
            <div className="flex items-center gap-2 text-[13px] font-semibold">
              <ShieldCheck className="h-4 w-4 text-ever-700" /> Identity protected
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-mute">Names stay with reception. Doctors and patients see visit labels only.</p>
          </div>
          {me?.kind === "staff" && (
            <div className="flex items-center gap-2.5 px-1">
              <Avatar label={initials(me.user.name)} seed={me.user.id} size={34} />
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-[13.5px] font-semibold">{me.user.name}</p>
                <p className="text-[12px] text-ink-mute">{ROLE_LABEL[me.user.role]}</p>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between gap-2 px-1">
            <LiveDot online={online} />
            <span className="flex gap-2">{ThemeBtn}{me && SignOutBtn}</span>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        {/* top bar (mobile / tablet) */}
        <header className="sticky top-0 z-30 border-b border-hairline bg-paper/85 backdrop-blur-md lg:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <Link to="/"><Logo size={28} /></Link>
            <span className="flex gap-2">{ThemeBtn}{me && SignOutBtn}</span>
          </div>
          {tabs.length > 1 && <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
            {tabs.map((t) => (
              <NavLink key={t.to} to={t.to}
                className={({ isActive }) => `inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-semibold ${
                  isActive ? "bg-ever-800 text-white" : "text-ink-soft hover:bg-porcelain"}`}>
                <t.icon className="h-4 w-4" /> {t.label}
              </NavLink>
            ))}
          </nav>}
        </header>

        <main className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-[26px] font-bold leading-tight tracking-tight sm:text-[30px]">{title}</h1>
              {sub && <p className="mt-1.5 text-[14.5px] text-ink-soft">{sub}</p>}
            </div>
            <div className="flex items-center gap-3">
              <span className="lg:hidden"><LiveDot online={online} /></span>
              {actions}
            </div>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}

export { spring };
