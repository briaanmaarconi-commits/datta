import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { mkdir, readdir, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { z } from "zod";
import { SERVICE, withDb } from "../db/pool.js";
import { env } from "../env.js";
import { MpError, cancelPreapproval, mpEnabled } from "../lib/mercadopago.js";
import { fail } from "./common.js";
import { requireSuper } from "./billing.js";

const uuid = z.string().uuid();

/** Carpeta (dentro del volumen de archivos, fuera de los buckets públicos) donde queda todo lo eliminado. */
const trashRoot = () => join(resolve(env.STORAGE_DIR), "_deleted-clients");

// Tablas que no tienen establishment_id: se llegan por su padre.
const CHILD_TABLES: [string, string][] = [
  ["order_items", `SELECT t.* FROM public.order_items t JOIN public.orders o ON o.id = t.order_id WHERE o.establishment_id = $1`],
  ["product_recipes", `SELECT t.* FROM public.product_recipes t JOIN public.products p ON p.id = t.product_id WHERE p.establishment_id = $1`],
  ["menu_combo_items", `SELECT t.* FROM public.menu_combo_items t JOIN public.menu_combos m ON m.id = t.combo_id WHERE m.establishment_id = $1`],
  ["purchase_invoice_items", `SELECT t.* FROM public.purchase_invoice_items t JOIN public.purchase_invoices i ON i.id = t.invoice_id WHERE i.establishment_id = $1`],
];

/** Qué se va a borrar, para mostrárselo al superadmin antes de confirmar. */
async function summarize(c: pg.PoolClient, id: string) {
  const { rows } = await c.query(
    `SELECT e.id, e.name, e.mp_preapproval_id, e.mp_status,
            (SELECT count(*) FROM public.orders WHERE establishment_id = e.id)::int AS orders,
            (SELECT count(*) FROM public.fiscal_invoices WHERE establishment_id = e.id)::int AS fiscal_invoices,
            (SELECT count(*) FROM public.products WHERE establishment_id = e.id)::int AS products,
            (SELECT count(*) FROM public.client_payments WHERE establishment_id = e.id)::int AS payments,
            (SELECT count(DISTINCT user_id) FROM public.user_roles WHERE establishment_id = e.id)::int AS users,
            (SELECT max(created_at) FROM public.orders WHERE establishment_id = e.id) AS last_order_at
       FROM public.establishments e WHERE e.id = $1`,
    [id],
  );
  return rows[0] as
    | {
        id: string; name: string; mp_preapproval_id: string | null; mp_status: string | null;
        orders: number; fiscal_invoices: number; products: number; payments: number; users: number; last_order_at: string | null;
      }
    | undefined;
}

/** Usuarios que solo existen por este cliente (nunca un superadmin). */
async function clientUserIds(c: pg.PoolClient, id: string): Promise<string[]> {
  const { rows } = await c.query(
    `SELECT DISTINCT ur.user_id FROM public.user_roles ur
      WHERE ur.establishment_id = $1
        AND NOT EXISTS (SELECT 1 FROM public.user_roles s WHERE s.user_id = ur.user_id AND s.role = 'superadmin')`,
    [id],
  );
  return rows.map((r) => r.user_id as string);
}

/** Copia de seguridad completa del cliente en un .json.gz antes de borrar nada. */
async function writeBackup(c: pg.PoolClient, est: { id: string; name: string }, userIds: string[], deletedBy: string) {
  const tables: Record<string, unknown[]> = {};
  const withEst = (
    await c.query(
      `SELECT table_name FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name = 'establishment_id' ORDER BY table_name`,
    )
  ).rows.map((r) => r.table_name as string);
  for (const t of withEst) {
    tables[t] = (await c.query(`SELECT * FROM public."${t}" WHERE establishment_id = $1`, [est.id])).rows;
  }
  for (const [t, sql] of CHILD_TABLES) tables[t] = (await c.query(sql, [est.id])).rows;
  const establishment = (await c.query(`SELECT * FROM public.establishments WHERE id = $1`, [est.id])).rows[0];
  const profiles = (await c.query(`SELECT * FROM public.profiles WHERE id = ANY($1)`, [userIds])).rows;
  const users = (await c.query(`SELECT id, email, encrypted_password, created_at FROM auth.users WHERE id = ANY($1)`, [userIds])).rows;

  const slug = est.name.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "cliente";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = `${slug}-${stamp}`;
  await mkdir(trashRoot(), { recursive: true });
  const file = join(trashRoot(), `${base}.json.gz`);
  const payload = { deleted_at: new Date().toISOString(), deleted_by: deletedBy, establishment, users, profiles, tables };
  await writeFile(file, gzipSync(JSON.stringify(payload)));
  return { base, file };
}

/** Mueve (no borra) las carpetas de archivos del cliente a la papelera. */
async function moveFiles(estId: string, base: string) {
  const root = resolve(env.STORAGE_DIR);
  const dest = join(trashRoot(), `${base}-archivos`);
  const move = async (from: string, name: string) => {
    await mkdir(join(dest, name, ".."), { recursive: true });
    await rename(from, join(dest, name));
  };
  // purchase-receipts/<estId>/...
  try { await move(join(root, "purchase-receipts", estId), `purchase-receipts/${estId}`); } catch { /* no tenía archivos */ }
  // product-images/<prefijo>/<estId>/...
  try {
    for (const prefix of await readdir(join(root, "product-images"))) {
      try { await move(join(root, "product-images", prefix, estId), `product-images/${prefix}/${estId}`); } catch { /* sin carpeta */ }
    }
  } catch { /* sin bucket */ }
}

export async function registerClients(app: FastifyInstance) {
  // Qué contiene el cliente (para el diálogo de confirmación).
  app.post("/api/fn/clients/delete-preview", async (req, reply) => {
    if (!(await requireSuper(req, reply))) return;
    const b = z.object({ establishment_id: uuid }).safeParse(req.body);
    if (!b.success) return fail(reply, 400, "Datos inválidos");
    return withDb(SERVICE, async (c) => {
      const s = await summarize(c, b.data.establishment_id);
      if (!s) return fail(reply, 404, "Cliente inexistente");
      return { ...s, has_data: s.orders + s.fiscal_invoices + s.payments > 0 };
    });
  });

  // Elimina el cliente y todo lo suyo. Exige repetir el nombre exacto y guarda antes una copia de seguridad.
  app.post("/api/fn/clients/delete", async (req, reply) => {
    const admin = await requireSuper(req, reply);
    if (!admin) return;
    const b = z.object({ establishment_id: uuid, confirm_name: z.string().min(1) }).safeParse(req.body);
    if (!b.success) return fail(reply, 400, "Datos inválidos");
    const id = b.data.establishment_id;

    try {
      const result = await withDb(SERVICE, async (c) => {
        const s = await summarize(c, id);
        if (!s) return fail(reply, 404, "Cliente inexistente");
        if (b.data.confirm_name.trim() !== s.name.trim()) return fail(reply, 400, "El nombre no coincide: no se eliminó nada");
        await c.query(`SELECT 1 FROM public.establishments WHERE id = $1 FOR UPDATE`, [id]);

        const userIds = await clientUserIds(c, id);
        const backup = await writeBackup(c, { id, name: s.name }, userIds, admin.id);

        // Si tiene suscripción activa en Mercado Pago, se cancela primero para no seguir cobrando.
        if (s.mp_preapproval_id && s.mp_status !== "cancelled" && mpEnabled()) await cancelPreapproval(s.mp_preapproval_id);

        // Orden: lo que no se borra solo en cascada (FK sin cascade o sin FK) y después el cliente.
        await c.query(`DELETE FROM public.fiscal_invoices WHERE establishment_id = $1`, [id]);
        await c.query(`DELETE FROM public.invoices WHERE establishment_id = $1`, [id]);
        await c.query(`UPDATE public.datta_transactions SET establishment_id = NULL WHERE establishment_id = $1`, [id]); // la contabilidad de Datta se conserva
        for (const t of ["reservations", "stock_movements", "purchase_invoices", "ingredients"]) {
          await c.query(`DELETE FROM public."${t}" WHERE establishment_id = $1`, [id]);
        }
        // La base no deja borrar una categoría con productos: los productos van antes que las categorías.
        await c.query(`DELETE FROM public.products WHERE establishment_id = $1`, [id]);
        await c.query(`DELETE FROM public.establishments WHERE id = $1`, [id]);
        if (userIds.length) await c.query(`DELETE FROM auth.users WHERE id = ANY($1)`, [userIds]); // arrastra perfiles y sesiones
        // Al final: los propios borrados generan filas de auditoría del cliente, que ya no tienen a quién pertenecer.
        await c.query(`DELETE FROM public.audit_logs WHERE establishment_id = $1`, [id]);

        return { ok: true, name: s.name, backup: backup.base, deleted: { orders: s.orders, fiscal_invoices: s.fiscal_invoices, products: s.products, users: userIds.length }, base: backup.base };
      });
      if (reply.sent) return;
      const r = result as { ok: true; base: string; name: string; backup: string; deleted: unknown };
      await moveFiles(id, r.base);
      app.log.warn({ deleted_by: admin.id, establishment: id, name: r.name, backup: r.backup, deleted: r.deleted }, "cliente eliminado");
      return { ok: true, backup: r.backup, deleted: r.deleted };
    } catch (e) {
      if (e instanceof MpError) return fail(reply, 502, `No se pudo cancelar la suscripción en Mercado Pago (${e.message}). No se eliminó nada: cancelala primero.`);
      throw e;
    }
  });
}
