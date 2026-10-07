import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BarChart3, Settings2, ArrowLeftRight, Lightbulb, ShoppingCart, Package, Trash2, Repeat, Carrot } from 'lucide-react';
import StockDashboard from '@/components/admin/stock/StockDashboard';
import ProductsRecipesTab from '@/components/admin/stock/ProductsRecipesTab';
import MovementsTab from '@/components/admin/stock/MovementsTab';
import SuggestionsTab from '@/components/admin/stock/SuggestionsTab';
import StockSettingsCard from '@/components/admin/stock/StockSettingsCard';
import SimplePurchasesTab from '@/components/admin/stock/SimplePurchasesTab';
import DirectStockTab from '@/components/admin/stock/DirectStockTab';
import IngredientsTab from '@/components/admin/stock/IngredientsTab';
import WastePanel from '@/components/admin/stock/WastePanel';
import StockModeChooser, { type InventoryMode } from '@/components/admin/stock/StockModeChooser';

const advancedTabs = [
  { value: 'dashboard', label: 'Estado', icon: BarChart3 },
  { value: 'products', label: 'Platos y recetas', icon: Settings2 },
  { value: 'ingredients', label: 'Ingredientes', icon: Carrot },
  { value: 'units', label: 'Por unidad o porción', icon: Package },
  { value: 'movements', label: 'Compras y movimientos', icon: ArrowLeftRight },
  { value: 'waste', label: 'Mermas', icon: Trash2 },
  { value: 'suggestions', label: 'Sugerencias', icon: Lightbulb },
];

const simpleTabs = [
  { value: 'units', label: 'Porciones y unidades', icon: Package },
  { value: 'waste', label: 'Mermas', icon: Trash2 },
  { value: 'purchases', label: 'Compras', icon: ShoppingCart },
];

export default function AdminStock() {
  const { establishmentId, role } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [wasteOpen, setWasteOpen] = useState(false);
  const isAdmin = role === 'admin';

  const { data: est, isLoading } = useQuery({
    queryKey: ['establishment-stock-mode', establishmentId],
    enabled: !!establishmentId,
    queryFn: async () => {
      const { data, error } = await db.from('establishments').select('id, inventory_mode').eq('id', establishmentId!).maybeSingle();
      if (error) throw error;
      return data as { id: string; inventory_mode: InventoryMode | null } | null;
    },
  });
  const mode = est?.inventory_mode ?? null;

  const choose = useMutation({
    mutationFn: async (m: InventoryMode) => {
      const { error } = await db.from('establishments')
        .update({ inventory_mode: m, stock_simple_mode: m === 'simple' } as any).eq('id', establishmentId!);
      if (error) throw error;
      return m;
    },
    onSuccess: (m) => {
      queryClient.invalidateQueries({ queryKey: ['establishment-stock-mode'] });
      queryClient.invalidateQueries({ queryKey: ['establishment-settings'] });
      setChanging(false);
      setTab(null);
      toast.success(m === 'simple' ? 'Listo: stock simple, por porciones o unidades' : 'Listo: stock avanzado, por ingredientes');
    },
    onError: (e: Error) => toast.error(e.message || 'No se pudo cambiar el modo'),
  });

  if (isLoading) return null;

  // Primera vez: elegir el modo.
  if (!mode) {
    return (
      <div className="space-y-6 pb-28 lg:pb-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gestión de Stock</h1>
          <p className="mt-1 text-muted-foreground">Elegí cómo querés controlar tu inventario. Lo podés cambiar más adelante.</p>
        </div>
        {isAdmin
          ? <StockModeChooser current={null} onChoose={(m) => choose.mutate(m)} saving={choose.isPending} />
          : <p className="rounded-lg border bg-muted/40 p-4 text-sm">El administrador todavía no eligió cómo se maneja el stock del local.</p>}
      </div>
    );
  }

  const advanced = mode === 'advanced';
  const tabs = advanced ? advancedTabs : simpleTabs;
  const current = tab && tabs.some(t => t.value === tab) ? tab : tabs[0].value;

  return (
    <div className="space-y-6 pb-28 lg:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">Gestión de Stock</h1>
            <Badge variant="outline" className="border-primary/40 text-primary">{advanced ? 'Avanzada: por ingredientes' : 'Simple: por porciones o unidades'}</Badge>
          </div>
          <p className="mt-1 text-muted-foreground">
            {advanced
              ? 'Cada venta descuenta los ingredientes de la receta. Bebidas, postres y empanadas se cuentan por unidad.'
              : 'Cada venta descuenta 1 porción o unidad del producto vendido.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="destructive" className="gap-2" onClick={() => setWasteOpen(true)}><Trash2 className="h-4 w-4" />Registrar merma</Button>
          {isAdmin && <Button variant="outline" className="gap-2" onClick={() => setChanging(true)}><Repeat className="h-4 w-4" />Cambiar modo</Button>}
        </div>
      </div>

      <Tabs value={current} onValueChange={setTab}>
        <TabsList className="h-auto flex-wrap justify-start">
          {tabs.map(t => (
            <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
              <t.icon className="h-4 w-4" />{t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="units"><DirectStockTab advanced={advanced} /></TabsContent>
        <TabsContent value="waste"><WastePanel advanced={advanced} /></TabsContent>
        {advanced ? (
          <>
            <TabsContent value="dashboard"><StockDashboard /></TabsContent>
            <TabsContent value="products"><ProductsRecipesTab /></TabsContent>
            <TabsContent value="ingredients"><IngredientsTab /></TabsContent>
            <TabsContent value="movements" className="space-y-4"><StockSettingsCard /><MovementsTab /></TabsContent>
            <TabsContent value="suggestions"><SuggestionsTab /></TabsContent>
          </>
        ) : (
          <TabsContent value="purchases"><SimplePurchasesTab /></TabsContent>
        )}
      </Tabs>

      <Dialog open={changing} onOpenChange={setChanging}>
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cambiar el modo de stock</DialogTitle>
            <DialogDescription>
              No se borra nada: tus productos, ingredientes y recetas quedan guardados. Desde el cambio, las ventas se descuentan según el modo nuevo.
            </DialogDescription>
          </DialogHeader>
          <StockModeChooser current={mode} onChoose={(m) => choose.mutate(m)} saving={choose.isPending} />
        </DialogContent>
      </Dialog>

      <Dialog open={wasteOpen} onOpenChange={setWasteOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Registrar merma</DialogTitle>
            <DialogDescription>Lo que se perdió se descuenta del stock y se suma a las pérdidas del mes.</DialogDescription>
          </DialogHeader>
          <WastePanel advanced={advanced} compact onDone={() => setWasteOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
