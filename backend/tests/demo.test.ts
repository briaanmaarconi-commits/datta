import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { env } from "../src/env.js";

const { buildApp } = await import("../src/server.js");
const { pool, withDb } = await import("../src/db/pool.js");
const { DEMO_NAME } = await import("../src/fn/demo.js");
const { clientUserIds, purgeEstablishment } = await import("../src/fn/clients.js");

const owner = new pg.Client({ connectionString: env.DATABASE_URL });
let app: FastifyInstance;
const PASS = "Test-Pass-123";
const tag = crypto.randomUUID().slice(0, 8);
const mail = (n: string) => `${n}-${tag}@demo-test.local`;
const U = {
  superU: { email: mail("super"), role: "superadmin", id: "", cookie: "" },
  adminX: { email: mail("admin-x"), role: "admin", id: "", cookie: "", est: crypto.randomUUID() },
};
const post = (who: "superU" | "adminX" | null, url: string, payload: unknown = {}, cookie?: string) =>
  app.inject({ method: "POST", url, payload: payload as any, headers: cookie ? { cookie } : who ? { cookie: U[who].cookie } : {} });
const n = async (sql: string, p: unknown[] = []) => Number((await owner.query(sql, p)).rows[0].n);

async function removeDemo() {
  await withDb({ role: "service_role", userId: null }, async (c) => {
    const ests = (await c.query(`SELECT id FROM public.establishments WHERE name = $1`, [DEMO_NAME])).rows.map((r) => r.id as string);
    for (const id of ests) await purgeEstablishment(c, id, await clientUserIds(c, id));
    await c.query(`DELETE FROM auth.users WHERE email LIKE 'demo-%@dattagestion.com'`);
  });
}

beforeAll(async () => {
  await owner.connect();
  await removeDemo();
  await owner.query(`DELETE FROM public.establishments WHERE name LIKE 'Demo Test %'`);
  await owner.query(`DELETE FROM auth.users WHERE email LIKE '%@demo-test.local'`);
  await owner.query(`INSERT INTO public.establishments (id, name) VALUES ($1, $2)`, [U.adminX.est, `Demo Test ${tag}`]);
  const hash = await bcrypt.hash(PASS, 4);
  for (const k of Object.keys(U) as (keyof typeof U)[]) {
    U[k].id = (await owner.query(`INSERT INTO auth.users (email, encrypted_password) VALUES ($1,$2) RETURNING id`, [U[k].email, hash])).rows[0].id;
    await owner.query(`INSERT INTO public.user_roles (user_id, role, establishment_id) VALUES ($1,$2,$3)`, [U[k].id, U[k].role, k === "adminX" ? U.adminX.est : null]);
  }
  app = await buildApp();
  for (const k of Object.keys(U) as (keyof typeof U)[]) {
    const l = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: U[k].email, password: PASS } });
    U[k].cookie = String(l.headers["set-cookie"]).split(";")[0];
  }
}, 300_000);

afterAll(async () => {
  await app?.close();
  await removeDemo();
  await owner.query(`DELETE FROM public.establishments WHERE name LIKE 'Demo Test %'`);
  await owner.query(`DELETE FROM auth.users WHERE email LIKE '%@demo-test.local'`);
  await owner.end();
  await pool.end();
}, 180_000);

let first: any;

describe("restaurante demo", { timeout: 240_000 }, () => {
  it("solo el superadmin puede crearlo", async () => {
    expect((await post(null, "/api/fn/clients/create-demo")).statusCode).toBe(401);
    expect((await post("adminX", "/api/fn/clients/create-demo")).statusCode).toBe(403);
    expect(await n(`SELECT count(*) n FROM public.establishments WHERE name = $1`, [DEMO_NAME])).toBe(0);
  });

  it("arma el local completo con carta, mesas, plano, historial, caja abierta y pedidos en curso", async () => {
    const r = await post("superU", "/api/fn/clients/create-demo");
    expect(r.statusCode, r.body).toBe(200);
    first = r.json();
    const id = first.establishment_id;
    expect(first.users.map((u: any) => u.role).sort()).toEqual(["admin", "cashier", "kitchen"]);
    expect(first.users.every((u: any) => /^[a-z2-9]{5}-[a-z2-9]{5}$/.test(u.password))).toBe(true);

    const e = (await owner.query(`SELECT service_status, is_active, agreed_price::float AS price, inventory_mode, onboarded_at IS NOT NULL AS onboarded FROM public.establishments WHERE id = $1`, [id])).rows[0];
    expect(e).toMatchObject({ service_status: "active", is_active: true, price: 0, inventory_mode: "simple", onboarded: true });

    expect(await n(`SELECT count(*) n FROM public.categories WHERE establishment_id = $1`, [id])).toBe(4);
    expect(await n(`SELECT count(*) n FROM public.products WHERE establishment_id = $1`, [id])).toBe(13);
    expect(await n(`SELECT count(*) n FROM public.products WHERE establishment_id = $1 AND stock_mode = 'direct' AND direct_stock > 0`, [id])).toBe(4);
    expect(await n(`SELECT count(*) n FROM public.sectors WHERE establishment_id = $1`, [id])).toBe(2);
    expect(await n(`SELECT count(*) n FROM public.tables WHERE establishment_id = $1`, [id])).toBe(10);
    expect(await n(`SELECT count(*) n FROM public.floor_plans WHERE establishment_id = $1 AND jsonb_array_length(layout_data->'elements') > 5`, [id])).toBe(2);
    expect(await n(`SELECT count(*) n FROM public.tables t WHERE t.establishment_id = $1 AND EXISTS (SELECT 1 FROM public.floor_plans f, jsonb_array_elements(f.layout_data->'elements') el WHERE f.establishment_id = t.establishment_id AND el->>'tableId' = t.id::text)`, [id])).toBe(10);

    const closed = await n(`SELECT count(*) n FROM public.orders WHERE establishment_id = $1 AND status = 'closed'`, [id]);
    expect(closed).toBeGreaterThan(100);
    expect(first.summary.closed_orders).toBe(closed);
    expect(await n(`SELECT count(*) n FROM public.orders WHERE establishment_id = $1 AND status IN ('new','preparing','ready')`, [id])).toBe(4);
    expect(await n(`SELECT count(*) n FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id WHERE o.establishment_id = $1 AND oi.cost_snapshot > 0`, [id])).toBeGreaterThan(200);
    expect(await n(`SELECT count(*) n FROM public.finance_transactions WHERE establishment_id = $1 AND type = 'income'`, [id])).toBe(closed);
    expect(await n(`SELECT count(*) n FROM public.invoices WHERE establishment_id = $1`, [id])).toBe(closed);
    expect(await n(`SELECT count(*) n FROM public.recurring_expenses WHERE establishment_id = $1 AND is_active`, [id])).toBe(6);
    expect(await n(`SELECT count(*) n FROM public.finance_transactions WHERE establishment_id = $1 AND type = 'expense'`, [id])).toBeGreaterThanOrEqual(12);
    // los totales de cada pedido coinciden con sus ítems
    expect(await n(`SELECT count(*) n FROM public.orders o WHERE o.establishment_id = $1 AND o.total <> (SELECT sum(quantity * unit_price) FROM public.order_items WHERE order_id = o.id)`, [id])).toBe(0);
    expect(await n(`SELECT count(*) n FROM public.shift_controls WHERE establishment_id = $1 AND closed_at IS NULL AND initial_cash = 20000`, [id])).toBe(1);
    expect(await n(`SELECT count(*) n FROM public.reservations WHERE establishment_id = $1`, [id])).toBe(3);
    expect(await n(`SELECT count(*) n FROM public.tables WHERE establishment_id = $1 AND status = 'occupied'`, [id])).toBe(4);
    // no quedó nada de facturación electrónica ni de cobro automático
    expect(await n(`SELECT count(*) n FROM public.afip_certificates WHERE establishment_id = $1`, [id])).toBe(0);
  });

  it("los tres usuarios entran con las claves entregadas y ven lo que corresponde a su rol", async () => {
    const byRole: Record<string, string> = {};
    for (const u of first.users) {
      const l = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: u.email, password: u.password } });
      expect(l.statusCode, u.email).toBe(200);
      expect(l.json().user).toMatchObject({ role: u.role, establishmentId: first.establishment_id });
      byRole[u.role] = String(l.headers["set-cookie"]).split(";")[0];
    }
    const q = async (role: string, table: string, extra: object = {}) => (await post(null, "/api/db/query", { table, op: "select", select: "id", ...extra }, byRole[role])).json().data as unknown[];
    expect(await q("kitchen", "sectors")).toHaveLength(2); // la cocina necesita leer los sectores (ticket)
    expect(await q("kitchen", "orders", { filters: [{ col: "status", op: "in", value: ["new", "preparing"] }] })).toHaveLength(3);
    expect(await q("cashier", "tables")).toHaveLength(10);
    expect(await q("cashier", "products")).toHaveLength(13);
    expect((await q("admin", "orders")).length).toBeGreaterThan(100);
    // y nada del resto de los locales
    expect(await q("admin", "establishments")).toHaveLength(1);
  });

  it("volver a crearlo sin «restablecer» avisa y no toca nada; con «restablecer» lo arma de nuevo con claves nuevas", async () => {
    const again = await post("superU", "/api/fn/clients/create-demo");
    expect(again.statusCode).toBe(409);
    expect(again.json().code ?? again.json().error?.code).toBe("DEMO_EXISTS");
    expect(await n(`SELECT count(*) n FROM public.establishments WHERE name = $1`, [DEMO_NAME])).toBe(1);

    const r = await post("superU", "/api/fn/clients/create-demo", { reset: true });
    expect(r.statusCode, r.body).toBe(200);
    const second = r.json();
    expect(second.establishment_id).not.toBe(first.establishment_id);
    expect(await n(`SELECT count(*) n FROM public.establishments WHERE name = $1`, [DEMO_NAME])).toBe(1);
    expect(await n(`SELECT count(*) n FROM public.establishments WHERE id = $1`, [first.establishment_id])).toBe(0);
    expect(await n(`SELECT count(*) n FROM auth.users WHERE email LIKE 'demo-%@dattagestion.com'`)).toBe(3);
    // la clave anterior ya no sirve
    const old = first.users[0];
    expect((await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: old.email, password: old.password } })).statusCode).toBe(401);
    const neu = second.users.find((u: any) => u.email === old.email);
    expect(neu.password).not.toBe(old.password);
    expect((await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: neu.email, password: neu.password } })).statusCode).toBe(200);
  });
});
