import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import bcrypt from "bcryptjs";
import { createHmac } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { env } from "../src/env.js";

process.env.MERCADOPAGO_ACCESS_TOKEN = "test-token";
process.env.MERCADOPAGO_WEBHOOK_SECRET = "whsec";

const { addMonths, daysBetween, evaluate, nextDueAfterPayment } = await import("../src/lib/billing.js");
const { buildApp } = await import("../src/server.js");
const { pool } = await import("../src/db/pool.js");
const { runBillingSweep } = await import("../src/jobs/billingSweep.js");
const { addDays, artDateString } = await import("../src/lib/time.js");

describe("reglas de fechas y estados (puras)", () => {
  it("addMonths conserva el día o usa el último del mes", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-10-10", 1)).toBe("2026-11-10");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
  });
  it("evaluate: vence el día siguiente y se suspende exactamente a los 25 días de atraso", () => {
    const f = { service_status: "active", next_due_date: "2026-10-01" };
    expect(evaluate(f, "2026-10-01", 25).status).toBe("active"); // el día del vencimiento todavía está al día
    expect(evaluate(f, "2026-10-02", 25)).toMatchObject({ status: "past_due", overdueDays: 1, daysToSuspension: 24 });
    expect(evaluate(f, "2026-10-25", 25)).toMatchObject({ status: "past_due", overdueDays: 24, daysToSuspension: 1 });
    expect(evaluate(f, "2026-10-26", 25)).toMatchObject({ status: "suspended", overdueDays: 25 });
    expect(evaluate(f, "2027-03-01", 25).status).toBe("suspended");
  });
  it("evaluate: sin vencimiento no se toca; suspendido/cancelado no se reactivan solos; prueba vence igual", () => {
    expect(evaluate({ service_status: "active", next_due_date: null }, "2030-01-01", 25).status).toBe("active");
    expect(evaluate({ service_status: "suspended", next_due_date: "2099-01-01" }, "2026-10-01", 25).status).toBe("suspended");
    expect(evaluate({ service_status: "cancelled", next_due_date: "2026-01-01" }, "2026-10-01", 25).status).toBe("cancelled");
    expect(evaluate({ service_status: "trial", next_due_date: "2026-10-01" }, "2026-10-05", 25).status).toBe("past_due");
  });
  it("nextDueAfterPayment sigue el ciclo y reinicia si el atraso fue enorme", () => {
    expect(nextDueAfterPayment("2026-10-10", "2026-10-05")).toBe("2026-11-10"); // pago adelantado
    expect(nextDueAfterPayment("2026-10-10", "2026-10-20")).toBe("2026-11-10"); // pago tarde dentro del ciclo
    expect(nextDueAfterPayment("2026-06-10", "2026-10-20")).toBe("2026-11-20"); // muy atrasado: desde hoy
    expect(nextDueAfterPayment(null, "2026-10-20")).toBe("2026-11-20");
    expect(daysBetween("2026-10-01", "2026-10-26")).toBe(25);
  });
});

// ---------------------------------------------------------------- integración (Postgres real, Mercado Pago simulado)
const owner = new pg.Client({ connectionString: env.DATABASE_URL });
let app: FastifyInstance;
const PASS = "Test-Pass-123";
const mail = (n: string) => `${n}-${crypto.randomUUID().slice(0, 8)}@bill-test.local`;
const ids = { est: crypto.randomUUID() };
const users = {
  superU: { email: mail("super"), role: "superadmin", est: null as string | null, id: "" },
  admin: { email: mail("admin"), role: "admin", est: ids.est, id: "" },
};
const cookie: Record<string, string> = {};

// --- simulación de la API de Mercado Pago
const mpCalls: { method: string; url: string; body?: any }[] = [];
const mpState = {
  authorizedPayments: {} as Record<string, any>,
  payments: {} as Record<string, any>,
  preapprovals: {} as Record<string, any>,
};
const realFetch = globalThis.fetch;
function installMp() {
  vi.stubGlobal("fetch", async (url: string, init: any = {}) => {
    if (!String(url).startsWith("https://api.mercadopago.com")) return realFetch(url, init);
    const path = String(url).replace("https://api.mercadopago.com", "");
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body) : undefined;
    mpCalls.push({ method, url: path, body });
    const json = (o: any, status = 200) => new Response(JSON.stringify(o), { status });
    if (method === "POST" && path === "/preapproval") {
      const pre = { id: "pre-1", status: "pending", init_point: "https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=pre-1", ...body };
      mpState.preapprovals["pre-1"] = pre;
      return json(pre, 201);
    }
    let m = path.match(/^\/preapproval\/([^/?]+)$/);
    if (m) {
      if (method === "GET") return mpState.preapprovals[m[1]] ? json(mpState.preapprovals[m[1]]) : json({ message: "not found" }, 404);
      if (method === "PUT") {
        Object.assign(mpState.preapprovals[m[1]], body, { auto_recurring: { ...(mpState.preapprovals[m[1]].auto_recurring ?? {}), ...(body.auto_recurring ?? {}) } });
        return json(mpState.preapprovals[m[1]]);
      }
    }
    m = path.match(/^\/authorized_payments\/search/);
    if (m) return json({ results: Object.values(mpState.authorizedPayments) });
    m = path.match(/^\/authorized_payments\/([^/?]+)$/);
    if (m) return mpState.authorizedPayments[m[1]] ? json(mpState.authorizedPayments[m[1]]) : json({ message: "not found" }, 404);
    m = path.match(/^\/v1\/payments\/([^/?]+)$/);
    if (m) return mpState.payments[m[1]] ? json(mpState.payments[m[1]]) : json({ message: "not found" }, 404);
    return json({ message: `ruta no simulada ${method} ${path}` }, 404);
  });
}

const sign = (dataId: string, requestId = "req-1") => {
  const ts = String(Date.now());
  const v1 = createHmac("sha256", "whsec").update(`id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`).digest("hex");
  return { "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": requestId };
};
const hook = (topic: string, id: string, headers: Record<string, string> = sign(id)) =>
  app.inject({ method: "POST", url: `/api/mercadopago/subscriptions/webhook?type=${topic}&data.id=${id}`, headers, payload: { type: topic, data: { id } } });
const call = (who: keyof typeof users | null, url: string, payload: unknown = {}) =>
  app.inject({ method: "POST", url, payload: payload as any, headers: who ? { cookie: cookie[who] } : {} });
const estRow = async () => (await owner.query(`SELECT service_status, next_due_date::text AS due, trial_ends_at::text AS trial, mp_status, mp_preapproval_id, suspended_at FROM public.establishments WHERE id = $1`, [ids.est])).rows[0];

async function cleanup() {
  const ests = (await owner.query(`SELECT id FROM public.establishments WHERE name LIKE 'Bill Test %'`)).rows.map((r) => r.id);
  if (ests.length) {
    await owner.query(`DELETE FROM public.datta_transactions WHERE establishment_id = ANY($1)`, [ests]);
    await owner.query(`DELETE FROM public.products WHERE establishment_id = ANY($1)`, [ests]);
    await owner.query(`DELETE FROM public.establishments WHERE id = ANY($1)`, [ests]);
  }
  await owner.query(`DELETE FROM auth.users WHERE email LIKE '%@bill-test.local'`);
}

beforeAll(async () => {
  await owner.connect();
  await cleanup();
  await owner.query(`INSERT INTO public.establishments (id, name, agreed_price) VALUES ($1, 'Bill Test A', 50000)`, [ids.est]);
  const hash = await bcrypt.hash(PASS, 4);
  for (const k of Object.keys(users) as (keyof typeof users)[]) {
    const r = await owner.query(`INSERT INTO auth.users (email, encrypted_password) VALUES ($1,$2) RETURNING id`, [users[k].email, hash]);
    users[k].id = r.rows[0].id;
    await owner.query(`INSERT INTO public.user_roles (user_id, role, establishment_id) VALUES ($1,$2,$3)`, [users[k].id, users[k].role, users[k].est]);
  }
  app = await buildApp();
  installMp();
  for (const k of Object.keys(users) as (keyof typeof users)[]) {
    const l = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: users[k].email, password: PASS } });
    cookie[k] = String(l.headers["set-cookie"]).split(";")[0];
  }
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await app?.close();
  await cleanup();
  await owner.end();
  await pool.end();
});

describe("permisos del panel de cobranzas", () => {
  it("solo el superadmin puede usar las rutas de billing", async () => {
    for (const url of ["overview", "trial", "register-payment", "set-status", "create-subscription", "update-price", "settings", "sweep"]) {
      expect((await call("admin", `/api/fn/billing/${url}`, {})).statusCode, url).toBe(403);
      expect((await call(null, `/api/fn/billing/${url}`, {})).statusCode, url).toBe(401);
    }
  });
});

describe("prueba gratis, vencimiento y suspensión automática", () => {
  it("prueba gratis de 10 días deja al cliente en trial con vencimiento al terminar", async () => {
    const r = await call("superU", "/api/fn/billing/trial", { establishment_id: ids.est, days: 10 });
    expect(r.statusCode).toBe(200);
    const e = await estRow();
    expect(e.service_status).toBe("trial");
    expect(e.due).toBe(addDays(artDateString(), 10));
    expect(e.trial).toBe(e.due);
  });

  it("el barrido pasa a past_due al día siguiente y suspende a los 25 días de atraso", async () => {
    const due = (await estRow()).due as string;
    expect((await runBillingSweep(due)).toPastDue).not.toContain(ids.est); // el día del vencimiento sigue en prueba
    expect((await estRow()).service_status).toBe("trial");

    const r1 = await runBillingSweep(addDays(due, 1));
    expect(r1.toPastDue).toContain(ids.est);
    expect((await estRow()).service_status).toBe("past_due");

    const r24 = await runBillingSweep(addDays(due, 24));
    expect(r24.suspended).not.toContain(ids.est);
    expect((await estRow()).service_status).toBe("past_due");

    const r25 = await runBillingSweep(addDays(due, 25));
    expect(r25.suspended).toContain(ids.est);
    const e = await estRow();
    expect(e.service_status).toBe("suspended");
    expect(e.suspended_at).not.toBeNull();
    // idempotente: correrlo de nuevo no repite
    expect((await runBillingSweep(addDays(due, 26))).suspended).not.toContain(ids.est);
  });

  it("un local suspendido no puede entrar, sus sesiones dejan de valer y la carta/QR/webhook se bloquean", async () => {
    const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: users.admin.email, password: PASS } });
    expect(login.statusCode).toBe(403);
    expect(login.json().error.code).toBe("SERVICE_SUSPENDED");

    const old = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie: cookie.admin } });
    expect(old.json().user).toBeNull();
    expect(old.json().blocked.reason).toBe("suspended");
    expect((await app.inject({ method: "POST", url: "/api/db/query", headers: { cookie: cookie.admin }, payload: { table: "products", op: "select" } })).statusCode).toBe(401);

    const t = await owner.query(`INSERT INTO public.tables (establishment_id, number) VALUES ($1, 77) RETURNING id`, [ids.est]);
    const order = await app.inject({ method: "POST", url: "/api/public/orders", payload: { tableId: t.rows[0].id, items: [{ productId: crypto.randomUUID(), quantity: 1 }] } });
    expect(order.statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/api/public/waiter-calls", payload: { tableId: t.rows[0].id } })).statusCode).toBe(403);
    const carta = await app.inject({ method: "POST", url: "/api/public/query", payload: { table: "tables", op: "select", select: "id", filters: [{ col: "establishment_id", op: "eq", value: ids.est }] } });
    expect(carta.json().data).toEqual([]); // la carta del local suspendido no se publica
  });

  it("el superadmin nunca se bloquea", async () => {
    const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie: cookie.superU } });
    expect(me.json().user.role).toBe("superadmin");
  });
});

describe("pagos manuales", () => {
  it("un pago manual reactiva al cliente, mueve el vencimiento y queda en Caja Datta", async () => {
    const before = await estRow();
    const r = await call("superU", "/api/fn/billing/register-payment", { establishment_id: ids.est, amount: 50000, payment_method: "transfer" });
    expect(r.statusCode).toBe(200);
    const e = await estRow();
    expect(e.service_status).toBe("active");
    expect(e.suspended_at).toBeNull();
    expect(e.due! > before.due!).toBe(true);
    const tx = await owner.query(`SELECT amount::float AS a, type FROM public.datta_transactions WHERE establishment_id = $1`, [ids.est]);
    expect(tx.rows).toEqual([{ a: 50000, type: "income" }]);
    // ya puede volver a entrar
    const l = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: users.admin.email, password: PASS } });
    expect(l.statusCode).toBe(200);
    cookie.admin = String(l.headers["set-cookie"]).split(";")[0];
    const t = await owner.query(`SELECT id FROM public.tables WHERE establishment_id = $1`, [ids.est]);
    const carta = await app.inject({ method: "POST", url: "/api/public/query", payload: { table: "tables", op: "select", select: "id", filters: [{ col: "id", op: "eq", value: t.rows[0].id }] } });
    expect(carta.json().data).toHaveLength(1);
  });

  it("el mismo período manual dos veces da 409", async () => {
    const r = await call("superU", "/api/fn/billing/register-payment", { establishment_id: ids.est, amount: 50000 });
    expect(r.statusCode).toBe(409);
  });

  it("suspender y reactivar a mano; reactivar da un vencimiento nuevo", async () => {
    expect((await call("superU", "/api/fn/billing/set-status", { establishment_id: ids.est, status: "suspended", reason: "prueba" })).statusCode).toBe(200);
    expect((await estRow()).service_status).toBe("suspended");
    const r = await call("superU", "/api/fn/billing/set-status", { establishment_id: ids.est, status: "active", extend_days: 15 });
    expect(r.json().next_due_date).toBe(addDays(artDateString(), 15));
    expect((await estRow()).service_status).toBe("active");
  });
});

describe("Mercado Pago", () => {
  it("genera el link de suscripción con monto, email y referencia del local", async () => {
    const r = await call("superU", "/api/fn/billing/create-subscription", { establishment_id: ids.est, payer_email: "duenio@correo.com" });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().init_point).toContain("mercadopago");
    const sent = mpCalls.find((c) => c.method === "POST" && c.url === "/preapproval")!.body;
    expect(sent.external_reference).toBe(ids.est);
    expect(sent.payer_email).toBe("duenio@correo.com");
    expect(sent.auto_recurring).toMatchObject({ frequency: 1, frequency_type: "months", transaction_amount: 50000, currency_id: "ARS" });
    expect((await estRow()).mp_preapproval_id).toBe("pre-1");
    // no se puede generar otra mientras haya una vigente
    expect((await call("superU", "/api/fn/billing/create-subscription", { establishment_id: ids.est, payer_email: "duenio@correo.com" })).statusCode).toBe(409);
  });

  it("sin precio definido no genera el link", async () => {
    const other = await owner.query(`INSERT INTO public.establishments (name, agreed_price) VALUES ('Bill Test B', 0) RETURNING id`);
    await owner.query(`UPDATE public.app_settings SET value = '0' WHERE key = 'plan_price'`);
    const r = await call("superU", "/api/fn/billing/create-subscription", { establishment_id: other.rows[0].id, payer_email: "x@y.com" });
    expect(r.statusCode).toBe(400);
  });

  it("webhook: un cobro aprobado se registra una sola vez, activa al cliente y toma el próximo cobro de MP", async () => {
    await owner.query(`UPDATE public.establishments SET service_status = 'past_due', next_due_date = current_date - 3 WHERE id = $1`, [ids.est]);
    const next = addDays(artDateString(), 30);
    mpState.preapprovals["pre-1"] = { ...mpState.preapprovals["pre-1"], status: "authorized", next_payment_date: `${next}T12:00:00.000-03:00` };
    mpState.authorizedPayments["ap-1"] = { id: "ap-1", preapproval_id: "pre-1", status: "processed", payment: { id: 9001, status: "approved" } };
    mpState.payments["9001"] = { id: 9001, status: "approved", transaction_amount: 50000, date_approved: new Date().toISOString() };

    expect((await hook("subscription_authorized_payment", "ap-1")).statusCode).toBe(200);
    expect((await hook("subscription_authorized_payment", "ap-1")).statusCode).toBe(200); // reintento de MP
    const pays = await owner.query(`SELECT source, mp_payment_id, amount::float AS a FROM public.client_payments WHERE establishment_id = $1 AND source = 'mercadopago'`, [ids.est]);
    expect(pays.rows).toEqual([{ source: "mercadopago", mp_payment_id: "9001", a: 50000 }]);
    const e = await estRow();
    expect(e.service_status).toBe("active");
    expect(e.due).toBe(next);
    const tx = await owner.query(`SELECT count(*)::int AS n FROM public.datta_transactions WHERE establishment_id = $1 AND description LIKE '%Mercado Pago%'`, [ids.est]);
    expect(tx.rows[0].n).toBe(1);
  });

  it("un pago que MP no confirma como aprobado se ignora aunque el webhook diga lo contrario", async () => {
    mpState.authorizedPayments["ap-2"] = { id: "ap-2", preapproval_id: "pre-1", status: "processed", payment: { id: 9002, status: "approved" } };
    mpState.payments["9002"] = { id: 9002, status: "rejected", transaction_amount: 50000 };
    expect((await hook("subscription_authorized_payment", "ap-2")).statusCode).toBe(200);
    const n = await owner.query(`SELECT count(*)::int AS n FROM public.client_payments WHERE mp_payment_id = '9002'`);
    expect(n.rows[0].n).toBe(0);
  });

  it("rechaza webhooks con firma inválida o ausente", async () => {
    expect((await hook("subscription_authorized_payment", "ap-1", { "x-signature": "ts=1,v1=deadbeef", "x-request-id": "r" })).statusCode).toBe(401);
    expect((await hook("subscription_authorized_payment", "ap-1", {})).statusCode).toBe(401);
  });

  it("webhook de la suscripción sincroniza el estado de MP", async () => {
    mpState.preapprovals["pre-1"].status = "paused";
    expect((await hook("subscription_preapproval", "pre-1")).statusCode).toBe(200);
    expect((await estRow()).mp_status).toBe("paused");
    mpState.preapprovals["pre-1"].status = "authorized";
    await hook("subscription_preapproval", "pre-1");
    expect((await estRow()).mp_status).toBe("authorized");
  });

  it("el barrido recupera un cobro cuyo webhook se perdió", async () => {
    mpState.authorizedPayments["ap-3"] = { id: "ap-3", preapproval_id: "pre-1", status: "processed", payment: { id: 9003, status: "approved" } };
    mpState.payments["9003"] = { id: 9003, status: "approved", transaction_amount: 50000, date_approved: new Date().toISOString() };
    const r = await runBillingSweep();
    expect(r.recoveredFromMp).toBeGreaterThanOrEqual(1);
    const n = await owner.query(`SELECT count(*)::int AS n FROM public.client_payments WHERE mp_payment_id = '9003'`);
    expect(n.rows[0].n).toBe(1);
  });

  it("cambiar el precio actualiza el plan, el cliente y la suscripción en Mercado Pago", async () => {
    mpCalls.length = 0;
    const r = await call("superU", "/api/fn/billing/update-price", { amount: 65000, establishment_id: ids.est });
    expect(r.json().mp).toEqual([{ establishmentId: ids.est, ok: true }]);
    const put = mpCalls.find((c) => c.method === "PUT" && c.url === "/preapproval/pre-1")!;
    expect(put.body.auto_recurring.transaction_amount).toBe(65000);
    expect(Number((await owner.query(`SELECT agreed_price FROM public.establishments WHERE id = $1`, [ids.est])).rows[0].agreed_price)).toBe(65000);
    expect(Number((await owner.query(`SELECT value FROM public.app_settings WHERE key = 'plan_price'`)).rows[0].value)).toBe(65000);
  });

  it("cancelar la suscripción la cancela en MP", async () => {
    const r = await call("superU", "/api/fn/billing/cancel-subscription", { establishment_id: ids.est });
    expect(r.statusCode).toBe(200);
    expect((await estRow()).mp_status).toBe("cancelled");
    expect(mpState.preapprovals["pre-1"].status).toBe("cancelled");
  });
});

describe("resumen de cobranzas", () => {
  it("devuelve estado calculado, totales y días de gracia", async () => {
    const r = await call("superU", "/api/fn/billing/overview");
    const j = r.json();
    expect(j.grace_days).toBe(25);
    const mine = j.clients.find((c: any) => c.id === ids.est);
    expect(mine.effective_status).toBe("active");
    expect(mine.billing_configured).toBe(true);
    expect(j.totals.collected_this_month).toBeGreaterThan(0);
    expect(j.totals.counts.active).toBeGreaterThanOrEqual(1);
  });
  it("los días de gracia se pueden cambiar", async () => {
    expect((await call("superU", "/api/fn/billing/settings", { grace_days: 30 })).statusCode).toBe(200);
    expect((await call("superU", "/api/fn/billing/overview")).json().grace_days).toBe(30);
    await call("superU", "/api/fn/billing/settings", { grace_days: 25 });
  });
});
