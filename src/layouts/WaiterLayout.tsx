import { Grid3X3, ClipboardList, CalendarDays, LogOut } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/hooks/useAuth';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider,
  SidebarTrigger, SidebarHeader, SidebarFooter, useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import SectionHelp from '@/components/shared/SectionHelp';
import { usePrivateTheme } from '@/hooks/usePrivateTheme';
import ViewAsBanner from '@/components/shared/ViewAsBanner';

const items = [
  { title: 'Mis Mesas', url: '/waiter', icon: Grid3X3 },
  { title: 'Pedidos', url: '/waiter/orders', icon: ClipboardList },
  { title: 'Reservas', url: '/waiter/reservations', icon: CalendarDays },
];

function SidebarNav() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const { signOut, viewAs } = useAuth();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border p-5">
        {collapsed ? <span className="font-display text-xl font-bold text-sidebar-primary">d</span> : <h1 className="workspace-brand">datta</h1>}
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Mesero</SidebarGroupLabel>
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
          {!collapsed && <span>{viewAs ? 'Cerrar vista' : 'Cerrar sesión'}</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}

export default function WaiterLayout({ children }: { children: React.ReactNode }) {
  usePrivateTheme();
  return (
    <SidebarProvider>
      <div className="workspace-shell flex min-h-screen w-full">
        <SidebarNav />
        <div className="flex-1 flex flex-col">
          <ViewAsBanner />
          <header className="workspace-header">
            <SidebarTrigger />
            <span className="ml-3 text-sm font-medium text-muted-foreground">Mesero</span>
            <span className="ml-2 flex items-center"><SectionHelp /></span>
          </header>
          <main className="workspace-main">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
