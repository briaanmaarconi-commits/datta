import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Maximize, Minimize, Users, UtensilsCrossed, Clock } from 'lucide-react';
import { getTableVisualState } from '@/lib/tableStatus';
import TableStatusLegend from '@/components/shared/TableStatusLegend';

export default function AdminMonitor() {
  const { establishmentId } = useAuth();
  const queryClient = useQueryClient();
  const [isFullscreen, setIsFullscreen] = useState(false);

  const { data: tables = [] } = useQuery({
    queryKey: ['admin-monitor-tables', establishmentId],
    queryFn: async () => {
      const { data, error } = await db.from('tables').select('*, sectors(name)').eq('establishment_id', establishmentId!).order('number');
      if (error) throw error;
      return data;
    },
    enabled: !!establishmentId,
  });

  const { data: activeOrders = [] } = useQuery({
    queryKey: ['admin-monitor-orders', establishmentId],
    queryFn: async () => {
      const { data, error } = await db
        .from('orders')
        .select('id, table_id, status')
        .eq('establishment_id', establishmentId!)
        .in('status', ['new', 'preparing', 'ready', 'delivered']);
      if (error) throw error;
      return data;
    },
    enabled: !!establishmentId,
  });

  useEffect(() => {
    if (!establishmentId) return;
    const channel = db
      .channel('admin-monitor-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables', filter: `establishment_id=eq.${establishmentId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['admin-monitor-tables', establishmentId] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `establishment_id=eq.${establishmentId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['admin-monitor-orders', establishmentId] });
      })
      .subscribe();
    return () => { db.removeChannel(channel); };
  }, [establishmentId, queryClient]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);


  const occupied = tables.filter(t => t.status !== 'free').length;
  const preparing = tables.filter(t => {
    const tableOrders = activeOrders.filter(o => o.table_id === t.id);
    return tableOrders.some(o => o.status === 'new' || o.status === 'preparing');
  }).length;
  const free = tables.length - occupied;

  const sectors = new Map<string, { name: string; tables: any[] }>();
  const noSectorTables: any[] = [];
  tables.forEach(t => {
    const sectorId = (t as any).sector_id;
    const sectorName = (t as any).sectors?.name;
    if (sectorId && sectorName) {
      if (!sectors.has(sectorId)) sectors.set(sectorId, { name: sectorName, tables: [] });
      sectors.get(sectorId)!.tables.push(t);
    } else {
      noSectorTables.push(t);
    }
  });

  const renderTable = (table: any) => {
    const style = getTableVisualState(table, activeOrders.filter(order => order.table_id === table.id));
    return (
      <div
        key={table.id}
        className={`relative rounded-md border-2 ${style.cardClass} p-4 transition-all duration-300 hover:shadow-lg cursor-default`}
      >
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${style.dotClass}`} />
        </div>
        <div className="space-y-2">
          <div className={`text-2xl font-bold font-display ${style.textClass}`}>{table.number}</div>
          <Badge variant="outline" className={`text-[10px] font-medium px-2 py-0.5 ${style.badgeClass}`}>
            {style.label}
          </Badge>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />
            <span>{(table as any).guest_count > 0 ? `${(table as any).guest_count}/` : ''}{table.capacity}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`space-y-6 ${isFullscreen ? 'p-6 bg-background min-h-screen' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-display tracking-tight">Monitoreo</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Vista en tiempo real de tu salón</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={toggleFullscreen} title={isFullscreen ? 'Salir pantalla completa' : 'Pantalla completa'}>
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <TableStatusLegend />

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
            <UtensilsCrossed className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-2xl font-bold font-display">{free}</p>
            <p className="text-xs text-muted-foreground">Libres</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
            <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="text-2xl font-bold font-display">{preparing}</p>
            <p className="text-xs text-muted-foreground">Preparando</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10">
            <Users className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <p className="text-2xl font-bold font-display">{occupied}</p>
            <p className="text-xs text-muted-foreground">Ocupadas</p>
          </div>
        </div>
      </div>

      {/* Tables grid */}
      {tables.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <UtensilsCrossed className="h-12 w-12 mb-3 opacity-30" />
          <p className="text-sm">No hay mesas configuradas</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(sectors.entries()).map(([sectorId, sector]) => (
            <div key={sectorId}>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-lg font-semibold font-display">{sector.name}</h2>
                <Badge variant="secondary" className="text-xs">{sector.tables.length}</Badge>
              </div>
              <div className="grid gap-3 grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
                {sector.tables.map(renderTable)}
              </div>
            </div>
          ))}
          {noSectorTables.length > 0 && (
            <div>
              {sectors.size > 0 && (
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-lg font-semibold font-display">Sin sector</h2>
                  <Badge variant="secondary" className="text-xs">{noSectorTables.length}</Badge>
                </div>
              )}
              <div className="grid gap-3 grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
                {noSectorTables.map(renderTable)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}