import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Lightbulb, Sparkles, Inbox, Settings, BellOff } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from '@/components/ui/use-toast';
import InsightsSettingsDialog from './InsightsSettingsDialog';

type Insight = {
  id: string;
  kind: 'alert' | 'recommendation';
  severity: 'info' | 'warning' | 'critical';
  category: string;
  title: string;
  body: string;
  status: 'new' | 'read' | 'dismissed';
  created_at: string;
};

const categoryLabel: Record<string, string> = {
  sales: 'Ventas',
  costs: 'Costos',
  product: 'Productos',
  stock: 'Stock',
  operations: 'Operación',
  health: 'Salud',
  other: 'Otros',
};

const severityRing: Record<string, string> = {
  critical: 'border-l-destructive',
  warning: 'border-l-yellow-500',
  info: 'border-l-primary',
};

export default function InsightsFeed() {
  const { establishmentId } = useAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'alert' | 'recommendation'>('all');
  const [running, setRunning] = useState(false);
  const [openSettings, setOpenSettings] = useState(false);

  const { data: insights = [] } = useQuery({
    queryKey: ['ai-insights-feed', establishmentId],
    enabled: !!establishmentId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_insights')
        .select('*')
        .eq('establishment_id', establishmentId!)
        .neq('status', 'dismissed')
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as Insight[];
    },
  });

  const filtered = filter === 'all' ? insights : insights.filter((i) => i.kind === filter);

  async function dismiss(id: string) {
    await supabase.from('ai_insights').update({ status: 'dismissed' }).eq('id', id);
    queryClient.invalidateQueries({ queryKey: ['ai-insights-feed', establishmentId] });
    queryClient.invalidateQueries({ queryKey: ['ai-insights', establishmentId] });
  }
  async function markRead(id: string) {
    await supabase.from('ai_insights').update({ status: 'read', read_at: new Date().toISOString() }).eq('id', id);
    queryClient.invalidateQueries({ queryKey: ['ai-insights-feed', establishmentId] });
    queryClient.invalidateQueries({ queryKey: ['ai-insights', establishmentId] });
  }
  async function silenceCategory(cat: string) {
    if (!establishmentId) return;
    const { data: prefs } = await supabase.rpc('ensure_insight_preferences', { _establishment_id: establishmentId });
    const current: string[] = (prefs as any)?.silenced_categories || [];
    if (current.includes(cat)) return;
    await supabase
      .from('ai_insight_preferences')
      .update({ silenced_categories: [...current, cat] })
      .eq('establishment_id', establishmentId);
    toast({ title: `Silencié "${categoryLabel[cat] ?? cat}"`, description: 'Podés reactivar la categoría desde configuración.' });
  }

  async function runNow() {
    if (!establishmentId) return;
    setRunning(true);
    try {
      const { error } = await supabase.functions.invoke('ai-daily-analysis', { headers: { 'x-establishment-id': establishmentId } });
      if (error) throw error;
      toast({ title: 'Analizando…', description: 'Las nuevas alertas aparecerán en segundos.' });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['ai-insights-feed', establishmentId] });
        queryClient.invalidateQueries({ queryKey: ['ai-insights', establishmentId] });
      }, 1500);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message ?? String(e), variant: 'destructive' });
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-base">Asistente IA</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">Alertas y recomendaciones automáticas</p>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={runNow} disabled={running}>
            <Sparkles className="h-3.5 w-3.5 mr-1" /> Analizar ahora
          </Button>
          <Button size="icon" variant="ghost" onClick={() => setOpenSettings(true)} title="Configurar">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-1 mb-3">
          {(['all', 'alert', 'recommendation'] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? 'secondary' : 'ghost'} className="h-7 text-xs" onClick={() => setFilter(f)}>
              {f === 'all' ? `Todas (${insights.length})` : f === 'alert' ? `Alertas (${insights.filter((i) => i.kind === 'alert').length})` : `Sugerencias (${insights.filter((i) => i.kind === 'recommendation').length})`}
            </Button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Sin novedades por ahora.</p>
            <Button size="sm" variant="link" onClick={runNow} disabled={running}>Generar análisis</Button>
          </div>
        ) : (
          <div className="divide-y rounded-md border">
            {filtered.map((i) => (
              <div key={i.id} className={`flex gap-3 p-3 border-l-4 ${severityRing[i.severity]} ${i.status === 'new' ? 'bg-accent/20' : ''}`}>
                <div className="shrink-0 pt-0.5">
                  {i.kind === 'alert' ? <AlertTriangle className="h-4 w-4 text-yellow-500" /> : <Lightbulb className="h-4 w-4 text-primary" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium leading-tight">{i.title}</p>
                    <Badge variant="outline" className="text-[10px] py-0">{categoryLabel[i.category] ?? i.category}</Badge>
                    {i.status === 'new' && <Badge variant="secondary" className="text-[10px] py-0">nuevo</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground whitespace-pre-line mt-1">{i.body}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(i.created_at), { addSuffix: true, locale: es })}</span>
                    {i.status === 'new' && (
                      <button onClick={() => markRead(i.id)} className="text-[10px] text-primary hover:underline">Marcar leída</button>
                    )}
                    <button onClick={() => silenceCategory(i.category)} className="text-[10px] text-muted-foreground hover:underline flex items-center gap-1">
                      <BellOff className="h-3 w-3" /> Silenciar {categoryLabel[i.category] ?? i.category}
                    </button>
                    <button onClick={() => dismiss(i.id)} className="text-[10px] text-muted-foreground hover:underline">Descartar</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <InsightsSettingsDialog open={openSettings} onOpenChange={setOpenSettings} />
    </Card>
  );
}
