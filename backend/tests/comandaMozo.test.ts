import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { env } from "../src/env.js";

const { buildApp } = await import("../src/server.js");
const { pool } = await import("../src/db/pool.js");

const owner = new pg.Client({ connectionString: env.DATABASE_URL });
let app: FastifyInstance;
const PASS = "Test-Pass-123";
const ids = { a: crypto.randomUUID(), b: crypto.randomUUID() };
const mail = (n: string) => `${n}-${crypto.randomUUID().slice(0, 6)}@comanda-mozo-test.local`;
const U: Record<string, { email: string; role: string; est: string; name: string; id: string; cookie: string }> = {
  juan: { email: mail("juan"), role: "waiter", est: ids.a, name: "Juan Pérez", id: "", cookie: "" },
  ana: { email: mail("ana"), role: "waiter", est: ids.a, name: "Ana Gómez", id: "", cookie: "" },
  cocina: { email: mail("cocina"), role: "kitchen", est: ids.a, name: "Cocina A", id: "", cookie: "" },
  ajeno: { email: mail("ajeno"), role: "waiter", est: ids.b, name: "Mozo Ajeno", id: "", cookie: "" },
};
let tableId = "";
let productId = "";

const q = (who: string, spec: Record<string, unknown>) =>
  app.inject({ method: "POST", url: "/api/db/query", payload: spec as any, headers: { cookie: U[who].cookie } });

async function cleanup() {
  const stale = (await owner.query(`SELECT id FROM public.establishments WHERE name LIKE 'Comanda Mozo Test %'`)).rows.map((r) => r.id);
  if (stale.length) {
    await owner.query(`DELETE FROM public.orders WHERE establishment_id = ANY($1)`, [stale]);
    await owner.query(`DELETE FROM public.products WHERE establishment_id = ANY($1)`, [stale]);
    await owner.query(`DELETE FROM public.establishments WHERE id = ANY($1)`, [stale]);
  }
  await owner.query(`DELETE FROM auth.users WHERE email LIKE '%@comanda-mozo-test.local'`);
}

beforeAll(async () => {
  await owner.connect();
  await cleanup();
  await owner.query(`INSERT INTO public.establishments (id, name) VALUES ($1,'Comanda Mozo Test A'), ($2,'Comanda Mozo Test B')`, [ids.a, ids.b]);
  const cat = (await owner.query(`INSERT INTO public.categories (establishment_id, name) VALUES ($1,'Cat') RETURNING id`, [ids.a])).rows[0].id;
  productId = (await owner.query(`INSERT INTO public.products (establishment_id, category_id, name, price) VALUES ($1,$2,'Milanesa',1000) RETURNING id`, [ids.a, cat])).rows[0].id;
  tableId = (await owner.query(`INSERT INTO public.tables (establishment_id, number) VALUES ($1, 5) RETURNING id`, [ids.a])).rows[0].id;
  const hash = await bcrypt.hash(PASS, 4);
  for (const u of Object.values(U)) {
    u.id = (await owner.query(
      `INSERT INTO auth.users (email, encrypted_password, raw_user_meta_data) VALUES ($1,$2,$3) RETURNING id`,
      [u.email, hash, JSON.stringify({ full_name: u.name })],
    )).rows[0].id;
    await owner.query(`INSERT INTO public.profiles (id, email, full_name) VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name`, [u.id, u.email, u.name]);
    await owner.query(`INSERT INTO public.user_roles (user_id, role, establishment_id) VALUES ($1,$2,$3)`, [u.id, u.role, u.est]);
  }
  app = await buildApp();
  for (const u of Object.values(U)) {
    const r = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: u.email, password: PASS } });
    const sc = r.headers["set-cookie"];
    u.cookie = String(Array.isArray(sc) ? sc[0] : sc).split(";")[0];
  }
});

afterAll(async () => {
  await app?.close();
  await cleanup();
  await owner.end();
  await pool.end();
});

describe("mozo en la comanda", () => {
  it("cada ítem guarda solo quién lo cargó, también en un agregado de otro mozo", async () => {
    const o = await q("juan", { table: "orders", op: "insert", select: "id", single: "single",
      values: { establishment_id: ids.a, table_id: tableId, created_by: U.juan.id, total: 1000 } });
    expect(o.json().error, o.body).toBeNull();
    const orderId = o.json().data.id;
    expect((await q("juan", { table: "order_items", op: "insert", values: { order_id: orderId, product_id: productId, quantity: 1 } })).json().error).toBeNull();
    expect((await q("ana", { table: "order_items", op: "insert", values: { order_id: orderId, product_id: productId, quantity: 2 } })).json().error).toBeNull();
    const rows = (await owner.query(`SELECT quantity, created_by FROM public.order_items WHERE order_id = $1 ORDER BY quantity`, [orderId])).rows;
    expect(rows).toEqual([{ quantity: 1, created_by: U.juan.id }, { quantity: 2, created_by: U.ana.id }]);
  });
  it("la cocina lee el nombre de los mozos de su local y no el de otro local", async () => {
    const r = await q("cocina", { table: "profiles", op: "select", select: "id, full_name", filters: [{ col: "id", op: "in", value: [U.juan.id, U.ana.id, U.ajeno.id] }] });
    expect(r.json().error).toBeNull();
    const names = (r.json().data as { full_name: string }[]).map((p) => p.full_name).sort();
    expect(names).toEqual(["Ana Gómez", "Juan Pérez"]);
  });
});
