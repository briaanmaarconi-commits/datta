import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { SERVICE, withDb } from "../db/pool.js";
import { runQuery, type QuerySpec } from "../db/queryEngine.js";
import { specSchema } from "../db/specSchema.js";
import { isServiceable } from "../lib/billing.js";

const uuid = z.string().uuid();
const limit = (max: number, windowStr = "1 minute") => ({ config: { rateLimit: { max, timeWindow: windowStr } } });

/**
 * Endpoints sin login del QR del cliente. Lectura: motor de consultas con el rol anon
 * (solo las columnas/filas de 101_public_menu.sql). Escrituras: validadas acá y ejecutadas
 * con privilegios de servicio, derivando el establecimiento desde la mesa/producto (nunca del cliente).
 */
export async function registerPublicRoutes(app: FastifyInstance) {
  app.post("/api/public/query", limit(120), async (req) => {
    const parsed = specSchema.safeParse(req.body);
    if (!parsed.success || parsed.data.op !== "select") {
      return { data: null, count: null, error: { message: "Consulta inválida", code: "PGRST100", details: null, hint: null } };
    }
    return withDb({ role: "anon", userId: null }, (c) => runQuery(c, parsed.data as QuerySpec));
  });

  app.post("/api/public/orders", limit(10), async (req, reply) => {
    const body = z
      .object({
        tableId: uuid,
        items: z
          .array(z.object({ productId: uuid, quantity: z.number().int().min(1).max(50), notes: z.string().max(300).nullish() }))
          .min(1)
          .max(60),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: { message: "Pedido inválido" } });
    const { tableId, items } = body.data;

    return withDb(SERVICE, async (c) => {
      const t = await c.query(`SELECT id, establishment_id, status FROM public.tables WHERE id = $1`, [tableId]);
      if (!t.rows.length) return reply.code(404).send({ error: { message: "Mesa inexistente" } });
      const est = t.rows[0].establishment_id as string;
      if (!(await isServiceable(c, est))) return reply.code(403).send({ error: { message: "Este local no está disponible en este momento." } });

      const ids = [...new Set(items.map((i) => i.productId))];
      const p = await c.query(
        `SELECT id, price FROM public.products WHERE id = ANY($1) AND establishment_id = $2 AND is_available`,
        [ids, est],
      );
      const price = new Map<string, number>(p.rows.map((r) => [r.id, Number(r.price)]));
      if (ids.some((id) => !price.has(id))) return reply.code(422).send({ error: { message: "Hay productos no disponibles" } });

      const total = items.reduce((s, i) => s + price.get(i.productId)! * i.quantity, 0);
      const o = await c.query(
        `INSERT INTO public.orders (table_id, establishment_id, total, created_by) VALUES ($1, $2, $3, NULL) RETURNING id`,
        [tableId, est, total],
      );
      const orderId = o.rows[0].id as string;
      for (const i of items) {
        await c.query(
          `INSERT INTO public.order_items (order_id, product_id, quantity, notes, unit_price) VALUES ($1, $2, $3, $4, $5)`,
          [orderId, i.productId, i.quantity, i.notes || null, price.get(i.productId)],
        );
      }
      if (t.rows[0].status === "free") await c.query(`UPDATE public.tables SET status = 'occupied' WHERE id = $1`, [tableId]);
      return { orderId };
    });
  });

  app.post("/api/public/waiter-calls", limit(10), async (req, reply) => {
    const body = z.object({ tableId: uuid }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: { message: "Datos inválidos" } });
    return withDb(SERVICE, async (c) => {
      const t = await c.query(`SELECT establishment_id, sector_id FROM public.tables WHERE id = $1`, [body.data.tableId]);
      if (!t.rows.length) return reply.code(404).send({ error: { message: "Mesa inexistente" } });
      const recent = await c.query(
        `SELECT 1 FROM public.waiter_calls WHERE table_id = $1 AND status = 'pending' AND created_at > now() - interval '60 seconds' LIMIT 1`,
        [body.data.tableId],
      );
      if (!(await isServiceable(c, t.rows[0].establishment_id))) return reply.code(403).send({ error: { message: "Este local no está disponible en este momento." } });
      if (!recent.rows.length) {
        await c.query(
          `INSERT INTO public.waiter_calls (table_id, establishment_id, sector_id, status) VALUES ($1, $2, $3, 'pending')`,
          [body.data.tableId, t.rows[0].establishment_id, t.rows[0].sector_id],
        );
      }
      return { ok: true };
    });
  });

  const rating = z.number().int().min(1).max(5);

  app.post("/api/public/product-reviews", limit(10), async (req, reply) => {
    const body = z
      .object({ productId: uuid, rating, comment: z.string().max(1000).nullish(), reviewerName: z.string().max(100).nullish() })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: { message: "Datos inválidos" } });
    const b = body.data;
    return withDb(SERVICE, async (c) => {
      const p = await c.query(`SELECT establishment_id FROM public.products WHERE id = $1`, [b.productId]);
      if (!p.rows.length) return reply.code(404).send({ error: { message: "Producto inexistente" } });
      if (!(await isServiceable(c, p.rows[0].establishment_id))) return reply.code(403).send({ error: { message: "Este local no está disponible en este momento." } });
      await c.query(
        `INSERT INTO public.product_reviews (product_id, establishment_id, rating, comment, reviewer_name) VALUES ($1, $2, $3, $4, $5)`,
        [b.productId, p.rows[0].establishment_id, b.rating, b.comment || null, b.reviewerName || null],
      );
      return { ok: true };
    });
  });

  app.post("/api/public/waiter-reviews", limit(10), async (req, reply) => {
    const body = z
      .object({
        establishmentId: uuid,
        waiterName: z.string().min(1).max(100),
        rating,
        comment: z.string().max(1000).nullish(),
        reviewerName: z.string().max(100).nullish(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: { message: "Datos inválidos" } });
    const b = body.data;
    return withDb(SERVICE, async (c) => {
      const e = await c.query(`SELECT 1 FROM public.establishments WHERE id = $1 AND public.establishment_serviceable(id)`, [b.establishmentId]);
      if (!e.rows.length) return reply.code(404).send({ error: { message: "Establecimiento inexistente" } });
      await c.query(
        `INSERT INTO public.waiter_reviews (establishment_id, waiter_name, rating, comment, reviewer_name) VALUES ($1, $2, $3, $4, $5)`,
        [b.establishmentId, b.waiterName.trim(), b.rating, b.comment || null, b.reviewerName || null],
      );
      return { ok: true };
    });
  });
}
