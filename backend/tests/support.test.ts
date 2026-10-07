import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { pool, withDb, type DbContext } from "../src/db/pool.js";
import { runQuery, type QuerySpec } from "../src/db/queryEngine.js";
import { env } from "../src/env.js";

// Inconvenientes: aislamiento entre locales y reglas de quién cambia qué.
const owner = new pg.Client({ connectionString: env.DATABASE_URL });
const ids = {
  estA: crypto.randomUUID(), estB: crypto.randomUUID(),
  adminA: crypto.randomUUID(), cashierA: crypto.randomUUID(), waiterA: crypto.randomUUID(),
  adminB: crypto.randomUUID(), superU: crypto.randomUUID(),
};
const as = (userId: string): DbContext => ({ role: "authenticated", userId });
const run = (userId: string, spec: QuerySpec) => withDb(as(userId), (c) => runQuery(c, spec));
const DESC = "La impresora de cocina no imprime las comandas desde ayer a la noche.";
let ticketA = "";

beforeAll(async () => {
  await owner.connect();
  await owner.query(`DELETE FROM public.establishments WHERE name IN ('Support A', 'Support B')`);
  await owner.query(`DELETE FROM auth.users WHERE email LIKE '%@support-test.local'`);
  await owner.query(`INSERT INTO public.establishments (id, name) VALUES ($1,'Support A'), ($2,'Support B')`, [ids.estA, ids.estB]);
  const people: [string, string, string | null][] = [
    [ids.adminA, "admin", ids.estA], [ids.cashierA, "cashier", ids.estA], [ids.waiterA, "waiter", ids.estA],
    [ids.adminB, "admin", ids.estB], [ids.superU, "superadmin", null],
  ];
  for (const [id, role, est] of people) {
    await owner.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [id, `${role}-${id}@support-test.local`]);
    await owner.query(`INSERT INTO public.user_roles (user_id, role, establishment_id) VALUES ($1,$2,$3)`, [id, role, est]);
  }
});

afterAll(async () => {
  await owner.query(`DELETE FROM public.establishments WHERE id = ANY($1)`, [[ids.estA, ids.estB]]);
  await owner.query(`DELETE FROM auth.users WHERE email LIKE '%@support-test.local'`);
  await owner.end();
  await pool.end();
});

describe("inconvenientes", () => {
  it("el admin crea uno: local, autor y estado los fija el servidor", async () => {
    const r = await run(ids.adminA, {
      table: "support_tickets", op: "insert", select: "*", single: "single",
      values: { establishment_id: ids.estB, title: "No imprime la cocina", description: DESC, status: "resolved", is_read: true },
    });
    expect(r.error).toBeNull();
    const t = r.data as any;
    expect(t).toMatchObject({ establishment_id: ids.estA, created_by: ids.adminA, status: "new", is_read: false });
    ticketA = t.id;
  });
  it("el cajero también puede crear; el mozo no", async () => {
    const ok = await run(ids.cashierA, { table: "support_tickets", op: "insert", values: { establishment_id: ids.estA, title: "Caja lenta", description: DESC } });
    expect(ok.error).toBeNull();
    const no = await run(ids.waiterA, { table: "support_tickets", op: "insert", values: { establishment_id: ids.estA, title: "Mozo", description: DESC } });
    expect(no.error?.code).toBe("42501");
  });
  it("exige título y desarrollo detallado", async () => {
    const r = await run(ids.adminA, { table: "support_tickets", op: "insert", values: { title: "Hola", description: "corto" } });
    expect(r.error).not.toBeNull();
  });
  it("otro local no lo ve ni puede responder", async () => {
    const s = await run(ids.adminB, { table: "support_tickets", op: "select", filters: [{ col: "id", op: "eq", value: ticketA }] });
    expect(s.data).toEqual([]);
    const m = await run(ids.adminB, { table: "support_ticket_messages", op: "insert", values: { ticket_id: ticketA, body: "intruso" } });
    expect(m.error?.code).toBe("42501");
  });
  it("el local no puede cambiar el estado", async () => {
    const r = await run(ids.adminA, { table: "support_tickets", op: "update", values: { status: "resolved" }, filters: [{ col: "id", op: "eq", value: ticketA }] });
    expect(r.error?.code).toBe("42501");
  });
  it("respuesta de Datta: queda sin leer para el local y pasa a en revisión", async () => {
    const r = await run(ids.superU, { table: "support_ticket_messages", op: "insert", values: { ticket_id: ticketA, body: "Lo estamos revisando" }, select: "*", single: "single" });
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({ from_datta: true, establishment_id: ids.estA });
    const t = (await owner.query(`SELECT status, client_unread, is_read FROM public.support_tickets WHERE id = $1`, [ticketA])).rows[0];
    expect(t).toEqual({ status: "in_progress", client_unread: true, is_read: true });
  });
  it("el local marca la respuesta como leída y contesta; vuelve como no leído a Datta", async () => {
    const u = await run(ids.adminA, { table: "support_tickets", op: "update", values: { client_unread: false }, filters: [{ col: "id", op: "eq", value: ticketA }], select: "id" });
    expect(u.error).toBeNull();
    const m = await run(ids.adminA, { table: "support_ticket_messages", op: "insert", values: { ticket_id: ticketA, body: "Gracias", from_datta: true }, select: "from_datta", single: "single" });
    expect(m.error).toBeNull();
    expect((m.data as any).from_datta).toBe(false);
    const t = (await owner.query(`SELECT client_unread, is_read FROM public.support_tickets WHERE id = $1`, [ticketA])).rows[0];
    expect(t).toEqual({ client_unread: false, is_read: false });
  });
  it("el superadmin ve todos y gestiona en bloque", async () => {
    const r = await run(ids.superU, {
      table: "support_tickets", op: "update", values: { status: "resolved", is_read: true },
      filters: [{ col: "establishment_id", op: "eq", value: ids.estA }], select: "status, resolved_at",
    });
    expect(r.error).toBeNull();
    expect((r.data as any[]).length).toBe(2);
    expect((r.data as any[]).every((t) => t.status === "resolved" && t.resolved_at)).toBe(true);
  });
});
