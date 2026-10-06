import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState } from 'react';
import { useShowMore, ShowMoreButton } from '@/components/ui/show-more';

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  entry: { label: 'Entrada', color: 'bg-green-500/20 text-green-700 border-green-500/30' },
  sale: { label: 'Venta', color: 'bg-blue-500/20 text-blue-700 border-blue-500/30' },
  waste: { label: 'Merma', color: 'bg-red-500/20 text-red-700 border-red-500/30' },
  adjustment: { label: 'Ajuste', color: 'bg-purple-500/20 text-purple-700 border-purple-500/30' },
};

export default function StockHistoryTab() {
  const { establishmentId } = useAuth();
  const [filterType, setFilterType] = useState('all');

  const { data: movements = [] } = useQuery({
    queryKey: ['stock_movements', establishmentId, filterType],
    queryFn: async () => {
      let q = supabase.from('stock_movements').select('*, ingredients(name, unit)')
        .eq('establishment_id', establishmentId!)
        .order('created_at', { ascending: false }).limit(100);
      if (filterType !== 'all') q = q.eq('type', filterType as any);
      const { data } = await q;
      return data || [];
    },
    enabled: !!establishmentId,
  });

  const movementsList = useShowMore<any>(movements, 15);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground">Todos los movimientos de stock</p>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="entry">Entradas</SelectItem>
            <SelectItem value="sale">Ventas</SelectItem>
            <SelectItem value="waste">Mermas</SelectItem>
            <SelectItem value="adjustment">Ajustes</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Ingrediente</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead>Motivo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {movementsList.visible.map((m: any) => {
              const t = TYPE_LABELS[m.type] || { label: m.type, color: '' };
              return (
                <TableRow key={m.id}>
                  <TableCell className="text-sm">{new Date(m.created_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</TableCell>
                  <TableCell className="font-medium">{(m as any).ingredients?.name}</TableCell>
                  <TableCell><Badge className={t.color}>{t.label}</Badge></TableCell>
                  <TableCell className={`text-right font-mono ${m.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {m.quantity > 0 ? '+' : ''}{m.quantity} {(m as any).ingredients?.unit}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{m.reason || '-'}</TableCell>
                </TableRow>
              );
            })}
            {movements.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No hay movimientos registrados</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        <ShowMoreButton hiddenCount={movementsList.hiddenCount} expanded={movementsList.expanded} onToggle={() => movementsList.setExpanded(!movementsList.expanded)} />
      </div>
    </div>
  );
}
