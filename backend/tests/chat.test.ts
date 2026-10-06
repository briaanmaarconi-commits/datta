import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { env } from "../src/env.js";

// Se reemplaza solo la llamada al modelo: el resto (contexto, permisos, RLS, herramientas) corre de verdad.
const captured: { system?: string; tools?: { name: string }[]; runTool?: (n: string, a: any) => Promise<string> } = {};
vi.mock("../src/ai.js", async (orig) => {
  const real = await orig<typeof import("../src/ai.js")>();
  return {
    ...real,
    aiEnabled: () => true,
    runToolChat: async (o: any) => {
      captured.system = o.system;
      captured.tools = o.tools;
      captured.runTool = o.runTool;
      return "respuesta simulada";
    },
  };
});

const { buildApp } = await import("../src/server.js");
const { pool } = await import("../src/db/pool.js");

const owner = new pg.Client({ connectionString: env.DATABASE_URL });
let app: FastifyInstance;
const PASS = "Test-Pass-123";
const mail = (n: string) => `${n}-${crypto.randomUUID().slice(0, 8)}@chat-test.local`;
const ids = { est: crypto.randomUUID(), otherEst: crypto.randomUUID() };
const users = {
  admin: { email: mail("admin"), role: "admin", est: ids.est, id: "" },
  cashier: { email: mail("cashier"), role: "cashier", est: ids.est, id: "" },
  waiter: { email: mail("waiter"), role: "waiter", est: ids.est, id: "" },
};
const cookie: Record<string, string> = {};

async function cleanup() {
  const ests = (await owner.query(`SELECT id FROM public.establishments WHERE name LIKE 'Chat Test %'`)).rows.map((r) => r.id);
  if (ests.length) {
    await owner.query(`DELETE FROM public.products WHERE establishment_id = ANY($1)`, [ests]);
    await owner.query(`DELETE FROM public.establishments WHERE id = ANY($1)`, [ests]);
  }
  await owner.query(`DELETE FROM auth.users WHERE email LIKE '%@chat-test.local'`);
}
const ask = (who: keyof typeof users) =>
  app.inject({ method: "POST", url: "/api/fn/restaurant-chat", headers: { cookie: cookie[who] }, payload: { messages: [{ role: "user", content: "hola" }] } });

beforeAll(async () => {
  await owner.connect();
  await cleanup();
  await owner.query(`INSERT INTO public.establishments (id, name) VALUES ($1,'Chat Test A'), ($2,'Chat Test B')`, [ids.est, ids.otherEst]);
  const hash = await bcrypt.hash(PASS, 4);
  for (const k of Object.keys(users) as (keyof typeof users)[]) {
    const r = await owner.query(`INSERT INTO auth.users (email, encrypted_password) VALUES ($1,$2) RETURNING id`, [users[k].email, hash]);
    users[k].id = r.rows[0].id;
    await owner.query(`INSERT INTO public.user_roles (user_id, role, establishment_id) VALUES ($1,$2,$3)`, [users[k].id, users[k].role, users[k].est]);
  }
  await owner.query(`INSERT INTO public.categories (id, establishment_id, name) VALUES (gen_random_uuid(), $1, 'Platos')`, [ids.est]);
  app = await buildApp();
  for (const k of Object.keys(users) as (keyof typeof users)[]) {
    const l = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: users[k].email, password: PASS } });
    cookie[k] = String(l.headers["set-cookie"]).split(";")[0];
  }
});

afterAll(async () => {
  await app?.close();
  await cleanup();
  await owner.end();
  await pool.end();
});

describe("asistente: acceso por rol", () => {
  it("el mozo no tiene acceso", async () => {
    expect((await ask("waiter")).statusCode).toBe(403);
  });

  it("el dueño (admin) recibe todo: semana, mes, finanzas y todas las herramientas", async () => {
    expect((await ask("admin")).statusCode).toBe(200);
    expect(captured.system).toContain("VENTAS SEMANA");
    expect(captured.system).toContain("TOP PRODUCTOS VENDIDOS");
    expect(captured.system).toContain("FINANZAS (últimos 30 días)");
    expect(captured.system).not.toContain("MODO CAJA");
    expect(captured.tools!.map((t) => t.name)).toContain("bulk_update_prices");
    expect(captured.tools!.map((t) => t.name)).toContain("delete_finance_transaction");
  });

  it("el cajero NO recibe datos semanales/mensuales ni alertas, y su prompt lo limita al día", async () => {
    expect((await ask("cashier")).statusCode).toBe(200);
    const s = captured.system!;
    expect(s).toContain("MODO CAJA");
    expect(s).toContain("VENTAS HOY");
    expect(s).toContain("PRODUCTOS Y MÁRGENES"); // calcular costos sí
    expect(s).not.toContain("VENTAS SEMANA");
    expect(s).not.toContain("TOP PRODUCTOS VENDIDOS");
    expect(s).not.toContain("FINANZAS (últimos 30 días)");
    expect(s).not.toContain("ALERTAS Y RECOMENDACIONES");
    expect(s).toContain("CAJA DE HOY");
  });

  it("el cajero solo tiene las herramientas operativas", async () => {
    await ask("cashier");
    const names = captured.tools!.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["create_product", "update_product", "create_category", "update_table_status", "create_finance_transaction"]));
    for (const banned of ["bulk_update_prices", "update_finance_transaction", "delete_finance_transaction", "create_finance_category"]) {
      expect(names).not.toContain(banned);
    }
  });

  it("aunque el modelo pida una herramienta prohibida, el servidor no la ejecuta", async () => {
    await ask("cashier");
    const r = await captured.runTool!("bulk_update_prices", { category_id: "all", percentage: 50 });
    expect(r).toMatch(/solo la puede hacer el administrador/);
  });

  it("el cajero puede agregar un plato (con su costo) en su establecimiento y no en otro", async () => {
    await ask("cashier");
    const cat = (await owner.query(`SELECT id FROM public.categories WHERE establishment_id = $1 LIMIT 1`, [ids.est])).rows[0].id;
    const ok = await captured.runTool!("create_product", { name: "Plato nuevo", category_id: cat, price: 5000, cost: 1800 });
    expect(ok).toMatch(/creado exitosamente/);
    const row = (await owner.query(`SELECT price, cost, establishment_id FROM public.products WHERE name = 'Plato nuevo'`)).rows[0];
    expect(Number(row.price)).toBe(5000);
    expect(Number(row.cost)).toBe(1800);
    expect(row.establishment_id).toBe(ids.est);
    // intentar tocar un producto de otro local: RLS lo impide (no se encuentra)
    const other = (await owner.query(
      `INSERT INTO public.products (category_id, establishment_id, name, price) VALUES ((SELECT id FROM public.categories WHERE establishment_id=$1 LIMIT 1), $2, 'Ajeno', 1) RETURNING id`,
      [ids.est, ids.otherEst],
    ).catch(() => ({ rows: [] as any[] }))).rows[0];
    if (other) {
      const r = await captured.runTool!("update_product", { product_id: other.id, updates: { price: 999999 } });
      expect(r).toMatch(/no se encontró|Error/);
    }
  });
});
