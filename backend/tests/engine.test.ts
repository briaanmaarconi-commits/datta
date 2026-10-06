import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { parseSelect } from "../src/db/selectParser.js";
import { SERVICE, pool, withDb, type DbContext } from "../src/db/pool.js";
import { runQuery, type QuerySpec } from "../src/db/queryEngine.js";
import { runRpc } from "../src/db/rpc.js";
import type { SessionUser } from "../src/auth/session.js";
import { env } from "../src/env.js";

describe("selectParser", () => {
  it("parsea columnas, alias, embebidos anidados e !inner", () => {
    const n = parseSelect("*, order_items(*, products(name)), profiles:user_id(full_name, email), orders!inner(id)");
    expect(n).toHaveLength(4);
    expect(n[1]).toMatchObject({ kind: "embed", target: "order_items" });
    expect((n[1] as any).children[1]).toMatchObject({ kind: "embed", target: "products" });
    expect(n[2]).toMatchObject({ kind: "embed", alias: "profiles", target: "user_id" });
    expect(n[3]).toMatchObject({ kind: "embed", target: "orders", inner: true });
  });
  it("tolera saltos de línea", () => {
    const n = parseSelect(`
      id,
      products!inner(
        name,
        categories(name)
      )
    `);
    expect(n).toHaveLength(2);
  });
  it("rechaza sintaxis inválida", () => {
    expect(() => parseSelect("a, (b)")).toThrow();
    expect(() => parseSelect("a(")).toThrow();
  });
});

// ---- Integración contra Postgres real (requiere DATABASE_URL y esquema migrado) ----
const owner = new pg.Client({ connectionString: env.DATABASE_URL });
const ids = {
  estA: crypto.randomUUID(), estB: crypto.randomUUID(),
  adminA: crypto.randomUUID(), adminB: crypto.randomUUID(), waiterA: crypto.randomUUID(), superU: crypto.randomUUID(),
  catA: crypto.randomUUID(), catB: crypto.randomUUID(), prodA: crypto.randomUUID(), prodB: crypto.randomUUID(),
  tableA: crypto.randomUUID(), orderA: crypto.randomUUID(), orderB: crypto.randomUUID(),
};
const as = (userId: string): DbContext => ({ role: "authenticated", userId });
const run = (userId: string, spec: QuerySpec) => withDb(as(userId), (c) => runQuery(c, spec));
const user = (id: string, role: SessionUser["role"], est: string | null): SessionUser => ({ id, email: null, fullName: null, role, establishmentId: est });

beforeAll(async () => {
  await owner.connect();
  const stale = await owner.query(`SELECT id FROM public.establishments WHERE name IN ('Test A', 'Test B')`);
  if (stale.rows.length) await cleanup(stale.rows.map((r) => r.id));
  await owner.query(`DELETE FROM auth.users WHERE email LIKE '%@test.local'`);
  await owner.query(`INSERT INTO public.establishments (id, name) VALUES ($1,'Test A'), ($2,'Test B')`, [ids.estA, ids.estB]);
  for (const [id, n] of [[ids.adminA, "adminA"], [ids.adminB, "adminB"], [ids.waiterA, "waiterA"], [ids.superU, "superU"]]) {
    await owner.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [id, `${n}-${id}@test.local`]);
  }
  await owner.query(
    `INSERT INTO public.user_roles (user_id, role, establishment_id) VALUES
       ($1,'admin',$5), ($2,'admin',$6), ($3,'waiter',$5), ($4,'superadmin',NULL)`,
    [ids.adminA, ids.adminB, ids.waiterA, ids.superU, ids.estA, ids.estB],
  );
  await owner.query(`INSERT INTO public.categories (id, establishment_id, name) VALUES ($1,$3,'Cat A'), ($2,$4,'Cat B')`, [ids.catA, ids.catB, ids.estA, ids.estB]);
  await owner.query(
    `INSERT INTO public.products (id, category_id, establishment_id, name, price) VALUES ($1,$3,$5,'Prod A',100), ($2,$4,$6,'Prod B',200)`,
    [ids.prodA, ids.prodB, ids.catA, ids.catB, ids.estA, ids.estB],
  );
  await owner.query(`INSERT INTO public.tables (id, establishment_id, number) VALUES ($1,$2,7)`, [ids.tableA, ids.estA]);
  await owner.query(`INSERT INTO public.orders (id, establishment_id, table_id, status) VALUES ($1,$3,$5,'closed'), ($2,$4,NULL,'new')`, [ids.orderA, ids.orderB, ids.estA, ids.estB, ids.tableA]);
  await owner.query(`INSERT INTO public.order_items (order_id, product_id, quantity, unit_price) VALUES ($1,$3,2,100), ($2,$4,1,200)`, [ids.orderA, ids.orderB, ids.prodA, ids.prodB]);
});

async function cleanup(estIds: string[]) {
  // orden explícito: el trigger de categorías bloquea borrar categorías con productos
  await owner.query(`DELETE FROM public.order_items WHERE order_id IN (SELECT id FROM public.orders WHERE establishment_id = ANY($1))`, [estIds]);
  await owner.query(`DELETE FROM public.orders WHERE establishment_id = ANY($1)`, [estIds]);
  await owner.query(`DELETE FROM public.products WHERE establishment_id = ANY($1)`, [estIds]);
  await owner.query(`DELETE FROM public.establishments WHERE id = ANY($1)`, [estIds]);
}

afterAll(async () => {
  await cleanup([ids.estA, ids.estB]);
  await owner.query(`DELETE FROM auth.users WHERE id = ANY($1)`, [[ids.adminA, ids.adminB, ids.waiterA, ids.superU]]);
  await owner.end();
  await pool.end();
});

describe("aislamiento por establecimiento (RLS)", () => {
  it("el admin solo ve sus productos", async () => {
    const r = await run(ids.adminA, { table: "products", op: "select", filters: [{ col: "id", op: "in", value: [ids.prodA, ids.prodB] }] });
    expect(r.error).toBeNull();
    expect((r.data as any[]).map((p) => p.name)).toEqual(["Prod A"]);
  });
  it("no puede insertar en otro establecimiento", async () => {
    const r = await run(ids.adminA, { table: "categories", op: "insert", values: { establishment_id: ids.estB, name: "x" } });
    expect(r.error?.code).toBe("42501");
  });
  it("el superadmin ve ambos", async () => {
    const r = await run(ids.superU, { table: "products", op: "select", filters: [{ col: "id", op: "in", value: [ids.prodA, ids.prodB] }] });
    expect((r.data as any[]).length).toBe(2);
  });
  it("update ajeno no afecta filas", async () => {
    const r = await run(ids.adminA, { table: "products", op: "update", values: { name: "hack" }, filters: [{ col: "id", op: "eq", value: ids.prodB }], select: "id" });
    expect(r.error).toBeNull();
    expect(r.data).toEqual([]);
  });
  it("un admin no puede cambiar su plan/precio", async () => {
    const r = await run(ids.adminA, { table: "establishments", op: "update", values: { agreed_price: 1 }, filters: [{ col: "id", op: "eq", value: ids.estA }] });
    expect(r.error?.code).toBe("42501");
  });
  it("anon/otros usuarios no leen sesiones ni afip_certificates", async () => {
    const s = await run(ids.adminA, { table: "sessions", op: "select" });
    expect(s.error?.code).toBe("42501");
    const c = await run(ids.adminA, { table: "afip_certificates", op: "select" });
    expect(c.error?.code).toBe("42501");
  });
});

describe("motor de consultas", () => {
  it("embebidos anidados to-one y to-many", async () => {
    const r = await run(ids.adminA, {
      table: "orders", op: "select", select: "*, order_items(*, products(name)), tables(number)",
      filters: [{ col: "id", op: "eq", value: ids.orderA }], single: "single",
    });
    expect(r.error).toBeNull();
    const o = r.data as any;
    expect(o.tables.number).toBe(7);
    expect(o.order_items).toHaveLength(1);
    expect(o.order_items[0].products.name).toBe("Prod A");
  });
  it("!inner con filtro sobre la tabla unida", async () => {
    const r = await run(ids.adminA, {
      table: "order_items", op: "select", select: "quantity, orders!inner(status), products(name)",
      filters: [{ col: "orders.status", op: "eq", value: "closed" }, { col: "orders.establishment_id", op: "eq", value: ids.estA }],
    });
    expect(r.error).toBeNull();
    expect((r.data as any[]).length).toBe(1);
    expect((r.data as any[])[0].orders.status).toBe("closed");
  });
  it("alias por columna FK (profiles:user_id)", async () => {
    const r = await run(ids.superU, {
      table: "user_roles", op: "select", select: "role, profiles:user_id(email)",
      filters: [{ col: "user_id", op: "eq", value: ids.adminA }],
    });
    expect(r.error).toBeNull();
    expect((r.data as any[])[0].profiles.email).toContain("adminA");
  });
  it("count exact + head", async () => {
    const r = await run(ids.adminA, { table: "products", op: "select", select: "id", count: "exact", head: true, filters: [{ col: "establishment_id", op: "eq", value: ids.estA }] });
    expect(r.count).toBe(1);
    expect(r.data).toBeNull();
  });
  it("insert + select + single devuelve la fila", async () => {
    const r = await run(ids.adminA, { table: "categories", op: "insert", values: { establishment_id: ids.estA, name: "Nueva" }, select: "id, name", single: "single" });
    expect(r.error).toBeNull();
    expect((r.data as any).name).toBe("Nueva");
  });
  it("maybeSingle sin filas devuelve null y single da PGRST116", async () => {
    const f = [{ col: "id", op: "eq" as const, value: crypto.randomUUID() }];
    expect((await run(ids.adminA, { table: "products", op: "select", filters: f, single: "maybe" })).data).toBeNull();
    expect((await run(ids.adminA, { table: "products", op: "select", filters: f, single: "single" })).error?.code).toBe("PGRST116");
  });
  it("is null / not is null / in vacío / order de varias columnas", async () => {
    const a = await run(ids.adminA, { table: "orders", op: "select", select: "id", filters: [{ col: "establishment_id", op: "eq", value: ids.estA }, { col: "table_id", op: "is", value: null, negate: true }] });
    expect(a.error).toBeNull();
    const b = await run(ids.adminA, { table: "products", op: "select", filters: [{ col: "id", op: "in", value: [] }] });
    expect(b.data).toEqual([]);
    const c = await run(ids.adminA, { table: "products", op: "select", select: "name", order: [{ col: "name, price", ascending: true }], limit: 1 });
    expect(c.error).toBeNull();
  });
  it("rechaza tablas/columnas inventadas e identificadores maliciosos", async () => {
    expect((await run(ids.adminA, { table: "pg_user", op: "select" })).error).not.toBeNull();
    expect((await run(ids.adminA, { table: "products", op: "select", select: 'id"; drop table products; --' })).error).not.toBeNull();
    expect((await run(ids.adminA, { table: "products", op: "select", filters: [{ col: "name\" = 1 or 1=1 --", op: "eq", value: 1 }] })).error).not.toBeNull();
  });
  it("update/delete sin filtros están prohibidos", async () => {
    expect((await run(ids.adminA, { table: "products", op: "delete" })).error).not.toBeNull();
  });
  it("jsonb se serializa bien en insert", async () => {
    const r = await run(ids.adminA, { table: "audit_logs", op: "insert", values: { establishment_id: ids.estA, user_id: ids.adminA, action: "test", table_name: "orders", details: { a: [1, 2], b: "ñ" } }, select: "details", single: "single" });
    expect(r.error).toBeNull();
    expect((r.data as any).details).toEqual({ a: [1, 2], b: "ñ" });
  });
});

describe("rpc", () => {
  it("get_business_health del propio establecimiento funciona, ajeno se rechaza", async () => {
    const ok = await runRpc(user(ids.adminA, "admin", ids.estA), "get_business_health", { _establishment_id: ids.estA });
    expect(ok.error).toBeNull();
    const bad = await runRpc(user(ids.adminA, "admin", ids.estA), "get_business_health", { _establishment_id: ids.estB });
    expect(bad.error?.code).toBe("42501");
  });
  it("funciones no listadas se rechazan", async () => {
    const r = await runRpc(user(ids.adminA, "admin", ids.estA), "has_role", {});
    expect(r.error).not.toBeNull();
  });
  it("ensure_tips_income_category devuelve un id", async () => {
    const r = await runRpc(user(ids.adminA, "admin", ids.estA), "ensure_tips_income_category", { _establishment_id: ids.estA });
    expect(r.error).toBeNull();
    expect(typeof r.data).toBe("string");
  });
});

describe("tiempo real", () => {
  it("los cambios emiten NOTIFY con el establecimiento", async () => {
    const listener = new pg.Client({ connectionString: env.DATABASE_URL });
    await listener.connect();
    await listener.query("LISTEN datta_changes");
    const got = new Promise<any>((resolve) => listener.on("notification", (m) => {
      const p = JSON.parse(m.payload!);
      if (p.table === "tables" && p.est === ids.estA) resolve(p);
    }));
    await owner.query(`UPDATE public.tables SET capacity = 9 WHERE id = $1`, [ids.tableA]);
    expect((await got).op).toBe("UPDATE");
    await listener.end();
  });
});

void SERVICE;
