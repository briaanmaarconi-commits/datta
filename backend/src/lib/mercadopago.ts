import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env.js";

// Cliente mínimo de la API de Suscripciones de Mercado Pago (preapproval). Todo lo que llega por webhook
// se vuelve a consultar acá con el token: el contenido del webhook nunca se toma como verdad.
const BASE = "https://api.mercadopago.com";

export class MpError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

export const mpEnabled = () => !!env.MERCADOPAGO_ACCESS_TOKEN.trim();

async function mp<T = any>(method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<T> {
  if (!mpEnabled()) throw new MpError(503, "Mercado Pago no está configurado (falta MERCADOPAGO_ACCESS_TOKEN).");
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* respuesta no JSON */
  }
  if (!res.ok) throw new MpError(res.status, json?.message ?? `Mercado Pago respondió ${res.status}`, json);
  return json as T;
}

export interface Preapproval {
  id: string;
  status: "pending" | "authorized" | "paused" | "cancelled" | string;
  init_point?: string;
  payer_email?: string;
  external_reference?: string;
  next_payment_date?: string | null;
  auto_recurring?: { transaction_amount?: number; start_date?: string };
}

export const createPreapproval = (o: {
  reason: string;
  externalReference: string;
  payerEmail: string;
  amount: number;
  startDate: string; // ISO
  backUrl: string;
}) =>
  mp<Preapproval>("POST", "/preapproval", {
    reason: o.reason,
    external_reference: o.externalReference,
    payer_email: o.payerEmail,
    back_url: o.backUrl,
    status: "pending",
    auto_recurring: {
      frequency: 1,
      frequency_type: "months",
      transaction_amount: o.amount,
      currency_id: "ARS",
      start_date: o.startDate,
    },
  });

export const getPreapproval = (id: string) => mp<Preapproval>("GET", `/preapproval/${encodeURIComponent(id)}`);

export const updatePreapprovalAmount = (id: string, amount: number) =>
  mp<Preapproval>("PUT", `/preapproval/${encodeURIComponent(id)}`, { auto_recurring: { transaction_amount: amount, currency_id: "ARS" } });

export const cancelPreapproval = (id: string) => mp<Preapproval>("PUT", `/preapproval/${encodeURIComponent(id)}`, { status: "cancelled" });

export interface AuthorizedPayment {
  id: number | string;
  preapproval_id?: string;
  status?: string; // processed | recycling | cancelled | scheduled
  transaction_amount?: number;
  debit_date?: string;
  payment?: { id?: number | string; status?: string } | null;
}
export const getAuthorizedPayment = (id: string) => mp<AuthorizedPayment>("GET", `/authorized_payments/${encodeURIComponent(id)}`);

export interface MpPayment {
  id: number | string;
  status: string; // approved | pending | rejected | ...
  transaction_amount: number;
  date_approved?: string | null;
  external_reference?: string | null;
  metadata?: { preapproval_id?: string } | null;
}
export const getPayment = (id: string) => mp<MpPayment>("GET", `/v1/payments/${encodeURIComponent(id)}`);

/** Pagos autorizados (cobros) de una suscripción, por si se perdió algún webhook. */
export const searchAuthorizedPayments = (preapprovalId: string) =>
  mp<{ results?: AuthorizedPayment[] }>("GET", `/authorized_payments/search?preapproval_id=${encodeURIComponent(preapprovalId)}`);

/**
 * Verifica la firma `x-signature` (ts=...,v1=...) que Mercado Pago agrega a los webhooks.
 * Si no hay secreto configurado se acepta (la verdad igual se re-consulta a la API).
 */
export function verifyWebhookSignature(opts: { signature?: string; requestId?: string; dataId?: string }): boolean {
  const secret = env.MERCADOPAGO_WEBHOOK_SECRET.trim();
  if (!secret) return true;
  if (!opts.signature) return false;
  const parts = Object.fromEntries(opts.signature.split(",").map((p) => p.trim().split("=") as [string, string]));
  if (!parts.ts || !parts.v1) return false;
  const manifest = `${opts.dataId ? `id:${opts.dataId.toLowerCase()};` : ""}${opts.requestId ? `request-id:${opts.requestId};` : ""}ts:${parts.ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}
