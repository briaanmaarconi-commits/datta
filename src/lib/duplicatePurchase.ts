// Detección de compras posiblemente duplicadas (misma compra cargada en Stock
// y también a mano en Movimientos de caja). Solo avisa, nunca bloquea.
import { db } from '@/lib/db';

export interface SimilarPurchase {
  id: string;
  source: 'stock' | 'movimientos';
  label: string;
  date: string;
  amount: number;
}

const norm = (s: string) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const shiftDate = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};

const sameAmount = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, Math.abs(a) * 0.01);

const namesMatch = (a: string, b: string) => {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
};

/**
 * Busca compras/gastos ya cargados del mismo proveedor, con fecha ±2 días y
 * monto igual (±1%). Devuelve las coincidencias para mostrar un aviso.
 */
export async function findSimilarPurchases(params: {
  establishmentId: string;
  supplier: string;
  date: string;
  amount: number;
  excludePurchaseId?: string | null;
  excludeTransactionId?: string | null;
}): Promise<SimilarPurchase[]> {
  const { establishmentId, supplier, date, amount } = params;
  if (!establishmentId || !supplier?.trim() || !amount) return [];

  const from = shiftDate(date, -2);
  const to = shiftDate(date, 2);
  const out: SimilarPurchase[] = [];

  const [{ data: purchases }, { data: txs }] = await Promise.all([
    db
      .from('purchase_invoices')
      .select('id, supplier, invoice_date, total')
      .eq('establishment_id', establishmentId)
      .gte('invoice_date', from)
      .lte('invoice_date', to),
    db
      .from('finance_transactions')
      .select('id, description, date, amount, type')
      .eq('establishment_id', establishmentId)
      .eq('type', 'expense')
      .gte('date', from)
      .lte('date', to),
  ]);

  (purchases ?? []).forEach((p: any) => {
    if (params.excludePurchaseId && p.id === params.excludePurchaseId) return;
    if (!sameAmount(Number(p.total), amount)) return;
    if (!namesMatch(p.supplier || '', supplier)) return;
    out.push({ id: p.id, source: 'stock', label: p.supplier, date: p.invoice_date, amount: Number(p.total) });
  });

  (txs ?? []).forEach((t: any) => {
    if (params.excludeTransactionId && t.id === params.excludeTransactionId) return;
    if (!sameAmount(Number(t.amount), amount)) return;
    if (!namesMatch(t.description || '', supplier)) return;
    out.push({
      id: t.id,
      source: 'movimientos',
      label: t.description || 'Movimiento',
      date: t.date,
      amount: Number(t.amount),
    });
  });

  return out;
}
