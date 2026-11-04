import { randomBytes, createHash } from "crypto";

// Crockford base32: no I, L, O, U, so codes read aloud or typed from paper stay unambiguous.
const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export const sha256 = (s) => createHash("sha256").update(s).digest("hex");
export const randomToken = () => randomBytes(32).toString("base64url");

/** 80-bit patient access code, shown as XXXX-XXXX-XXXX-XXXX. */
export function newAccessCode() {
  const bytes = randomBytes(10);
  let bits = 0, value = 0, out = "";
  for (const b of bytes) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  return out.match(/.{4}/g).join("-");
}

/** Accepts lower case, spaces, dashes and the usual look-alike letters. */
export function normalizeAccessCode(input) {
  return String(input || "").toUpperCase()
    .replace(/[OQ]/g, "0").replace(/[IL]/g, "1").replace(/[^0-9A-Z]/g, "");
}

export const hashAccessCode = (code) => sha256(normalizeAccessCode(code));

/** Non-secret display label like A417, unique per hospital (checked by caller). */
export function newVisitLabel() {
  const L = "ABCDEFGHJKMNPQRSTUVWXYZ";
  return L[randomBytes(1)[0] % L.length] + String(100 + (randomBytes(2).readUInt16BE() % 900));
}

/**
 * Fixed-window rate limiter.
 * shortcut: in-process memory, so limits reset on restart and are per instance; move to Postgres/Redis before running more than one server.
 */
export function rateLimiter({ max, windowMs }) {
  const hits = new Map();
  return {
    hit(key) {
      const now = Date.now();
      const h = hits.get(key);
      if (!h || h.reset < now) { hits.set(key, { n: 1, reset: now + windowMs }); return true; }
      h.n += 1;
      return h.n <= max;
    },
    reset(key) { hits.delete(key); },
  };
}
