import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, CalendarDays, MapPin, Phone, Pencil, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/useAuth';
import { toArgDate } from '@/lib/utils';
import {
  ACTIVITY_KINDS, ACTIVITY_STATUSES, PROSPECT_STATUSES,
  agendaMatches, fromArgentinaInput, toArgentinaInput, whatsappUrl,
} from '@/lib/prospects';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type Prospect = Tables<'sales_prospects'>;
type Activity = Tables<'sales_prospect_activities'>;
type ProspectForm = Pick<Prospect, 'name' | 'phone' | 'address' | 'description' | 'status'> & { id?: string };
type ActivityForm = Pick<Activity, 'prospect_id' | 'kind' | 'status' | 'notes'> & { id?: string; date: string };
const blankProspect = (): ProspectForm => ({ name: '', phone: '', address: '', description: '', status: 'pending' });
const selectClass = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';
const dateLabel = (value: string) => new Date(value).toLocaleString('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short',
});
const labelFor = (labels: Record<string, string>, value: string) => labels[value] || value;

// Fetch every page: PostgREST otherwise silently limits results to 1,000 rows.
async function fetchProspects() {
  const result: Prospect[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('sales_prospects').select('*')
      .order('name').order('id').range(offset, offset + 499);
    if (error) throw error;
    result.push(...data);
    if (data.length < 500) return result;
  }
}
async function fetchActivities() {
  const result: Activity[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('sales_prospect_activities').select('*')
      .order('scheduled_at').order('id').range(offset, offset + 499);
    if (error) throw error;
    result.push(...data);
    if (data.length < 500) return result;
  }
}

export default function SuperAdminProspects() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const enabled = !!user && role === 'superadmin';
  const queryKey = ['sa-prospects', user?.id];
  const prospectsQuery = useQuery({
    queryKey: [...queryKey, 'restaurants'], queryFn: fetchProspects, enabled, refetchInterval: 60_000,
  });
  const activitiesQuery = useQuery({
    queryKey: [...queryKey, 'activities'], queryFn: fetchActivities, enabled, refetchInterval: 60_000,
  });
  const prospects = prospectsQuery.data ?? [];
  const activities = activitiesQuery.data ?? [];
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [agendaFilter, setAgendaFilter] = useState('pending');
  const [day, setDay] = useState(toArgDate());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [prospectForm, setProspectForm] = useState<ProspectForm | null>(null);
  const [activityForm, setActivityForm] = useState<ActivityForm | null>(null);
  const detail = prospects.find(p => p.id === detailId);
  const invalidate = () => queryClient.invalidateQueries({ queryKey });
  const showError = () => toast.error('No se pudo guardar. Tus datos siguen en el formulario; intentá nuevamente.');

  const saveProspect = useMutation({
    mutationFn: async (form: ProspectForm) => {
      if (!enabled) throw new Error('No autorizado');
      const { id, ...fields } = form;
      const payload = { ...fields, name: fields.name.trim(), phone: fields.phone.trim(), address: fields.address.trim() };
      if (!payload.name) throw new Error('Ingresá el nombre del restaurante');
      const response = id
        ? await supabase.from('sales_prospects').update(payload).eq('id', id).select('id').single()
        : await supabase.from('sales_prospects').insert(payload).select('id').single();
      if (response.error) throw response.error;
      return response.data.id;
    },
    onSuccess: async (id) => {
      await invalidate();
      setProspectForm(null);
      setDetailId(id);
      toast.success('Restaurante guardado');
    },
    onError: showError,
  });

  const saveActivity = useMutation({
    mutationFn: async (form: ActivityForm) => {
      if (!enabled) throw new Error('No autorizado');
      const { id, date, ...fields } = form;
      const scheduled_at = fromArgentinaInput(date);
      if (fields.status === 'completed' && new Date(scheduled_at).getTime() > Date.now()) {
        throw new Error('Una visita realizada no puede tener una fecha futura');
      }
      const payload = { ...fields, scheduled_at };
      const response = id
        ? await supabase.from('sales_prospect_activities').update(payload).eq('id', id).select('id').single()
        : await supabase.from('sales_prospect_activities').insert(payload).select('id').single();
      if (response.error) throw response.error;
    },
    onSuccess: async () => {
      await invalidate();
      setActivityForm(null);
      toast.success('Seguimiento guardado');
    },
    onError: (error: Error) => {
      if (error.message === 'Una visita realizada no puede tener una fecha futura' ||
          error.message === 'Ingresá una fecha y hora válidas') toast.error(error.message);
      else showError();
    },
  });

  function newActivity(prospectId: string, completed = false) {
    setActivityForm({ prospect_id: prospectId, kind: 'visit', status: completed ? 'completed' : 'pending', date: toArgentinaInput(), notes: '' });
  }
  function editActivity(activity: Activity) {
    setActivityForm({
      id: activity.id, prospect_id: activity.prospect_id, kind: activity.kind,
      status: activity.status, date: toArgentinaInput(activity.scheduled_at), notes: activity.notes,
    });
  }

  const filtered = prospects.filter(p => (status === 'all' || p.status === status) &&
    [p.name, p.phone, p.address, p.description].some(value => value.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())));
  const visibleIds = new Set(filtered.map(p => p.id));
  const agenda = activities.filter(a => visibleIds.has(a.prospect_id) && agendaMatches(a, agendaFilter, day))
    .sort((a, b) => agendaFilter === 'completed' || agendaFilter === 'cancelled'
      ? b.scheduled_at.localeCompare(a.scheduled_at) : a.scheduled_at.localeCompare(b.scheduled_at));
  const history = activities.filter(a => a.prospect_id === detailId)
    .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));
  const nextActivity = (id: string) => activities.find(a => a.prospect_id === id && a.status === 'pending');
  const pending = activities.filter(a => a.status === 'pending');
  const overdue = pending.filter(a => agendaMatches(a, 'overdue', day)).length;
  const today = pending.filter(a => agendaMatches(a, 'today', day)).length;

  function activityCard(activity: Activity, showRestaurant = false) {
    const restaurant = prospects.find(p => p.id === activity.prospect_id);
    const late = agendaMatches(activity, 'overdue', day);
    return (
      <div key={activity.id} className="rounded-lg border bg-card p-4 space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            {showRestaurant && <Button variant="link" className="h-auto p-0 text-base" onClick={() => setDetailId(activity.prospect_id)}>{restaurant?.name || 'Restaurante'}</Button>}
            <p className="font-medium">{labelFor(ACTIVITY_KINDS, activity.kind)} · {dateLabel(activity.scheduled_at)}</p>
            {showRestaurant && restaurant?.address && <p className="text-sm text-muted-foreground">{restaurant.address}</p>}
          </div>
          <Badge variant={late ? 'destructive' : 'secondary'}>{late ? 'Atrasada' : labelFor(ACTIVITY_STATUSES, activity.status)}</Badge>
        </div>
        {activity.notes && <p className="whitespace-pre-wrap break-words text-sm">{activity.notes}</p>}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => editActivity(activity)}>Editar seguimiento</Button>
          {activity.status === 'pending' && <Button size="sm" onClick={() => setActivityForm({
            id: activity.id, prospect_id: activity.prospect_id, kind: activity.kind,
            status: 'completed', date: toArgentinaInput(), notes: activity.notes,
          })}>Registrar resultado</Button>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Posibles clientes</h1>
          <p className="mt-1 text-muted-foreground">Restaurantes, visitas y próximos contactos de Datta.</p>
        </div>
        <Button onClick={() => setProspectForm(blankProspect())}><Plus className="mr-2 h-4 w-4" />Nuevo restaurante</Button>
      </div>

      {(prospectsQuery.isError || activitiesQuery.isError) ? (
        <Card><CardContent className="space-y-3 pt-6" role="alert">
          <p>No se pudieron cargar los restaurantes o sus seguimientos.</p>
          <Button variant="outline" onClick={() => { void prospectsQuery.refetch(); void activitiesQuery.refetch(); }}>Reintentar</Button>
        </CardContent></Card>
      ) : (prospectsQuery.isPending || activitiesQuery.isPending) ? <p role="status">Cargando posibles clientes…</p> : <>
        <div className="grid gap-3 sm:grid-cols-3">
          {[['Restaurantes registrados', prospects.length], ['Contactos para hoy', today], ['Seguimientos atrasados', overdue]].map(([label, count]) => (
            <Card key={label}><CardContent className="pt-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-3xl font-semibold">{count}</p></CardContent></Card>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="prospect-search">Buscar restaurante, celular o dirección</Label>
            <Input id="prospect-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar…" /></div>
          <div className="space-y-1"><Label htmlFor="prospect-filter">Estado del restaurante</Label>
            <select id="prospect-filter" className={selectClass} value={status} onChange={e => setStatus(e.target.value)}>
              <option value="all">Todos los estados</option>
              {Object.entries(PROSPECT_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></div>
        </div>
        <Tabs defaultValue="restaurants">
          <TabsList><TabsTrigger value="restaurants">Restaurantes</TabsTrigger><TabsTrigger value="agenda"><CalendarDays className="mr-2 h-4 w-4" />Agenda</TabsTrigger></TabsList>
          <TabsContent value="restaurants" className="space-y-3">
            {!filtered.length && <Card><CardContent className="py-8 text-center text-muted-foreground">{prospects.length ? 'No hay restaurantes con esos filtros.' : 'Agregá tu primer restaurante para empezar el seguimiento.'}</CardContent></Card>}
            <div className="grid gap-4 lg:grid-cols-2">
              {filtered.map(p => {
                const next = nextActivity(p.id);
                const whatsapp = whatsappUrl(p.phone);
                return <Card key={p.id}><CardContent className="space-y-3 pt-5">
                  <div className="flex flex-wrap items-start justify-between gap-2"><h2 className="text-lg font-semibold break-words">{p.name}</h2><Badge variant="secondary">{labelFor(PROSPECT_STATUSES, p.status)}</Badge></div>
                  <p className="flex items-start gap-2 text-sm text-muted-foreground"><MapPin className="h-4 w-4 shrink-0" />{p.address || 'Sin dirección'}</p>
                  <p className="flex items-center gap-2 text-sm"><Phone className="h-4 w-4" />{p.phone || 'Sin celular'}</p>
                  {p.description && <p className="line-clamp-2 whitespace-pre-wrap break-words text-sm">{p.description}</p>}
                  <p className="text-sm">{next ? 'Próximo pendiente: ' + dateLabel(next.scheduled_at) : 'Sin próximo contacto agendado'}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setDetailId(p.id)}>Ver ficha e historial</Button>
                    <Button size="sm" onClick={() => newActivity(p.id)}>Agendar</Button>
                    {whatsapp && <Button size="sm" variant="outline" asChild><a href={whatsapp} target="_blank" rel="noopener noreferrer" aria-label={'Abrir WhatsApp de ' + p.name}><MessageCircle className="mr-1 h-4 w-4" />WhatsApp</a></Button>}
                  </div>
                </CardContent></Card>;
              })}
            </div>
          </TabsContent>
          <TabsContent value="agenda" className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1"><Label htmlFor="agenda-filter">Mostrar contactos</Label>
                <select id="agenda-filter" className={selectClass} value={agendaFilter} onChange={e => setAgendaFilter(e.target.value)}>
                  <option value="pending">Todos los pendientes</option><option value="today">Hoy</option>
                  <option value="overdue">Atrasados</option><option value="day">Elegir día</option>
                  <option value="completed">Realizados</option><option value="cancelled">Cancelados</option>
                </select></div>
              {agendaFilter === 'day' && <div className="space-y-1"><Label htmlFor="agenda-day">Día</Label><Input id="agenda-day" type="date" value={day} onChange={e => setDay(e.target.value)} /></div>}
              <p className="pb-2 text-xs text-muted-foreground">Fechas y horarios de Argentina.</p>
            </div>
            {!agenda.length && <p className="py-8 text-center text-muted-foreground">No hay contactos para esta selección.</p>}
            {agenda.map(a => activityCard(a, true))}
          </TabsContent>
        </Tabs>
      </>}

      <Dialog open={!!detail} onOpenChange={open => { if (!open) setDetailId(null); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{detail?.name}</DialogTitle><DialogDescription>Datos e historial comercial del restaurante.</DialogDescription></DialogHeader>
          {detail && <div className="space-y-4">
            <Badge variant="secondary">{labelFor(PROSPECT_STATUSES, detail.status)}</Badge>
            <p className="text-sm">{detail.phone || 'Sin celular'} · {detail.address || 'Sin dirección'}</p>
            <p className="whitespace-pre-wrap break-words text-sm">{detail.description || 'Sin descripción'}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setProspectForm({ id: detail.id, name: detail.name, phone: detail.phone, address: detail.address, description: detail.description, status: detail.status })}><Pencil className="mr-2 h-4 w-4" />Editar ficha</Button>
              <Button onClick={() => newActivity(detail.id)}>Agendar contacto</Button>
              <Button variant="outline" onClick={() => newActivity(detail.id, true)}>Registrar visita realizada</Button>
            </div>
            <h3 className="font-semibold">Historial y próximos contactos</h3>
            {!history.length && <p className="text-sm text-muted-foreground">Todavía no hay visitas ni contactos registrados.</p>}
            {history.map(a => activityCard(a))}
          </div>}
        </DialogContent>
      </Dialog>

      <Dialog open={!!prospectForm} onOpenChange={open => { if (!open && !saveProspect.isPending) setProspectForm(null); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>{prospectForm?.id ? 'Editar restaurante' : 'Nuevo restaurante'}</DialogTitle><DialogDescription>Guardá la información para el seguimiento comercial.</DialogDescription></DialogHeader>
          {prospectForm && <form onSubmit={e => { e.preventDefault(); saveProspect.mutate(prospectForm); }}>
            <fieldset disabled={saveProspect.isPending} className="space-y-4">
              <div className="space-y-1"><Label htmlFor="lead-name">Nombre del restaurante *</Label><Input id="lead-name" required maxLength={200} value={prospectForm.name} onChange={e => setProspectForm({ ...prospectForm, name: e.target.value })} /></div>
              <div className="space-y-1"><Label htmlFor="lead-phone">Celular</Label><Input id="lead-phone" type="tel" maxLength={40} placeholder="+54 9 2284 123456" value={prospectForm.phone} onChange={e => setProspectForm({ ...prospectForm, phone: e.target.value })} /><p className="text-xs text-muted-foreground">Incluí el código de país para abrir WhatsApp.</p></div>
              <div className="space-y-1"><Label htmlFor="lead-address">Dirección</Label><Input id="lead-address" maxLength={500} value={prospectForm.address} onChange={e => setProspectForm({ ...prospectForm, address: e.target.value })} /></div>
              <div className="space-y-1"><Label htmlFor="lead-description">Descripción</Label><Textarea id="lead-description" maxLength={5000} rows={4} value={prospectForm.description} onChange={e => setProspectForm({ ...prospectForm, description: e.target.value })} /></div>
              <div className="space-y-1"><Label htmlFor="lead-status">Estado</Label><select id="lead-status" className={selectClass} value={prospectForm.status} onChange={e => setProspectForm({ ...prospectForm, status: e.target.value })}>{Object.entries(PROSPECT_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                {prospectForm.status === 'client' && <p className="text-xs text-muted-foreground">Este estado conserva el historial comercial. El alta del servicio se realiza en Clientes.</p>}
              </div>
              <Button type="submit" className="w-full" disabled={saveProspect.isPending || !prospectForm.name.trim()}>{saveProspect.isPending ? 'Guardando…' : 'Guardar restaurante'}</Button>
            </fieldset>
          </form>}
        </DialogContent>
      </Dialog>

      <Dialog open={!!activityForm} onOpenChange={open => { if (!open && !saveActivity.isPending) setActivityForm(null); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>{activityForm?.id ? 'Editar seguimiento' : 'Nuevo seguimiento'}</DialogTitle><DialogDescription>{prospects.find(p => p.id === activityForm?.prospect_id)?.name} · Horario de Argentina.</DialogDescription></DialogHeader>
          {activityForm && <form onSubmit={e => { e.preventDefault(); saveActivity.mutate(activityForm); }}>
            <fieldset disabled={saveActivity.isPending} className="space-y-4">
              <div className="space-y-1"><Label htmlFor="activity-kind">Tipo de contacto</Label><select id="activity-kind" className={selectClass} value={activityForm.kind} onChange={e => setActivityForm({ ...activityForm, kind: e.target.value })}>{Object.entries(ACTIVITY_KINDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
              <div className="space-y-1"><Label htmlFor="activity-date">Fecha y hora del contacto *</Label><Input id="activity-date" type="datetime-local" required value={activityForm.date} onChange={e => setActivityForm({ ...activityForm, date: e.target.value })} /></div>
              <div className="space-y-1"><Label htmlFor="activity-status">Estado</Label><select id="activity-status" className={selectClass} value={activityForm.status} onChange={e => setActivityForm({ ...activityForm, status: e.target.value })}>{Object.entries(ACTIVITY_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
              <div className="space-y-1"><Label htmlFor="activity-notes">Notas y resultado</Label><Textarea id="activity-notes" maxLength={5000} rows={4} placeholder="Con quién hablamos, qué nos comentó o qué tenemos que hacer…" value={activityForm.notes} onChange={e => setActivityForm({ ...activityForm, notes: e.target.value })} /></div>
              <Button type="submit" className="w-full" disabled={saveActivity.isPending}>{saveActivity.isPending ? 'Guardando…' : 'Guardar seguimiento'}</Button>
            </fieldset>
          </form>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
