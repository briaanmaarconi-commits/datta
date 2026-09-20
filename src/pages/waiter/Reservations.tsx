import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, CheckCircle2, Clock, Phone, Plus, RotateCcw, Users, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type ReservationStatus = 'confirmed' | 'seated' | 'cancelled' | 'no_show';

const STATUS_LABELS: Record<ReservationStatus, string> = {
  confirmed: 'Confirmada',
  seated: 'Llegó',
  cancelled: 'Cancelada',
  no_show: 'No vino',
};

const STATUS_CLASSES: Record<ReservationStatus, string> = {
  confirmed: 'bg-primary/15 text-primary border-primary/30',
  seated: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
  cancelled: 'bg-destructive/15 text-destructive border-destructive/30',
  no_show: 'bg-muted text-muted-foreground border-border',
};

/** Fecha YYYY-MM-DD en hora local (Argentina). */
const toDateInput = (date: Date) => {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

const defaultTime = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 60);
  d.setSeconds(0, 0);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const formatHour = (value: string) =>
  new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));

export default function WaiterReservations() {
  const { establishmentId, session } = useAuth();
  const queryClient = useQueryClient();

  const [day, setDay] = useState(toDateInput(new Date()));
  const [open, setOpen] = useState(false);
  const [tableId, setTableId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [partySize, setPartySize] = useState('2');
  const [formDate, setFormDate] = useState(toDateInput(new Date()));
  const [formTime, setFormTime] = useState(defaultTime());
  const [notes, setNotes] = useState('');

  const { data: tables = [] } = useQuery({
    queryKey: ['reservation-tables', establishmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tables')
        .select('id, number, capacity, status')
        .eq('establishment_id', establishmentId!)
        .order('number');
      if (error) throw error;
      return data || [];
    },
    enabled: !!establishmentId,
  });

  const { data: reservations = [], isLoading } = useQuery({
    queryKey: ['reservations', establishmentId, day],
    queryFn: async () => {
      const from = new Date(`${day}T00:00:00`);
      const to = new Date(`${day}T23:59:59.999`);
      const { data, error } = await supabase
        .from('reservations' as any)
        .select('*')
        .eq('establishment_id', establishmentId!)
        .gte('reservation_at', from.toISOString())
        .lte('reservation_at', to.toISOString())
        .order('reservation_at', { ascending: true });
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!establishmentId,
  });

  // Sincronización en vivo con Caja / Administración
  useEffect(() => {
    if (!establishmentId) return;
    const channel = supabase
      .channel('waiter-reservations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, () => {
        queryClient.invalidateQueries({ queryKey: ['reservations', establishmentId] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [establishmentId, queryClient]);

  const tableById = useMemo(() => new Map(tables.map((t: any) => [t.id, t])), [tables]);

  const stats = useMemo(() => {
    const active = reservations.filter((r: any) => r.status === 'confirmed');
    return {
      total: reservations.filter((r: any) => r.status !== 'cancelled').length,
      people: active.reduce((sum: number, r: any) => sum + Number(r.party_size || 0), 0),
      arrived: reservations.filter((r: any) => r.status === 'seated').length,
    };
  }, [reservations]);

  const resetForm = () => {
    setTableId('');
    setCustomerName('');
    setCustomerPhone('');
    setPartySize('2');
    setFormDate(day);
    setFormTime(defaultTime());
    setNotes('');
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['reservations', establishmentId] });
    queryClient.invalidateQueries({ queryKey: ['reservation-tables', establishmentId] });
    queryClient.invalidateQueries({ queryKey: ['tables'] });
  };

  const createReservation = useMutation({
    mutationFn: async () => {
      if (!tableId) throw new Error('Seleccioná una mesa');
      if (!customerName.trim()) throw new Error('Ingresá el nombre del cliente');
      const { error } = await supabase.from('reservations' as any).insert({
        establishment_id: establishmentId!,
        table_id: tableId,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim() || null,
        party_size: parseInt(partySize, 10) || 1,
        reservation_at: new Date(`${formDate}T${formTime}`).toISOString(),
        notes: notes.trim() || null,
        created_by: session?.user?.id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Reserva registrada');
      setDay(formDate);
      setOpen(false);
      resetForm();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ reservation, status }: { reservation: any; status: ReservationStatus }) => {
      const { error } = await supabase.from('reservations' as any).update({ status }).eq('id', reservation.id);
      if (error) throw error;

      // Al llegar la gente, la mesa queda ocupada con la cantidad de personas de la reserva
      if (status === 'seated' && reservation.table_id) {
        await supabase
          .from('tables')
          .update({ status: 'occupied', guest_count: reservation.party_size })
          .eq('id', reservation.table_id);
      }
    },
    onSuccess: (_data, variables) => {
      invalidate();
      toast.success(
        variables.status === 'seated'
          ? 'Listo, la mesa quedó ocupada'
          : 'Reserva actualizada',
      );
    },
    onError: () => toast.error('No se pudo actualizar la reserva'),
  });

  const isLate = (reservation: any) =>
    reservation.status === 'confirmed' && new Date(reservation.reservation_at).getTime() < Date.now();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Reservas</h1>
          <p className="text-sm text-muted-foreground">Cargá reservas y marcá quién va llegando.</p>
        </div>
        <Button className="gap-2" onClick={() => { resetForm(); setOpen(true); }}>
          <Plus className="h-4 w-4" /> Nueva reserva
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="day" className="text-xs text-muted-foreground">Día</Label>
          <Input
            id="day"
            type="date"
            className="w-44"
            value={day}
            onChange={e => setDay(e.target.value)}
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => setDay(toDateInput(new Date()))}>Hoy</Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" /> Reservas
            </div>
            <div className="mt-1 text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" /> Esperadas
            </div>
            <div className="mt-1 text-2xl font-bold">{stats.people}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5" /> Llegaron
            </div>
            <div className="mt-1 text-2xl font-bold">{stats.arrived}</div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        {isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Cargando reservas...</p>}

        {!isLoading && reservations.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No hay reservas para este día.
            </CardContent>
          </Card>
        )}

        {reservations.map((reservation: any) => {
          const table = tableById.get(reservation.table_id) as any;
          const status = reservation.status as ReservationStatus;
          const late = isLate(reservation);

          return (
            <Card key={reservation.id} className={cn(late && 'border-amber-500/50')}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xl font-bold tabular-nums">{formatHour(reservation.reservation_at)}</span>
                      {late && (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-500">
                          Atrasada
                        </span>
                      )}
                    </div>
                    <div className="mt-1 truncate text-base font-semibold">{reservation.customer_name}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{table ? `Mesa ${table.number}` : 'Mesa eliminada'}</span>
                      <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {reservation.party_size}</span>
                      {reservation.customer_phone && (
                        <a href={`tel:${reservation.customer_phone}`} className="flex items-center gap-1 underline-offset-2 hover:underline">
                          <Phone className="h-3 w-3" /> {reservation.customer_phone}
                        </a>
                      )}
                    </div>
                  </div>
                  <Badge variant="outline" className={cn('shrink-0', STATUS_CLASSES[status])}>
                    {STATUS_LABELS[status]}
                  </Badge>
                </div>

                {reservation.notes && (
                  <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">{reservation.notes}</p>
                )}

                {status === 'confirmed' ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      className="flex-1 gap-1.5"
                      disabled={updateStatus.isPending}
                      onClick={() => updateStatus.mutate({ reservation, status: 'seated' })}
                    >
                      <CheckCircle2 className="h-4 w-4" /> Llegó
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updateStatus.isPending}
                      onClick={() => updateStatus.mutate({ reservation, status: 'no_show' })}
                    >
                      No vino
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5 text-muted-foreground"
                      disabled={updateStatus.isPending}
                      onClick={() => updateStatus.mutate({ reservation, status: 'cancelled' })}
                    >
                      <X className="h-4 w-4" /> Cancelar
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1.5 text-muted-foreground"
                    disabled={updateStatus.isPending}
                    onClick={() => updateStatus.mutate({ reservation, status: 'confirmed' })}
                  >
                    <RotateCcw className="h-4 w-4" /> Deshacer
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nueva reserva</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); createReservation.mutate(); }} className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre del cliente</Label>
              <Input value={customerName} onChange={e => setCustomerName(e.target.value)} required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input type="tel" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Personas</Label>
                <Input type="number" min="1" value={partySize} onChange={e => setPartySize(e.target.value)} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Mesa</Label>
              <Select value={tableId} onValueChange={setTableId}>
                <SelectTrigger><SelectValue placeholder="Seleccionar mesa" /></SelectTrigger>
                <SelectContent position="popper" className="z-[100]">
                  {tables.map((table: any) => (
                    <SelectItem key={table.id} value={table.id}>
                      Mesa {table.number} · {table.capacity} pers.
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Fecha</Label>
                <Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Hora</Label>
                <Input type="time" value={formTime} onChange={e => setFormTime(e.target.value)} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Ej: silla para bebé, cumpleaños, ubicación preferida"
              />
            </div>
            <Button type="submit" className="w-full" disabled={createReservation.isPending}>
              {createReservation.isPending ? 'Guardando...' : 'Guardar reserva'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
