import { useEffect, useMemo, useState } from 'react';
import { Bell, AlertTriangle, Lightbulb, CheckCheck, Sparkles } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from '@/components/ui/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

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

const severityRing: Record<string, string> = {
  critical: 'border-l-destructive',
  warning: 'border-l-yellow-500',
  info: 'border-l-primary',
};

export default function InsightsBell() {
  const { establishmentId } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);

  const { data: insights = [] } = useQuery({
    queryKey: ['ai-insights', establishmentId],
    enabled: !!establishmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_insights')
        .select('*')
        .eq('establishment_id', establishmentId!)
        .neq('status', 'dismissed')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Insight[];
    },
    refetchInterval: 60_000,
  });

  // Realtime
  useEffect(() => {
    if (!establishmentId) return;
    const channel = supabase
      .channel(`ai_insights_${establishmentId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ai_insights', filter: `establishment_id=eq.${establishmentId}` },
        () => queryClient.invalidateQueries({ queryKey: ['ai-insights', establishmentId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [establishmentId, queryClient]);

  const unread = useMemo(() => insights.filter((i) => i.status === 'new').length, [insights]);
  const alerts = insights.filter((i) => i.kind === 'alert');
  const recs = insights.filter((i) => i.kind === 'recommendation');

  async function markRead(id: string) {
    await supabase.from('ai_insights').update({ status: 'read', read_at: new Date().toISOString() }).eq('id', id);
    queryClient.invalidateQueries({ queryKey: ['ai-insights', establishmentId] });
  }
  async function dismiss(id: string) {
    await supabase.from('ai_insights').update({ status: 'dismissed' }).eq('id', id);
    queryClient.invalidateQueries({ queryKey: ['ai-insights', establishmentId] });
  }
  async function markAllRead() {
    if (!establishmentId) return;
    await supabase
      .from('ai_insights')
      .update({ status: 'read', read_at: new Date().toISOString() })
      .eq('establishment_id', establishmentId)
      .eq('status', 'new');
    queryClient.invalidateQueries({ queryKey: ['ai-insights', establishmentId] });
  }

  async function runAnalysisNow() {
    if (!establishmentId) return;
    setRunning(true);
    try {
      const { error } = await supabase.functions.invoke('ai-daily-analysis', {
        headers: { 'x-establishment-id': establishmentId },
      });
      if (error) throw error;
      toast({ title: 'Análisis IA ejecutado', description: 'Las nuevas alertas aparecerán en segundos.' });
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['ai-insights', establishmentId] }), 1500);
    } catch (e: any) {
      toast({ title: 'No se pudo correr el análisis', description: e.message ?? String(e), variant: 'destructive' });
    } finally {
      setRunning(false);
    }
  }

  const renderList = (items: Insight[]) => (
    <ScrollArea className="h-[360px]">
      {items.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">No hay novedades por ahora.</div>
      ) : (
        <div className="flex flex-col">
          {items.map((i) => (
            <div
              key={i.id}
              className={`border-l-4 ${severityRing[i.severity]} ${i.status === 'new' ? 'bg-accent/30' : ''} px-4 py-3 border-b last:border-b-0`}
            >
              <div className="flex items-start gap-2">
                {i.kind === 'alert' ? (
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-yellow-500" />
                ) : (
                  <Lightbulb className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium leading-tight">{i.title}</p>
                    {i.status === 'new' && <Badge variant="secondary" className="text-[10px]">nuevo</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground whitespace-pre-line mt-1">{i.body}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(i.created_at), { addSuffix: true, locale: es })}
                    </span>
                    {i.status === 'new' && (
                      <button onClick={() => markRead(i.id)} className="text-[10px] text-primary hover:underline">
                        Marcar leída
                      </button>
                    )}
                    <button onClick={() => dismiss(i.id)} className="text-[10px] text-muted-foreground hover:underline">
                      Descartar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </ScrollArea>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div>
            <p className="text-sm font-semibold">Asistente IA</p>
            <p className="text-xs text-muted-foreground">Alertas y recomendaciones automáticas</p>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={runAnalysisNow} disabled={running} title="Analizar ahora">
              <Sparkles className="h-4 w-4" />
            </Button>
            {unread > 0 && (
              <Button size="sm" variant="ghost" onClick={markAllRead} title="Marcar todas como leídas">
                <CheckCheck className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        <Tabs defaultValue="all">
          <TabsList className="w-full grid grid-cols-3 rounded-none border-b bg-transparent h-9">
            <TabsTrigger value="all" className="text-xs">Todas ({insights.length})</TabsTrigger>
            <TabsTrigger value="alerts" className="text-xs">Alertas ({alerts.length})</TabsTrigger>
            <TabsTrigger value="recs" className="text-xs">Sugerencias ({recs.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="all" className="m-0">{renderList(insights)}</TabsContent>
          <TabsContent value="alerts" className="m-0">{renderList(alerts)}</TabsContent>
          <TabsContent value="recs" className="m-0">{renderList(recs)}</TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
