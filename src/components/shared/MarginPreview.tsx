import { parseAmount } from '@/lib/parseAmount';

/** Muestra ganancia y margen en vivo al cargar precio y costo de un producto.
 *  Si el producto tiene IVA, el margen se calcula sobre el precio NETO (sin IVA),
 *  porque ese impuesto no es ganancia del restaurante. */
export default function MarginPreview({ price, cost, taxPct }: { price: string; cost: string; taxPct?: string }) {
  const p = parseAmount(price);
  const c = parseAmount(cost);
  if (!p || !c) return null;

  const tax = parseAmount(taxPct || '') || 0;
  const netPrice = tax > 0 ? p / (1 + tax / 100) : p;
  const profit = netPrice - c;
  const margin = (profit / netPrice) * 100;
  const positive = profit >= 0;

  return (
    <div className={`text-xs font-medium ${positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
      <p>
        Ganancia ${profit.toFixed(2)} · Margen {margin.toFixed(1)}%
        {tax > 0 && <span className="text-muted-foreground"> (neto de IVA: ${netPrice.toFixed(2)})</span>}
      </p>
    </div>
  );
}
