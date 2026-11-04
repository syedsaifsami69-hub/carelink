import { useEffect, useState, useCallback, createContext, useContext } from "react";

/** JSON request helper; throws Error(message) with the server's error text. */
export async function api(path, { method = "GET", body } = {}) {
  const r = await fetch(path, {
    method, credentials: "same-origin",
    headers: method === "GET" ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? (method === "GET" ? undefined : "{}") : JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || `Request failed (${r.status})`), { status: r.status, data });
  return data;
}

/* ---- session (who is signed in) ---- */
const SessionCtx = createContext(null);
export const useSession = () => useContext(SessionCtx);

export function useSessionState() {
  const [me, setMe] = useState(undefined); // undefined = loading, null = signed out
  const refresh = useCallback(() => api("/api/auth/me").then(setMe, () => setMe(null)), []);
  useEffect(() => { refresh(); }, [refresh]);
  const logout = useCallback(async () => { await api("/api/auth/logout", { method: "POST" }).catch(() => {}); setMe(null); }, []);
  return { me, setMe, refresh, logout };
}
export const SessionProvider = SessionCtx.Provider;
export const homeFor = (me) => (me?.kind === "patient" ? "/patient" : me?.user?.role === "DOCTOR" ? "/doctor" : "/staff");

/* ---- workspace data: whatever the signed-in user may see, kept fresh over WebSocket ---- */
export function useWorkspace() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [online, setOnline] = useState(false);
  const setMe = useSession()?.setMe; // stable useState setter

  const refresh = useCallback(async () => {
    try { setData(await api("/api/workspace")); setError(null); }
    catch (e) {
      // session expired or access revoked: drop back to the sign-in screen instead of showing an error
      if (e.status === 401) setMe?.(null); else setError(e);
    }
  }, [setMe]);

  useEffect(() => {
    refresh();
    let ws, retry, closed = false;
    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}/ws`);
      ws.onopen = () => { setOnline(true); refresh(); }; // refresh catches anything missed while disconnected
      ws.onmessage = () => refresh();
      ws.onerror = () => refresh(); // a refused (401) upgrade surfaces here; refresh decides whether to sign out
      ws.onclose = () => { setOnline(false); if (!closed) retry = setTimeout(connect, 3000); };
    };
    connect();
    return () => { closed = true; clearTimeout(retry); ws?.close(); };
  }, [refresh]);

  return { data, error, online, refresh };
}

export const fmtTime = (ts) =>
  new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
export const fmtDateTime = (ts) =>
  new Date(ts).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
