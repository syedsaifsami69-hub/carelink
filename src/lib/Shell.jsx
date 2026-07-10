import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle2, X, Sun, Moon } from "lucide-react";

const spring = { type: "spring", stiffness: 400, damping: 32 };

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
      <div className="pointer-events-none fixed bottom-5 left-1/2 z-50 flex w-[min(92vw,380px)] -translate-x-1/2 flex-col gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div key={t.id}
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8 }}
              transition={spring}
              className="pointer-events-auto flex items-center gap-2.5 rounded-xl border border-hairline bg-ink px-4 py-3 text-[13px] font-medium text-porcelain shadow-lg">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-ever-500" />
              {t.msg}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

/* ---- modal ---- */
export function Modal({ open, onClose, title, children, wide }) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40 grid place-items-center p-4">
          <motion.div className="absolute inset-0 bg-ink/40"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }} onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={spring}
            className={`relative w-full ${wide ? "max-w-2xl" : "max-w-md"} rounded-2xl border border-hairline bg-paper p-5 shadow-2xl`}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">{title}</h3>
              <button onClick={onClose} aria-label="Close"
                className="grid h-8 w-8 place-items-center rounded-lg text-ink-mute hover:bg-porcelain">
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

/* ---- shell ---- */
const TABS = [
  { to: "/staff", label: "Reception" },
  { to: "/doctor", label: "Doctor" },
  { to: "/patient", label: "Patient" },
];

export function Shell({ title, sub, children, online }) {
  const { pathname } = useLocation();
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem("cl-theme") === "dark"; } catch { return false; }
  });
  const toggle = () => setDark((d) => {
    const next = !d;
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("cl-theme", next ? "dark" : "light"); } catch {}
    return next;
  });
  useState(() => { document.documentElement.classList.toggle("dark", dark); });
  return (
    <div className="min-h-screen bg-porcelain">
      <header className="sticky top-0 z-30 border-b border-hairline bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-md bg-ever-800 font-display font-bold text-ever-50">+</div>
            <span className="hidden font-display font-semibold sm:block">CareLink</span>
          </Link>
          <nav className="flex items-center gap-1 rounded-full border border-hairline bg-porcelain p-1">
            {TABS.map((t) => (
              <Link key={t.to} to={t.to} className="relative rounded-full px-3 py-1.5 text-[12.5px] font-semibold">
                {pathname === t.to && (
                  <motion.span layoutId="tab-pill" transition={spring}
                    className="absolute inset-0 rounded-full bg-ever-800" />
                )}
                <span className={`relative ${pathname === t.to ? "text-ever-50" : "text-ink-soft"}`}>{t.label}</span>
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2.5">
            <button onClick={toggle} aria-label="Toggle theme"
              className="grid h-8 w-8 place-items-center rounded-full border border-hairline bg-porcelain text-ink-soft">
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <span className={`hidden font-mono text-[10px] tracking-wide sm:block ${online ? "text-ever-700" : "text-ink-mute"}`}>
              {online ? "● LIVE" : "○ DEMO"}
            </span>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-5">
          <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
          {sub && <p className="mt-1 text-[13.5px] text-ink-soft">{sub}</p>}
        </div>
        {children}
      </main>
    </div>
  );
}

export { spring };
