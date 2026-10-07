import { useEffect } from 'react';
import { LayoutDashboard, UtensilsCrossed, Grid3X3, Users, BarChart3, LogOut, Monitor, Wallet, Calculator, ClipboardList, Package, CalendarCheck, Receipt, Bike, MessageSquareWarning, BadgeDollarSign, PhoneCall, Printer } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { toArgDate, argDayRange } from '@/lib/utils';
import { useDeliverySettings } from '@/hooks/useDeliverySettings';
import {
  Sidebar, SidebarContent, SidebarProvider, SidebarTrigger, SidebarHeader, SidebarFooter, useSidebar,
} from '@/components/ui/sidebar';
import GroupedNav, { type NavEntry } from '@/components/shared/GroupedNav';
import { Button } from '@/components/ui/button';
import ChatBot from '@/components/admin/ChatBot';
import InsightsBell from '@/components/admin/InsightsBell';
import SectionHelp from '@/components/shared/SectionHelp';
import ServiceBanner from '@/components/shared/ServiceBanner';
import { usePrivateTheme } from '@/hooks/usePrivateTheme';
import SupportNavBadge from '@/components/support/SupportNavBadge';

function navEntries(deliveryEnabled: boolean): NavEntry[] {
  return [
    { title: 'Inicio', url: '/admin', icon: LayoutDashboard },
    {
      title: 'Salón y pedidos', icon: Grid3X3, items: [
        { title: 'Mesas', url: '/admin/tables', icon: Grid3X3 },
        { title: 'Reservas', url: '/admin/reservations', icon: CalendarCheck },
        { title: 'Monitoreo', url: '/admin/monitor', icon: Monitor },
        { title: 'Delivery propio', url: '/admin/delivery-propio', icon: PhoneCall },
        ...(deliveryEnabled ? [{ title: 'Delivery por apps', url: '/admin/delivery', icon: Bike }] : []),
      ],
    },
    {
      title: 'Carta y precios', icon: UtensilsCrossed, items: [
        { title: 'Menú', url: '/admin/menu', icon: UtensilsCrossed },
        { title: 'Precios y márgenes', url: '/admin/costs', icon: Calculator },
        { title: 'Stock', url: '/admin/stock', icon: Package },
      ],
    },
    {
      title: 'Caja y facturación', icon: Wallet, items: [
        { title: 'Caja', url: '/admin/cash', icon: Wallet },
        { title: 'Facturación', url: '/admin/billing', icon: Receipt },
      ],
    },
    {
      title: 'Estadísticas', icon: BarChart3, items: [
        { title: 'Analíticas', url: '/admin/analytics', icon: BarChart3 },
        { title: 'Historial', url: '/admin/audit', icon: ClipboardList },
      ],
    },
    {
      title: 'Equipo y ajustes', icon: Users, items: [
        { title: 'Personal', url: '/admin/staff', icon: Users },
        { title: 'Impresoras', url: '/admin/impresoras', icon: Printer },
      ],
    },
    {
      title: 'Mi cuenta Datta', icon: BadgeDollarSign, items: [
        { title: 'Suscripción', url: '/admin/suscripcion', icon: BadgeDollarSign },
        { title: 'Inconvenientes', url: '/admin/inconvenientes', icon: MessageSquareWarning, badge: (c) => <SupportNavBadge collapsed={c} /> },
      ],
    },
  ];
}

function SidebarNav() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const { signOut } = useAuth();
  const { enabled: deliveryEnabled } = useDeliverySettings();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border p-5">
        {collapsed ? <span className="font-display text-xl font-bold text-sidebar-primary">d</span> : <h1 className="workspace-brand">datta</h1>}
      </SidebarHeader>
      <SidebarContent>
        <GroupedNav entries={navEntries(deliveryEnabled)} storageKey="datta.nav.admin" />
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
          db.from('orders').select('id, total, status, created_at').eq('establishment_id', establishmentId).gte('created_at', from).lte('created_at', to),
          db.from('tables').select('id, status').eq('establishment_id', establishmentId),
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
        const { data } = await db.from('products').select('*, categories(name)').eq('establishment_id', establishmentId).order('name');
        return data ?? [];
      },
      staleTime: 60_000,
    });

    // Prefetch tables + sectors (Mesas / Monitor)
    queryClient.prefetchQuery({
      queryKey: ['tables', establishmentId],
      queryFn: async () => {
        const { data } = await db.from('tables').select('*, sectors(name, color)').eq('establishment_id', establishmentId).order('number');
        return data ?? [];
      },
      staleTime: 60_000,
    });
    queryClient.prefetchQuery({
      queryKey: ['sectors', establishmentId],
      queryFn: async () => {
        const { data } = await db.from('sectors').select('*').eq('establishment_id', establishmentId).order('name');
        return data ?? [];
      },
      staleTime: 5 * 60_000,
    });

    // Prefetch finance categories (Caja / Costos)
    queryClient.prefetchQuery({
      queryKey: ['finance-categories', establishmentId],
      queryFn: async () => {
        const { data } = await db.from('finance_categories').select('*').eq('establishment_id', establishmentId).order('name');
        return data ?? [];
      },
      staleTime: 5 * 60_000,
    });
  }, [establishmentId, queryClient]);

  return (
    <SidebarProvider>
      <div className="workspace-shell flex min-h-screen w-full">
        <SidebarNav />
        <div className="flex min-w-0 flex-1 flex-col">
          <ServiceBanner />
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
