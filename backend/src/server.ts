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
import { specSchema } from "./db/specSchema.js";
import { registerPublicRoutes } from "./routes/public.js";
import { registerStorage } from "./storage.js";
import { registerCreateUser } from "./fn/createUser.js";
import { registerDelivery } from "./fn/delivery.js";
import { registerAfipCsr } from "./fn/afipCsr.js";
import { registerAfipInvoice } from "./fn/afipInvoice.js";
import { registerAiFunctions } from "./fn/ai.js";
import { registerChat } from "./fn/chat.js";
import { registerBilling } from "./fn/billing.js";
import { registerClients } from "./fn/clients.js";
import { VIEW_ONLY_ERROR, attachViewAs, dbContextFor, registerViewAs } from "./auth/viewAs.js";
import { startCron } from "./cron.js";
import { registerWeb } from "./web.js";

export async function buildApp() {
  const app = Fastify({ logger: true, bodyLimit: 25 * 1024 * 1024, trustProxy: true });

  await app.register(cookie);
  await app.register(rateLimit, { max: 600, timeWindow: "1 minute" });

  app.decorateRequest("user", null);
  app.decorateRequest("blocked", null);
  app.addHook("onRequest", attachUser);
  app.addHook("onRequest", attachViewAs); // "ver como" del superadmin (por pestaña); después de attachUser

  app.get("/api/health", async () => ({ ok: true }));

  await registerAuthRoutes(app);
  await registerViewAs(app);

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
    // Modo "solo mirar" del superadmin: además de la transacción READ ONLY, un mensaje claro en vez de un error de Postgres.
    if (req.viewAs && !req.viewAs.operate && spec.op !== "select") return { data: null, count: null, error: VIEW_ONLY_ERROR };
    return withDb(dbContextFor(user, req.viewAs), (c) => runQuery(c, spec));
  });

  app.post("/api/db/rpc", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const body = z.object({ fn: z.string(), args: z.record(z.unknown()).optional() }).safeParse(req.body);
    if (!body.success) return { data: null, count: null, error: { message: "RPC inválido", code: "PGRST100", details: null, hint: null } };
    return runRpc(user, body.data.fn, body.data.args ?? {}, req.viewAs);
  });

  await registerPublicRoutes(app);
  await registerStorage(app);
  await registerCreateUser(app);
  await registerDelivery(app);
  await registerAfipCsr(app);
  await registerAfipInvoice(app);
  await registerAiFunctions(app);
  await registerChat(app);
  await registerBilling(app);
  await registerClients(app);
  await registerRealtime(app);

  await registerWeb(app);

  await loadCatalog();
  return app;
}

if (process.argv[1] && /server\.(ts|js)$/.test(process.argv[1])) {
  const app = await buildApp();
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  startCron(app);
}
