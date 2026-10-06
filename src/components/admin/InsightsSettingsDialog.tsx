import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/components/ui/use-toast';
import { useQueryClient } from '@tanstack/react-query';

const categories = [
  { key: 'sales', label: 'Ventas' },
  { key: 'costs', label: 'Costos y gastos' },
  { key: 'product', label: 'Productos' },
  { key: 'stock', label: 'Stock' },
  { key: 'operations', label: 'Operación' },
  { key: 'health', label: 'Resumen de salud' },
];

type Prefs = {
  enabled: boolean;
  silenced_categories: string[];
  thresholds: { sales_drop_pct?: number; cost_rise_pct?: number; ticket_drop_pct?: number };
  daily_report_enabled: boolean;
  daily_report_emails: string[];
  daily_report_hour: number;
};

export default function InsightsSettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { establishmentId } = useAuth();
  const queryClient = useQueryClient();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [emailsText, setEmailsText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !establishmentId) return;
    (async () => {
      const { data } = await db.rpc('ensure_insight_preferences', { _establishment_id: establishmentId });
      const p = data as unknown as Prefs;
      setPrefs(p);
      setEmailsText((p?.daily_report_emails || []).join(', '));
    })();
  }, [open, establishmentId]);

  if (!prefs) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent><p className="text-sm text-muted-foreground py-6">Cargando…</p></DialogContent>
      </Dialog>
    );
  }

  const toggleCat = (key: string) => {
    const has = prefs.silenced_categories.includes(key);
    setPrefs({
      ...prefs,
      silenced_categories: has ? prefs.silenced_categories.filter((c) => c !== key) : [...prefs.silenced_categories, key],
    });
  };

  const save = async () => {
    if (!establishmentId || !prefs) return;
    setSaving(true);
    const emails = emailsText.split(/[,;\n]/).map((e) => e.trim()).filter(Boolean);
    const { error } = await db
      .from('ai_insight_preferences')
      .update({
        enabled: prefs.enabled,
        silenced_categories: prefs.silenced_categories,
        thresholds: prefs.thresholds,
        daily_report_enabled: prefs.daily_report_enabled,
        daily_report_emails: emails,
        daily_report_hour: prefs.daily_report_hour,
        updated_at: new Date().toISOString(),
      })
      .eq('establishment_id', establishmentId);
    setSaving(false);
    if (error) {
      toast({ title: 'Error al guardar', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Configuración guardada' });
    queryClient.invalidateQueries({ queryKey: ['ai-insights', establishmentId] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurar Asistente IA</DialogTitle>
          <DialogDescription>Elegí qué alertas querés recibir y cómo.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between py-2">
          <div>
            <Label className="text-sm">Asistente activo</Label>
            <p className="text-xs text-muted-foreground">Análisis automático diario y alertas en la app.</p>
          </div>
          <Switch checked={prefs.enabled} onCheckedChange={(v) => setPrefs({ ...prefs, enabled: v })} />
        </div>

        <Separator />

        <div className="space-y-2">
          <Label className="text-sm">Categorías de alerta</Label>
          <p className="text-xs text-muted-foreground">Desactivá las que no quieras recibir.</p>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {categories.map((c) => {
              const active = !prefs.silenced_categories.includes(c.key);
              return (
                <div key={c.key} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <span className="text-sm">{c.label}</span>
                  <Switch checked={active} onCheckedChange={() => toggleCat(c.key)} />
                </div>
              );
            })}
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <Label className="text-sm">Umbrales de sensibilidad</Label>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Caída ventas %</Label>
              <Input type="number" min={1} max={100} value={prefs.thresholds.sales_drop_pct ?? 15}
                onChange={(e) => setPrefs({ ...prefs, thresholds: { ...prefs.thresholds, sales_drop_pct: Number(e.target.value) } })} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Suba costos %</Label>
              <Input type="number" min={1} max={100} value={prefs.thresholds.cost_rise_pct ?? 15}
                onChange={(e) => setPrefs({ ...prefs, thresholds: { ...prefs.thresholds, cost_rise_pct: Number(e.target.value) } })} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Baja ticket %</Label>
              <Input type="number" min={1} max={100} value={prefs.thresholds.ticket_drop_pct ?? 10}
                onChange={(e) => setPrefs({ ...prefs, thresholds: { ...prefs.thresholds, ticket_drop_pct: Number(e.target.value) } })} />
            </div>
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Reporte diario por email</Label>
            <Switch checked={prefs.daily_report_enabled} onCheckedChange={(v) => setPrefs({ ...prefs, daily_report_enabled: v })} />
          </div>
          <p className="text-xs text-muted-foreground">
            Requiere conectar el proveedor de email para activarse. Configurá ahora los destinatarios y el horario.
          </p>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <Label className="text-xs text-muted-foreground">Destinatarios</Label>
              <Input placeholder="dueño@restaurant.com, gerente@…" value={emailsText} onChange={(e) => setEmailsText(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Hora envío (0-23)</Label>
              <Input type="number" min={0} max={23} value={prefs.daily_report_hour}
                onChange={(e) => setPrefs({ ...prefs, daily_report_hour: Math.min(23, Math.max(0, Number(e.target.value))) })} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
