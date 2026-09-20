import { useState, ReactNode } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Gift, Users, UtensilsCrossed } from 'lucide-react';
import { CourtesyType } from '@/hooks/useCloseTableAsCourtesy';
import { useCourtesyAccounts } from '@/hooks/useCourtesyAccounts';
import { useAuth } from '@/hooks/useAuth';

const TYPES: { value: CourtesyType; label: string; icon: typeof Gift; desc: string }[] = [
  { value: 'invitation', label: 'Invitación', icon: Gift, desc: 'Cortesía a un cliente' },
  { value: 'staff_meal', label: 'Personal', icon: Users, desc: 'Comida del staff' },
  { value: 'internal', label: 'Interno', icon: UtensilsCrossed, desc: 'Pruebas, degustación' },
];

const UNASSIGNED = '__none__';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (type: CourtesyType, notes: string, accountId: string | null) => void;
  isPending?: boolean;
  tableNumber?: number;
  total?: number;
  trigger?: ReactNode;
}

export default function CourtesyDialog({ open, onOpenChange, onConfirm, isPending, tableNumber, total }: Props) {
  const { establishmentId } = useAuth();
  const { data: accounts = [] } = useCourtesyAccounts(establishmentId);
  const [type, setType] = useState<CourtesyType>('invitation');
  const [notes, setNotes] = useState('');
  const [accountId, setAccountId] = useState<string>(UNASSIGNED);

  const handleConfirm = () => {
    onConfirm(type, notes, accountId === UNASSIGNED ? null : accountId);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setNotes(''); setType('invitation'); setAccountId(UNASSIGNED); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cerrar mesa como cortesía{tableNumber ? ` — Mesa ${tableNumber}` : ''}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {total !== undefined && total > 0 && (
            <div className="bg-muted rounded-md p-3 text-sm">
              <p className="text-muted-foreground">Esta mesa NO se cobra. Se descuenta el stock y se registra el costo de los ingredientes como gasto en Caja.</p>
              <p className="text-xs text-muted-foreground mt-1">Total del pedido (no cobrado): ${total.toFixed(2)}</p>
            </div>
          )}

          <div>
            <Label className="mb-2 block">Tipo</Label>
            <div className="grid grid-cols-3 gap-2">
              {TYPES.map(t => {
                const Icon = t.icon;
                const active = type === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setType(t.value)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-md border text-xs transition-colors ${active ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50'}`}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="font-medium">{t.label}</span>
                    <span className="text-muted-foreground text-[10px] leading-tight">{t.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label className="mb-2 block">¿A nombre de quién?</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Sin asignar" />
              </SelectTrigger>
              <SelectContent className="z-[100] bg-popover">
                <SelectItem value={UNASSIGNED}>Sin asignar</SelectItem>
                {accounts.map(a => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">
              El consumo queda registrado en la cuenta corriente de esa persona (solo control, no se cobra).
            </p>
          </div>

          <div>
            <Label>Notas (opcional)</Label>
            <Textarea
              placeholder="Ej: Cumpleaños del cliente, almuerzo equipo..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={isPending}>
            {isPending ? 'Procesando...' : 'Confirmar cortesía'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
