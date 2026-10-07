import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Archive, ArrowLeft, CheckCircle2, Clock, Inbox, Loader2, Mail, MailOpen, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/db';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import TicketThread from '@/components/support/TicketThread';
import { STATUS_CLASS, STATUS_LABEL, SUPPORT_KEY, useSupportRealtime, type SupportTicket, type TicketStatus } from '@/lib/support';

type Folder = 'inbox' | TicketStatus | 'all';

const FOLDERS: { id: Folder; label: string }[] = [
  { id: 'inbox', label: 'Bandeja' },
  { id: 'new', label: 'Nuevos' },
  { id: 'in_progress', label: 'En revisión' },
  { id: 'resolved', label: 'Resueltos' },
  { id: 'archived', label: 'Archivados' },
  { id: 'all', label: 'Todos' },
];

const INBOX_KEY = [...SUPPORT_KEY, 'inbox'];

const inFolder = (t: SupportTicket, f: Folder) =>
  f === 'all' ? true : f === 'inbox' ? t.status === 'new' || t.status === 'in_progress' : t.status === f;

/** Bandeja de inconvenientes de todos los clientes: gestión de a uno o en bloque, y respuesta al cliente. */
export default function SuperAdminSupport() {
  const queryClient = useQueryClient();
  const [folder, setFolder] = useState<Folder>('inbox');
  const [client, setClient] = useState('all');
  const [search, setSearch] = useState('');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useSupportRealtime();

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: INBOX_KEY,
    queryFn: async () => {
      const { data, error } = await db
        .from('support_tickets')
        .select('*, establishments(name), profiles:created_by(full_name, email)')
        .order('last_message_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as SupportTicket[];
    },
  });

  const clients = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tickets) m.set(t.establishment_id, t.establishments?.name ?? 'Local');
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [tickets]);

  // Carpetas abiertas: cuentan los no leídos. Cerradas: el total.
  const counts = useMemo(() => {
    const c = {} as Record<Folder, number>;
    for (const f of FOLDERS) {
      const open = f.id === 'inbox' || f.id === 'new' || f.id === 'in_progress';
      c[f.id] = tickets.filter((t) => inFolder(t, f.id) && (!open || !t.is_read)).length;
    }
    return c;
  }, [tickets]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((t) =>
      inFolder(t, folder)
      && (client === 'all' || t.establishment_id === client)
      && (!q || [t.title, t.description, t.establishments?.name, t.profiles?.full_name, t.profiles?.email]
        .some((s) => s?.toLowerCase().includes(q))));
  }, [tickets, folder, client, search]);

  // La selección solo conserva lo que sigue visible (al cambiar de carpeta o filtrar).
  useEffect(() => {
    setChecked((prev) => {
      const ids = new Set(visible.map((t) => t.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [visible]);

  const opened = tickets.find((t) => t.id === openId) ?? null;

  // Abrir un inconveniente lo marca como leído.
  useEffect(() => {
    if (!opened || opened.is_read) return;
    void db.from('support_tickets').update({ is_read: true }).eq('id', opened.id)
      .then(() => queryClient.invalidateQueries({ queryKey: SUPPORT_KEY }));
  }, [opened?.id, opened?.is_read, queryClient]);

  const allChecked = visible.length > 0 && visible.every((t) => checked.has(t.id));
  const someChecked = checked.size > 0 && !allChecked;

  function toggle(id: string, on: boolean) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  }

  async function apply(ids: string[], values: Partial<Pick<SupportTicket, 'status' | 'is_read'>>, done: string) {
    if (!ids.length) return;
    setBusy(true);
    // Se ve el cambio al instante; si falla, la recarga lo revierte.
    queryClient.setQueryData<SupportTicket[]>(INBOX_KEY, (old = []) => old.map((t) => (ids.includes(t.id) ? { ...t, ...values } : t)));
    const { error } = await db.from('support_tickets').update(values).in('id', ids);
    setBusy(false);
    if (error) {
      toast.error(error.message || 'No se pudo actualizar');
      queryClient.invalidateQueries({ queryKey: SUPPORT_KEY });
      return;
    }
    toast.success(done);
    setChecked(new Set());
    queryClient.invalidateQueries({ queryKey: SUPPORT_KEY });
  }

  async function remove(ids: string[]) {
    setBusy(true);
    const { error } = await db.from('support_tickets').delete().in('id', ids);
    setBusy(false);
    setConfirmDelete(false);
    if (error) {
      toast.error(error.message || 'No se pudo eliminar');
      return;
    }
    queryClient.setQueryData<SupportTicket[]>(INBOX_KEY, (old = []) => old.filter((t) => !ids.includes(t.id)));
    toast.success(ids.length === 1 ? 'Inconveniente eliminado' : `${ids.length} inconvenientes eliminados`);
    setChecked(new Set());
    if (openId && ids.includes(openId)) setOpenId(null);
    queryClient.invalidateQueries({ queryKey: SUPPORT_KEY });
  }

  const selectedIds = [...checked];
  const plural = (n: number) => (n === 1 ? '1 inconveniente' : `${n} inconvenientes`);
  const bulk: { icon: typeof Mail; label: string; run: () => void }[] = [
    { icon: MailOpen, label: 'Marcar como leído', run: () => apply(selectedIds, { is_read: true }, `${plural(selectedIds.length)} marcados como leídos`) },
    { icon: Mail, label: 'Marcar como no leído', run: () => apply(selectedIds, { is_read: false }, `${plural(selectedIds.length)} marcados como no leídos`) },
    { icon: Clock, label: 'Pasar a En revisión', run: () => apply(selectedIds, { status: 'in_progress', is_read: true }, `${plural(selectedIds.length)} en revisión`) },
    { icon: CheckCircle2, label: 'Marcar como resuelto', run: () => apply(selectedIds, { status: 'resolved', is_read: true }, `${plural(selectedIds.length)} resueltos`) },
    { icon: Archive, label: 'Archivar', run: () => apply(selectedIds, { status: 'archived', is_read: true }, `${plural(selectedIds.length)} archivados`) },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Inconvenientes</h1>
        <p className="mt-1 text-muted-foreground">Problemas reportados por los clientes. Gestionalos de a uno o seleccioná varios.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FOLDERS.map((f) => (
          <Button
            key={f.id}
            size="sm"
            variant={folder === f.id ? 'default' : 'outline'}
            onClick={() => { setFolder(f.id); setOpenId(null); }}
            className="gap-2"
          >
            {f.label}
            {counts[f.id] > 0 && (
              <span className={cn('rounded-full px-1.5 text-xs', folder === f.id ? 'bg-primary-foreground/20' : 'bg-muted')}>{counts[f.id]}</span>
            )}
          </Button>
        ))}
      </div>

      <div className="grid overflow-hidden rounded-xl border bg-card lg:h-[calc(100vh-17rem)] lg:min-h-[520px] lg:grid-cols-[minmax(320px,440px)_1fr]">
        <div className={cn('flex min-h-0 flex-col border-b lg:border-b-0 lg:border-r', opened && 'hidden lg:flex')}>
          <div className="space-y-2 border-b p-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar" className="pl-8" />
              </div>
              <Select value={client} onValueChange={setClient}>
                <SelectTrigger className="w-[150px]"><SelectValue placeholder="Cliente" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los clientes</SelectItem>
                  {clients.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-h-9 items-center gap-1">
              <Checkbox
                aria-label="Seleccionar todos"
                className="mx-1.5"
                checked={allChecked ? true : someChecked ? 'indeterminate' : false}
                onCheckedChange={(v) => setChecked(v === true ? new Set(visible.map((t) => t.id)) : new Set())}
                disabled={!visible.length}
              />
              {checked.size > 0 ? (
                <>
                  <span className="mr-1 text-sm text-muted-foreground">{checked.size}</span>
                  {bulk.map((b) => (
                    <Tooltip key={b.label}>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={busy} onClick={b.run} aria-label={b.label}>
                          <b.icon className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{b.label}</TooltipContent>
                    </Tooltip>
                  ))}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" disabled={busy} onClick={() => setConfirmDelete(true)} aria-label="Eliminar">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Eliminar</TooltipContent>
                  </Tooltip>
                  {busy && <Loader2 className="ml-1 h-4 w-4 animate-spin text-muted-foreground" />}
                </>
              ) : (
                <span className="text-sm text-muted-foreground">{visible.length} {visible.length === 1 ? 'inconveniente' : 'inconvenientes'}</span>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : visible.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
                <Inbox className="h-10 w-10" />
                <p>No hay inconvenientes acá</p>
              </div>
            ) : (
              <ul>
                {visible.map((t) => (
                  <li
                    key={t.id}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 border-b px-3 py-3 transition-colors hover:bg-muted/60',
                      t.id === openId && 'bg-muted',
                      checked.has(t.id) && 'bg-primary/5',
                    )}
                    onClick={() => setOpenId(t.id)}
                  >
                    <Checkbox
                      aria-label={`Seleccionar ${t.title}`}
                      className="mx-1.5 mt-0.5"
                      checked={checked.has(t.id)}
                      onClick={(e) => e.stopPropagation()}
                      onCheckedChange={(v) => toggle(t.id, v === true)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {!t.is_read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="No leído" />}
                        <span className={cn('min-w-0 flex-1 truncate text-sm', !t.is_read ? 'font-semibold' : 'text-muted-foreground')}>
                          {t.establishments?.name ?? 'Local'}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">{formatDistanceToNow(new Date(t.last_message_at), { locale: es })}</span>
                      </div>
                      <div className={cn('truncate text-sm', !t.is_read && 'font-semibold')}>{t.title}</div>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge variant="outline" className={cn('text-[11px]', STATUS_CLASS[t.status])}>{STATUS_LABEL[t.status]}</Badge>
                        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{t.description}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className={cn('min-h-0', !opened && 'hidden lg:block')}>
          {opened ? (
            <div className="flex h-full min-h-[560px] flex-col lg:min-h-0">
              <div className="border-b p-2 lg:hidden">
                <Button variant="ghost" size="sm" className="gap-2" onClick={() => setOpenId(null)}>
                  <ArrowLeft className="h-4 w-4" /> Volver
                </Button>
              </div>
              <div className="min-h-0 flex-1">
                <TicketThread
                  key={opened.id}
                  ticket={opened}
                  viewer="datta"
                  actions={
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={opened.status}
                        onValueChange={(v) => apply([opened.id], { status: v as TicketStatus }, `Estado: ${STATUS_LABEL[v as TicketStatus]}`)}
                      >
                        <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(STATUS_LABEL) as TicketStatus[]).map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button variant="outline" size="sm" className="gap-2" disabled={busy}
                        onClick={() => { void apply([opened.id], { is_read: false }, 'Marcado como no leído'); setOpenId(null); }}>
                        <Mail className="h-4 w-4" /> No leído
                      </Button>
                      <Button variant="outline" size="sm" className="gap-2 text-destructive" disabled={busy}
                        onClick={() => { setChecked(new Set([opened.id])); setConfirmDelete(true); }}>
                        <Trash2 className="h-4 w-4" /> Eliminar
                      </Button>
                    </div>
                  }
                />
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-10 text-center text-muted-foreground">
              <Inbox className="h-10 w-10" />
              <p>Elegí un inconveniente para leerlo y responder</p>
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {plural(checked.size)}?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borran junto con toda su conversación y el cliente deja de verlos. No se puede deshacer. Si solo querés sacarlos de la bandeja, usá Archivar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => remove(selectedIds)}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
