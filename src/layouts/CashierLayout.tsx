import { Grid3X3, Receipt, FileText, DollarSign, LogOut, CalendarCheck, UtensilsCrossed, LayoutGrid, Users, MonitorSpeaker, Wallet, Calculator, Package, ScrollText, MessageSquareWarning, BadgeDollarSign, PhoneCall, Printer, HandCoins } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  Sidebar, SidebarContent, SidebarProvider, SidebarTrigger, SidebarHeader, SidebarFooter, useSidebar,
} from '@/components/ui/sidebar';
import GroupedNav, { type NavEntry } from '@/components/shared/GroupedNav';
import { Button } from '@/components/ui/button';
import FloatingCalculator from '@/components/cashier/FloatingCalculator';
import ChatBot from '@/components/admin/ChatBot';
import SupportAssistant from '@/components/support/SupportAssistant';
import { useDeliverySettings } from '@/hooks/useDeliverySettings';
import { Bike } from 'lucide-react';
import SectionHelp from '@/components/shared/SectionHelp';
import ServiceBanner from '@/components/shared/ServiceBanner';
import ViewAsBanner from '@/components/shared/ViewAsBanner';
import { usePrivateTheme } from '@/hooks/usePrivateTheme';
import SupportNavBadge from '@/components/support/SupportNavBadge';

function navEntries(deliveryEnabled: boolean): NavEntry[] {
  return [
    { title: 'Mesas', url: '/cashier', icon: Grid3X3 },
    {
      title: 'Pedidos', icon: PhoneCall, items: [
        { title: 'Delivery propio', url: '/cashier/delivery-propio', icon: PhoneCall },
        ...(deliveryEnabled ? [{ title: 'Delivery por apps', url: '/cashier/delivery', icon: Bike }] : []),
        { title: 'Reservas', url: '/cashier/reservations', icon: CalendarCheck },
        { title: 'Monitoreo', url: '/cashier/monitor', icon: MonitorSpeaker },
      ],
    },
    {
      // De lo que más se usa en el turno a lo que menos.
      title: 'Caja', icon: Wallet, items: [
        { title: 'Costos y gastos', url: '/cashier/costos-gastos', icon: HandCoins },
        { title: 'Salidas e ingresos', url: '/cashier/expenses', icon: DollarSign },
        { title: 'Facturación', url: '/cashier/invoices', icon: FileText },
        { title: 'Resumen de turno', url: '/cashier/shift', icon: Receipt },
        { title: 'Caja', url: '/cashier/cash', icon: Wallet },
      ],
    },
    {
      title: 'Carta y precios', icon: UtensilsCrossed, items: [
        { title: 'Carta', url: '/cashier/menu', icon: UtensilsCrossed },
        { title: 'Precios y márgenes', url: '/cashier/costs', icon: Calculator },
        { title: 'Stock', url: '/cashier/stock', icon: Package },
      ],
    },
    {
      title: 'Ajustes', icon: LayoutGrid, items: [
        { title: 'Mesas y sectores', url: '/cashier/tables-config', icon: LayoutGrid },
        { title: 'Personal', url: '/cashier/staff', icon: Users },
        { title: 'Impresoras', url: '/cashier/impresoras', icon: Printer },
        { title: 'Auditoría', url: '/cashier/audit', icon: ScrollText },
      ],
    },
    {
      title: 'Mi cuenta Datta', icon: BadgeDollarSign, items: [
        { title: 'Suscripción', url: '/cashier/suscripcion', icon: BadgeDollarSign },
        { title: 'Inconvenientes', url: '/cashier/inconvenientes', icon: MessageSquareWarning, badge: (c) => <SupportNavBadge collapsed={c} /> },
      ],
    },
  ];
}

function SidebarNav() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const { signOut, viewAs } = useAuth();
  const { enabled: deliveryEnabled } = useDeliverySettings();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border p-5">
        {collapsed ? <span className="font-display text-xl font-bold text-sidebar-primary">d</span> : <h1 className="workspace-brand">datta</h1>}
      </SidebarHeader>
      <SidebarContent>
        <GroupedNav entries={navEntries(deliveryEnabled)} storageKey="datta.nav.cashier" />
      </SidebarContent>
      <SidebarFooter className="p-2">
        <Button variant="ghost" className="w-full justify-start gap-2 text-sidebar-foreground" onClick={signOut}>
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>{viewAs ? 'Cerrar vista' : 'Cerrar sesión'}</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}

export default function CashierLayout({ children }: { children: React.ReactNode }) {
  usePrivateTheme();
  const { viewAs } = useAuth();
  return (
    <SidebarProvider>
      <div className="workspace-shell flex min-h-screen w-full">
        <SidebarNav />
        <div className="flex min-w-0 flex-1 flex-col">
          <ViewAsBanner />
          <ServiceBanner />
          <header className="workspace-header">
            <SidebarTrigger />
            <span className="ml-3 text-sm font-medium text-muted-foreground">Caja</span>
            <span className="ml-2 flex items-center"><SectionHelp /></span>
            {!viewAs && <div className="ml-auto flex items-center gap-2"><SupportAssistant base="/cashier" /></div>}
          </header>
          <main className="workspace-main">{children}</main>
        </div>
      </div>
      {/* el asistente queda arriba de la calculadora para no taparse */}
      {!viewAs && <ChatBot bottomClass="bottom-24" />}
      <FloatingCalculator />
    </SidebarProvider>
  );
}
