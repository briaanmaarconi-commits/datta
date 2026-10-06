import Fastify from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import { env } from "./env.js";
import { attachUser, registerAuthRoutes, requireUser } from "./auth/routes.js";
import { withDb } from "./db/pool.js";
import { runQuery, type QuerySpec } from "./db/queryEngine.js";
import { runRpc } from "./db/rpc.js";
import { loadCatalog } from "./db/catalog.js";
import { registerRealtime } from "./realtime/sse.js";

export async function buildApp() {
  const app = Fastify({ logger: true, bodyLimit: 25 * 1024 * 1024, trustProxy: true });

  await app.register(cookie);
  await app.register(rateLimit, { max: 600, timeWindow: "1 minute" });

  app.decorateRequest("user", null);
  app.addHook("onRequest", attachUser);

  app.get("/api/health", async () => ({ ok: true }));

  await registerAuthRoutes(app);

  const filterSchema = z.object({
    col: z.string().max(100),
    op: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "in", "is"]),
    value: z.unknown(),
    negate: z.boolean().optional(),
  });
  const specSchema = z.object({
    table: z.string().regex(/^[a-z_][a-z0-9_]*$/),
    op: z.enum(["select", "insert", "update", "delete"]),
    select: z.string().max(2000).optional(),
    filters: z.array(filterSchema).max(50).optional(),
    order: z.array(z.object({ col: z.string().max(200), ascending: z.boolean().optional(), nullsFirst: z.boolean().optional() })).max(10).optional(),
    limit: z.number().int().min(0).max(100000).optional(),
    single: z.enum(["single", "maybe"]).optional(),
    count: z.literal("exact").optional(),
    head: z.boolean().optional(),
    values: z.union([z.record(z.unknown()), z.array(z.record(z.unknown())).max(5000)]).optional(),
  });

  // Reemplazo de PostgREST: la seguridad la aplican las policies RLS de Postgres
  // con el rol "authenticated" y auth.uid() del usuario de la sesión.
  app.post("/api/db/query", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const parsed = specSchema.safeParse(req.body);
    if (!parsed.success) {
      return { data: null, count: null, error: { message: "Consulta inválida", code: "PGRST100", details: parsed.error.message, hint: null } };
    }
    const spec = parsed.data as QuerySpec;
    return withDb({ role: "authenticated", userId: user.id }, (c) => runQuery(c, spec));
  });

  app.post("/api/db/rpc", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const body = z.object({ fn: z.string(), args: z.record(z.unknown()).optional() }).safeParse(req.body);
    if (!body.success) return { data: null, count: null, error: { message: "RPC inválido", code: "PGRST100", details: null, hint: null } };
    return runRpc(user, body.data.fn, body.data.args ?? {});
  });

  await registerRealtime(app);

  await loadCatalog();
  return app;
}

if (process.argv[1] && /server\.(ts|js)$/.test(process.argv[1])) {
  const app = await buildApp();
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
}
