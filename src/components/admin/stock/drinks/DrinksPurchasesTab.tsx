import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShoppingCart } from 'lucide-react';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import DrinksPurchaseDialog from './DrinksPurchaseDialog';
import { fmtMoney, fmtNum, useDrinksInventory } from './useDrinksInventory';

/** Historial de compras de bebidas (las botellas se muestran en botellas, no en ml). */
export default function DrinksPurchasesTab() {
  const { establishmentId } = useAuth();
  const { products, bottles, refresh } = useDrinksInventory();
  const [open, setOpen] = useState(false);
  const bottleMl = new Map(bottles.map(b => [b.id, b.bottle_ml]));

  const { data: purchases = [], isLoading } = useQuery({
    queryKey: ['drinks-purchases', establishmentId],
    queryFn: async () => {
      const { data, error } = await db
        .from('purchase_invoices')
        .select('id, supplier, invoice_date, total, purchase_invoice_items(item_name, quantity, unit, ingredient_id)')
        .eq('establishment_id', establishmentId!)
        .order('invoice_date', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!establishmentId,
  });

  const describe = (it: any) => {
    const ml = it.ingredient_id ? bottleMl.get(it.ingredient_id) : null;
    if (ml) return `${fmtNum(Number(it.quantity) / ml, 1)} bot. ${it.item_name}`;
    return `${fmtNum(Number(it.quantity), 2)} ${it.unit === 'unidad' ? 'u' : it.unit} ${it.item_name}`;
  };

  return (
    <div className="space-y-4">
      <Button className="gap-2" onClick={() => setOpen(true)} disabled={products.length + bottles.length === 0}>
        <ShoppingCart className="h-4 w-4" /> Registrar compra
      </Button>
      <Card>
        <CardContent className="pt-6">
          {isLoading ? null : purchases.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay compras cargadas.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow><TableHead>Fecha</TableHead><TableHead>Proveedor</TableHead><TableHead>Detalle</TableHead><TableHead className="text-right">Total</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {purchases.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap">{new Date(`${p.invoice_date}T12:00:00`).toLocaleDateString('es-AR')}</TableCell>
                    <TableCell>{p.supplier}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{(p.purchase_invoice_items ?? []).map(describe).join(' · ')}</TableCell>
                    <TableCell className="text-right font-medium">{fmtMoney(p.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <DrinksPurchaseDialog open={open} onOpenChange={setOpen} items={[...products, ...bottles]} onSaved={refresh} />
    </div>
  );
}
