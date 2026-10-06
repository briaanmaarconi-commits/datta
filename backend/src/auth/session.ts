import { createHash, randomBytes } from "node:crypto";
import { SERVICE, withDb } from "../db/pool.js";
import { env } from "../env.js";
import { BLOCKED_STATUSES, DEFAULT_GRACE_DAYS, evaluate, type ServiceStatus } from "../lib/billing.js";
import { artDateString } from "../lib/time.js";

export const SESSION_COOKIE = "datta_session";

export type AppRole = "superadmin" | "admin" | "cashier" | "waiter" | "kitchen";

/** Estado del servicio contratado por el establecimiento del usuario (para el aviso de mora en la app). */
export interface ServiceInfo {
  status: ServiceStatus;
  nextDueDate: string | null;
  trialEndsAt: string | null;
  overdueDays: number;
  daysToSuspension: number | null;
  payUrl: string | null;
}

export interface SessionUser {
  id: string;
  email: string | null;
  fullName: string | null;
  /** Rol principal: mismo criterio que usaba el front (order by role limit 1, orden del enum). */
  role: AppRole | null;
  establishmentId: string | null;
  service?: ServiceInfo | null;
}

export type BlockReason = "suspended" | "cancelled" | "inactive";
export const BLOCK_MESSAGE: Record<BlockReason, string> = {
  suspended: "El servicio de tu restaurante está suspendido. Comunicate con Datta para regularizar tu suscripción.",
  cancelled: "La suscripción de tu restaurante fue cancelada. Comunicate con Datta si querés reactivarla.",
  inactive: "El restaurante está inactivo. Comunicate con Datta.",
};

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

export interface SessionLookup {
  user: SessionUser;
  /** Si el local del usuario está suspendido/cancelado/inactivo (el superadmin nunca se bloquea). */
  blocked: BlockReason | null;
}

export async function lookupSession(token: string): Promise<SessionLookup | null> {
  return withDb(SERVICE, async (c) => {
    const { rows } = await c.query(
      `SELECT s.id AS session_id, s.last_seen_at, u.id, u.email, p.full_name, r.role, r.establishment_id,
              e.service_status, e.is_active, e.next_due_date::text AS next_due_date, e.trial_ends_at::text AS trial_ends_at, e.mp_init_point,
              COALESCE((SELECT (value #>> '{}')::int FROM public.app_settings WHERE key = 'billing_grace_days'), $2) AS grace
         FROM public.sessions s
         JOIN auth.users u ON u.id = s.user_id
         LEFT JOIN public.profiles p ON p.id = u.id
         LEFT JOIN LATERAL (
           SELECT ur.role, ur.establishment_id FROM public.user_roles ur
            WHERE ur.user_id = u.id ORDER BY ur.role LIMIT 1
         ) r ON true
         LEFT JOIN public.establishments e ON e.id = r.establishment_id
        WHERE s.token_hash = $1 AND s.expires_at > now()
          AND (u.banned_until IS NULL OR u.banned_until < now())`,
      [hash(token), DEFAULT_GRACE_DAYS],
    );
    if (!rows.length) return null;
    const r = rows[0];
    if (Date.now() - new Date(r.last_seen_at).getTime() > 3_600_000) {
      await c.query(`UPDATE public.sessions SET last_seen_at = now() WHERE id = $1`, [r.session_id]);
    }

    let service: ServiceInfo | null = null;
    let blocked: BlockReason | null = null;
    if (r.role !== "superadmin" && r.establishment_id) {
      const status = (r.service_status ?? "active") as ServiceStatus;
      if (!r.is_active) blocked = "inactive";
      else if (BLOCKED_STATUSES.includes(status)) blocked = status as BlockReason;
      const ev = evaluate({ service_status: status, next_due_date: r.next_due_date }, artDateString(), Number(r.grace));
      service = {
        status: ev.status,
        nextDueDate: r.next_due_date,
        trialEndsAt: r.trial_ends_at,
        overdueDays: ev.overdueDays,
        daysToSuspension: ev.daysToSuspension,
        payUrl: r.mp_init_point ?? null,
      };
    }
    return {
      user: { id: r.id, email: r.email, fullName: r.full_name, role: r.role, establishmentId: r.establishment_id, service },
      blocked,
    };
  });
}

/** Compatibilidad: devuelve el usuario solo si su local puede operar. */
export async function getSessionUser(token: string): Promise<SessionUser | null> {
  const s = await lookupSession(token);
  return s && !s.blocked ? s.user : null;
}
