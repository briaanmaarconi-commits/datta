import type { FastifyInstance } from "fastify";
import pg from "pg";
import webpush from "web-push";
import { z } from "zod";
import { SERVICE, withDb } from "../db/pool.js";
import { env } from "../env.js";
import { requireUser } from "../auth/routes.js";
import { decryptSecret, encryptSecret } from "../secrets.js";

// Avisos al celular (Web Push): hoy, "pedido listo" al mozo que tomó el pedido.
// La base avisa por el canal datta_push (trigger notify_order_ready) y acá se manda a sus celulares.

let vapid: { publicKey: string; privateKey: string } | null = null;

/** Claves VAPID del servidor: se generan una vez y quedan guardadas (la privada cifrada). */
async function getVapid() {
  if (vapid) return vapid;
  vapid = await withDb(SERVICE, async (c) => {
    const { rows } = await c.query("SELECT public_key, private_key FROM public.push_keys WHERE id = 1");
    if (rows[0]) return { publicKey: rows[0].public_key as string, privateKey: decryptSecret(rows[0].private_key) };
    const k = webpush.generateVAPIDKeys();
    await c.query(
      "INSERT INTO public.push_keys (id, public_key, private_key) VALUES (1, $1, $2) ON CONFLICT (id) DO NOTHING",
      [k.publicKey, encryptSecret(k.privateKey)],
    );
    // Si otro proceso la creó al mismo tiempo, vale la que quedó guardada.
    const again = await c.query("SELECT public_key, private_key FROM public.push_keys WHERE id = 1");
    return { publicKey: again.rows[0].public_key as string, privateKey: decryptSecret(again.rows[0].private_key) };
  });
  webpush.setVapidDetails("mailto:soporte@dattagestion.com", vapid.publicKey, vapid.privateKey);
  return vapid;
}

/** Manda un aviso a todos los celulares del usuario; borra las suscripciones vencidas. */
export async function sendPushToUser(userId: string, payload: { title: string; body: string; url?: string; tag?: string }) {
  await getVapid();
  const subs = await withDb(SERVICE, async (c) =>
    (await c.query("SELECT id, endpoint, p256dh, auth FROM public.push_subscriptions WHERE user_id = $1", [userId])).rows,
  );
  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 600, urgency: "high" });
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await withDb(SERVICE, (c) => c.query("DELETE FROM public.push_subscriptions WHERE id = $1", [s.id]));
        } else {
          console.warn("push: no se pudo enviar", code ?? (e as Error).message);
        }
      }
    }),
  );
}

async function handle(raw: string) {
  let ev: { kind?: string; user_id?: string; order_id?: string; table?: number | null };
  try {
    ev = JSON.parse(raw);
  } catch {
    return;
  }
  if (ev.kind === "order_ready" && ev.user_id) {
    await sendPushToUser(ev.user_id, {
      title: ev.table != null ? `Mesa ${ev.table}: pedido listo` : "Pedido listo",
      body: "Cocina marcó el pedido como listo para llevar.",
      url: "/waiter/orders",
      tag: `order-ready-${ev.order_id}`,
    });
  }
}

/** Conexión LISTEN datta_push con reconexión automática. */
async function startListener(app: FastifyInstance) {
  const connect = async () => {
    const c = new pg.Client({ connectionString: env.APP_DATABASE_URL ?? env.DATABASE_URL });
    c.on("notification", (m) => m.payload && void handle(m.payload).catch((e) => app.log.error({ err: e }, "push: error al avisar")));
    let retried = false;
    const retry = () => {
      if (retried) return;
      retried = true;
      setTimeout(() => void connect().catch(() => { retried = false; retry(); }), 3000);
    };
    c.on("error", (e) => {
      app.log.error({ err: e }, "listener de avisos caído");
      retry();
    });
    c.on("end", retry);
    await c.connect();
    await c.query("LISTEN datta_push");
  };
  await connect().catch((e) => {
    app.log.error({ err: e }, "no se pudo iniciar el listener de avisos");
    setTimeout(() => void startListener(app), 3000);
  });
}

const subSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(500) }),
});

export async function registerPush(app: FastifyInstance) {
  await startListener(app);

  app.get("/api/push/key", async (req, reply) => {
    if (!requireUser(req, reply)) return;
    return { publicKey: (await getVapid()).publicKey };
  });

  // Guarda este celular para el usuario actual (si el celular era de otro usuario, pasa a ser de este).
  app.post("/api/push/subscribe", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    if (req.viewAs) return reply.code(403).send({ error: { message: "No disponible en modo vista" } });
    const parsed = subSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { message: "Suscripción inválida" } });
    const s = parsed.data;
    await withDb(SERVICE, (c) =>
      c.query(
        `INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent`,
        [user.id, s.endpoint, s.keys.p256dh, s.keys.auth, String(req.headers["user-agent"] ?? "").slice(0, 300)],
      ),
    );
    return { ok: true };
  });

  app.post("/api/push/unsubscribe", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const endpoint = z.object({ endpoint: z.string().max(2000) }).safeParse(req.body);
    if (!endpoint.success) return reply.code(400).send({ error: { message: "Falta el endpoint" } });
    await withDb(SERVICE, (c) => c.query("DELETE FROM public.push_subscriptions WHERE endpoint = $1 AND user_id = $2", [endpoint.data.endpoint, user.id]));
    return { ok: true };
  });

  // Aviso de prueba al propio celular (botón "Probar aviso").
  app.post("/api/push/test", async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    await sendPushToUser(user.id, { title: "Datta", body: "Los avisos funcionan en este celular ✅", url: "/waiter/orders", tag: "push-test" });
    return { ok: true };
  });
}
