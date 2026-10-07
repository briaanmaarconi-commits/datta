import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, useSidebar,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

type Icon = ComponentType<{ className?: string }>;
export interface NavLeaf { title: string; url: string; icon: Icon; badge?: (collapsed: boolean) => ReactNode }
export interface NavGroup { title: string; icon: Icon; items: NavLeaf[] }
export type NavEntry = NavLeaf | NavGroup;

const isGroup = (e: NavEntry): e is NavGroup => 'items' in e;

/**
 * Barra lateral agrupada: secciones sueltas y grupos que se despliegan hacia abajo.
 * El grupo de la página actual se abre solo; lo que el usuario abre o cierra se recuerda en esta PC.
 */
export default function GroupedNav({ entries, storageKey }: { entries: NavEntry[]; storageKey: string }) {
  const { state, setOpen, isMobile } = useSidebar();
  const collapsed = state === 'collapsed' && !isMobile;
  const { pathname } = useLocation();

  const [open, setOpenGroups] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) ?? '{}');
    } catch {
      return {};
    }
  });
  const toggle = (title: string, value: boolean) => setOpenGroups(prev => {
    const next = { ...prev, [title]: value };
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* sin almacenamiento: se recuerda solo mientras la pestaña esté abierta */
    }
    return next;
  });

  // Al entrar a una página, su grupo queda abierto.
  useEffect(() => {
    const active = entries.find(e => isGroup(e) && e.items.some(i => i.url === pathname));
    if (active && !open[active.title]) toggle(active.title, true);
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {entries.map(entry => {
            if (!isGroup(entry)) {
              return (
                <SidebarMenuItem key={entry.url}>
                  <SidebarMenuButton asChild isActive={pathname === entry.url} tooltip={entry.title}>
                    <NavLink to={entry.url} end>
                      <entry.icon className="h-4 w-4" />
                      {!collapsed && <span>{entry.title}</span>}
                      {entry.badge?.(collapsed)}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            }
            const hasActive = entry.items.some(i => i.url === pathname);
            const isOpen = !!open[entry.title];
            const badges = entry.items.filter(i => i.badge);
            return (
              <Collapsible key={entry.title} open={isOpen} onOpenChange={v => toggle(entry.title, v)} asChild>
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      isActive={hasActive && (collapsed || !isOpen)}
                      tooltip={entry.title}
                      // Con la barra achicada (solo íconos), tocar el grupo la agranda y lo abre.
                      onClick={collapsed ? (ev) => { ev.preventDefault(); setOpen(true); toggle(entry.title, true); } : undefined}
                    >
                      <entry.icon className="h-4 w-4" />
                      {!collapsed && <span className="flex-1">{entry.title}</span>}
                      {/* El aviso de algo sin leer se ve también con el grupo cerrado. */}
                      {(!isOpen || collapsed) && badges.map(b => <span key={b.url} className="contents">{b.badge?.(collapsed)}</span>)}
                      {!collapsed && <ChevronDown className={cn('h-4 w-4 shrink-0 opacity-60 transition-transform', isOpen && 'rotate-180')} />}
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {entry.items.map(item => (
                        <SidebarMenuSubItem key={item.url} className="relative">
                          <SidebarMenuSubButton asChild isActive={pathname === item.url}>
                            <NavLink to={item.url} end>
                              <item.icon className="h-4 w-4" />
                              <span className="flex-1">{item.title}</span>
                              {item.badge?.(false)}
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
