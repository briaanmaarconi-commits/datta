import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PREP_AREAS, PREP_AREA_LABEL, type PrepArea } from '@/lib/printAgent';

const NONE = 'none';

/** Sector de preparación de una categoría: define a qué comandera sale cada plato. */
export function PrepAreaSelect({ value, onChange }: { value: PrepArea | null; onChange: (v: PrepArea | null) => void }) {
  return (
    <div className="space-y-2">
      <Label>Sector de preparación</Label>
      <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : (v as PrepArea))}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Sin asignar (sale por Plato principal)</SelectItem>
          {PREP_AREAS.map((a) => (
            <SelectItem key={a} value={a}>{PREP_AREA_LABEL[a]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">Decide en qué impresora de cocina sale la comanda de esta categoría.</p>
    </div>
  );
}
