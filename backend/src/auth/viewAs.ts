import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { SERVICE, withDb, type DbContext } from "../db/pool.js";
import type { SessionUser } from "./session.js";
import { requireUser } from "./routes.js";

/**
 * "Ver como": un superadmin mira (o, si lo activa, opera) la cocina, caja o mozo de un local.
 * El contexto es POR PESTAÑA: viaja en las cabeceras x-view-as / x-view-mode (o en la URL del EventSource), nunca en la sesión,
 * así pueden convivir varias pestañas de locales distintos y el panel del superadmin no se ve afectado.
 * Solo se respeta si la sesión real es de un superadmin: para cualquier otro usuario las cabeceras se ignoran.
 */
export interface ViewAs {
  establishmentId: string;
  /** false = solo mirar (por defecto); true = puede modificar datos. */
  operate: boolean;
}

declare module "fastify" {
  interface FastifyRequest {
    viewAs: ViewAs | null;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Cache corto de locales que existen (evita una consulta por cada request de una pestaña "ver como").
const known = new Map<string, number>();
async function establishmentExists(id: string): Promise<boolean> {
  const hit = known.get(id);
  if (hit && hit > Date.now()) return true;
  const ok = await withDb(SERVICE, async (c) => (await c.query(`SELECT 1 FROM public.establishments WHERE id = $1`, [id])).rowCount === 1);
  if (ok) known.set(id, Date.now() + 60_000);
  return ok;
}

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);

/** Hook global (después de attachUser): arma req.viewAs y aplica las guardas del modo "solo mirar". */
export async function attachViewAs(req: FastifyRequest, reply: import("fastify").FastifyReply) {
  req.viewAs = null;
  if (req.user?.role !== "superadmin") return;

  const url = new URL(req.url, "http://x");
  const rawId = first(req.headers["x-view-as"]) ?? url.searchParams.get("viewAs");
  if (typeof rawId !== "string" || !UUID.test(rawId)) return;
  if (!(await establishmentExists(rawId.toLowerCase()))) return;
  const mode = first(req.headers["x-view-mode"]) ?? url.searchParams.get("viewMode");
  req.viewAs = { establishmentId: rawId.toLowerCase(), operate: mode === "operate" };

  // Las funciones /api/fn/* y /api/storage/* usan el rol de servicio y se saltean RLS: en "solo mirar" se cierran por completo.
  if (!req.viewAs.operate && req.method !== "GET" && req.method !== "HEAD" && (url.pathname.startsWith("/api/fn/") || url.pathname.startsWith("/api/storage/"))) {
    return reply.code(403).send({ error: { message: "Modo solo mirar: activá «Operar» para modificar datos.", code: "VIEW_ONLY" } });
  }
}

/** Contexto de base de datos de un usuario autenticado, con las restricciones de "ver como" si corresponde. */
export function dbContextFor(user: SessionUser, viewAs: ViewAs | null): DbContext {
  return {
    role: "authenticated",
    userId: user.id,
    readOnly: !!viewAs && !viewAs.operate,
    actingEstablishment: viewAs?.establishmentId ?? null,
  };
}

export const VIEW_ONLY_ERROR = { message: "Modo solo mirar: activá «Operar» para modificar datos.", code: "VIEW_ONLY", details: null, hint: null };

export async function registerViewAs(app: FastifyInstance) {
  app.decorateRequest("viewAs", null);

  // Registra en la auditoría del local que un superadmin entró a mirar u operar (y cuándo activa o desactiva "operar").
  app.post("/api/auth/view-as", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    if (user.role !== "superadmin") return reply.code(403).send({ error: { message: "Solo el superadmin puede usar esta función" } });
    const b = z
      .object({ establishment_id: z.string().uuid(), role: z.enum(["kitchen", "cashier", "waiter"]), mode: z.enum(["spectate", "operate"]) })
      .safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: { message: "Datos inválidos" } });
    return withDb(SERVICE, async (c) => {
      const est = (await c.query(`SELECT id, name FROM public.establishments WHERE id = $1`, [b.data.establishment_id])).rows[0];
      if (!est) return reply.code(404).send({ error: { message: "Local inexistente" } });
      await c.query(
        `INSERT INTO public.audit_logs (user_id, establishment_id, action, table_name, record_id, details) VALUES ($1,$2,'superadmin_view_as','view_as',$3,$4)`,
        [user.id, est.id, String(est.id), JSON.stringify({ superadmin: user.email, role: b.data.role, mode: b.data.mode })],
      );
      return { ok: true, name: est.name as string };
    });
  });
}
