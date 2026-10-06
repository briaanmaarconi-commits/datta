import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { billing, money, type BillingOverview } from '@/lib/billingApi';

/** Plan único de Datta: el dueño define el precio mensual (en pesos, sin ajuste automático). */
export default function SuperAdminPlans() {
  const qc = useQueryClient();
  const [price, setPrice] = useState('');
  const [applyAll, setApplyAll] = useState(false);

  const { data } = useQuery({ queryKey: ['billing-overview'], queryFn: () => billing<BillingOverview>('overview') });

  const save = useMutation({
    mutationFn: () => billing<{ updated: number; mp: { ok: boolean; error?: string }[] }>('update-price', { amount: Number(price), apply_to_all: applyAll }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['billing-overview'] });
      const failed = r.mp.filter((m) => !m.ok).length;
      toast.success(applyAll ? `Precio actualizado en ${r.updated} clientes${failed ? ` (${failed} suscripciones de Mercado Pago fallaron)` : ''}` : 'Precio del plan actualizado');
      setPrice('');
      setApplyAll(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const current = data?.plan_price ?? 0;
  const paying = data?.clients.filter((c) => ['active', 'trial', 'past_due'].includes(c.effective_status)) ?? [];

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-3xl font-bold tracking-tight">Plan</h1>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />Plan Datta (único)</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Precio actual para clientes nuevos: <strong className="text-foreground">{current > 0 ? `${money(current)} por mes` : 'sin definir'}</strong>
          </div>
          <div className="space-y-2">
            <Label>Nuevo precio mensual (pesos)</Label>
            <Input type="number" min={1} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Ej: 60000" />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={applyAll} onChange={(e) => setApplyAll(e.target.checked)} />
            <span>Aplicar también a los clientes actuales ({paying.length}) y a sus suscripciones de Mercado Pago. Si no lo marcás, solo cambia el precio para clientes nuevos y cada cliente conserva su precio.</span>
          </label>
          <Button disabled={!(Number(price) > 0) || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Guardando…' : 'Guardar precio'}</Button>
          <p className="text-xs text-muted-foreground">Los precios son en pesos y no se ajustan solos: vos decidís cuándo subirlos.</p>
        </CardContent>
      </Card>
    </div>
  );
}
