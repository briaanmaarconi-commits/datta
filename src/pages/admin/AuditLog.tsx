import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

const ACTION_LABELS: Record<string, string> = {
  open_shift: 'Abrió turno',
  close_shift: 'Cerró turno',
  reopen_shift: 'Reabrió turno',
  delete: 'Eliminó registro',
  cancel_order: 'Canceló pedido',
  mark_unavailable: 'Marcó agotado',
  create_expense: 'Registró gasto',
  update_expense: 'Editó gasto',
  delete_expense: 'Eliminó gasto',
};

const TABLE_LABELS: Record<string, string> = {
  shift_controls: 'Turnos',
  categories: 'Categorías',
  products: 'Productos',
  orders: 'Pedidos',
  finance_transactions: 'Finanzas',
};

export default function AuditLog() {
  const { establishmentId } = useAuth();

  const { data: logs = [] } = useQuery({
    queryKey: ['audit-logs', establishmentId],
    queryFn: async () => {
      const { data, error } = await db
        .from('audit_logs')
        .select('*')
        .eq('establishment_id', establishmentId!)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      const userIds = Array.from(new Set((data || []).map((l: any) => l.user_id).filter(Boolean)));
      let profilesMap: Record<string, { full_name: string | null; email: string | null }> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await db
          .from('profiles')
          .select('id, full_name, email')
          .in('id', userIds);
        (profiles || []).forEach((p: any) => { profilesMap[p.id] = { full_name: p.full_name, email: p.email }; });
      }
      return (data || []).map((l: any) => ({ ...l, profiles: profilesMap[l.user_id] || null }));
    },
    enabled: !!establishmentId,
    staleTime: 30_000,
    retry: false,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Historial de acciones</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Últimas 100 acciones</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[600px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Acción</TableHead>
                  <TableHead>Módulo</TableHead>
                  <TableHead>Detalles</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log: any) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString('es')}
                    </TableCell>
                    <TableCell className="text-sm">
                      {(log.profiles as any)?.full_name || (log.profiles as any)?.email || '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{ACTION_LABELS[log.action] || log.action}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {TABLE_LABELS[log.table_name] || log.table_name}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                      {log.details && Object.keys(log.details).length > 0
                        ? JSON.stringify(log.details)
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
                {logs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Sin registros aún
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
