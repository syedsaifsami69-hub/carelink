import { Router } from "express";
import { requireStaff } from "./auth.js";

/**
 * Record who did what. Callers pass ids and counts only: never names, message text or file contents.
 * shortcut: written after the action, outside its transaction, so a DB failure here loses the entry (logged to stderr); move into the same transaction if audit completeness becomes a compliance requirement.
 */
export function audit(db, req, action, { entityType, entityId, meta, hospitalId } = {}) {
  const a = req.auth;
  return db.auditLog.create({
    data: {
      action, entityType, entityId, meta, ip: req.ip,
      hospitalId: hospitalId ?? a?.hospitalId ?? null,
      actorUserId: a?.kind === "staff" ? a.user.id : null,
      actorVisitId: a?.kind === "patient" ? a.visit.id : null,
    },
  }).catch((e) => console.error("audit write failed", action, e.message));
}

export function auditRoutes(db) {
  const r = Router();
  r.get("/audit", requireStaff("ADMIN"), async (req, res) => {
    const before = req.query.before ? new Date(String(req.query.before)) : null;
    if (before && isNaN(before)) return res.status(400).json({ error: "before must be a date" });
    const rows = await db.auditLog.findMany({
      where: { hospitalId: req.auth.hospitalId, ...(before ? { createdAt: { lt: before } } : {}) },
      orderBy: { createdAt: "desc" }, take: 100,
      include: { actor: { select: { name: true, role: true } } },
    });
    res.json({
      entries: rows.map((e) => ({
        id: e.id, action: e.action, entityType: e.entityType, entityId: e.entityId, meta: e.meta, ip: e.ip,
        ts: e.createdAt.getTime(), actor: e.actor ? `${e.actor.name} (${e.actor.role.toLowerCase()})` : e.actorVisitId ? "Patient" : "—",
      })),
      next: rows.length === 100 ? rows[99].createdAt.toISOString() : null,
    });
  });
  return r;
}
