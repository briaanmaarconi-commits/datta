import { LayoutDashboard, Building2, Users, BarChart3, LogOut, Monitor, Wallet, CreditCard, ContactRound } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/hooks/useAuth';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider,
  SidebarTrigger, SidebarHeader, SidebarFooter, useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { usePrivateTheme } from '@/hooks/usePrivateTheme';

const items = [
  { title: 'Dashboard', url: '/superadmin', icon: LayoutDashboard },
  { title: 'Posibles clientes', url: '/superadmin/prospects', icon: ContactRound },
  { title: 'Clientes', url: '/superadmin/clients', icon: Building2 },
  { title: 'Usuarios', url: '/superadmin/users', icon: Users },
  { title: 'Monitoreo', url: '/superadmin/monitor', icon: Monitor },
  { title: 'Analíticas', url: '/superadmin/analytics', icon: BarChart3 },
  { title: 'Caja', url: '/superadmin/cash', icon: Wallet },
  { title: 'Planes', url: '/superadmin/plans', icon: CreditCard },
];

function SidebarNav() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const { signOut } = useAuth();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border p-5">
        {collapsed ? <span className="font-display text-xl font-bold text-sidebar-primary">d</span> : <h1 className="workspace-brand">datta</h1>}
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Gestión Datta</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map(item => (
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

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  usePrivateTheme();
  return (
    <SidebarProvider>
      <div className="workspace-shell flex min-h-screen w-full">
        <SidebarNav />
        <div className="flex-1 flex flex-col">
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
