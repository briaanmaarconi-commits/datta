import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { pool, withDb, type DbContext } from "../src/db/pool.js";
import { runQuery, type QuerySpec } from "../src/db/queryEngine.js";
import { env } from "../src/env.js";

// Movimientos borrados: el cajero borra, queda la copia y solo el dueño la ve.
const owner = new pg.Client({ connectionString: env.DATABASE_URL });
const id = () => crypto.randomUUID();
const ids = { estA: id(), estB: id(), adminA: id(), cashierA: id(), adminB: id() };
const run = (userId: string, spec: QuerySpec) => withDb({ role: "authenticated", userId } as DbContext, (c) => runQuery(c, spec));
let tx = "";

beforeAll(async () => {
  await owner.connect();
  await owner.query(`DELETE FROM public.establishments WHERE name IN ('Del A', 'Del B')`);
  await owner.query(`DELETE FROM auth.users WHERE email LIKE '%@del-test.local'`);
  await owner.query(`INSERT INTO public.establishments (id, name) VALUES ($1,'Del A'), ($2,'Del B')`, [ids.estA, ids.estB]);
  for (const [uid, role, est] of [[ids.adminA, "admin", ids.estA], [ids.cashierA, "cashier", ids.estA], [ids.adminB, "admin", ids.estB]] as const) {
    await owner.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [uid, `${role}-${uid}@del-test.local`]);
    await owner.query(`INSERT INTO public.user_roles (user_id, role, establishment_id) VALUES ($1,$2,$3)`, [uid, role, est]);
  }
  const cat = (await owner.query(`INSERT INTO public.finance_categories (establishment_id, name, type) VALUES ($1,'Luz','expense') RETURNING id`, [ids.estA])).rows[0].id;
  tx = (await owner.query(
    `INSERT INTO public.finance_transactions (establishment_id, category_id, type, amount, description, affects_cash, created_by) VALUES ($1,$2,'expense',45000,'Edesur',true,$3) RETURNING id`,
    [ids.estA, cat, ids.cashierA],
  )).rows[0].id;
});

afterAll(async () => {
  await owner.query(`DELETE FROM public.establishments WHERE id = ANY($1)`, [[ids.estA, ids.estB]]);
  await owner.query(`DELETE FROM auth.users WHERE email LIKE '%@del-test.local'`);
  await owner.end();
  await pool.end();
});

describe("movimientos borrados", () => {
  it("el cajero puede borrar un movimiento y queda la copia con quién y cuándo", async () => {
    const r = await run(ids.cashierA, { table: "finance_transactions", op: "delete", filters: [{ col: "id", op: "eq", value: tx }] });
    expect(r.error).toBeNull();
    const row = (await owner.query(`SELECT amount::float, category_name, description, deleted_by, deleted_at, affects_cash FROM public.deleted_finance_transactions WHERE original_id = $1`, [tx])).rows[0];
    expect(row).toMatchObject({ amount: 45000, category_name: "Luz", description: "Edesur", deleted_by: ids.cashierA, affects_cash: true });
    expect(row.deleted_at).toBeTruthy();
  });
  it("solo el dueño del local ve los borrados", async () => {
    const f = [{ col: "original_id", op: "eq" as const, value: tx }];
    expect(((await run(ids.adminA, { table: "deleted_finance_transactions", op: "select", filters: f })).data as any[]).length).toBe(1);
    expect((await run(ids.cashierA, { table: "deleted_finance_transactions", op: "select", filters: f })).data).toEqual([]);
    expect((await run(ids.adminB, { table: "deleted_finance_transactions", op: "select", filters: f })).data).toEqual([]);
  });
  it("nadie puede borrar ni cambiar la copia", async () => {
    const d = await run(ids.adminA, { table: "deleted_finance_transactions", op: "delete", filters: [{ col: "original_id", op: "eq", value: tx }] });
    expect(d.error?.code).toBe("42501");
  });
  it("borrar el local entero (con movimientos) sigue funcionando", async () => {
    const cat = (await owner.query(`INSERT INTO public.finance_categories (establishment_id, name, type) VALUES ($1,'Gas','expense') RETURNING id`, [ids.estB])).rows[0].id;
    await owner.query(`INSERT INTO public.finance_transactions (establishment_id, category_id, type, amount) VALUES ($1,$2,'expense',100)`, [ids.estB, cat]);
    await owner.query(`DELETE FROM public.establishments WHERE id = $1`, [ids.estB]);
    const left = await owner.query(`SELECT 1 FROM public.establishments WHERE id = $1`, [ids.estB]);
    expect(left.rowCount).toBe(0);
  });
});
