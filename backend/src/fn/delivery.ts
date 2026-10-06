import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { SERVICE, withDb } from "../db/pool.js";
import { fail, hasEstablishmentRole, requireSession } from "./common.js";

const PLATFORMS = ["rappi", "peya"] as const;
type Platform = (typeof PLATFORMS)[number];
const ORDER_PLATFORM: Record<Platform, string> = { rappi: "rappi", peya: "pedidosya" };

const RAPPI_AUTH = "https://auth.rappi.com/oauth/token";
const PEYA_AUTH: Record<string, string> = {
  sandbox: "https://sandbox-integration-middleware.pedidosya.com/v1/login",
  production: "https://integration-middleware.pedidosya.com/v1/login",
};

const credentialsBody = z.object({
  establishment_id: z.string().uuid(),
  platform: z.enum(PLATFORMS),
  environment: z.string().optional(),
  store_id: z.string().nullish(),
  external_vendor_id: z.string().nullish(),
  client_id: z.string().nullish(),
  client_secret: z.string().nullish(),
  api_key: z.string().nullish(),
  regenerate_webhook_token: z.boolean().optional(),
});

async function testRappi(creds: Record<string, string>, clientId: string | null) {
  if (!clientId || !creds.client_secret) return { ok: false, message: "Falta Client ID o Client Secret" };
  const res = await fetch(RAPPI_AUTH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audience: "https://int-public-api-v2.rappi.com",
      client_id: clientId,
      client_secret: creds.client_secret,
      grant_type: "client_credentials",
    }),
  });
  const text = await res.text();
  if (!res.ok) return { ok: false, message: `Rappi respondió ${res.status}: ${text.slice(0, 300)}` };
  return { ok: true, message: "Autenticación con Rappi correcta" };
}

async function testPeya(creds: Record<string, string>, vendorId: string | null, env: string) {
  if (!creds.api_key) return { ok: false, message: "Falta API Key / Client Secret de PedidosYa" };
  if (!vendorId) return { ok: false, message: "Falta el Vendor ID de PedidosYa" };
  const res = await fetch(PEYA_AUTH[env] ?? PEYA_AUTH.sandbox, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: vendorId, password: creds.api_key }),
  });
  const text = await res.text();
  if (!res.ok) return { ok: false, message: `PedidosYa respondió ${res.status}: ${text.slice(0, 300)}` };
  return { ok: true, message: "Autenticación con PedidosYa correcta" };
}

export async function registerDelivery(app: FastifyInstance) {
  // Guardar credenciales (admin/cajero del establecimiento o superadmin)
  app.post("/api/fn/delivery-credentials", async (req, reply) => {
    const user = requireSession(req, reply);
    if (!user) return;
    const p = credentialsBody.safeParse(req.body);
    if (!p.success) return fail(reply, 400, "establishment_id / platform inválidos (rappi | peya)");
    const b = p.data;
    if (!(await hasEstablishmentRole(user.id, b.establishment_id, ["admin", "cashier"]))) return fail(reply, 403, "Forbidden");
    const environment = b.environment === "production" ? "production" : "sandbox";

    await withDb(SERVICE, async (c) => {
      const { rows } = await c.query(
        `SELECT id, credentials, secret_last4 FROM public.delivery_integrations WHERE establishment_id = $1 AND platform = $2`,
        [b.establishment_id, b.platform],
      );
      const existing = rows[0];
      const credentials: Record<string, string> = { ...(existing?.credentials ?? {}) };
      const secret = (b.client_secret ?? "").trim();
      const apiKey = (b.api_key ?? "").trim();
      if (secret) credentials.client_secret = secret;
      if (apiKey) credentials.api_key = apiKey;
      const newest = secret || apiKey;
      const last4 = newest ? newest.slice(-4) : existing?.secret_last4 ?? null;
      const hasCreds = !!(credentials.client_secret || credentials.api_key);
      const values = {
        environment,
        store_id: b.store_id?.toString().trim() || null,
        external_vendor_id: b.external_vendor_id?.toString().trim() || null,
        client_id: b.client_id?.toString().trim() || null,
        credentials: JSON.stringify(credentials),
        secret_last4: last4,
        status: hasCreds ? "configured" : "not_configured",
      };
      const token = b.regenerate_webhook_token ? randomBytes(24).toString("hex") : null;
      if (existing) {
        await c.query(
          `UPDATE public.delivery_integrations SET environment=$1, store_id=$2, external_vendor_id=$3, client_id=$4,
             credentials=$5::jsonb, secret_last4=$6, status=$7, last_error=NULL, webhook_token = COALESCE($9, webhook_token)
           WHERE id = $8`,
          [values.environment, values.store_id, values.external_vendor_id, values.client_id, values.credentials, values.secret_last4, values.status, existing.id, token],
        );
      } else {
        await c.query(
          `INSERT INTO public.delivery_integrations (establishment_id, platform, environment, store_id, external_vendor_id, client_id, credentials, secret_last4, status, webhook_token)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9, COALESCE($10, encode(gen_random_bytes(24),'hex')))`,
          [b.establishment_id, b.platform, values.environment, values.store_id, values.external_vendor_id, values.client_id, values.credentials, values.secret_last4, values.status, token],
        );
      }
    });
    return { ok: true };
  });

  // Probar la conexión con la plataforma
  app.post("/api/fn/delivery-test-connection", async (req, reply) => {
    const user = requireSession(req, reply);
    if (!user) return;
    const p = z.object({ establishment_id: z.string().uuid(), platform: z.enum(PLATFORMS) }).safeParse(req.body);
    if (!p.success) return fail(reply, 400, "establishment_id / platform inválidos");
    const { establishment_id, platform } = p.data;
    if (!(await hasEstablishmentRole(user.id, establishment_id, ["admin", "cashier"]))) return fail(reply, 403, "Forbidden");

    return withDb(SERVICE, async (c) => {
      const { rows } = await c.query(
        `SELECT id, environment, client_id, external_vendor_id, credentials FROM public.delivery_integrations WHERE establishment_id = $1 AND platform = $2`,
        [establishment_id, platform],
      );
      const row = rows[0];
      if (!row) return { ok: false, message: "No hay credenciales cargadas todavía" };
      let result: { ok: boolean; message: string };
      try {
        result = platform === "rappi"
          ? await testRappi(row.credentials ?? {}, row.client_id)
          : await testPeya(row.credentials ?? {}, row.external_vendor_id, row.environment);
      } catch (e) {
        result = { ok: false, message: `No se pudo contactar la plataforma: ${(e as Error).message}` };
      }
      await c.query(
        `UPDATE public.delivery_integrations SET status=$1, last_checked_at=now(), last_error=$2 WHERE id=$3`,
        [result.ok ? "connected" : "error", result.ok ? null : result.message, row.id],
      );
      return result;
    });
  });

  // Webhook público (Rappi / PedidosYa). Se mantiene también la ruta histórica /functions/v1/delivery-webhook
  // para no romper las integraciones ya registradas con esa URL.
  const webhook = async (req: any, reply: any) => {
    const token = String(req.query?.token ?? req.headers["x-datta-token"] ?? "");
    if (!token) return fail(reply, 401, "Token faltante");
    const payload = req.body;
    if (!payload || typeof payload !== "object") return fail(reply, 400, "Payload inválido");

    return withDb(SERVICE, async (c) => {
      const integ = (await c.query(`SELECT id, establishment_id, platform FROM public.delivery_integrations WHERE webhook_token = $1`, [token])).rows[0];
      if (!integ) return fail(reply, 401, "Token inválido");
      const est = integ.establishment_id as string;
      const platform = integ.platform as Platform;

      const externalOrderId = String(payload.external_order_id ?? payload.id ?? "").trim();
      if (!externalOrderId) return fail(reply, 400, "external_order_id requerido");
      const rawItems: Record<string, unknown>[] = Array.isArray(payload.items) ? payload.items : [];
      if (!rawItems.length) return fail(reply, 400, "El pedido no trae ítems");

      const dupe = (await c.query(`SELECT id FROM public.orders WHERE establishment_id = $1 AND external_order_id = $2`, [est, externalOrderId])).rows[0];
      if (dupe) return { ok: true, duplicated: true, order_id: dupe.id };

      const extIds = rawItems.map((i) => String(i.id ?? i.sku ?? "")).filter(Boolean);
      const maps = await c.query(
        `SELECT external_item_id, product_id FROM public.delivery_menu_mapping WHERE establishment_id = $1 AND platform = $2 AND external_item_id = ANY($3)`,
        [est, platform, extIds.length ? extIds : ["__none__"]],
      );
      const byExt = new Map<string, string | null>(maps.rows.map((m) => [m.external_item_id, m.product_id]));

      const unmapped: { id: string; name: string }[] = [];
      const lines: { product_id: string; quantity: number; unit_price: number; notes: string | null }[] = [];
      for (const item of rawItems) {
        const extId = String(item.id ?? item.sku ?? "");
        const name = String(item.name ?? extId);
        const productId = extId ? byExt.get(extId) : null;
        if (!productId) { unmapped.push({ id: extId, name }); continue; }
        lines.push({
          product_id: productId,
          quantity: Math.max(1, Number(item.quantity ?? 1)),
          unit_price: Number(item.unit_price ?? item.price ?? 0),
          notes: item.notes ? String(item.notes) : null,
        });
      }

      if (unmapped.length) {
        for (const u of unmapped) {
          await c.query(
            `INSERT INTO public.delivery_menu_mapping (establishment_id, platform, external_item_id, external_item_name, product_id)
             VALUES ($1,$2,$3,$4,NULL) ON CONFLICT (establishment_id, platform, external_item_id) DO NOTHING`,
            [est, platform, u.id || u.name, u.name],
          );
        }
        return reply.code(422).send({ error: "Hay ítems sin mapear en Datta", unmapped });
      }

      const subtotal = lines.reduce((s, l) => s + l.unit_price * l.quantity, 0);
      const deliveryFee = Number(payload.delivery_fee ?? 0);
      const e = (await c.query(`SELECT rappi_commission, peya_commission FROM public.establishments WHERE id = $1`, [est])).rows[0];
      const pct = Number((platform === "rappi" ? e?.rappi_commission : e?.peya_commission) ?? 0);
      const customer = (payload.customer ?? {}) as Record<string, unknown>;

      const order = await c.query(
        `INSERT INTO public.orders (establishment_id, table_id, status, total, channel, external_platform, external_order_id, delivery_fee, platform_commission, customer_name, delivery_address)
         VALUES ($1, NULL, 'new', $2, 'delivery', $3, $4, $5, $6, $7, $8::jsonb) RETURNING id`,
        [est, subtotal + deliveryFee, ORDER_PLATFORM[platform], externalOrderId, deliveryFee, subtotal * (pct / 100),
          customer.name ? String(customer.name) : null,
          JSON.stringify({ address: customer.address ? String(customer.address) : null, phone: customer.phone ? String(customer.phone) : null })],
      );
      for (const l of lines) {
        await c.query(
          `INSERT INTO public.order_items (order_id, product_id, quantity, unit_price, notes, status) VALUES ($1,$2,$3,$4,$5,'pending')`,
          [order.rows[0].id, l.product_id, l.quantity, l.unit_price, l.notes],
        );
      }
      return { ok: true, order_id: order.rows[0].id };
    });
  };
  const hook = { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } };
  app.post("/api/delivery-webhook", hook, webhook);
  app.post("/functions/v1/delivery-webhook", hook, webhook);
}
