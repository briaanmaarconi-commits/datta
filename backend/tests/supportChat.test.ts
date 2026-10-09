import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { env } from "../src/env.js";
import { SECTION_HELP } from "../../src/lib/sectionHelp.js";

// Se reemplaza solo la llamada al modelo; sesión, roles y armado del contexto corren de verdad.
const captured: { system?: string; prompt?: string } = {};
vi.mock("../src/ai.js", async (orig) => {
  const real = await orig<typeof import("../src/ai.js")>();
  return {
    ...real,
    aiEnabled: () => true,
    generateText: async (o: { system: string; prompt: string }) => {
      captured.system = o.system;
      captured.prompt = o.prompt;
      return /impresora/i.test(o.prompt)
        ? "Lo paso al equipo de Datta para que lo revisen.\n[[DERIVAR: La impresora de cocina no imprime]]"
        : "Andá a Caja y facturación → Costos y gastos y tocá Nuevo gasto.";
    },
  };
});

const { buildApp } = await import("../src/server.js");
const { pool } = await import("../src/db/pool.js");
const { splitHandoff } = await import("../src/fn/supportChat.js");
const { HELP_SECTIONS } = await import("../src/lib/helpKnowledge.js");

const owner = new pg.Client({ connectionString: env.DATABASE_URL });
let app: FastifyInstance;
const PASS = "Test-Pass-123";
const mail = (n: string) => `${n}-${crypto.randomUUID().slice(0, 8)}@support-chat-test.local`;
const est = crypto.randomUUID();
const users = {
  admin: { email: mail("admin"), role: "admin", id: "" },
  cashier: { email: mail("cashier"), role: "cashier", id: "" },
  waiter: { email: mail("waiter"), role: "waiter", id: "" },
};
const cookie: Record<string, string> = {};

async function cleanup() {
  await owner.query(`DELETE FROM public.establishments WHERE name LIKE 'Support Chat Test %'`);
  await owner.query(`DELETE FROM auth.users WHERE email LIKE '%@support-chat-test.local'`);
}
const ask = (who: keyof typeof users | null, content: string, page?: string) =>
  app.inject({
    method: "POST",
    url: "/api/fn/support-chat",
    headers: who ? { cookie: cookie[who] } : {},
    payload: { messages: [{ role: "user", content }], page },
  });

beforeAll(async () => {
  await owner.connect();
  await cleanup();
  await owner.query(`INSERT INTO public.establishments (id, name) VALUES ($1,'Support Chat Test A')`, [est]);
  const hash = await bcrypt.hash(PASS, 4);
  for (const k of Object.keys(users) as (keyof typeof users)[]) {
    const r = await owner.query(`INSERT INTO auth.users (email, encrypted_password) VALUES ($1,$2) RETURNING id`, [users[k].email, hash]);
    users[k].id = r.rows[0].id;
    await owner.query(`INSERT INTO public.user_roles (user_id, role, establishment_id) VALUES ($1,$2,$3)`, [users[k].id, users[k].role, est]);
  }
  app = await buildApp();
  for (const k of Object.keys(users) as (keyof typeof users)[]) {
    const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: users[k].email, password: PASS } });
    cookie[k] = String(res.headers["set-cookie"]).split(";")[0];
  }
});

afterAll(async () => {
  await cleanup();
  await owner.end();
  await app?.close();
  await pool.end();
});

describe("asistente de soporte", () => {
  it("pide sesión y no atiende a mozos ni cocina", async () => {
    expect((await ask(null, "hola")).statusCode).toBe(401);
    expect((await ask("waiter", "hola")).statusCode).toBe(403);
  });

  it("responde al administrador con su menú y la sección donde está", async () => {
    const res = await ask("admin", "¿Cómo cargo un gasto?", "/admin/costos-gastos");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ reply: "Andá a Caja y facturación → Costos y gastos y tocá Nuevo gasto.", handoff: null });
    expect(captured.system).toContain("Menú lateral del administrador");
    expect(captured.system).toContain("El usuario está ahora en la sección: Costos y gastos");
    expect(captured.prompt).toContain("¿Cómo cargo un gasto?");
  });

  it("a la caja le explica con el menú de la caja", async () => {
    const res = await ask("cashier", "¿Dónde veo el resumen del turno?", "/cashier/shift");
    expect(res.statusCode).toBe(200);
    expect(captured.system).toContain("Menú lateral de la caja");
    expect(captured.system).not.toContain("Menú lateral del administrador");
  });

  it("cuando no puede resolverlo devuelve la derivación aparte de la respuesta", async () => {
    const res = await ask("admin", "La impresora no imprime nada");
    expect(res.json()).toEqual({ reply: "Lo paso al equipo de Datta para que lo revisen.", handoff: { title: "La impresora de cocina no imprime" } });
  });

  it("rechaza mensajes vacíos o demasiado largos", async () => {
    expect((await ask("admin", "")).statusCode).toBe(400);
    expect((await ask("admin", "x".repeat(4001))).statusCode).toBe(400);
  });
});

describe("splitHandoff", () => {
  it("solo toma la marca si está al final", () => {
    expect(splitHandoff("Probá reiniciar.")).toEqual({ reply: "Probá reiniciar.", handoff: null });
    expect(splitHandoff("Te ayudo.\n[[DERIVAR: No puedo entrar]]  ")).toEqual({ reply: "Te ayudo.", handoff: { title: "No puedo entrar" } });
    expect(splitHandoff("Dice [[DERIVAR: x]] y sigue").handoff).toBeNull();
  });
});

describe("conocimiento del asistente", () => {
  it("está al día con los textos de ayuda del sistema", () => {
    const front = Object.entries(SECTION_HELP)
      .filter(([k]) => !k.startsWith("/waiter"))
      .map(([path, v]) => ({ path, title: v.title, what: v.what, bullets: v.bullets, ...(v.note ? { note: v.note } : {}) }));
    expect(HELP_SECTIONS).toEqual(front);
  });
});
