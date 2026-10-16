import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import SplitPaymentEditor, { defaultSplit, splitSum } from '@/components/shared/SplitPaymentEditor';
import { MIXED, SPLIT_METHODS, type PaymentPart, type SplitMethod } from '@/lib/payments';

type Choice = SplitMethod | typeof MIXED | null;

/**
 * La moza marca "Pidió la cuenta" y anota cómo va a pagar el cliente (un medio o varios combinados).
 * Queda en tables.payment_request y la caja lo ve precargado al cobrar.
 */
export default function BillRequestDialog({
  table,
  ordersCutoff,
  onClose,
  onConfirm,
  saving,
}: {
  table: { id: string; number: number } | null;
  ordersCutoff: string;
  onClose: () => void;
  onConfirm: (request: PaymentPart[] | null) => void;
  saving?: boolean;
}) {
  const [choice, setChoice] = useState<Choice>(null);
  const [parts, setParts] = useState<PaymentPart[]>([]);

  // El total sale de los mismos pedidos que cobra la caja (todos los no cerrados del turno).
  const { data: total = 0, isLoading } = useQuery({
    queryKey: ['bill-request-total', table?.id, ordersCutoff],
    queryFn: async () => {
      const { data, error } = await db
        .from('orders')
        .select('created_at, order_items(quantity, unit_price)')
        .eq('table_id', table!.id)
        .in('status', ['new', 'preparing', 'ready', 'delivered'])
        .gte('created_at', ordersCutoff);
      if (error) throw error;
      return ((data ?? []) as { order_items?: { quantity: number; unit_price: number }[] }[])
        .flatMap((o) => o.order_items ?? [])
        .reduce((s, i) => s + Number(i.unit_price) * Number(i.quantity), 0);
    },
    enabled: !!table,
  });

  useEffect(() => {
    if (!table) {
      setChoice(null);
      setParts([]);
    }
  }, [table]);

  const pick = (c: Choice) => {
    setChoice(c);
    if (c === MIXED && parts.length === 0) setParts(defaultSplit(total));
  };

  const mixedOk = choice !== MIXED || (parts.length >= 2 && splitSum(parts) === Math.round(total * 100) / 100);

  const confirm = () => {
    if (choice === null) return onConfirm(null);
    if (choice === MIXED) return onConfirm(parts.filter((p) => p.amount > 0));
    onConfirm([{ method: choice, amount: total }]);
  };

  return (
    <Dialog open={!!table} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Mesa {table?.number} pidió la cuenta</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg bg-muted p-3">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-xl font-bold">{isLoading ? '…' : `$${total.toLocaleString('es-AR')}`}</span>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold">¿Cómo paga?</p>
            <div className="grid grid-cols-2 gap-2">
              {SPLIT_METHODS.map((m) => (
                <Button key={m.value} type="button" variant={choice === m.value ? 'default' : 'outline'} onClick={() => pick(m.value)}>
                  {m.label}
                </Button>
              ))}
              <Button type="button" variant={choice === MIXED ? 'default' : 'outline'} onClick={() => pick(MIXED)} disabled={isLoading}>
                Combinado
              </Button>
            </div>
            <Button type="button" variant={choice === null ? 'secondary' : 'ghost'} size="sm" className="w-full" onClick={() => pick(null)}>
              No sé todavía
            </Button>
          </div>
          {choice === MIXED && <SplitPaymentEditor parts={parts} onChange={setParts} total={total} />}
          <Button className="w-full" onClick={confirm} disabled={saving || isLoading || !mixedOk}>
            Avisar a caja
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
