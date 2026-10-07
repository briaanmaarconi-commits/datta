import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { pool, withDb, type DbContext } from "../src/db/pool.js";
import { runQuery, type QuerySpec } from "../src/db/queryEngine.js";
import { runRpc } from "../src/db/rpc.js";
import type { SessionUser } from "../src/auth/session.js";
import { env } from "../src/env.js";

// Costos y gastos: clasificación de categorías, gastos fijos que se repiten y pendientes del mes.
const owner = new pg.Client({ connectionString: env.DATABASE_URL });
const id = () => crypto.randomUUID();
const ids = { estA: id(), estB: id(), cashierA: id(), waiterA: id(), adminB: id() };
const run = (userId: string, spec: QuerySpec) => withDb({ role: "authenticated", userId } as DbContext, (c) => runQuery(c, spec));
const user = (uid: string, role: SessionUser["role"], est: string): SessionUser => ({ id: uid, email: null, fullName: null, role, establishmentId: est });
const ym = (d: Date) => d.toISOString().slice(0, 7);
let alquiler = "";
let rent = "";

beforeAll(async () => {
  await owner.connect();
  await owner.query(`DELETE FROM public.establishments WHERE name IN ('Costs A', 'Costs B')`);
  await owner.query(`DELETE FROM auth.users WHERE email LIKE '%@costs-test.local'`);
  await owner.query(`INSERT INTO public.establishments (id, name) VALUES ($1,'Costs A'), ($2,'Costs B')`, [ids.estA, ids.estB]);
  for (const [uid, role, est] of [[ids.cashierA, "cashier", ids.estA], [ids.waiterA, "waiter", ids.estA], [ids.adminB, "admin", ids.estB]] as const) {
    await owner.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [uid, `${role}-${uid}@costs-test.local`]);
    await owner.query(`INSERT INTO public.user_roles (user_id, role, establishment_id) VALUES ($1,$2,$3)`, [uid, role, est]);
  }
  await owner.query(`SELECT public.seed_default_finance_categories($1)`, [ids.estA]);
  alquiler = (await owner.query(`SELECT id FROM public.finance_categories WHERE establishment_id = $1 AND name = 'Alquiler'`, [ids.estA])).rows[0].id;
});

afterAll(async () => {
  await owner.query(`DELETE FROM public.finance_transactions WHERE establishment_id = ANY($1)`, [[ids.estA, ids.estB]]);
  await owner.query(`DELETE FROM public.establishments WHERE id = ANY($1)`, [[ids.estA, ids.estB]]);
  await owner.query(`DELETE FROM auth.users WHERE email LIKE '%@costs-test.local'`);
  await owner.end();
  await pool.end();
});

describe("costos y gastos", () => {
  it("las categorías por defecto quedan clasificadas", async () => {
    const rows = (await owner.query(`SELECT name, kind FROM public.finance_categories WHERE establishment_id = $1 AND type = 'expense'`, [ids.estA])).rows;
    const kind = (n: string) => rows.find((r) => r.name === n)?.kind;
    expect(kind("Costo de mercadería")).toBe("cogs");
    expect(kind("Alquiler")).toBe("fixed");
    expect(kind("Publicidad")).toBe("variable");
  });
  it("una categoría nueva se clasifica sola por el nombre", async () => {
    const r = await run(ids.cashierA, { table: "finance_categories", op: "insert", select: "kind", single: "single", values: { establishment_id: ids.estA, name: "Sueldo del bachero", type: "expense" } });
    expect(r.error).toBeNull();
    expect((r.data as any).kind).toBe("fixed");
  });
  it("el cajero carga un gasto fijo que se repite y aparece pendiente cuando llega el día", async () => {
    const r = await run(ids.cashierA, {
      table: "recurring_expenses", op: "insert", select: "id", single: "single",
      values: { establishment_id: ids.estA, category_id: alquiler, name: "Alquiler", amount: 800000, day_of_month: 1 },
    });
    expect(r.error).toBeNull();
    rent = (r.data as any).id;
    const p = await runRpc(user(ids.cashierA, "cashier", ids.estA), "pending_recurring_expenses", { _establishment_id: ids.estA });
    expect(p.error).toBeNull();
    const rows = p.data as any[];
    // empieza este mes: no reclama el mes pasado
    expect(rows.map((x) => x.period)).toEqual([ym(new Date())]);
    expect(rows[0]).toMatchObject({ name: "Alquiler", amount: 800000, overdue: false });
  });
  it("confirmado o salteado deja de estar pendiente, y no se confirma dos veces", async () => {
    const period = ym(new Date());
    const ok = await run(ids.cashierA, {
      table: "finance_transactions", op: "insert",
      values: { establishment_id: ids.estA, category_id: alquiler, type: "expense", amount: 810000, date: new Date().toISOString().slice(0, 10), affects_cash: false, recurring_expense_id: rent, period },
    });
    expect(ok.error).toBeNull();
    const dup = await run(ids.cashierA, {
      table: "finance_transactions", op: "insert",
      values: { establishment_id: ids.estA, category_id: alquiler, type: "expense", amount: 1, recurring_expense_id: rent, period },
    });
    expect(dup.error).not.toBeNull();
    const p = await runRpc(user(ids.cashierA, "cashier", ids.estA), "pending_recurring_expenses", { _establishment_id: ids.estA });
    expect(p.data).toEqual([]);
  });
  it("el mes pasado sin confirmar aparece atrasado", async () => {
    await owner.query(`UPDATE public.recurring_expenses SET starts_on = date_trunc('month', now() - interval '1 month') WHERE id = $1`, [rent]);
    const p = await runRpc(user(ids.cashierA, "cashier", ids.estA), "pending_recurring_expenses", { _establishment_id: ids.estA });
    const rows = p.data as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].overdue).toBe(true);
    const skip = await run(ids.cashierA, { table: "recurring_expense_skips", op: "insert", values: { recurring_expense_id: rent, period: rows[0].period } });
    expect(skip.error).toBeNull();
    expect((await runRpc(user(ids.cashierA, "cashier", ids.estA), "pending_recurring_expenses", { _establishment_id: ids.estA })).data).toEqual([]);
  });
  it("otro local y el mozo no ven ni consultan los gastos fijos", async () => {
    const f = [{ col: "id", op: "eq" as const, value: rent }];
    expect((await run(ids.adminB, { table: "recurring_expenses", op: "select", filters: f })).data).toEqual([]);
    expect((await run(ids.waiterA, { table: "recurring_expenses", op: "select", filters: f })).data).toEqual([]);
    const p = await runRpc(user(ids.adminB, "admin", ids.estB), "pending_recurring_expenses", { _establishment_id: ids.estA });
    expect(p.error?.code).toBe("42501");
  });
});
