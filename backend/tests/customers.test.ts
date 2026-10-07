import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { pool, withDb, type DbContext } from "../src/db/pool.js";
import { runQuery, type QuerySpec } from "../src/db/queryEngine.js";
import { env } from "../src/env.js";

// Delivery propio: ficha de clientes por local, consentimiento de WhatsApp e historial de pedidos.
const owner = new pg.Client({ connectionString: env.DATABASE_URL });
const ids = {
  estA: crypto.randomUUID(), estB: crypto.randomUUID(),
  cashierA: crypto.randomUUID(), waiterA: crypto.randomUUID(), adminB: crypto.randomUUID(),
};
const run = (userId: string, spec: QuerySpec) => withDb({ role: "authenticated", userId } as DbContext, (c) => runQuery(c, spec));
let customerA = "";

beforeAll(async () => {
  await owner.connect();
  await owner.query(`DELETE FROM public.establishments WHERE name IN ('Cust A', 'Cust B')`);
  await owner.query(`DELETE FROM auth.users WHERE email LIKE '%@cust-test.local'`);
  await owner.query(`INSERT INTO public.establishments (id, name) VALUES ($1,'Cust A'), ($2,'Cust B')`, [ids.estA, ids.estB]);
  const people: [string, string, string][] = [[ids.cashierA, "cashier", ids.estA], [ids.waiterA, "waiter", ids.estA], [ids.adminB, "admin", ids.estB]];
  for (const [id, role, est] of people) {
    await owner.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [id, `${role}-${id}@cust-test.local`]);
    await owner.query(`INSERT INTO public.user_roles (user_id, role, establishment_id) VALUES ($1,$2,$3)`, [id, role, est]);
  }
});

afterAll(async () => {
  await owner.query(`DELETE FROM public.orders WHERE establishment_id = ANY($1)`, [[ids.estA, ids.estB]]);
  await owner.query(`DELETE FROM public.establishments WHERE id = ANY($1)`, [[ids.estA, ids.estB]]);
  await owner.query(`DELETE FROM auth.users WHERE email LIKE '%@cust-test.local'`);
  await owner.end();
  await pool.end();
});

describe("clientes de delivery propio", () => {
  it("el cajero carga un cliente; el consentimiento queda fechado y casa no guarda piso", async () => {
    const r = await run(ids.cashierA, {
      table: "customers", op: "insert", select: "*", single: "single",
      values: { establishment_id: ids.estA, full_name: " Juan Pérez ", phone: "11 4444-5555", street_address: "Av. Siempre Viva 742", dwelling_type: "house", floor: "3", whatsapp_opt_in: true, orders_count: 99 },
    });
    expect(r.error).toBeNull();
    const c = r.data as any;
    expect(c).toMatchObject({ full_name: "Juan Pérez", phone_digits: "1144445555", floor: null, orders_count: 0 });
    expect(c.whatsapp_opt_in_at).not.toBeNull();
    customerA = c.id;
  });
  it("no se duplica el mismo teléfono escrito distinto", async () => {
    const r = await run(ids.cashierA, { table: "customers", op: "insert", values: { establishment_id: ids.estA, full_name: "Otro", phone: "1144445555" } });
    expect(r.error).not.toBeNull();
  });
  it("otro local y el mozo no ven los clientes", async () => {
    const f = [{ col: "id", op: "eq" as const, value: customerA }];
    expect((await run(ids.adminB, { table: "customers", op: "select", filters: f })).data).toEqual([]);
    expect((await run(ids.waiterA, { table: "customers", op: "select", filters: f })).data).toEqual([]);
  });
  it("el navegador no puede inflar los totales", async () => {
    const r = await run(ids.cashierA, { table: "customers", op: "update", values: { orders_count: 50, total_spent: 1 }, filters: [{ col: "id", op: "eq", value: customerA }], select: "orders_count, total_spent", single: "single" });
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({ orders_count: 0 });
  });
  it("al cerrar un pedido se suma al historial del cliente; al anularlo se descuenta", async () => {
    const o = await run(ids.cashierA, {
      table: "orders", op: "insert", select: "id", single: "single",
      values: { establishment_id: ids.estA, table_id: null, status: "new", channel: "delivery", external_platform: "propio", customer_id: customerA, total: 1500 },
    });
    expect(o.error).toBeNull();
    const id = (o.data as any).id;
    await run(ids.cashierA, { table: "orders", op: "update", values: { status: "closed" }, filters: [{ col: "id", op: "eq", value: id }] });
    let c = (await owner.query(`SELECT orders_count, total_spent::float AS t, last_order_at FROM public.customers WHERE id = $1`, [customerA])).rows[0];
    expect(c.orders_count).toBe(1);
    expect(c.t).toBe(1500);
    expect(c.last_order_at).not.toBeNull();
    await run(ids.cashierA, { table: "orders", op: "update", values: { status: "cancelled" }, filters: [{ col: "id", op: "eq", value: id }] });
    c = (await owner.query(`SELECT orders_count, total_spent::float AS t FROM public.customers WHERE id = $1`, [customerA])).rows[0];
    expect(c).toEqual({ orders_count: 0, t: 0 });
  });
});
