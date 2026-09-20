import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2 } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  free: 'bg-green-500/20 border-green-500 text-green-700',
  occupied: 'bg-red-500/20 border-red-500 text-red-700',
  billing: 'bg-yellow-500/20 border-yellow-500 text-yellow-700',
};
const STATUS_LABELS: Record<string, string> = { free: 'Libre', occupied: 'Ocupada', billing: 'En preparación' };

export default function SuperAdminMonitor() {
  const queryClient = useQueryClient();

  const { data: establishments = [] } = useQuery({
    queryKey: ['monitor-establishments'],
    queryFn: async () => {
      const { data, error } = await supabase.from('establishments').select('id, name, is_active').eq('is_active', true).order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: allTables = [] } = useQuery({
    queryKey: ['monitor-tables'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tables').select('*').order('number');
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel('superadmin-tables-monitor')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables' }, () => {
        queryClient.invalidateQueries({ queryKey: ['monitor-tables'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Monitoreo en tiempo real</h1>
      {establishments.map(est => {
        const tables = allTables.filter(t => t.establishment_id === est.id);
        const occupied = tables.filter(t => t.status !== 'free').length;
        return (
          <Card key={est.id}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Building2 className="h-5 w-5 text-primary" />
                {est.name}
                <Badge variant="outline" className="ml-auto">{occupied}/{tables.length} activas</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {tables.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin mesas configuradas</p>
              ) : (
                <div className="grid gap-2 grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
                  {tables.map(table => (
                    <div key={table.id} className={`border-2 rounded-lg p-2 text-center transition-all ${STATUS_COLORS[table.status]}`}>
                      <div className="text-lg font-bold">{table.number}</div>
                      <div className="text-xs">{STATUS_LABELS[table.status]}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
