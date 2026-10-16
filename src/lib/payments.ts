// Pago combinado: una mesa cobrada con varios medios (ej. mitad tarjeta, mitad efectivo).
// En la base: payment_method = 'mixed' y `payments` con el detalle (backend/sql/123_split_payments.sql).

export const MIXED = 'mixed';

export type SplitMethod = 'cash' | 'card' | 'transfer';
export interface PaymentPart {
  method: SplitMethod;
  amount: number;
}

export const SPLIT_METHODS: { value: SplitMethod; label: string }[] = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'card', label: 'Tarjeta' },
  { value: 'transfer', label: 'Transferencia' },
];

export const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  account: 'Cuenta corriente',
  mixed: 'Combinado',
};

export const paymentLabel = (m: string | null | undefined) => (m ? PAYMENT_LABELS[m] ?? m : '—');

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Lee el detalle guardado (tolerante a datos viejos o mal formados). */
export function parsePayments(v: unknown): PaymentPart[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((p) => ({ method: p?.method as SplitMethod, amount: Number(p?.amount) }))
    .filter((p) => SPLIT_METHODS.some((m) => m.value === p.method) && p.amount > 0);
}

/** Cuánto de esta venta entró por `method` (contempla pagos combinados). */
export function amountForMethod(row: { total?: number | string | null; payment_method?: string | null; payments?: unknown }, method: string): number {
  if (row.payment_method === MIXED) {
    return parsePayments(row.payments).filter((p) => p.method === method).reduce((s, p) => s + p.amount, 0);
  }
  return row.payment_method === method ? Number(row.total) || 0 : 0;
}

/** "Tarjeta $10.000 + Efectivo $5.000" */
export function describePayments(parts: PaymentPart[]): string {
  return parts.map((p) => `${paymentLabel(p.method)} $${p.amount.toLocaleString('es-AR')}`).join(' + ');
}

/**
 * Reparte el pago combinado entre los pedidos de la mesa, en proporción a lo cobrado de cada uno,
 * así los resúmenes por pedido suman exacto lo que entró por cada medio.
 */
export function splitAcrossOrders(parts: PaymentPart[], orderTotals: number[]): PaymentPart[][] {
  const grand = orderTotals.reduce((s, t) => s + t, 0);
  const result: PaymentPart[][] = orderTotals.map(() => []);
  for (const part of parts) {
    let assigned = 0;
    orderTotals.forEach((t, i) => {
      const last = i === orderTotals.length - 1;
      const amount = last ? round2(part.amount - assigned) : round2(grand > 0 ? (part.amount * t) / grand : 0);
      assigned = round2(assigned + amount);
      if (amount !== 0) result[i].push({ method: part.method, amount });
    });
  }
  return result;
}
