import { useCallback, useEffect, useState } from "react";
import { CalendarPlus, ChevronLeft, ChevronRight, LogIn, Clock, X, UserX } from "lucide-react";
import { api, fmtTime } from "../lib/store";
import { Modal, useToast, StatusBadge } from "../lib/Shell";
import { PatientPicker, EMPTY_PATIENT, patientBody } from "../lib/PatientPicker";

const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const toLocalInput = (ts) => { const d = new Date(ts); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const nextQuarter = () => Math.ceil(Date.now() / 9e5) * 9e5;

/** Day view of every doctor's booked slots, with booking, rescheduling, cancel, no-show and check-in. */
export default function Appointments({ doctors, version, onCheckedIn }) {
  const toast = useToast();
  const [day, setDay] = useState(() => dayKey(new Date()));
  const [list, setList] = useState(null);
  const [error, setError] = useState("");
  const [booking, setBooking] = useState(null); // form state when open
  const [resched, setResched] = useState(null); // { appt, startsAt }
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const from = new Date(`${day}T00:00`), to = new Date(from.getTime() + 864e5);
    try { setList((await api(`/api/appointments?from=${from.toISOString()}&to=${to.toISOString()}`)).appointments); setError(""); }
    catch (e) { setError(e.message); }
  }, [day]);
  useEffect(() => { load(); }, [load, version]);

  const shift = (n) => { const d = new Date(`${day}T00:00`); d.setDate(d.getDate() + n); setDay(dayKey(d)); };

  const act = async (fn, ok) => {
    setBusy(true);
    try { const out = await fn(); if (ok) toast(ok); await load(); return out; }
    catch (e) { toast(e.message, "error"); return null; }
    finally { setBusy(false); }
  };

  const openBooking = () => setBooking({
    patient: EMPTY_PATIENT, duplicates: null, doctorId: doctors[0]?.id || "", duration: 15, note: "",
    startsAt: toLocalInput(Math.max(nextQuarter(), new Date(`${day}T09:00`).getTime())),
  });

  const book = async (confirmNew = false) => {
    setBusy(true);
    try {
      await api("/api/appointments", { method: "POST", body: {
        ...patientBody(booking.patient, confirmNew), doctorId: booking.doctorId,
        startsAt: new Date(booking.startsAt).toISOString(), durationMin: Number(booking.duration), note: booking.note || undefined,
      } });
      toast("Appointment booked");
      setDay(booking.startsAt.slice(0, 10));
      setBooking(null);
      await load();
    } catch (e) {
      if (e.data?.duplicates) setBooking((b) => ({ ...b, duplicates: e.data.duplicates }));
      else toast(e.message, "error");
    } finally { setBusy(false); }
  };

  const checkIn = async (a) => {
    const out = await act(() => api(`/api/appointments/${a.id}/check-in`, { method: "POST" }), `${a.patient.name} checked in`);
    if (out) onCheckedIn({ id: out.id, label: out.label, name: a.patient.name }, out);
  };

  const byDoctor = (id) => (list || []).filter((a) => a.doctorId === id);

  return (
    <div className="surface overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-hairline p-4">
        <div className="flex items-center gap-1">
          <button onClick={() => shift(-1)} aria-label="Previous day" className="btn btn-sm btn-secondary w-9 px-0"><ChevronLeft className="h-4 w-4" /></button>
          <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="Day" className="field h-[34px] w-auto" />
          <button onClick={() => shift(1)} aria-label="Next day" className="btn btn-sm btn-secondary w-9 px-0"><ChevronRight className="h-4 w-4" /></button>
          {day !== dayKey(new Date()) && <button onClick={() => setDay(dayKey(new Date()))} className="btn btn-sm btn-ghost">Today</button>}
        </div>
        <p className="flex-1 text-[13px] text-ink-mute">{list ? `${list.filter((a) => a.status === "Booked").length} booked` : "Loading…"}</p>
        <button onClick={openBooking} className="btn btn-sm btn-primary"><CalendarPlus className="h-4 w-4" /> Book appointment</button>
      </div>

      {error && <p role="alert" className="m-4 rounded-lg bg-rose-100 px-4 py-3 text-[13.5px] font-medium text-rose-600">{error}</p>}

      <div className="grid gap-4 bg-porcelain/50 p-4 md:grid-cols-2 xl:grid-cols-3">
        {doctors.map((d) => {
          const appts = byDoctor(d.id);
          return (
            <div key={d.id} className="rounded-xl border border-hairline bg-porcelain p-3">
              <div className="px-1 pb-3">
                <p className="text-[13.5px] font-semibold">{d.name}</p>
                <p className="text-[12px] text-ink-mute">{d.department} · {appts.filter((a) => a.status === "Booked").length} booked</p>
              </div>
              <div className="flex flex-col gap-2">
                {appts.map((a) => (
                  <div key={a.id} className={`surface p-3 ${a.status === "Cancelled" ? "opacity-60" : ""}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[13px] font-semibold">{fmtTime(a.startsAt)}–{fmtTime(a.endsAt)}</span>
                      <StatusBadge status={a.status} />
                    </div>
                    <p className="mt-1.5 truncate text-[13.5px] font-medium">{a.patient?.name}</p>
                    {a.note && <p className="truncate text-[12px] text-ink-mute">{a.note}</p>}
                    {a.status === "Booked" && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-hairline pt-2.5">
                        <button disabled={busy} onClick={() => checkIn(a)} className="btn btn-sm btn-primary h-7 text-[12px]"><LogIn className="h-3.5 w-3.5" /> Check in</button>
                        <button disabled={busy} onClick={() => setResched({ appt: a, startsAt: toLocalInput(a.startsAt) })} className="btn btn-sm btn-secondary h-7 text-[12px]"><Clock className="h-3.5 w-3.5" /> Move</button>
                        <button disabled={busy} onClick={() => act(() => api(`/api/appointments/${a.id}`, { method: "PATCH", body: { status: "No-show" } }), "Marked as no-show")}
                          aria-label="Mark no-show" title="No-show" className="btn btn-sm btn-secondary h-7 w-7 px-0"><UserX className="h-3.5 w-3.5" /></button>
                        <button disabled={busy} onClick={() => act(() => api(`/api/appointments/${a.id}`, { method: "PATCH", body: { status: "Cancelled" } }), "Appointment cancelled")}
                          aria-label="Cancel appointment" title="Cancel" className="btn btn-sm btn-secondary h-7 w-7 px-0 text-rose-600"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    )}
                  </div>
                ))}
                {list && appts.length === 0 && <p className="rounded-lg border border-dashed border-hairline px-2 py-4 text-center text-[12px] text-ink-mute">No appointments — free all day</p>}
              </div>
            </div>
          );
        })}
      </div>

      <Modal open={!!booking} onClose={() => setBooking(null)} title="Book appointment" description="The doctor's existing slots are checked so nothing overlaps.">
        {booking && (
          <div className="flex flex-col gap-4">
            <PatientPicker value={booking.patient} duplicates={booking.duplicates}
              onChange={(patient) => setBooking((b) => ({ ...b, patient, duplicates: patient.patientId ? null : b.duplicates }))}
              onConfirmNew={() => book(true)} />
            <div>
              <label className="label" htmlFor="bk-doc">Doctor</label>
              <select id="bk-doc" value={booking.doctorId} onChange={(e) => setBooking({ ...booking, doctorId: e.target.value })} className="field">
                {doctors.map((d) => <option key={d.id} value={d.id}>{d.name} — {d.department}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <div>
                <label className="label" htmlFor="bk-at">Date and time</label>
                <input id="bk-at" type="datetime-local" step="300" value={booking.startsAt} onChange={(e) => setBooking({ ...booking, startsAt: e.target.value })} className="field" />
              </div>
              <div>
                <label className="label" htmlFor="bk-dur">Length</label>
                <select id="bk-dur" value={booking.duration} onChange={(e) => setBooking({ ...booking, duration: e.target.value })} className="field">
                  {[10, 15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m} min</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="bk-note">Note <span className="font-normal text-ink-mute">(optional, visible to reception)</span></label>
              <input id="bk-note" value={booking.note} maxLength={500} onChange={(e) => setBooking({ ...booking, note: e.target.value })} className="field" />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setBooking(null)} className="btn btn-secondary">Cancel</button>
              <button onClick={() => book(false)} disabled={busy} className="btn btn-primary disabled:opacity-60">Book</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!resched} onClose={() => setResched(null)} title="Move appointment" description={resched ? `${resched.appt.patient?.name} · currently ${fmtTime(resched.appt.startsAt)}` : ""}>
        {resched && (
          <div className="flex flex-col gap-4">
            <div>
              <label className="label" htmlFor="rs-at">New date and time</label>
              <input id="rs-at" type="datetime-local" step="300" value={resched.startsAt} onChange={(e) => setResched({ ...resched, startsAt: e.target.value })} className="field" />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setResched(null)} className="btn btn-secondary">Cancel</button>
              <button disabled={busy} className="btn btn-primary disabled:opacity-60"
                onClick={async () => { if (await act(() => api(`/api/appointments/${resched.appt.id}`, { method: "PATCH", body: { startsAt: new Date(resched.startsAt).toISOString() } }), "Appointment moved")) setResched(null); }}>
                Move
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
