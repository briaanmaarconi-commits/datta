import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Printer, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  agentOnline, agentPrinters, agentPrint, PREP_AREAS, PREP_AREA_LABEL,
  type PrepArea, type PrintStation,
} from '@/lib/printAgent';

type Row = { printer_name: string; paper_width: 58 | 80; is_active: boolean };
const EMPTY: Row = { printer_name: '', paper_width: 80, is_active: true };

/**
 * Impresoras por sector de preparación (entrada / plato principal / postre). Se configura una vez por local;
 * la PC de cocina con el agente de impresión reparte cada comanda a la impresora de su sector.
 */
export default function StationsSetup() {
  const { establishmentId } = useAuth();
  const qc = useQueryClient();
  const [rows, setRows] = useState<Record<PrepArea, Row>>({ entrada: EMPTY, principal: EMPTY, postre: EMPTY });

  const { data: stations = [] } = useQuery({
    queryKey: ['print-stations', establishmentId],
    queryFn: async () => {
      const { data, error } = await db.from('print_stations').select('*').eq('establishment_id', establishmentId!);
      if (error) throw error;
      return (data ?? []) as PrintStation[];
    },
    enabled: !!establishmentId,
  });
  const { data: online = false, refetch: recheck } = useQuery({ queryKey: ['print-agent-status'], queryFn: agentOnline, refetchInterval: 10000 });
  const { data: winPrinters = [] } = useQuery({ queryKey: ['agent-printers'], queryFn: agentPrinters, enabled: online, retry: false });

  useEffect(() => {
    const next: Record<PrepArea, Row> = { entrada: EMPTY, principal: EMPTY, postre: EMPTY };
    for (const s of stations) next[s.prep_area] = { printer_name: s.printer_name, paper_width: s.paper_width, is_active: s.is_active };
    setRows(next);
  }, [stations]);

  const patch = (a: PrepArea, p: Partial<Row>) => setRows((r) => ({ ...r, [a]: { ...r[a], ...p } }));

  const save = useMutation({
    mutationFn: async () => {
      for (const a of PREP_AREAS) {
        const r = rows[a];
        const existing = stations.find((s) => s.prep_area === a);
        if (!r.printer_name.trim()) {
          if (existing) {
            const { error } = await db.from('print_stations').delete().eq('id', existing.id);
            if (error) throw error;
          }
          continue;
        }
        const body = { printer_name: r.printer_name.trim(), paper_width: r.paper_width, is_active: r.is_active, updated_at: new Date().toISOString() };
        const { error } = existing
          ? await db.from('print_stations').update(body).eq('id', existing.id)
          : await db.from('print_stations').insert({ ...body, establishment_id: establishmentId!, prep_area: a });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['print-stations'] });
      toast.success('Impresoras por sector guardadas');
    },
    onError: () => toast.error('No se pudo guardar'),
  });

  async function test(a: PrepArea) {
    const r = rows[a];
    if (!r.printer_name.trim()) return toast.error('Elegí primero la impresora');
    try {
      await agentPrint(r, {
        area: a,
        establishmentName: 'PRUEBA',
        tableNumber: 'DEMO',
        createdAt: new Date().toISOString(),
        items: [{ quantity: 1, name: `Prueba ${PREP_AREA_LABEL[a]}`, notes: 'áéíóú ñ - si ves esto, anda' }],
      });
      toast.success(`Prueba enviada a "${r.printer_name}"`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo imprimir la prueba');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-lg">
          <span className="flex items-center gap-2"><Printer className="h-5 w-5" /> Impresoras por sector</span>
          <span className={`flex items-center gap-1 text-sm font-medium ${online ? 'text-emerald-600' : 'text-destructive'}`}>
            {online ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {online ? 'Agente de impresión conectado' : 'Agente de impresión no detectado en esta PC'}
            <Button variant="ghost" size="sm" onClick={() => recheck()}>Reintentar</Button>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Cada sector sale por su propia comandera. Configurá esto desde la <strong>PC de cocina</strong> (donde corre el agente)
          para elegir de la lista de impresoras de Windows. Un sector sin impresora sale por <strong>Plato principal</strong>;
          si tampoco hay, por la impresora predeterminada de la PC.
        </p>
        {PREP_AREAS.map((a) => (
          <div key={a} className="grid items-center gap-2 rounded-lg border p-3 sm:grid-cols-[9rem_1fr_6rem_auto_auto]">
            <span className="font-semibold">{PREP_AREA_LABEL[a]}</span>
            {winPrinters.length > 0 ? (
              <Select value={rows[a].printer_name || '__none'} onValueChange={(v) => patch(a, { printer_name: v === '__none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="Elegí la impresora" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Sin impresora</SelectItem>
                  {[...new Set([rows[a].printer_name, ...winPrinters].filter(Boolean))].map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input value={rows[a].printer_name} placeholder={`Nombre en Windows (ej. Datta-${PREP_AREA_LABEL[a].split(' ').pop()})`}
                onChange={(e) => patch(a, { printer_name: e.target.value })} />
            )}
            <Select value={String(rows[a].paper_width)} onValueChange={(v) => patch(a, { paper_width: Number(v) as 58 | 80 })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="80">80 mm</SelectItem>
                <SelectItem value="58">58 mm</SelectItem>
              </SelectContent>
            </Select>
            <Switch checked={rows[a].is_active} onCheckedChange={(v) => patch(a, { is_active: v })} aria-label={`Activar ${PREP_AREA_LABEL[a]}`} />
            <Button variant="outline" size="sm" disabled={!online} onClick={() => test(a)}>Imprimir prueba</Button>
          </div>
        ))}
        <Button onClick={() => save.mutate()} disabled={save.isPending || !establishmentId}>Guardar</Button>
      </CardContent>
    </Card>
  );
}
