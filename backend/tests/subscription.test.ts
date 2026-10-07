import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { pool, withDb, type DbContext } from "../src/db/pool.js";
import { runQuery, type QuerySpec } from "../src/db/queryEngine.js";
import { env } from "../src/env.js";

// Suscripción y facturas de Datta: cada local ve solo lo suyo y nadie escribe facturas desde el navegador.
const owner = new pg.Client({ connectionString: env.DATABASE_URL });
const ids = {
  estA: crypto.randomUUID(), estB: crypto.randomUUID(),
  adminA: crypto.randomUUID(), cashierA: crypto.randomUUID(), waiterA: crypto.randomUUID(), adminB: crypto.randomUUID(), superU: crypto.randomUUID(),
  payA: crypto.randomUUID(), payB: crypto.randomUUID(), invA: crypto.randomUUID(), invB: crypto.randomUUID(),
};
const run = (userId: string, spec: QuerySpec) => withDb({ role: "authenticated", userId } as DbContext, (c) => runQuery(c, spec));
const ids2 = (r: { data: unknown }) => ((r.data as { id: string }[] | null) ?? []).map((x) => x.id).sort();

beforeAll(async () => {
  await owner.connect();
  await owner.query(`DELETE FROM public.establishments WHERE name IN ('Subs A', 'Subs B')`);
  await owner.query(`DELETE FROM auth.users WHERE email LIKE '%@subs-test.local'`);
  await owner.query(`INSERT INTO public.establishments (id, name) VALUES ($1,'Subs A'), ($2,'Subs B')`, [ids.estA, ids.estB]);
  const people: [string, string, string | null][] = [
    [ids.adminA, "admin", ids.estA], [ids.cashierA, "cashier", ids.estA], [ids.waiterA, "waiter", ids.estA],
    [ids.adminB, "admin", ids.estB], [ids.superU, "superadmin", null],
  ];
  for (const [id, role, est] of people) {
    await owner.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [id, `${role}-${id}@subs-test.local`]);
    await owner.query(`INSERT INTO public.user_roles (user_id, role, establishment_id) VALUES ($1,$2,$3)`, [id, role, est]);
  }
  await owner.query(
    `INSERT INTO public.client_payments (id, establishment_id, amount, period_month, period_year) VALUES ($1,$3,1000,1,2026), ($2,$4,2000,1,2026)`,
    [ids.payA, ids.payB, ids.estA, ids.estB],
  );
  const inv = `INSERT INTO public.datta_invoices (id, establishment_id, client_payment_id, environment, tipo_cbte, punto_venta, cbte_numero, cae, issue_date, description, total, neto_gravado, emisor, receptor)
               VALUES ($1,$2,$3,'testing',11,9999,$4,'00000000000000','2026-01-05','test',1000,1000,'{}','{}')`;
  await owner.query(inv, [ids.invA, ids.estA, ids.payA, 900001]);
  await owner.query(inv, [ids.invB, ids.estB, ids.payB, 900002]);
});

afterAll(async () => {
  await owner.query(`DELETE FROM public.datta_invoices WHERE id = ANY($1)`, [[ids.invA, ids.invB]]);
  await owner.query(`DELETE FROM public.establishments WHERE id = ANY($1)`, [[ids.estA, ids.estB]]);
  await owner.query(`DELETE FROM auth.users WHERE email LIKE '%@subs-test.local'`);
  await owner.end();
  await pool.end();
});

describe("suscripción y facturas de Datta", () => {
  it("admin y cajero ven solo sus pagos y facturas", async () => {
    for (const u of [ids.adminA, ids.cashierA]) {
      expect(ids2(await run(u, { table: "client_payments", op: "select", select: "id", filters: [{ col: "id", op: "in", value: [ids.payA, ids.payB] }] }))).toEqual([ids.payA]);
      expect(ids2(await run(u, { table: "datta_invoices", op: "select", select: "id", filters: [{ col: "id", op: "in", value: [ids.invA, ids.invB] }] }))).toEqual([ids.invA]);
    }
  });
  it("el mozo no ve la suscripción", async () => {
    expect(ids2(await run(ids.waiterA, { table: "client_payments", op: "select", select: "id", filters: [{ col: "id", op: "eq", value: ids.payA }] }))).toEqual([]);
    expect(ids2(await run(ids.waiterA, { table: "datta_invoices", op: "select", select: "id", filters: [{ col: "id", op: "eq", value: ids.invA }] }))).toEqual([]);
  });
  it("el local no puede registrar pagos ni facturas", async () => {
    const p = await run(ids.adminA, { table: "client_payments", op: "insert", values: { establishment_id: ids.estA, amount: 1, period_month: 2, period_year: 2026 } });
    expect(p.error?.code).toBe("42501");
    const i = await run(ids.adminA, { table: "datta_invoices", op: "update", values: { total: 1 }, filters: [{ col: "id", op: "eq", value: ids.invA }] });
    expect(i.error?.code).toBe("42501");
  });
  it("nadie lee los datos fiscales ni la clave de Datta desde el navegador", async () => {
    for (const u of [ids.adminA, ids.superU]) {
      expect((await run(u, { table: "datta_fiscal_settings", op: "select" })).error?.code).toBe("42501");
      expect((await run(u, { table: "datta_afip_tokens", op: "select" })).error?.code).toBe("42501");
    }
  });
  it("el superadmin ve todas las facturas", async () => {
    expect(ids2(await run(ids.superU, { table: "datta_invoices", op: "select", select: "id", filters: [{ col: "id", op: "in", value: [ids.invA, ids.invB] }] }))).toEqual([ids.invA, ids.invB].sort());
  });
});
