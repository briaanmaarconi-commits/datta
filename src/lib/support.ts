import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';

// Inconvenientes: los locales los reportan y el superadmin los gestiona (ver backend/sql/107_support_tickets.sql).

export type TicketStatus = 'new' | 'in_progress' | 'resolved' | 'archived';

export interface SupportTicket {
  id: string;
  establishment_id: string;
  created_by: string | null;
  title: string;
  description: string;
  status: TicketStatus;
  is_read: boolean;
  client_unread: boolean;
  last_message_at: string;
  resolved_at: string | null;
  created_at: string;
  establishments?: { name: string } | null;
  profiles?: { full_name: string | null; email: string | null } | null;
}

export interface SupportMessage {
  id: string;
  ticket_id: string;
  author_id: string | null;
  from_datta: boolean;
  body: string;
  created_at: string;
  profiles?: { full_name: string | null; email: string | null } | null;
}

export const TITLE_MIN = 5;
export const TITLE_MAX = 120;
export const DESCRIPTION_MIN = 30;
export const DESCRIPTION_MAX = 5000;

export const STATUS_LABEL: Record<TicketStatus, string> = {
  new: 'Nuevo',
  in_progress: 'En revisión',
  resolved: 'Resuelto',
  archived: 'Archivado',
};

export const STATUS_CLASS: Record<TicketStatus, string> = {
  new: 'bg-primary/10 text-primary border-primary/30',
  in_progress: 'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400',
  resolved: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400',
  archived: 'bg-muted text-muted-foreground border-border',
};

export const SUPPORT_KEY = ['support'] as const;

/** Refresca todo lo de inconvenientes cuando cambia un ticket o llega un mensaje. */
export function useSupportRealtime() {
  const { role, establishmentId } = useAuth();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!role || (role !== 'superadmin' && !establishmentId)) return;
    const filter = role === 'superadmin' ? undefined : `establishment_id=eq.${establishmentId}`;
    const refresh = () => queryClient.invalidateQueries({ queryKey: SUPPORT_KEY });
    const channel = db
      .channel(`support-${role}-${establishmentId ?? 'all'}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets', filter }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_ticket_messages', filter }, refresh)
      .subscribe();
    return () => {
      db.removeChannel(channel);
    };
  }, [role, establishmentId, queryClient]);
}

/**
 * Cantidad de inconvenientes con algo pendiente de leer:
 * para Datta, los que no abrió; para el local, los que tienen una respuesta nueva de Datta.
 */
export function useSupportUnread() {
  const { role, establishmentId } = useAuth();
  const isDatta = role === 'superadmin';
  useSupportRealtime();
  const { data = 0 } = useQuery({
    queryKey: [...SUPPORT_KEY, 'unread', role, establishmentId],
    enabled: isDatta || !!establishmentId,
    queryFn: async () => {
      let q = db.from('support_tickets').select('id', { count: 'exact', head: true });
      q = isDatta
        ? q.eq('is_read', false).neq('status', 'archived')
        : q.eq('establishment_id', establishmentId!).eq('client_unread', true);
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 120_000,
  });
  return data;
}
