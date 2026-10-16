import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import { SPLIT_METHODS, type PaymentPart, type SplitMethod } from '@/lib/payments';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Arranque típico: mitad tarjeta, mitad efectivo. */
export function defaultSplit(total: number): PaymentPart[] {
  const half = Math.round(total / 2);
  return [
    { method: 'card', amount: half },
    { method: 'cash', amount: round2(total - half) },
  ];
}

export const splitSum = (parts: PaymentPart[]) => round2(parts.reduce((s, p) => s + (Number(p.amount) || 0), 0));

/** Filas "medio + monto" para cobrar una cuenta con varios medios de pago. */
export default function SplitPaymentEditor({
  parts,
  onChange,
  total,
}: {
  parts: PaymentPart[];
  onChange: (parts: PaymentPart[]) => void;
  total: number;
}) {
  const sum = splitSum(parts);
  const diff = round2(total - sum);
  const set = (i: number, patch: Partial<PaymentPart>) => onChange(parts.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const used = new Set(parts.map((p) => p.method));
  const nextMethod = SPLIT_METHODS.find((m) => !used.has(m.value))?.value ?? 'cash';

  return (
    <div className="space-y-2">
      {parts.map((p, i) => (
        <div key={i} className="flex gap-2 items-center">
          <Select value={p.method} onValueChange={(v) => set(i, { method: v as SplitMethod })}>
            <SelectTrigger className="w-36 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" className="z-[100]">
              {SPLIT_METHODS.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            placeholder="0"
            value={p.amount || ''}
            onChange={(e) => set(i, { amount: parseFloat(e.target.value) || 0 })}
          />
          {parts.length > 2 && (
            <Button type="button" size="icon" variant="ghost" className="shrink-0" onClick={() => onChange(parts.filter((_, j) => j !== i))} title="Quitar">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="gap-1 px-2"
          onClick={() => onChange([...parts, { method: nextMethod, amount: diff > 0 ? diff : 0 }])}
        >
          <Plus className="h-4 w-4" /> Agregar otro medio
        </Button>
        {diff !== 0 && parts.length > 0 && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => set(parts.length - 1, { amount: round2((Number(parts[parts.length - 1].amount) || 0) + diff) })}
          >
            Completar el último
          </Button>
        )}
      </div>
      <p className={`text-sm ${diff === 0 ? 'text-green-700' : 'text-destructive'}`}>
        {diff === 0
          ? `Suma $${sum.toLocaleString('es-AR')}: coincide con el total`
          : diff > 0
            ? `Faltan $${diff.toLocaleString('es-AR')} para llegar al total ($${total.toLocaleString('es-AR')})`
            : `Se pasa por $${(-diff).toLocaleString('es-AR')} del total ($${total.toLocaleString('es-AR')})`}
      </p>
    </div>
  );
}
