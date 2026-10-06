import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, Clock, Plus, Users } from 'lucide-react';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

type ReservationStatus = 'confirmed' | 'seated' | 'cancelled' | 'no_show';

const STATUS_LABELS: Record<ReservationStatus, string> = {
  confirmed: 'Confirmada',
  seated: 'Sentados',
  cancelled: 'Cancelada',
  no_show: 'No vino',
};

const STATUS_VARIANTS: Record<ReservationStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  confirmed: 'default',
  seated: 'secondary',
  cancelled: 'destructive',
  no_show: 'outline',
};

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));

const defaultDateTime = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset() + 60);
  date.setSeconds(0, 0);
  return date.toISOString().slice(0, 16);
};

export default function Reservations() {
  const { establishmentId, session } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tableId, setTableId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [partySize, setPartySize] = useState('2');
  const [reservationAt, setReservationAt] = useState(defaultDateTime());
  const [notes, setNotes] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | ReservationStatus | 'all'>('active');

  const { data: tables = [] } = useQuery({
    queryKey: ['reservation-tables', establishmentId],
    queryFn: async () => {
      const { data, error } = await db
        .from('tables')
        .select('id, number, capacity, status')
        .eq('establishment_id', establishmentId!)
        .order('number');
      if (error) throw error;
      return data || [];
    },
    enabled: !!establishmentId,
  });

  const { data: reservations = [] } = useQuery({
    queryKey: ['reservations', establishmentId],
    queryFn: async () => {
      const { data, error } = await db
        .from('reservations' as any)
        .select('*')
        .eq('establishment_id', establishmentId!)
        .order('reservation_at', { ascending: true });
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!establishmentId,
  });

  const tableById = useMemo(() => new Map(tables.map((table: any) => [table.id, table])), [tables]);

  const filteredReservations = useMemo(() => {
    if (statusFilter === 'all') return reservations;
    if (statusFilter === 'active') return reservations.filter((reservation: any) => reservation.status === 'confirmed');
    return reservations.filter((reservation: any) => reservation.status === statusFilter);
  }, [reservations, statusFilter]);

  const resetForm = () => {
    setTableId('');
    setCustomerName('');
    setCustomerPhone('');
    setPartySize('2');
    setReservationAt(defaultDateTime());
    setNotes('');
  };

  const createReservation = useMutation({
    mutationFn: async () => {
      if (!tableId) throw new Error('Seleccioná una mesa');
      const { error } = await db.from('reservations' as any).insert({
        establishment_id: establishmentId!,
        table_id: tableId,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim() || null,
        party_size: parseInt(partySize, 10) || 1,
        reservation_at: new Date(reservationAt).toISOString(),
        notes: notes.trim() || null,
        created_by: session?.user?.id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations', establishmentId] });
      toast.success('Reserva registrada');
      setOpen(false);
      resetForm();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ReservationStatus }) => {
      const { error } = await db.from('reservations' as any).update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations', establishmentId] });
      toast.success('Reserva actualizada');
    },
    onError: () => toast.error('No se pudo actualizar la reserva'),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reservas</h1>
          <p className="text-sm text-muted-foreground">Registro de reservas por mesa, horario y cliente.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> Nueva reserva</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nueva reserva</DialogTitle></DialogHeader>
            <form onSubmit={e => { e.preventDefault(); createReservation.mutate(); }} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Mesa</Label>
                  <Select value={tableId} onValueChange={setTableId} required>
                    <SelectTrigger><SelectValue placeholder="Seleccionar mesa" /></SelectTrigger>
                    <SelectContent position="popper" className="z-[100]">
                      {tables.map((table: any) => (
                        <SelectItem key={table.id} value={table.id}>Mesa {table.number} · {table.capacity} pers.</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Fecha y hora</Label>
                  <Input type="datetime-local" value={reservationAt} onChange={e => setReservationAt(e.target.value)} required />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nombre</Label>
                  <Input value={customerName} onChange={e => setCustomerName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Teléfono</Label>
                  <Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Cantidad de personas</Label>
                <Input type="number" min="1" value={partySize} onChange={e => setPartySize(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Notas</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ej: silla para bebé, cumpleaños, ubicación preferida" />
              </div>
              <Button type="submit" className="w-full" disabled={createReservation.isPending}>
                {createReservation.isPending ? 'Guardando...' : 'Guardar reserva'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><CalendarCheck className="h-4 w-4 text-primary" /> Confirmadas</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{reservations.filter((r: any) => r.status === 'confirmed').length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Clock className="h-4 w-4 text-primary" /> Próxima</CardTitle></CardHeader>
          <CardContent className="text-sm font-medium">{reservations.find((r: any) => r.status === 'confirmed') ? formatDateTime(reservations.find((r: any) => r.status === 'confirmed').reservation_at) : 'Sin reservas'}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4 text-primary" /> Personas previstas</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{reservations.filter((r: any) => r.status === 'confirmed').reduce((sum: number, r: any) => sum + Number(r.party_size || 0), 0)}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Listado</CardTitle>
          <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Activas</SelectItem>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="seated">Sentados</SelectItem>
              <SelectItem value="cancelled">Canceladas</SelectItem>
              <SelectItem value="no_show">No vino</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Horario</TableHead>
                <TableHead>Mesa</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Personas</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Notas</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredReservations.map((reservation: any) => {
                const table = tableById.get(reservation.table_id) as any;
                return (
                  <TableRow key={reservation.id}>
                    <TableCell className="font-medium">{formatDateTime(reservation.reservation_at)}</TableCell>
                    <TableCell>{table ? `Mesa ${table.number}` : 'Mesa eliminada'}</TableCell>
                    <TableCell>
                      <div className="font-medium">{reservation.customer_name}</div>
                      {reservation.customer_phone && <div className="text-xs text-muted-foreground">{reservation.customer_phone}</div>}
                    </TableCell>
                    <TableCell>{reservation.party_size}</TableCell>
                    <TableCell><Badge variant={STATUS_VARIANTS[reservation.status as ReservationStatus]}>{STATUS_LABELS[reservation.status as ReservationStatus]}</Badge></TableCell>
                    <TableCell className="max-w-48 truncate text-muted-foreground">{reservation.notes || '—'}</TableCell>
                    <TableCell className="text-right">
                      {reservation.status === 'confirmed' ? (
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => updateStatus.mutate({ id: reservation.id, status: 'seated' })}>Sentar</Button>
                          <Button variant="ghost" size="sm" onClick={() => updateStatus.mutate({ id: reservation.id, status: 'cancelled' })}>Cancelar</Button>
                        </div>
                      ) : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredReservations.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No hay reservas para este filtro.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}