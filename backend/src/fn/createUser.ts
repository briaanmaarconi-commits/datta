import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { SERVICE, withDb } from "../db/pool.js";
import { destroyUserSessions } from "../auth/session.js";
import { fail, loadRoles, requireSession } from "./common.js";

// Port de la edge function create-user: misma matriz de permisos.
const ADMIN_ASSIGNABLE = new Set(["admin", "cashier", "waiter", "kitchen"]);
const CASHIER_ASSIGNABLE = new Set(["waiter", "kitchen"]);
const ROLE = z.enum(["superadmin", "admin", "cashier", "waiter", "kitchen"]);

const tempPassword = () =>
  Array.from(randomBytes(12), (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 16);

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create").optional(), email: z.string().email(), password: z.string().min(6).max(200), fullName: z.string().max(200).optional(), role: ROLE, establishmentId: z.string().uuid().nullish() }),
  z.object({ action: z.literal("update_role"), roleId: z.string().uuid(), role: ROLE, establishmentId: z.string().uuid().nullish() }),
  z.object({ action: z.literal("reset_password"), userId: z.string().uuid() }),
  z.object({ action: z.literal("delete_role"), roleId: z.string().uuid() }),
]);

export async function registerCreateUser(app: FastifyInstance) {
  app.post("/api/fn/create-user", async (req, reply) => {
    const caller = requireSession(req, reply);
    if (!caller) return;

    const roles = await loadRoles(caller.id);
    const isSuperadmin = roles.some((r) => r.role === "superadmin");
    const adminEsts = new Set(roles.filter((r) => r.role === "admin" && r.establishment_id).map((r) => r.establishment_id!));
    const isAdmin = adminEsts.size > 0;
    const cashierEsts = new Set(roles.filter((r) => r.role === "cashier" && r.establishment_id).map((r) => r.establishment_id!));
    const isCashier = !isAdmin && cashierEsts.size > 0;
    const scoped = isCashier ? cashierEsts : adminEsts;
    const assignable = isCashier ? CASHIER_ASSIGNABLE : ADMIN_ASSIGNABLE;
    if (!isSuperadmin && !isAdmin && !isCashier) return fail(reply, 403, "Forbidden");

    const parsed = body.safeParse({ action: "create", ...(req.body as object) });
    if (!parsed.success) return fail(reply, 400, "Datos inválidos");
    const b = parsed.data;

    const canAssign = (role: string, est: string | null): string | null => {
      if (isSuperadmin) return null;
      if (!assignable.has(role)) return "No podés asignar este rol";
      if (!est || !scoped.has(est)) return "Cannot assign role outside your establishment";
      return null;
    };

    return withDb(SERVICE, async (c) => {
      const canManageRow = async (roleId: string) => {
        const { rows } = await c.query(`SELECT role, establishment_id, user_id FROM public.user_roles WHERE id = $1`, [roleId]);
        const t = rows[0];
        if (!t) return { status: 404, msg: "Role not found" };
        if (isSuperadmin) return null;
        if (t.role === "superadmin") return { status: 403, msg: "Forbidden" };
        if (isCashier && !CASHIER_ASSIGNABLE.has(t.role)) return { status: 403, msg: "Forbidden" };
        if (!t.establishment_id || !scoped.has(t.establishment_id)) return { status: 403, msg: "Forbidden" };
        return null;
      };

      if (b.action === undefined || b.action === "create") {
        const est = b.role === "superadmin" ? null : b.establishmentId ?? null;
        const denied = canAssign(b.role, est);
        if (denied) return fail(reply, 403, denied);
        const hash = await bcrypt.hash(b.password, 10);
        try {
          await c.query("SAVEPOINT u");
          const u = await c.query(
            `INSERT INTO auth.users (email, encrypted_password, raw_user_meta_data) VALUES (lower($1), $2, $3::jsonb) RETURNING id, email`,
            [b.email.trim(), hash, JSON.stringify({ full_name: b.fullName ?? "" })],
          );
          await c.query(`INSERT INTO public.user_roles (user_id, role, establishment_id) VALUES ($1, $2, $3)`, [u.rows[0].id, b.role, est]);
          await c.query("RELEASE SAVEPOINT u");
          return { user: u.rows[0] };
        } catch (e: any) {
          await c.query("ROLLBACK TO SAVEPOINT u");
          return fail(reply, 400, e.code === "23505" ? "Ya existe un usuario con ese email" : e.message);
        }
      }

      if (b.action === "update_role") {
        const est = b.role === "superadmin" ? null : b.establishmentId ?? null;
        const no = await canManageRow(b.roleId);
        if (no) return fail(reply, no.status, no.msg);
        const denied = canAssign(b.role, est);
        if (denied) return fail(reply, 403, denied);
        await c.query(`UPDATE public.user_roles SET role = $1, establishment_id = $2 WHERE id = $3`, [b.role, est, b.roleId]);
        return { success: true };
      }

      if (b.action === "reset_password") {
        if (!isSuperadmin) {
          const { rows: targets } = await c.query(`SELECT role, establishment_id FROM public.user_roles WHERE user_id = $1`, [b.userId]);
          if (!targets.length) return fail(reply, 403, "Forbidden");
          if (targets.some((r) => r.role === "superadmin")) return fail(reply, 403, "Forbidden");
          if (isCashier && !targets.every((r) => CASHIER_ASSIGNABLE.has(r.role))) return fail(reply, 403, "Forbidden");
          if (!targets.some((r) => r.establishment_id && scoped.has(r.establishment_id))) return fail(reply, 403, "Forbidden");
        }
        const temp = tempPassword();
        const hash = await bcrypt.hash(temp, 10);
        const r = await c.query(`UPDATE auth.users SET encrypted_password = $1, updated_at = now() WHERE id = $2`, [hash, b.userId]);
        if (!r.rowCount) return fail(reply, 400, "Usuario inexistente");
        await destroyUserSessions(b.userId); // la contraseña vieja deja de valer en todos los dispositivos
        return { success: true, tempPassword: temp };
      }

      // delete_role
      const del = b as Extract<typeof b, { action: "delete_role" }>;
      const no = await canManageRow(del.roleId);
      if (no) return fail(reply, no.status, no.msg);
      await c.query(`DELETE FROM public.user_roles WHERE id = $1`, [del.roleId]);
      return { success: true };
    });
  });
}
