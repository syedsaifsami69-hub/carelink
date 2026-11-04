import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { Logo } from "../lib/Shell";
import { api, useSession, homeFor } from "../lib/store";

export default function Login() {
  const { me, setMe } = useSession();
  const nav = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (me?.kind === "staff") nav(homeFor(me), { replace: true }); }, [me, nav]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const session = await api("/api/auth/login", { method: "POST", body: form });
      setMe(session);
      nav(homeFor(session), { replace: true });
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="hero-bg grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-[400px]">
        <Link to="/" className="mb-8 flex justify-center"><Logo size={36} /></Link>
        <form onSubmit={submit} className="surface p-8" noValidate>
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-ever-100"><LockKeyhole className="h-5 w-5 text-ever-800" /></span>
          <h1 className="mt-5 font-display text-[22px] font-bold">Staff sign-in</h1>
          <p className="mt-1.5 text-[14px] text-ink-soft">Reception, doctors and administrators.</p>

          <label className="label mt-6" htmlFor="email">Work email</label>
          <input id="email" type="email" autoComplete="username" autoFocus required className="field"
            value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <label className="label mt-4" htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" required className="field"
            value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />

          {error && <p role="alert" className="mt-4 rounded-lg bg-rose-100 px-3 py-2.5 text-[13px] font-medium text-rose-600">{error}</p>}

          <button type="submit" disabled={busy} className="btn btn-lg btn-primary mt-6 w-full disabled:opacity-60">
            {busy ? "Signing in…" : <>Sign in <ArrowRight className="h-4 w-4" /></>}
          </button>
        </form>
        <p className="mt-5 text-center text-[13.5px] text-ink-mute">
          Patient? <Link to="/patient" className="font-semibold text-ever-800 hover:underline">Use your access code</Link>
        </p>
        {import.meta.env.DEV && (
          <p className="mt-3 text-center text-[12px] text-ink-mute">Dev seed: reception@slims.dev, meera@slims.dev · see README for the password</p>
        )}
      </div>
    </div>
  );
}
