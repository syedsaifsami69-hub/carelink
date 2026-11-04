import { WebSocketServer } from "ws";
import { COOKIE, parseCookies, resolveSession } from "./auth.js";

/**
 * Authenticated, tenant-scoped "something changed" pings. Clients re-fetch their own scoped data,
 * so no record content travels over the socket.
 */
export function attachRealtime(server, db) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", async (req, socket, head) => {
    if (new URL(req.url, "http://x").pathname !== "/ws") return socket.destroy();
    const auth = await resolveSession(db, parseCookies(req.headers.cookie)[COOKIE]).catch(() => null);
    if (!auth) { socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n"); return socket.destroy(); }
    wss.handleUpgrade(req, socket, head, (ws) => { ws.auth = auth; wss.emit("connection", ws); });
  });

  /** visit: { hospitalId, id, doctorId } of the record that changed. */
  function notify(visit) {
    const now = new Date();
    for (const ws of wss.clients) {
      const a = ws.auth;
      if (ws.readyState !== 1) continue;
      if (a.expiresAt < now) { ws.close(4001, "session expired"); continue; }
      if (a.hospitalId !== visit.hospitalId) continue;
      const allowed = a.kind === "patient" ? a.visit.id === visit.id
        : a.user.role === "DOCTOR" ? a.user.id === visit.doctorId || a.user.id === visit.previousDoctorId
        : true;
      if (allowed) ws.send("update");
    }
  }

  return { notify, close: () => { for (const ws of wss.clients) ws.terminate(); wss.close(); } };
}
