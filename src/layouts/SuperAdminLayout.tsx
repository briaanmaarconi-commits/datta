import { LayoutDashboard, Building2, Users, BarChart3, LogOut, Monitor, Wallet, CreditCard, Receipt, MessageSquareWarning, FileText, ContactRound } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  Sidebar, SidebarContent, SidebarProvider, SidebarTrigger, SidebarHeader, SidebarFooter, useSidebar,
} from '@/components/ui/sidebar';
import GroupedNav, { type NavEntry } from '@/components/shared/GroupedNav';
import { Button } from '@/components/ui/button';
import { usePrivateTheme } from '@/hooks/usePrivateTheme';
import SupportNavBadge from '@/components/support/SupportNavBadge';

const entries: NavEntry[] = [
  { title: 'Inicio', url: '/superadmin', icon: LayoutDashboard },
  {
    title: 'Clientes', icon: Building2, items: [
      { title: 'Posibles clientes', url: '/superadmin/prospects', icon: ContactRound },
      { title: 'Clientes', url: '/superadmin/clients', icon: Building2 },
      { title: 'Usuarios', url: '/superadmin/users', icon: Users },
      { title: 'Monitoreo', url: '/superadmin/monitor', icon: Monitor },
    ],
  },
  {
    title: 'Cobros y facturación', icon: Receipt, items: [
      { title: 'Cobranzas', url: '/superadmin/billing', icon: Receipt },
      { title: 'Facturación Datta', url: '/superadmin/facturacion', icon: FileText },
      { title: 'Planes', url: '/superadmin/plans', icon: CreditCard },
      { title: 'Caja', url: '/superadmin/cash', icon: Wallet },
    ],
  },
  { title: 'Estadísticas', url: '/superadmin/analytics', icon: BarChart3 },
  { title: 'Inconvenientes', url: '/superadmin/inconvenientes', icon: MessageSquareWarning, badge: (c) => <SupportNavBadge collapsed={c} /> },
];

function SidebarNav() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const { signOut } = useAuth();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border p-5">
        {collapsed ? <span className="font-display text-xl font-bold text-sidebar-primary">d</span> : <h1 className="workspace-brand">datta</h1>}
      </SidebarHeader>
      <SidebarContent>
        <GroupedNav entries={entries} storageKey="datta.nav.superadmin" />
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

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  usePrivateTheme();
  return (
    <SidebarProvider>
      <div className="workspace-shell flex min-h-screen w-full">
        <SidebarNav />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="workspace-header">
            <SidebarTrigger />
            <span className="ml-3 text-sm font-medium text-muted-foreground">Datta</span>
          </header>
          <main className="workspace-main">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
