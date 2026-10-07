import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { pool, withDb, type DbContext } from "../src/db/pool.js";
import { runQuery, type QuerySpec } from "../src/db/queryEngine.js";
import { runRpc } from "../src/db/rpc.js";
import type { SessionUser } from "../src/auth/session.js";
import { env } from "../src/env.js";

// Stock: descuento al cobrar (simple y avanzado), rendimiento, devolución al reabrir, mermas e ingresos.
const owner = new pg.Client({ connectionString: env.DATABASE_URL });
const id = () => crypto.randomUUID();
const ids = {
  adv: id(), simple: id(), cashierAdv: id(), waiterAdv: id(), cashierSimple: id(),
  coca: id(), burger: id(), carne: id(), cocaS: id(), burgerS: id(), carneS: id(),
};
const run = (userId: string, spec: QuerySpec) => withDb({ role: "authenticated", userId } as DbContext, (c) => runQuery(c, spec));
const user = (uid: string, role: SessionUser["role"], est: string): SessionUser => ({ id: uid, email: null, fullName: null, role, establishmentId: est });
const val = async (sql: string, p: unknown[]) => Number(Object.values((await owner.query(sql, p)).rows[0])[0]);

async function sell(cashier: string, est: string, items: [string, number][]) {
  const o = await run(cashier, { table: "orders", op: "insert", select: "id", single: "single", values: { establishment_id: est, table_id: null, status: "new", total: 1 } });
  const orderId = (o.data as any).id;
  await run(cashier, { table: "order_items", op: "insert", values: items.map(([product_id, quantity]) => ({ order_id: orderId, product_id, quantity, unit_price: 1 })) });
  const c = await run(cashier, { table: "orders", op: "update", values: { status: "closed" }, filters: [{ col: "id", op: "eq", value: orderId }] });
  expect(c.error).toBeNull();
  return orderId as string;
}

beforeAll(async () => {
  await owner.connect();
  await owner.query(`DELETE FROM public.establishments WHERE name IN ('Inv Adv', 'Inv Simple')`);
  await owner.query(`DELETE FROM auth.users WHERE email LIKE '%@inv-test.local'`);
  await owner.query(`INSERT INTO public.establishments (id, name, inventory_mode) VALUES ($1,'Inv Adv','advanced'), ($2,'Inv Simple','simple')`, [ids.adv, ids.simple]);
  for (const [uid, role, est] of [[ids.cashierAdv, "cashier", ids.adv], [ids.waiterAdv, "waiter", ids.adv], [ids.cashierSimple, "cashier", ids.simple]] as const) {
    await owner.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [uid, `${role}-${uid}@inv-test.local`]);
    await owner.query(`INSERT INTO public.user_roles (user_id, role, establishment_id) VALUES ($1,$2,$3)`, [uid, role, est]);
  }
  for (const [est, coca, burger, carne] of [[ids.adv, ids.coca, ids.burger, ids.carne], [ids.simple, ids.cocaS, ids.burgerS, ids.carneS]]) {
    const cat = (await owner.query(`INSERT INTO public.categories (establishment_id, name) VALUES ($1,'Inv') RETURNING id`, [est])).rows[0].id;
    await owner.query(
      `INSERT INTO public.products (id, establishment_id, category_id, name, price, cost, stock_mode, direct_stock)
       VALUES ($1,$3,$4,'Coca',100,40,'direct',10), ($2,$3,$4,'Hamburguesa',500,0,'recipe',0)`,
      [coca, burger, est, cat],
    );
    await owner.query(`INSERT INTO public.ingredients (id, establishment_id, name, unit, current_stock, cost_per_unit, yield_pct) VALUES ($1,$2,'Carne','g',1000,10,80)`, [carne, est]);
    await owner.query(`INSERT INTO public.product_recipes (product_id, ingredient_id, quantity) VALUES ($1,$2,150)`, [burger, carne]);
  }
});

afterAll(async () => {
  for (const est of [ids.adv, ids.simple]) {
    await owner.query(`DELETE FROM public.stock_movements WHERE establishment_id = $1`, [est]);
    await owner.query(`DELETE FROM public.order_items WHERE order_id IN (SELECT id FROM public.orders WHERE establishment_id = $1)`, [est]);
    await owner.query(`DELETE FROM public.orders WHERE establishment_id = $1`, [est]);
    await owner.query(`DELETE FROM public.products WHERE establishment_id = $1`, [est]);
  }
  await owner.query(`DELETE FROM public.establishments WHERE id = ANY($1)`, [[ids.adv, ids.simple]]);
  await owner.query(`DELETE FROM auth.users WHERE email LIKE '%@inv-test.local'`);
  await owner.end();
  await pool.end();
});

describe("stock al cobrar", () => {
  let order = "";
  it("avanzado: descuenta unidades y los ingredientes de la receta, con rendimiento", async () => {
    order = await sell(ids.cashierAdv, ids.adv, [[ids.coca, 2], [ids.burger, 2]]);
    expect(await val(`SELECT direct_stock FROM public.products WHERE id = $1`, [ids.coca])).toBe(8);
    // 2 x 150 g con rendimiento 80% => 375 g
    expect(await val(`SELECT current_stock FROM public.ingredients WHERE id = $1`, [ids.carne])).toBe(625);
  });
  it("no descuenta dos veces el mismo pedido", async () => {
    await owner.query(`UPDATE public.orders SET status = 'closed' WHERE id = $1`, [order]);
    expect(await val(`SELECT current_stock FROM public.ingredients WHERE id = $1`, [ids.carne])).toBe(625);
  });
  it("si se reabre el pedido, el stock vuelve", async () => {
    await owner.query(`UPDATE public.orders SET status = 'delivered' WHERE id = $1`, [order]);
    expect(await val(`SELECT direct_stock FROM public.products WHERE id = $1`, [ids.coca])).toBe(10);
    expect(await val(`SELECT current_stock FROM public.ingredients WHERE id = $1`, [ids.carne])).toBe(1000);
  });
  it("simple: descuenta unidades pero no ingredientes", async () => {
    await sell(ids.cashierSimple, ids.simple, [[ids.cocaS, 3], [ids.burgerS, 1]]);
    expect(await val(`SELECT direct_stock FROM public.products WHERE id = $1`, [ids.cocaS])).toBe(7);
    expect(await val(`SELECT current_stock FROM public.ingredients WHERE id = $1`, [ids.carneS])).toBe(1000);
  });
});

describe("mermas e ingresos", () => {
  it("la merma descuenta stock y guarda la plata perdida", async () => {
    const r = await runRpc(user(ids.cashierAdv, "cashier", ids.adv), "register_waste", { _kind: "ingredient", _item_id: ids.carne, _quantity: 50, _reason: "expired", _note: "heladera" });
    expect(r.error).toBeNull();
    expect((r.data as any).value).toBe(500);
    expect(await val(`SELECT current_stock FROM public.ingredients WHERE id = $1`, [ids.carne])).toBe(950);
    const m = (await owner.query(`SELECT reason, waste_reason FROM public.stock_movements WHERE ingredient_id = $1 AND type = 'waste'`, [ids.carne])).rows[0];
    expect(m).toEqual({ reason: "Vencido: heladera", waste_reason: "expired" });
  });
  it("merma de un producto por unidad", async () => {
    const r = await runRpc(user(ids.cashierAdv, "cashier", ids.adv), "register_waste", { _kind: "product", _item_id: ids.coca, _quantity: 1, _reason: "broken" });
    expect((r.data as any).value).toBe(40);
    expect(await val(`SELECT direct_stock FROM public.products WHERE id = $1`, [ids.coca])).toBe(9);
  });
  it("el mozo no registra mermas ni otro local puede tocar el stock", async () => {
    const w = await runRpc(user(ids.waiterAdv, "waiter", ids.adv), "register_waste", { _kind: "product", _item_id: ids.coca, _quantity: 1, _reason: "broken" });
    expect(w.error?.code).toBe("42501");
    const o = await runRpc(user(ids.cashierSimple, "cashier", ids.simple), "add_product_stock", { _product_id: ids.coca, _quantity: 5 });
    expect(o.error?.code).toBe("42501");
  });
  it("sumar porciones o unidades", async () => {
    const r = await runRpc(user(ids.cashierSimple, "cashier", ids.simple), "add_product_stock", { _product_id: ids.cocaS, _quantity: 24, _note: "Llegó el pedido" });
    expect(r.error).toBeNull();
    expect((r.data as any).stock).toBe(31);
  });
});
