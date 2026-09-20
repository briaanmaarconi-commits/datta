import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { UtensilsCrossed } from 'lucide-react';
import { GROUP_LABELS, MenuGroup } from '@/lib/menuGroups';
import { ComboExpandedLine, expandComboSelection } from '@/hooks/useMenuCombos';

const GROUP_ORDER: MenuGroup[] = ['main', 'dessert', 'drink'];

interface ComboPickerDialogProps {
  combos: any[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (lines: ComboExpandedLine[], comboName: string) => void;
}

export default function ComboPickerDialog({ combos, open, onOpenChange, onConfirm }: ComboPickerDialogProps) {
  const [comboId, setComboId] = useState<string | null>(null);
  const [selection, setSelection] = useState<Record<string, string>>({});

  const combo = combos.find(c => c.id === comboId) || null;

  const groups = useMemo(() => {
    if (!combo) return [];
    const items = (combo.menu_combo_items || []).slice().sort((a: any, b: any) => a.sort_order - b.sort_order);
    return GROUP_ORDER.map(group => ({ group, items: items.filter((i: any) => i.item_group === group) })).filter(
      g => g.items.length > 0,
    );
  }, [combo]);

  useEffect(() => {
    if (!combo) return;
    const initial: Record<string, string> = {};
    groups.forEach(g => { initial[g.group] = g.items[0].id; });
    setSelection(initial);
  }, [comboId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) { setComboId(null); setSelection({}); }
  }, [open]);

  const confirm = () => {
    if (!combo) return;
    const items = groups
      .map(g => g.items.find((i: any) => i.id === selection[g.group]))
      .filter(Boolean) as any[];
    const lines = expandComboSelection(combo, items);
    if (lines.length === 0) return;
    onConfirm(lines, combo.name);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UtensilsCrossed className="h-5 w-5 text-amber-500" />
            Combos del día
          </DialogTitle>
        </DialogHeader>

        {!combo ? (
          <div className="space-y-2">
            {combos.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No hay combos activos.</p>
            )}
            {combos.map(c => (
              <button
                key={c.id}
                type="button"
                className="w-full flex items-center justify-between gap-3 rounded-md border px-3 py-3 text-left hover:bg-muted/60 transition-colors"
                onClick={() => setComboId(c.id)}
              >
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{c.name}</p>
                  {c.description && <p className="text-xs text-muted-foreground truncate">{c.description}</p>}
                </div>
                <Badge className="bg-amber-500 hover:bg-amber-600 shrink-0">${Number(c.price).toFixed(2)}</Badge>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">{combo.name}</p>
              <Badge className="bg-amber-500 hover:bg-amber-600">${Number(combo.price).toFixed(2)}</Badge>
            </div>

            {groups.map(g => (
              <div key={g.group} className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  {GROUP_LABELS[g.group]}
                </Label>
                <div className="grid gap-1.5">
                  {g.items.map((i: any) => (
                    <button
                      key={i.id}
                      type="button"
                      onClick={() => setSelection(prev => ({ ...prev, [g.group]: i.id }))}
                      className={`w-full text-left rounded-md border px-3 py-2 text-sm transition-colors ${
                        selection[g.group] === i.id ? 'border-primary bg-primary/10' : 'hover:bg-muted/60'
                      }`}
                    >
                      {i.products?.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setComboId(null)}>
                Volver
              </Button>
              <Button className="flex-1" onClick={confirm}>
                Agregar combo (${Number(combo.price).toFixed(2)})
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
