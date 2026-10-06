import { Grid3X3, Receipt, FileText, DollarSign, LogOut, CalendarCheck, UtensilsCrossed, LayoutGrid, Users, MonitorSpeaker, Wallet, Calculator, Package, ScrollText } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/hooks/useAuth';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider,
  SidebarTrigger, SidebarHeader, SidebarFooter, useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import FloatingCalculator from '@/components/cashier/FloatingCalculator';
import ChatBot from '@/components/admin/ChatBot';
import { useDeliverySettings } from '@/hooks/useDeliverySettings';
import { Bike } from 'lucide-react';
import SectionHelp from '@/components/shared/SectionHelp';
import { usePrivateTheme } from '@/hooks/usePrivateTheme';

const operationItems = [
  { title: 'Mesas', url: '/cashier', icon: Grid3X3 },
  { title: 'Reservas', url: '/cashier/reservations', icon: CalendarCheck },
  { title: 'Monitoreo', url: '/cashier/monitor', icon: MonitorSpeaker },
  { title: 'Facturación', url: '/cashier/invoices', icon: FileText },
  { title: 'Salidas e Ingresos', url: '/cashier/expenses', icon: DollarSign },
  { title: 'Resumen de turno', url: '/cashier/shift', icon: Receipt },
];

const managementItems = [
  { title: 'Carta', url: '/cashier/menu', icon: UtensilsCrossed },
  { title: 'Mesas y sectores', url: '/cashier/tables-config', icon: LayoutGrid },
  { title: 'Personal', url: '/cashier/staff', icon: Users },
  { title: 'Caja', url: '/cashier/cash', icon: Wallet },
  { title: 'Precios y márgenes', url: '/cashier/costs', icon: Calculator },
  { title: 'Stock', url: '/cashier/stock', icon: Package },
  { title: 'Auditoría', url: '/cashier/audit', icon: ScrollText },
];

function SidebarNav() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const { signOut } = useAuth();
  const { enabled: deliveryEnabled } = useDeliverySettings();

  const opItems = deliveryEnabled
    ? [...operationItems.slice(0, 1), { title: 'Delivery', url: '/cashier/delivery', icon: Bike }, ...operationItems.slice(1)]
    : operationItems;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border p-5">
        {collapsed ? <span className="font-display text-xl font-bold text-sidebar-primary">d</span> : <h1 className="workspace-brand">datta</h1>}
      </SidebarHeader>
      <SidebarContent>
        {[{ label: 'Operación', items: opItems }, { label: 'Gestión', items: managementItems }].map(group => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map(item => (
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
        ))}
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

export default function CashierLayout({ children }: { children: React.ReactNode }) {
  usePrivateTheme();
  return (
    <SidebarProvider>
      <div className="workspace-shell flex min-h-screen w-full">
        <SidebarNav />
        <div className="flex-1 flex flex-col">
          <header className="workspace-header">
            <SidebarTrigger />
            <span className="ml-3 text-sm font-medium text-muted-foreground">Caja</span>
            <span className="ml-2 flex items-center"><SectionHelp /></span>
          </header>
          <main className="workspace-main">{children}</main>
        </div>
      </div>
      {/* el asistente queda arriba de la calculadora para no taparse */}
      <ChatBot bottomClass="bottom-24" />
      <FloatingCalculator />
    </SidebarProvider>
  );
}
