import { useEffect } from 'react';
import { LayoutDashboard, UtensilsCrossed, Grid3X3, Users, BarChart3, LogOut, Monitor, Wallet, Calculator, ClipboardList, Package, CalendarCheck, Receipt, Bike } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toArgDate, argDayRange } from '@/lib/utils';
import { useDeliverySettings } from '@/hooks/useDeliverySettings';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider,
  SidebarTrigger, SidebarHeader, SidebarFooter, useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import ChatBot from '@/components/admin/ChatBot';
import InsightsBell from '@/components/admin/InsightsBell';
import SectionHelp from '@/components/shared/SectionHelp';
import { usePrivateTheme } from '@/hooks/usePrivateTheme';

const items = [
  { title: 'Dashboard', url: '/admin', icon: LayoutDashboard },
  { title: 'Menú', url: '/admin/menu', icon: UtensilsCrossed },
  { title: 'Mesas', url: '/admin/tables', icon: Grid3X3 },
  { title: 'Reservas', url: '/admin/reservations', icon: CalendarCheck },
  { title: 'Personal', url: '/admin/staff', icon: Users },
  { title: 'Monitoreo', url: '/admin/monitor', icon: Monitor },
  { title: 'Analíticas', url: '/admin/analytics', icon: BarChart3 },
  { title: 'Caja', url: '/admin/cash', icon: Wallet },
  { title: 'Facturación', url: '/admin/billing', icon: Receipt },
  { title: 'Precios y márgenes', url: '/admin/costs', icon: Calculator },
  { title: 'Stock', url: '/admin/stock', icon: Package },
  { title: 'Historial', url: '/admin/audit', icon: ClipboardList },
];

const deliveryItem = { title: 'Delivery', url: '/admin/delivery', icon: Bike };


function SidebarNav() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const { signOut } = useAuth();
  const { enabled: deliveryEnabled } = useDeliverySettings();
  const navItems = deliveryEnabled ? [...items, deliveryItem] : items;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border p-5">
        {collapsed ? <span className="font-display text-xl font-bold text-sidebar-primary">d</span> : <h1 className="workspace-brand">datta</h1>}
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Administración</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map(item => (

                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location.pathname === item.url}>
                    <NavLink to={item.url} end>
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-2">
        <Button variant="ghost" className="w-full justify-start gap-2 text-sidebar-foreground" onClick={signOut}>
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>Cerrar sesión</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  usePrivateTheme();
  const { establishmentId } = useAuth();
  const queryClient = useQueryClient();

  // Prefetch common data on layout mount so pages load instantly
  useEffect(() => {
    if (!establishmentId) return;
    const today = toArgDate();
    const { from, to } = argDayRange(today);

    // Prefetch dashboard stats
    queryClient.prefetchQuery({
      queryKey: ['admin-stats', establishmentId],
      queryFn: async () => {
        const [ordersRes, tablesRes] = await Promise.all([
          supabase.from('orders').select('id, total, status, created_at').eq('establishment_id', establishmentId).gte('created_at', from).lte('created_at', to),
          supabase.from('tables').select('id, status').eq('establishment_id', establishmentId),
        ]);
        const orders = ordersRes.data || [];
        const tables = tablesRes.data || [];
        const closedOrders = orders.filter(o => o.status === 'closed');
        const totalSales = closedOrders.reduce((sum, o) => sum + Number(o.total), 0);
        const avgTicket = closedOrders.length > 0 ? totalSales / closedOrders.length : 0;
        return { totalSales, totalOrders: orders.length, closedOrders: closedOrders.length, avgTicket, activeTables: tables.filter(t => t.status !== 'free').length, totalTables: tables.length };
      },
      staleTime: 60_000,
    });

    // Prefetch products & categories
    queryClient.prefetchQuery({
      queryKey: ['products', establishmentId],
      queryFn: async () => {
        const { data } = await supabase.from('products').select('*, categories(name)').eq('establishment_id', establishmentId).order('name');
        return data ?? [];
      },
      staleTime: 60_000,
    });

    // Prefetch tables + sectors (Mesas / Monitor)
    queryClient.prefetchQuery({
      queryKey: ['tables', establishmentId],
      queryFn: async () => {
        const { data } = await supabase.from('tables').select('*, sectors(name, color)').eq('establishment_id', establishmentId).order('number');
        return data ?? [];
      },
      staleTime: 60_000,
    });
    queryClient.prefetchQuery({
      queryKey: ['sectors', establishmentId],
      queryFn: async () => {
        const { data } = await supabase.from('sectors').select('*').eq('establishment_id', establishmentId).order('name');
        return data ?? [];
      },
      staleTime: 5 * 60_000,
    });

    // Prefetch finance categories (Caja / Costos)
    queryClient.prefetchQuery({
      queryKey: ['finance-categories', establishmentId],
      queryFn: async () => {
        const { data } = await supabase.from('finance_categories').select('*').eq('establishment_id', establishmentId).order('name');
        return data ?? [];
      },
      staleTime: 5 * 60_000,
    });
  }, [establishmentId, queryClient]);

  return (
    <SidebarProvider>
      <div className="workspace-shell flex min-h-screen w-full">
        <SidebarNav />
        <div className="flex-1 flex flex-col">
          <header className="workspace-header">
            <SidebarTrigger />
            <span className="ml-3 text-sm font-medium text-muted-foreground">Admin</span>
            <span className="ml-2 flex items-center"><SectionHelp /></span>
            <div className="ml-auto flex items-center gap-2">
              <InsightsBell />
            </div>
          </header>
          <main className="workspace-main">{children}</main>
        </div>
      </div>
      <ChatBot />
    </SidebarProvider>
  );
}
