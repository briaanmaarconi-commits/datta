import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { env } from "../src/env.js";

const { buildApp } = await import("../src/server.js");
const { pool, withDb } = await import("../src/db/pool.js");
const { visibleTo } = await import("../src/realtime/sse.js");

const owner = new pg.Client({ connectionString: env.DATABASE_URL });
let app: FastifyInstance;
const PASS = "Test-Pass-123";
const tag = crypto.randomUUID().slice(0, 8);
const mail = (n: string) => `${n}-${tag}@view-test.local`;
const E = { a: crypto.randomUUID(), b: crypto.randomUUID() };
const T = { a: crypto.randomUUID(), b: crypto.randomUUID() };
const U: Record<string, { email: string; role: string; est: string | null; id: string; cookie: string }> = {
  superU: { email: mail("super"), role: "superadmin", est: null, id: "", cookie: "" },
  adminA: { email: mail("admin-a"), role: "admin", est: E.a, id: "", cookie: "" },
  adminB: { email: mail("admin-b"), role: "admin", est: E.b, id: "", cookie: "" },
};

const post = (who: string | null, url: string, payload: unknown = {}, headers: Record<string, string> = {}) =>
  app.inject({ method: "POST", url, payload: payload as any, headers: { ...(who ? { cookie: U[who].cookie } : {}), ...headers } });
const query = (who: string, spec: unknown, headers: Record<string, string> = {}) => post(who, "/api/db/query", spec, headers);
const asA = { "x-view-as": E.a, "x-view-mode": "spectate" };
const operateA = { "x-view-as": E.a, "x-view-mode": "operate" };
const tableStatus = async (id: string) => (await owner.query(`SELECT status FROM public.tables WHERE id = $1`, [id])).rows[0].status as string;
const setStatus = (id: string, status: string, headers: Record<string, string> = {}) =>
  query("superU", { table: "tables", op: "update", values: { status }, filters: [{ col: "id", op: "eq", value: id }] }, headers);

async function cleanup() {
  const ests = (await owner.query(`SELECT id FROM public.establishments WHERE name LIKE 'View Test %'`)).rows.map((r) => r.id);
  if (ests.length) {
    await owner.query(`DELETE FROM public.audit_logs WHERE establishment_id = ANY($1)`, [ests]);
    await owner.query(`DELETE FROM public.establishments WHERE id = ANY($1)`, [ests]);
  }
  await owner.query(`DELETE FROM auth.users WHERE email LIKE '%@view-test.local'`);
}

beforeAll(async () => {
  await owner.connect();
  await cleanup();
  await owner.query(`INSERT INTO public.establishments (id, name) VALUES ($1,$2), ($3,$4)`, [E.a, `View Test A ${tag}`, E.b, `View Test B ${tag}`]);
  await owner.query(`INSERT INTO public.tables (id, establishment_id, number, status) VALUES ($1,$2,1,'free'), ($3,$4,1,'free')`, [T.a, E.a, T.b, E.b]);
  const hash = await bcrypt.hash(PASS, 4);
  for (const k of Object.keys(U)) {
    U[k].id = (await owner.query(`INSERT INTO auth.users (email, encrypted_password) VALUES ($1,$2) RETURNING id`, [U[k].email, hash])).rows[0].id;
    await owner.query(`INSERT INTO public.user_roles (user_id, role, establishment_id) VALUES ($1,$2,$3)`, [U[k].id, U[k].role, U[k].est]);
  }
  app = await buildApp();
  for (const k of Object.keys(U)) {
    const l = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: U[k].email, password: PASS } });
    U[k].cookie = String(l.headers["set-cookie"]).split(";")[0];
  }
}, 300_000);

afterAll(async () => {
  await app?.close();
  await cleanup();
  await owner.end();
  await pool.end();
}, 120_000);

describe('"ver como" del superadmin', { timeout: 120_000 }, () => {
  it("el panel sin cabeceras funciona igual que siempre (el superadmin puede escribir)", async () => {
    expect((await setStatus(T.a, "occupied")).json().error).toBeNull();
    expect(await tableStatus(T.a)).toBe("occupied");
    await setStatus(T.a, "free");
  });

  it("un usuario que no es superadmin no gana nada con las cabeceras: se ignoran", async () => {
    // el admin del local A manda cabeceras apuntando a B: sigue viendo solo lo suyo y puede escribir en lo suyo
    const r = await query("adminA", { table: "tables", op: "select", select: "id" }, { "x-view-as": E.b, "x-view-mode": "operate" });
    expect(r.json().data.map((x: any) => x.id)).toEqual([T.a]);
    const w = await query("adminA", { table: "tables", op: "update", values: { status: "occupied" }, filters: [{ col: "id", op: "eq", value: T.a }] }, { "x-view-as": E.b, "x-view-mode": "spectate" });
    expect(w.json().error).toBeNull(); // spectate no le aplica: no es superadmin
    expect(await tableStatus(T.a)).toBe("occupied");
    await owner.query(`UPDATE public.tables SET status = 'free' WHERE id = $1`, [T.a]);
  });

  it("espectador: lee el local indicado pero no puede modificar nada", async () => {
    const read = await query("superU", { table: "tables", op: "select", select: "id, status", filters: [{ col: "establishment_id", op: "eq", value: E.a }] }, asA);
    expect(read.json().data).toEqual([{ id: T.a, status: "free" }]);

    for (const spec of [
      { table: "tables", op: "update", values: { status: "occupied" }, filters: [{ col: "id", op: "eq", value: T.a }] },
      { table: "tables", op: "insert", values: { establishment_id: E.a, number: 2 } },
      { table: "tables", op: "delete", filters: [{ col: "id", op: "eq", value: T.a }] },
    ]) {
      const r = await query("superU", spec, asA);
      expect(r.json().error?.code, JSON.stringify(spec)).toBe("VIEW_ONLY");
    }
    expect(await tableStatus(T.a)).toBe("free");
    expect(Number((await owner.query(`SELECT count(*) n FROM public.tables WHERE establishment_id = $1`, [E.a])).rows[0].n)).toBe(1);
  });

  it("espectador: los RPC de escritura fallan (transacción de solo lectura) y no se puede consultar otro local", async () => {
    const before = Number((await owner.query(`SELECT count(*) n FROM public.finance_categories WHERE establishment_id = $1`, [E.a])).rows[0].n);
    const w = await post("superU", "/api/db/rpc", { fn: "seed_default_finance_categories", args: { _establishment_id: E.a } }, asA);
    expect(w.json().error, w.body).toBeTruthy();
    expect(Number((await owner.query(`SELECT count(*) n FROM public.finance_categories WHERE establishment_id = $1`, [E.a])).rows[0].n)).toBe(before);
    const other = await post("superU", "/api/db/rpc", { fn: "seed_default_finance_categories", args: { _establishment_id: E.b } }, asA);
    expect(other.json().error?.code).toBe("42501");
  });

  it("espectador: /api/fn/* y /api/storage/* están cerrados; con «operar» o sin cabeceras no los bloquea esta guardia", async () => {
    for (const url of ["/api/fn/create-user", "/api/fn/afip-invoice", "/api/fn/billing/set-status", "/api/storage/purchase-receipts"]) {
      const r = await post("superU", url, {}, asA);
      expect(r.statusCode, url).toBe(403);
      expect(r.json().error.code, url).toBe("VIEW_ONLY");
      expect((await post("superU", url, {}, operateA)).json().error?.code, url).not.toBe("VIEW_ONLY");
      expect((await post("superU", url, {})).json().error?.code, url).not.toBe("VIEW_ONLY");
    }
  });

  it("operar: puede modificar el local indicado y get_user_establishment responde como ese local", async () => {
    expect((await setStatus(T.a, "occupied", operateA)).json().error).toBeNull();
    expect(await tableStatus(T.a)).toBe("occupied");
    await setStatus(T.a, "free");

    const est = async (userId: string, acting: string | null) =>
      withDb({ role: "authenticated", userId, actingEstablishment: acting }, async (c) => (await c.query(`SELECT public.get_user_establishment(auth.uid()) AS e`)).rows[0].e as string | null);
    expect(await est(U.superU.id, null)).toBeNull(); // sin contexto: igual que antes
    expect(await est(U.superU.id, E.a)).toBe(E.a); // superadmin con contexto
    expect(await est(U.adminA.id, E.b)).toBe(E.a); // un admin no puede "actuar" como otro local
    expect(await est(U.adminB.id, null)).toBe(E.b);
  });

  it("una cabecera con un local inexistente o mal formada se ignora", async () => {
    for (const h of [{ "x-view-as": crypto.randomUUID(), "x-view-mode": "spectate" }, { "x-view-as": "no-es-uuid", "x-view-mode": "spectate" }]) {
      const r = await setStatus(T.a, "occupied", h);
      expect(r.json().error).toBeNull();
      await setStatus(T.a, "free");
    }
  });

  it("tiempo real: un superadmin en «ver como» solo recibe eventos de ese local", () => {
    const ev = (est: string | null) => ({ table: "orders", op: "INSERT" as const, id: "1", est });
    const sup = { id: "s", email: null, fullName: null, role: "superadmin" as const, establishmentId: null };
    const adm = { id: "a", email: null, fullName: null, role: "admin" as const, establishmentId: E.a };
    expect(visibleTo({ user: sup, acting: null }, ev(E.a))).toBe(true);
    expect(visibleTo({ user: sup, acting: null }, ev(E.b))).toBe(true);
    expect(visibleTo({ user: sup, acting: E.a }, ev(E.a))).toBe(true);
    expect(visibleTo({ user: sup, acting: E.a }, ev(E.b))).toBe(false);
    expect(visibleTo({ user: adm, acting: null }, ev(E.a))).toBe(true);
    expect(visibleTo({ user: adm, acting: null }, ev(E.b))).toBe(false);
  });

  it("POST /api/auth/view-as: solo superadmin, valida el local y deja registro en la auditoría", async () => {
    const body = { establishment_id: E.a, role: "kitchen", mode: "spectate" };
    expect((await post(null, "/api/auth/view-as", body)).statusCode).toBe(401);
    expect((await post("adminA", "/api/auth/view-as", body)).statusCode).toBe(403);
    expect((await post("superU", "/api/auth/view-as", { ...body, role: "admin" })).statusCode).toBe(400);
    expect((await post("superU", "/api/auth/view-as", { ...body, establishment_id: crypto.randomUUID() })).statusCode).toBe(404);

    const ok = await post("superU", "/api/auth/view-as", body);
    expect(ok.statusCode).toBe(200);
    expect(ok.json().name).toBe(`View Test A ${tag}`);
    await post("superU", "/api/auth/view-as", { ...body, role: "cashier", mode: "operate" });
    const rows = (await owner.query(`SELECT user_id, details FROM public.audit_logs WHERE establishment_id = $1 AND action = 'superadmin_view_as' ORDER BY created_at`, [E.a])).rows;
    expect(rows).toHaveLength(2);
    expect(rows[0].user_id).toBe(U.superU.id);
    expect(rows[0].details).toMatchObject({ role: "kitchen", mode: "spectate" });
    expect(rows[1].details).toMatchObject({ role: "cashier", mode: "operate" });
  });
});
