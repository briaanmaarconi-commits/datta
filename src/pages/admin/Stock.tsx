import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { BarChart3, Settings2, ArrowLeftRight, Lightbulb, ShoppingCart, Package } from 'lucide-react';
import StockDashboard from '@/components/admin/stock/StockDashboard';
import ProductsRecipesTab from '@/components/admin/stock/ProductsRecipesTab';
import MovementsTab from '@/components/admin/stock/MovementsTab';
import SuggestionsTab from '@/components/admin/stock/SuggestionsTab';
import StockSettingsCard from '@/components/admin/stock/StockSettingsCard';
import SimplePurchasesTab from '@/components/admin/stock/SimplePurchasesTab';
import DirectStockTab from '@/components/admin/stock/DirectStockTab';

const tabs = [
  { value: 'dashboard', label: 'Estado', icon: BarChart3 },
  { value: 'products', label: 'Productos y Recetas', icon: Settings2 },
  { value: 'movements', label: 'Movimientos', icon: ArrowLeftRight },
  { value: 'suggestions', label: 'Sugerencias', icon: Lightbulb },
];

const simpleTabs = [
  { value: 'purchases', label: 'Compras', icon: ShoppingCart },
  { value: 'direct', label: 'Productos en stock', icon: Package },
];


export default function AdminStock() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [simpleTab, setSimpleTab] = useState('purchases');

  const { establishmentId } = useAuth();

  const { data: est, isLoading } = useQuery({
    queryKey: ['establishment-stock-mode', establishmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('establishments')
        .select('id, stock_simple_mode')
        .eq('id', establishmentId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!establishmentId,
  });

  const simple = !!est?.stock_simple_mode;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Gestión de Stock</h1>
        <p className="text-muted-foreground mt-1">
          {simple
            ? 'Cargá lo que comprás y el gasto se refleja solo en tus números'
            : 'Controlá el inventario de productos e ingredientes'}
        </p>
      </div>
      <StockSettingsCard />
      {isLoading ? null : simple ? (
        <Tabs value={simpleTab} onValueChange={setSimpleTab}>
          <TabsList className="h-auto">
            {simpleTabs.map(t => (
              <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
                <t.icon className="h-4 w-4" />
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="purchases"><SimplePurchasesTab /></TabsContent>
          <TabsContent value="direct"><DirectStockTab /></TabsContent>
        </Tabs>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-auto">
            {tabs.map(t => (
              <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
                <t.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{t.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="dashboard"><StockDashboard /></TabsContent>
          <TabsContent value="products"><ProductsRecipesTab /></TabsContent>
          <TabsContent value="movements"><MovementsTab /></TabsContent>
          <TabsContent value="suggestions"><SuggestionsTab /></TabsContent>
        </Tabs>
      )}
    </div>
  );
}
