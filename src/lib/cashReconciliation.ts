// Shared cash reconciliation rules for shift closing (Caja, ticket and Admin detail).
// Keeps the "efectivo esperado" formula identical everywhere.

export const TIPS_CATEGORY_RE = /propina/i;
export const SALES_CATEGORY_RE = /^ventas$/i;

export interface TxLike {
  type: string;
  amount: number | string;
  categoryName?: string | null;
  /** false = el dinero no sale/entra del cajón de la caja (ej: compras de mercadería). */
  affects_cash?: boolean | null;
}

/** Automatic movement created when closing a table (category "Ventas"). */
export const isAutomaticSaleTx = (t: TxLike) => SALES_CATEGORY_RE.test(t.categoryName || '');

/** Tip movement (income + mirror expense) — always neutral for the cash count. */
export const isTipTx = (t: TxLike) => TIPS_CATEGORY_RE.test(t.categoryName || '');

/** Movement explicitly flagged as not touching the cash drawer (purchases, etc.). */
export const isOutOfCashTx = (t: TxLike) => t.affects_cash === false;

/** Only manual movements that touch the drawer affect the arqueo on top of cash sales. */
export const isManualCashTx = (t: TxLike) =>
  !isAutomaticSaleTx(t) && !isTipTx(t) && !isOutOfCashTx(t);

export function summarizeManualMovements<T extends TxLike>(txs: T[]) {
  const manual = txs.filter(isManualCashTx);
  const manualIncome = manual
    .filter(t => t.type === 'income')
    .reduce((s, t) => s + Number(t.amount), 0);
  const manualExpenses = manual
    .filter(t => t.type === 'expense')
    .reduce((s, t) => s + Number(t.amount), 0);
  return { manual, manualIncome, manualExpenses };
}

export function computeExpectedCash(params: {
  initialCash: number;
  cashSales: number;
  manualIncome: number;
  manualExpenses: number;
}) {
  return params.initialCash + params.cashSales + params.manualIncome - params.manualExpenses;
}
