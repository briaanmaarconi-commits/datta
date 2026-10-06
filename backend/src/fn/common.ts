import type { FastifyReply, FastifyRequest } from "fastify";
import { SERVICE, withDb } from "../db/pool.js";
import type { AppRole, SessionUser } from "../auth/session.js";

export interface RoleRow {
  role: AppRole;
  establishment_id: string | null;
}

/** Todas las filas de user_roles del usuario (la sesión solo trae el rol principal). */
export async function loadRoles(userId: string): Promise<RoleRow[]> {
  return withDb(SERVICE, async (c) => {
    const { rows } = await c.query(`SELECT role, establishment_id FROM public.user_roles WHERE user_id = $1`, [userId]);
    return rows as RoleRow[];
  });
}

export function requireSession(req: FastifyRequest, reply: FastifyReply): SessionUser | null {
  if (!req.user) {
    void reply.code(401).send({ error: "No autenticado" });
    return null;
  }
  return req.user;
}

/**
 * ¿Puede el usuario operar sobre el establecimiento con alguno de esos roles?
 * (superadmin siempre puede; equivale a requireEstablishmentAdmin de las edge functions.)
 */
export async function hasEstablishmentRole(userId: string, establishmentId: string, roles: AppRole[]): Promise<boolean> {
  const rows = await loadRoles(userId);
  if (rows.some((r) => r.role === "superadmin")) return true;
  return rows.some((r) => r.establishment_id === establishmentId && roles.includes(r.role));
}

export const fail = (reply: FastifyReply, status: number, error: string) => reply.code(status).send({ error });
