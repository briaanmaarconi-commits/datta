import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { SERVICE, withDb } from "../db/pool.js";
import { env } from "../env.js";
import { BLOCK_MESSAGE, SESSION_COOKIE, createSession, destroySession, lookupSession, type BlockReason, type SessionUser } from "./session.js";

declare module "fastify" {
  interface FastifyRequest {
    user: SessionUser | null;
    /** Sesión válida pero el local está suspendido/cancelado/inactivo. */
    blocked: BlockReason | null;
  }
}

// Hash descartable para igualar tiempos cuando el email no existe.
const DUMMY_HASH = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8.4ZpP5w5mZ1jQ3nXq0yGZ9sZ1Qh9a";

export function setSessionCookie(reply: FastifyReply, token: string, expires: Date) {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.COOKIE_SECURE,
    path: "/",
    expires,
  });
}

/** Hook global: adjunta req.user si hay cookie de sesión válida. */
export async function attachUser(req: FastifyRequest) {
  req.user = null;
  req.blocked = null;
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return;
  const s = await lookupSession(token);
  if (!s) return;
  // Si el servicio del local está suspendido, la sesión deja de valer para todo (API, tiempo real, archivos).
  if (s.blocked) req.blocked = s.blocked;
  else req.user = s.user;
}

export function requireUser(req: FastifyRequest, reply: FastifyReply): SessionUser | null {
  if (!req.user) {
    void reply.code(401).send({ error: { message: "No autenticado", code: "401" } });
    return null;
  }
  return req.user;
}

const loginBody = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post("/api/auth/login", { config: { rateLimit: { max: env.LOGIN_RATE_LIMIT, timeWindow: "1 minute" } } }, async (req, reply) => {
    const parsed = loginBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { message: "Datos inválidos" } });
    const email = parsed.data.email.trim().toLowerCase();

    const row = await withDb(SERVICE, async (c) => {
      const { rows } = await c.query(
        `SELECT id, encrypted_password, banned_until FROM auth.users WHERE lower(email) = $1`,
        [email],
      );
      return rows[0] as { id: string; encrypted_password: string | null; banned_until: Date | null } | undefined;
    });

    const ok = await bcrypt.compare(parsed.data.password, row?.encrypted_password || DUMMY_HASH);
    const banned = row?.banned_until && new Date(row.banned_until) > new Date();
    if (!row || !row.encrypted_password || !ok || banned) {
      return reply.code(401).send({ error: { message: "Credenciales incorrectas" } });
    }

    const { token, expires } = await createSession(row.id, req.ip, req.headers["user-agent"]);
    await withDb(SERVICE, (c) => c.query(`UPDATE auth.users SET last_sign_in_at = now() WHERE id = $1`, [row.id]));
    setSessionCookie(reply, token, expires);
    const s = await lookupSession(token);
    if (s?.blocked) {
      await destroySession(token);
      reply.clearCookie(SESSION_COOKIE, { path: "/" });
      return reply.code(403).send({ error: { message: BLOCK_MESSAGE[s.blocked], code: "SERVICE_SUSPENDED", reason: s.blocked } });
    }
    return { user: s?.user ?? null };
  });

  app.post("/api/auth/logout", async (req, reply) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) await destroySession(token);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/api/auth/me", async (req) => ({
    user: req.user,
    blocked: req.blocked ? { reason: req.blocked, message: BLOCK_MESSAGE[req.blocked] } : null,
  }));
}
