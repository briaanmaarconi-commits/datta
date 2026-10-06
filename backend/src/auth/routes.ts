import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { SERVICE, withDb } from "../db/pool.js";
import { env } from "../env.js";
import { SESSION_COOKIE, createSession, destroySession, getSessionUser, type SessionUser } from "./session.js";

declare module "fastify" {
  interface FastifyRequest {
    user: SessionUser | null;
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
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) req.user = await getSessionUser(token);
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
  app.post("/api/auth/login", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
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
    const user = await getSessionUser(token);
    return { user };
  });

  app.post("/api/auth/logout", async (req, reply) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) await destroySession(token);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/api/auth/me", async (req) => ({ user: req.user }));
}
