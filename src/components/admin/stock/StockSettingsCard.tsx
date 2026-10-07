import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Link2, Info } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

/** Opción de stock avanzado: que las compras de ingredientes se registren solas como gasto en Caja. */
export default function StockSettingsCard() {
  const { establishmentId } = useAuth();
  const queryClient = useQueryClient();

  const { data: est } = useQuery({
    queryKey: ['establishment-settings', establishmentId],
    queryFn: async () => {
      const { data } = await db.from('establishments')
        .select('id, auto_purchase_to_expense')
        .eq('id', establishmentId!).single();
      return data;
    },
    enabled: !!establishmentId,
  });

  const toggleMutation = useMutation({
    mutationFn: async (value: boolean) => {
      const { error } = await db.from('establishments')
        .update({ auto_purchase_to_expense: value }).eq('id', establishmentId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['establishment-settings'] });
      toast({ title: 'Configuración actualizada' });
    },
    onError: () => toast({ title: 'Error al actualizar', variant: 'destructive' }),
  });

  if (!est) return null;
  const enabled = est.auto_purchase_to_expense;

  return (
    <Card className="border-primary/20">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 ${enabled ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
              <Link2 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <Label htmlFor="auto-expense" className="text-sm font-semibold cursor-pointer">
                Vincular compras de stock con el balance
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {enabled
                  ? 'Cada compra de ingredientes se registra automáticamente como gasto en Control de Caja.'
                  : 'Las compras quedan solo en stock. Los gastos los cargás manualmente en Caja.'}
              </p>
            </div>
          </div>
          <Switch
            id="auto-expense"
            checked={enabled}
            onCheckedChange={(v) => toggleMutation.mutate(v)}
            disabled={toggleMutation.isPending}
          />
        </div>
        {enabled && (
          <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 rounded-md p-2.5">
            <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <span>Los gastos se categorizan como <strong>"Compras de insumos"</strong>. Se sincronizan al editar o eliminar la compra.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
