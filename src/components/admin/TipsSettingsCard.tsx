import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTipMode } from '@/hooks/useTipMode';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { HandCoins, Users, User } from 'lucide-react';
import { toast } from 'sonner';

export default function TipsSettingsCard() {
  const { establishmentId } = useAuth();
  const queryClient = useQueryClient();
  const { data: mode = 'individual' } = useTipMode(establishmentId);

  const update = useMutation({
    mutationFn: async (newMode: 'pool' | 'individual') => {
      const { error } = await supabase
        .from('establishments')
        .update({ tip_mode: newMode } as any)
        .eq('id', establishmentId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['establishment-tip-mode'] });
      toast.success('Modo de propinas actualizado');
    },
    onError: () => toast.error('Error al actualizar'),
  });

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <HandCoins className="h-5 w-5 text-primary" />
          Modo de propinas
        </CardTitle>
      </CardHeader>
      <CardContent>
        <RadioGroup
          value={mode}
          onValueChange={(v) => update.mutate(v as 'pool' | 'individual')}
          className="gap-3"
        >
          <Label
            htmlFor="tip-individual"
            className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
              mode === 'individual' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'
            }`}
          >
            <RadioGroupItem value="individual" id="tip-individual" className="mt-1" />
            <div className="flex items-start gap-3 min-w-0">
              <User className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div className="min-w-0">
                <div className="font-semibold text-sm">Individual (al mozo que atendió)</div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  La propina queda asignada al mozo. Solo se registran las de <strong>tarjeta y transferencia</strong>; las de efectivo se las lleva el mozo directo y no pasan por el sistema.
                </p>
              </div>
            </div>
          </Label>

          <Label
            htmlFor="tip-pool"
            className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
              mode === 'pool' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'
            }`}
          >
            <RadioGroupItem value="pool" id="tip-pool" className="mt-1" />
            <div className="flex items-start gap-3 min-w-0">
              <Users className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div className="min-w-0">
                <div className="font-semibold text-sm">Pozo común</div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Todas las propinas se acumulan en un pozo. Se registran con <strong>cualquier método de pago</strong> (efectivo, tarjeta, transferencia) para llevar control total.
                </p>
              </div>
            </div>
          </Label>
        </RadioGroup>
        <p className="text-xs text-muted-foreground mt-3">
          Las propinas se registran como ingreso en la categoría <strong>"Propinas"</strong>, separada de "Ventas" para no inflar la analítica.
        </p>
      </CardContent>
    </Card>
  );
}
