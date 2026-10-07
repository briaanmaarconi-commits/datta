import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { SERVICE, withDb } from "../db/pool.js";
import { env } from "../env.js";
import { artDateString } from "../lib/time.js";
import { fail } from "./common.js";
import { requireSuper } from "./billing.js";
import { clientUserIds, purgeEstablishment } from "./clients.js";

/**
 * Restaurante de demostración: un local completo (carta chica, mesas, plano, historial de ventas, caja abierta y pedidos en curso)
 * con tres usuarios (administrador, cocina y caja) para mostrar cómo funciona Datta sin tocar datos reales.
 * Solo el superadmin lo crea; "restablecer" lo borra y lo arma de nuevo (con claves nuevas).
 */
export const DEMO_NAME = "DEMO Datta";
const DEMO_USERS = [
  { key: "admin", label: "Administrador", email: "demo-admin@dattagestion.com", role: "admin", fullName: "Demo Administrador" },
  { key: "kitchen", label: "Cocina", email: "demo-cocina@dattagestion.com", role: "kitchen", fullName: "Demo Cocina" },
  { key: "cashier", label: "Caja", email: "demo-caja@dattagestion.com", role: "cashier", fullName: "Demo Caja" },
] as const;

const MENU: { category: string; items: { name: string; description: string; price: number; cost: number; stock?: number; min?: number; special?: boolean }[] }[] = [
  {
    category: "Entradas",
    items: [
      { name: "Provoleta a la parrilla", description: "Con tomate cherry, orégano y pan de campo", price: 7800, cost: 3200 },
      { name: "Empanadas de carne (x3)", description: "Cortadas a cuchillo, al horno", price: 6900, cost: 2600 },
      { name: "Tabla de fiambres", description: "Jamón crudo, salame, queso y aceitunas", price: 12500, cost: 5800 },
    ],
  },
  {
    category: "Platos principales",
    items: [
      { name: "Milanesa napolitana con papas", description: "Con jamón, queso y salsa de tomate", price: 14500, cost: 6200, special: true },
      { name: "Bife de chorizo con ensalada", description: "300 g, a punto, con ensalada mixta", price: 19800, cost: 9600 },
      { name: "Ravioles de ricota", description: "Con salsa fileto o crema", price: 13200, cost: 4900 },
      { name: "Hamburguesa completa", description: "Doble carne, cheddar, panceta y papas", price: 12900, cost: 5200 },
    ],
  },
  {
    category: "Postres",
    items: [
      { name: "Flan casero", description: "Con dulce de leche y crema", price: 5600, cost: 1800 },
      { name: "Brownie con helado", description: "Chocolate tibio y helado de crema", price: 6900, cost: 2400 },
    ],
  },
  {
    category: "Bebidas",
    items: [
      { name: "Gaseosa 500 cc", description: "Línea cola, naranja o lima", price: 3200, cost: 1300, stock: 48, min: 12 },
      { name: "Agua mineral 500 cc", description: "Con o sin gas", price: 2600, cost: 900, stock: 60, min: 12 },
      { name: "Cerveza artesanal", description: "Rubia o roja, 500 cc", price: 4800, cost: 2100, stock: 36, min: 10 },
      { name: "Copa de vino malbec", description: "Mendoza, copa de 200 ml", price: 5200, cost: 2300, stock: 24, min: 6 },
    ],
  },
];

const SECTORS = ["Salón", "Terraza"];
// [número, capacidad, sector (índice en SECTORS)]
const TABLES: [number, number, number][] = [
  [1, 4, 0], [2, 4, 0], [3, 4, 0], [4, 2, 0], [5, 2, 0], [6, 6, 0],
  [7, 4, 1], [8, 4, 1], [9, 2, 1], [10, 2, 1],
];

/** Clave legible (sin caracteres ambiguos), que se muestra una sola vez. */
function readablePassword() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const pick = (n: number) => Array.from(randomBytes(n), (b) => alphabet[b % alphabet.length]).join("");
  return `${pick(5)}-${pick(5)}`;
}

/** Generador pseudoaleatorio con semilla: la demo siempre se ve parecida pero no depende de random() de la base. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Plano de un sector: mesas ubicadas en grilla más algunos elementos decorativos. */
function floorLayout(tables: { id: string; number: number; capacity: number }[], terrace: boolean) {
  const els: Record<string, unknown>[] = [];
  const cols = 3;
  tables.forEach((t, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    els.push({
      id: randomUUID(), type: "table", label: String(t.number), tableId: t.id, shape: t.capacity <= 2 ? "round" : "rect",
      x: 150 + col * 190, y: 120 + row * 150, width: t.capacity <= 2 ? 50 : 70, height: t.capacity <= 2 ? 50 : 45, rotation: 0, chairs: t.capacity,
    });
  });
  if (terrace) {
    els.push({ id: randomUUID(), type: "planter", label: "Maceta/Planta", x: 100, y: 60, width: 520, height: 24, rotation: 0 });
    els.push({ id: randomUUID(), type: "door-entry", label: "Ingreso", x: 340, y: 560, width: 80, height: 14, rotation: 0 });
  } else {
    els.push({ id: randomUUID(), type: "bar", label: "Barra", x: 100, y: 500, width: 520, height: 40, rotation: 0 });
    els.push({ id: randomUUID(), type: "cashier", label: "Caja", x: 650, y: 60, width: 90, height: 40, rotation: 0 });
    els.push({ id: randomUUID(), type: "kitchen", label: "Cocina", x: 650, y: 140, width: 90, height: 120, rotation: 0 });
    els.push({ id: randomUUID(), type: "door-entry", label: "Ingreso", x: 340, y: 570, width: 80, height: 14, rotation: 0 });
  }
  return { width: 800, height: 600, elements: els };
}

interface DemoUserOut { role: string; label: string; email: string; password: string }
export interface DemoResult {
  establishment_id: string;
  name: string;
  url: string;
  users: DemoUserOut[];
  summary: { products: number; tables: number; closed_orders: number; open_orders: number };
}

/** Arma (o rearma) el restaurante demo dentro de una transacción ya abierta con el rol de servicio. */
export async function buildDemo(c: import("pg").PoolClient, opts: { reset: boolean }): Promise<DemoResult | { exists: true; id: string }> {
  const existing = (await c.query(`SELECT id FROM public.establishments WHERE name = $1`, [DEMO_NAME])).rows[0] as { id: string } | undefined;
  const orphanIds = (await c.query(`SELECT id FROM auth.users WHERE lower(email) = ANY($1)`, [DEMO_USERS.map((u) => u.email)])).rows.map((r) => r.id as string);
  if (existing && !opts.reset) return { exists: true, id: existing.id };
  if (existing) {
    const ids = new Set([...(await clientUserIds(c, existing.id)), ...orphanIds]);
    await purgeEstablishment(c, existing.id, [...ids]);
  } else if (orphanIds.length) {
    await c.query(`DELETE FROM auth.users WHERE id = ANY($1)`, [orphanIds]);
  }

  // --- local
  const est = (
    await c.query(
      `INSERT INTO public.establishments (name, address, city, contact_email, contact_phone, service_status, agreed_price, service_start_date, is_active, inventory_mode, stock_simple_mode, onboarded_at)
       VALUES ($1, 'Av. Siempre Viva 742', 'Ciudad Demo', 'demo@dattagestion.com', '+54 11 5555-0100', 'active', 0, $2, true, 'simple', true, now()) RETURNING id`,
      [DEMO_NAME, artDateString()],
    )
  ).rows[0].id as string;

  // --- usuarios
  const users: DemoUserOut[] = [];
  const userIds: Record<string, string> = {};
  for (const u of DEMO_USERS) {
    const password = readablePassword();
    const hash = await bcrypt.hash(password, 10);
    const row = await c.query(`INSERT INTO auth.users (email, encrypted_password, raw_user_meta_data) VALUES ($1, $2, $3::jsonb) RETURNING id`, [u.email, hash, JSON.stringify({ full_name: u.fullName })]);
    userIds[u.key] = row.rows[0].id;
    await c.query(`INSERT INTO public.user_roles (user_id, role, establishment_id) VALUES ($1, $2, $3)`, [row.rows[0].id, u.role, est]);
    users.push({ role: u.role, label: u.label, email: u.email, password });
  }

  // --- finanzas: categorías por defecto y la de ventas
  await c.query(`SELECT public.seed_default_finance_categories($1)`, [est]);
  let salesCat = (await c.query(`SELECT id FROM public.finance_categories WHERE establishment_id = $1 AND name = 'Ventas' AND type = 'income' LIMIT 1`, [est])).rows[0]?.id as string | undefined;
  if (!salesCat) salesCat = (await c.query(`INSERT INTO public.finance_categories (establishment_id, name, type) VALUES ($1,'Ventas','income') RETURNING id`, [est])).rows[0].id as string;

  // --- gastos fijos mensuales (confirmados el mes pasado y este mes) y compras de mercadería
  const catId = async (name: string) => (await c.query(`SELECT id FROM public.finance_categories WHERE establishment_id = $1 AND name = $2 AND type = 'expense' LIMIT 1`, [est, name])).rows[0]?.id as string | undefined;
  const todayStr = artDateString();
  const [ty, tm, td] = todayStr.split("-").map(Number);
  const prev = tm === 1 ? { y: ty - 1, m: 12 } : { y: ty, m: tm - 1 };
  const ym = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;
  const FIXED: [string, number, number][] = [
    ["Alquiler", 850000, 5], ["Sueldos", 2400000, 10], ["Cargas sociales", 700000, 12],
    ["Luz", 180000, 15], ["Gas", 90000, 15], ["Internet y teléfono", 40000, 8],
  ];
  for (const [name, amount, day] of FIXED) {
    const cid = await catId(name);
    if (!cid) continue;
    const rec = (
      await c.query(
        `INSERT INTO public.recurring_expenses (establishment_id, category_id, name, amount, day_of_month, starts_on, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [est, cid, name, amount, day, `${prev.y}-${String(prev.m).padStart(2, "0")}-01`, userIds.admin],
      )
    ).rows[0].id as string;
    for (const [y, m] of [[prev.y, prev.m], [ty, tm]] as [number, number][]) {
      if (y === ty && m === tm && day > td) continue; // todavía no venció este mes
      const date = `${ym(y, m)}-${String(day).padStart(2, "0")}`;
      await c.query(
        `INSERT INTO public.finance_transactions (establishment_id, category_id, type, amount, description, date, created_by, created_at, recurring_expense_id, period)
         VALUES ($1,$2,'expense',$3,$4,$5,$6,$7,$8,$9)`,
        [est, cid, amount, name, date, userIds.admin, `${date}T12:00:00-03:00`, rec, ym(y, m)],
      );
    }
  }
  // compras de mercadería y bebidas de las últimas dos semanas
  const goods: [string, number, number][] = [["Costo de mercadería", 410000, 12], ["Costo de mercadería", 385000, 9], ["Costo de mercadería", 440000, 6], ["Bebidas", 260000, 10], ["Costo de mercadería", 395000, 3], ["Bebidas", 240000, 4]];
  for (const [name, amount, daysBack] of goods) {
    const cid = await catId(name);
    if (!cid) continue;
    const when = new Date(Date.now() - daysBack * 86_400_000 - 3 * 3_600_000).toISOString().slice(0, 10);
    await c.query(
      `INSERT INTO public.finance_transactions (establishment_id, category_id, type, amount, description, date, created_by, created_at) VALUES ($1,$2,'expense',$3,$4,$5,$6,$7)`,
      [est, cid, amount, `Compra: ${name === "Bebidas" ? "Distribuidora de bebidas" : "Proveedor de mercadería"}`, when, userIds.admin, `${when}T11:00:00-03:00`],
    );
  }

  // --- sectores, mesas y planos
  const sectorIds = (await c.query(`INSERT INTO public.sectors (establishment_id, name, sort_order) SELECT $1, n, o FROM unnest($2::text[], $3::int[]) AS s(n, o) RETURNING id, name`, [est, SECTORS, SECTORS.map((_, i) => i + 1)])).rows as { id: string; name: string }[];
  const sectorId = (name: string) => sectorIds.find((s) => s.name === name)!.id;
  const tableRows = (
    await c.query(
      `INSERT INTO public.tables (establishment_id, number, capacity, sector_id) SELECT $1, n, cap, sec FROM unnest($2::int[], $3::int[], $4::uuid[]) AS t(n, cap, sec) RETURNING id, number, capacity, sector_id`,
      [est, TABLES.map((t) => t[0]), TABLES.map((t) => t[1]), TABLES.map((t) => sectorId(SECTORS[t[2]]))],
    )
  ).rows as { id: string; number: number; capacity: number; sector_id: string }[];
  for (const [i, name] of SECTORS.entries()) {
    const mine = tableRows.filter((t) => t.sector_id === sectorId(name)).sort((a, b) => a.number - b.number);
    await c.query(`INSERT INTO public.floor_plans (establishment_id, sector_id, layout_data) VALUES ($1,$2,$3::jsonb)`, [est, sectorId(name), JSON.stringify(floorLayout(mine, i === 1))]);
  }

  // --- carta
  const cats = (
    await c.query(`INSERT INTO public.categories (establishment_id, name, sort_order) SELECT $1, n, o FROM unnest($2::text[], $3::int[]) AS s(n, o) RETURNING id, name`, [est, MENU.map((m) => m.category), MENU.map((_, i) => i + 1)])
  ).rows as { id: string; name: string }[];
  const productInput = MENU.flatMap((m) =>
    m.items.map((it) => ({
      category_id: cats.find((c2) => c2.name === m.category)!.id, name: it.name, description: it.description, price: it.price, cost: it.cost,
      stock_mode: it.stock != null ? "direct" : "none", direct_stock: it.stock ?? 0, direct_min_stock: it.min ?? 0, special: !!it.special,
    })),
  );
  const products = (
    await c.query(
      `INSERT INTO public.products (establishment_id, category_id, name, description, price, cost, is_available, stock_mode, direct_stock, direct_min_stock, is_daily_special, cost_mode)
       SELECT $1, x.category_id, x.name, x.description, x.price, x.cost, true, x.stock_mode, x.direct_stock, x.direct_min_stock, x.special, 'manual'
         FROM jsonb_to_recordset($2::jsonb) AS x(category_id uuid, name text, description text, price numeric, cost numeric, stock_mode text, direct_stock numeric, direct_min_stock numeric, special boolean)
       RETURNING id, name, price`,
      [est, JSON.stringify(productInput)],
    )
  ).rows as { id: string; name: string; price: string }[];
  const prod = products.map((p) => ({ id: p.id, name: p.name, price: Number(p.price) }));

  // --- historial: 14 días de pedidos cerrados (más movimiento los viernes, sábados y domingos) + lo de hoy
  const rand = rng(20261007);
  const nowMs = Date.now();
  const today = artDateString();
  const ART = "-03:00";
  const payMethods = ["cash", "card", "transfer"] as const;
  const payLabel = { cash: "Efectivo", card: "Tarjeta", transfer: "Transferencia" } as const;
  const orders: any[] = [];
  const items: any[] = [];
  const tx: any[] = [];
  const invoices: any[] = [];

  const makeOrder = (createdAt: Date, status: "closed" | "new" | "preparing" | "ready") => {
    const table = tableRows[Math.floor(rand() * tableRows.length)];
    const lines: { p: (typeof prod)[number]; qty: number }[] = [];
    const n = 1 + Math.floor(rand() * 4);
    const used = new Set<number>();
    while (lines.length < n) {
      const i = Math.floor(rand() * prod.length);
      if (used.has(i)) continue;
      used.add(i);
      lines.push({ p: prod[i], qty: 1 + Math.floor(rand() * 2) });
    }
    const total = lines.reduce((s, l) => s + l.p.price * l.qty, 0);
    const id = randomUUID();
    const pm = payMethods[Math.floor(rand() * 3)];
    const prepared = new Date(createdAt.getTime() + (8 + Math.floor(rand() * 10)) * 60_000);
    const delivered = new Date(prepared.getTime() + (5 + Math.floor(rand() * 10)) * 60_000);
    const closed = status === "closed";
    orders.push({
      id, table_id: table.id, status, total, created_at: createdAt.toISOString(),
      prepared_at: closed || status === "ready" ? prepared.toISOString() : null, delivered_at: closed ? delivered.toISOString() : null,
      payment_method: closed ? pm : null, amount_paid: closed ? total : null,
    });
    for (const l of lines) items.push({ order_id: id, product_id: l.p.id, quantity: l.qty, unit_price: l.p.price, created_at: createdAt.toISOString() });
    if (closed) {
      const when = delivered.toISOString();
      const ymd = new Date(delivered.getTime() - 3 * 3_600_000).toISOString().slice(0, 10); // fecha en hora argentina
      tx.push({ category_id: salesCat, amount: total, description: `Mesa ${table.number} - ${payLabel[pm]}`, date: ymd, created_at: when });
      invoices.push({
        table_number: table.number, order_ids: [id], items: lines.map((l) => ({ name: l.p.name, quantity: l.qty, price: l.p.price })),
        payment_method: pm, total, amount_paid: total, created_at: when,
      });
    }
    return { id, table };
  };

  for (let back = 14; back >= 1; back--) {
    const day = new Date(`${today}T12:00:00${ART}`);
    day.setUTCDate(day.getUTCDate() - back);
    const dow = new Date(day.getTime() - 3 * 3_600_000).getUTCDay(); // 0 domingo
    const count = (dow === 5 || dow === 6 || dow === 0 ? 16 : 8) + Math.floor(rand() * 5);
    for (let k = 0; k < count; k++) {
      const hour = 12 + Math.floor(rand() * 11); // 12 a 22 h
      const minute = Math.floor(rand() * 60);
      const d = new Date(day);
      d.setUTCHours(hour + 3, minute, 0, 0); // hora argentina -> UTC
      makeOrder(d, "closed");
    }
  }
  // lo de hoy: ventas ya cobradas en las últimas horas (si todavía es temprano, no hay)
  for (let k = 0; k < 6; k++) {
    const d = new Date(nowMs - (40 + Math.floor(rand() * 260)) * 60_000);
    if (new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 10) === today) makeOrder(d, "closed");
  }
  const closedCount = orders.length;

  // pedidos en curso para que cocina y mozo tengan algo que ver apenas entran
  const live: { id: string; table: { id: string } }[] = [];
  const liveSpec: ("new" | "preparing" | "ready")[] = ["new", "preparing", "new", "ready"];
  const free = tableRows.slice().sort(() => rand() - 0.5);
  liveSpec.forEach((st, i) => {
    const o = makeOrder(new Date(nowMs - (3 + i * 4) * 60_000), st);
    // la mesa del pedido en curso debe ser distinta para cada uno
    const t = free[i];
    const last = orders[orders.length - 1];
    last.table_id = t.id;
    live.push({ id: o.id, table: t });
  });

  await c.query(
    `INSERT INTO public.orders (id, establishment_id, table_id, status, created_by, total, created_at, prepared_at, delivered_at, payment_method, amount_paid, channel)
     SELECT x.id, $1, x.table_id, x.status::order_status, $3, x.total, x.created_at, x.prepared_at, x.delivered_at, x.payment_method, x.amount_paid, 'dine_in'
       FROM jsonb_to_recordset($2::jsonb) AS x(id uuid, table_id uuid, status text, total numeric, created_at timestamptz, prepared_at timestamptz, delivered_at timestamptz, payment_method text, amount_paid numeric)`,
    [est, JSON.stringify(orders), userIds.cashier],
  );
  await c.query(
    `INSERT INTO public.order_items (order_id, product_id, quantity, unit_price, created_at)
     SELECT x.order_id, x.product_id, x.quantity, x.unit_price, x.created_at FROM jsonb_to_recordset($1::jsonb) AS x(order_id uuid, product_id uuid, quantity int, unit_price numeric, created_at timestamptz)`,
    [JSON.stringify(items)],
  );
  await c.query(
    `INSERT INTO public.finance_transactions (establishment_id, category_id, type, amount, description, date, created_by, created_at)
     SELECT $1, x.category_id, 'income', x.amount, x.description, x.date, $3, x.created_at FROM jsonb_to_recordset($2::jsonb) AS x(category_id uuid, amount numeric, description text, date date, created_at timestamptz)`,
    [est, JSON.stringify(tx), userIds.cashier],
  );
  await c.query(
    `INSERT INTO public.invoices (establishment_id, table_number, order_ids, items, payment_method, total, amount_paid, created_by, created_at)
     SELECT $1, x.table_number, x.order_ids, x.items, x.payment_method, x.total, x.amount_paid, $3, x.created_at
       FROM jsonb_to_recordset($2::jsonb) AS x(table_number int, order_ids uuid[], items jsonb, payment_method text, total numeric, amount_paid numeric, created_at timestamptz)`,
    [est, JSON.stringify(invoices), userIds.cashier],
  );
  await c.query(`UPDATE public.tables SET status = 'occupied' WHERE id = ANY($1)`, [live.map((l) => l.table.id)]);

  // --- caja abierta (para poder cobrar enseguida) y reservas de ejemplo
  await c.query(`INSERT INTO public.shift_controls (establishment_id, shift_date, is_controlled, opened_at, initial_cash) VALUES ($1, $2, false, now() - interval '3 hours', 20000)`, [est, today]);
  const reservable = tableRows.filter((t) => !live.some((l) => l.table.id === t.id));
  const reservations = [
    { name: "Familia García (ejemplo)", party: 4, at: `${today}T21:00:00${ART}` },
    { name: "Cumpleaños Pérez (ejemplo)", party: 6, at: `${today}T21:30:00${ART}` },
    { name: "Mesa Rodríguez (ejemplo)", party: 2, at: `${today}T22:00:00${ART}` },
  ];
  for (const [i, r] of reservations.entries()) {
    await c.query(`INSERT INTO public.reservations (establishment_id, table_id, customer_name, party_size, reservation_at, notes, created_by) VALUES ($1,$2,$3,$4,$5,'Reserva de ejemplo para la demostración',$6)`, [est, reservable[i % reservable.length].id, r.name, r.party, r.at, userIds.admin]);
  }

  return {
    establishment_id: est,
    name: DEMO_NAME,
    url: env.PUBLIC_ORIGIN ?? "",
    users,
    summary: { products: prod.length, tables: tableRows.length, closed_orders: closedCount, open_orders: live.length },
  };
}

export async function registerDemo(app: FastifyInstance) {
  // Crea el restaurante demo (o, con reset, lo vuelve a armar desde cero). Las claves se devuelven una sola vez.
  app.post("/api/fn/clients/create-demo", async (req, reply) => {
    const admin = await requireSuper(req, reply);
    if (!admin) return;
    const b = z.object({ reset: z.boolean().optional() }).safeParse(req.body ?? {});
    if (!b.success) return fail(reply, 400, "Datos inválidos");
    const out = await withDb(SERVICE, (c) => buildDemo(c, { reset: !!b.data.reset }));
    if ("exists" in out) return reply.code(409).send({ error: { message: "Ya existe el restaurante demo. Usá «Restablecer» para volver a armarlo (genera claves nuevas).", code: "DEMO_EXISTS" }, exists: true, establishment_id: out.id });
    app.log.warn({ by: admin.id, establishment: out.establishment_id, reset: !!b.data.reset }, "restaurante demo armado");
    return out;
  });
}
