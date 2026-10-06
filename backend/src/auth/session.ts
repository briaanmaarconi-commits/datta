import { createHash, randomBytes } from "node:crypto";
import { SERVICE, withDb } from "../db/pool.js";
import { env } from "../env.js";

export const SESSION_COOKIE = "datta_session";

export type AppRole = "superadmin" | "admin" | "cashier" | "waiter" | "kitchen";

export interface SessionUser {
  id: string;
  email: string | null;
  fullName: string | null;
  /** Rol principal: mismo criterio que usaba el front (order by role limit 1, orden del enum). */
  role: AppRole | null;
  establishmentId: string | null;
}

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(userId: string, ip: string | undefined, userAgent: string | undefined) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + env.SESSION_TTL_DAYS * 86_400_000);
  await withDb(SERVICE, (c) =>
    c.query(
      `INSERT INTO public.sessions (token_hash, user_id, expires_at, user_agent, ip) VALUES ($1, $2, $3, $4, $5)`,
      [hash(token), userId, expires, userAgent?.slice(0, 300) ?? null, ip ?? null],
    ),
  );
  return { token, expires };
}

export async function destroySession(token: string) {
  await withDb(SERVICE, (c) => c.query(`DELETE FROM public.sessions WHERE token_hash = $1`, [hash(token)]));
}

export async function destroyUserSessions(userId: string) {
  await withDb(SERVICE, (c) => c.query(`DELETE FROM public.sessions WHERE user_id = $1`, [userId]));
}

export async function getSessionUser(token: string): Promise<SessionUser | null> {
  return withDb(SERVICE, async (c) => {
    const { rows } = await c.query(
      `SELECT s.id AS session_id, s.last_seen_at, u.id, u.email, p.full_name, r.role, r.establishment_id
         FROM public.sessions s
         JOIN auth.users u ON u.id = s.user_id
         LEFT JOIN public.profiles p ON p.id = u.id
         LEFT JOIN LATERAL (
           SELECT ur.role, ur.establishment_id FROM public.user_roles ur
            WHERE ur.user_id = u.id ORDER BY ur.role LIMIT 1
         ) r ON true
        WHERE s.token_hash = $1 AND s.expires_at > now()
          AND (u.banned_until IS NULL OR u.banned_until < now())`,
      [hash(token)],
    );
    if (!rows.length) return null;
    const r = rows[0];
    if (Date.now() - new Date(r.last_seen_at).getTime() > 3_600_000) {
      await c.query(`UPDATE public.sessions SET last_seen_at = now() WHERE id = $1`, [r.session_id]);
    }
    return {
      id: r.id,
      email: r.email,
      fullName: r.full_name,
      role: r.role,
      establishmentId: r.establishment_id,
    };
  });
}
