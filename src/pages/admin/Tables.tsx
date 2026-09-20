import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Plus, Trash2, QrCode, FolderPlus, Map } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import FloorPlanEditor from '@/components/admin/FloorPlanEditor';

const STATUS_COLORS: Record<string, string> = {
  free: 'bg-green-100 text-green-800 border-green-300',
  occupied: 'bg-red-100 text-red-800 border-red-300',
  billing: 'bg-yellow-100 text-yellow-800 border-yellow-300',
};
const STATUS_LABELS: Record<string, string> = { free: 'Libre', occupied: 'Ocupada', billing: 'En preparación' };

export default function AdminTables() {
  const { establishmentId } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [sectorOpen, setSectorOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState<string | null>(null);
  const [qrGeneralOpen, setQrGeneralOpen] = useState(false);
  const [number, setNumber] = useState('');
  const [capacity, setCapacity] = useState('4');
  const [sectorId, setSectorId] = useState<string>('none');
  const [sectorName, setSectorName] = useState('');

  const { data: tables = [] } = useQuery({
    queryKey: ['tables', establishmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tables')
        .select('*')
        .eq('establishment_id', establishmentId!)
        .order('number');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!establishmentId,
  });

  const { data: sectors = [] } = useQuery({
    queryKey: ['sectors', establishmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sectors')
        .select('*')
        .eq('establishment_id', establishmentId!)
        .order('sort_order');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!establishmentId,
  });

  useEffect(() => {
    if (!establishmentId) return;
    const channel = supabase
      .channel('admin-tables-manage-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables', filter: `establishment_id=eq.${establishmentId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['tables', establishmentId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [establishmentId, queryClient]);

  const createSector = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('sectors').insert({
        name: sectorName,
        establishment_id: establishmentId!,
        sort_order: sectors.length,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sectors'] });
      toast.success('Sector creado');
      setSectorOpen(false);
      setSectorName('');
    },
    onError: () => toast.error('Error al crear sector'),
  });

  const deleteSector = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('sectors').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sectors'] });
      toast.success('Sector eliminado');
    },
    onError: () => toast.error('No se puede eliminar: tiene mesas asociadas'),
  });

  const createTable = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('tables').insert({
        number: parseInt(number),
        capacity: parseInt(capacity),
        establishment_id: establishmentId!,
        sector_id: sectorId === 'none' ? null : sectorId,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      toast.success('Mesa creada');
      setOpen(false);
      setNumber('');
      setCapacity('4');
      setSectorId('none');
    },
    onError: () => toast.error('Error: el número de mesa ya existe'),
  });

  const deleteTable = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tables').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      toast.success('Mesa eliminada');
    },
  });

  const host = window.location.hostname;
  const isPreviewOrigin = host === 'localhost'
    || host === '127.0.0.1'
    || host.startsWith('id-preview--')
    || host.endsWith('.lovableproject.com')
    || host.endsWith('.lovable.dev')
    || host.includes('sandbox');
  const publicOrigin = isPreviewOrigin ? 'https://dattagestion.lovable.app' : window.location.origin;
  const menuUrl = (tableId: string) => `${publicOrigin}/menu/${tableId}`;
  const cartaUrl = `${publicOrigin}/carta/${establishmentId}`;

  // Group tables by sector
  const tablesWithoutSector = tables.filter(t => !(t as any).sector_id);
  const tablesBySector = sectors.map(s => ({
    sector: s,
    tables: tables.filter(t => (t as any).sector_id === s.id),
  }));

  const renderTableCard = (table: any) => (
    <Card key={table.id} className="relative">
      <CardHeader className="pb-2">
        <CardTitle className="text-center">
          <span className="text-2xl font-bold">Mesa {table.number}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="text-center space-y-3">
        <Badge className={STATUS_COLORS[table.status]}>
          {STATUS_LABELS[table.status]}
        </Badge>
        <p className="text-sm text-muted-foreground">{table.capacity} personas</p>
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setQrOpen(table.id)}>
            <QrCode className="h-3 w-3 mr-1" /> QR
          </Button>
          <Button variant="ghost" size="sm" onClick={() => deleteTable.mutate(table.id)}>
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Mesas</h1>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" className="gap-2" onClick={() => setQrGeneralOpen(true)}>
            <QrCode className="h-4 w-4" /> QR Carta General
          </Button>
          <Dialog open={sectorOpen} onOpenChange={setSectorOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2"><FolderPlus className="h-4 w-4" /> Nuevo sector</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nuevo sector</DialogTitle></DialogHeader>
              <form onSubmit={e => { e.preventDefault(); createSector.mutate(); }} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nombre del sector</Label>
                  <Input value={sectorName} onChange={e => setSectorName(e.target.value)} placeholder="Ej: Terraza, Interior..." required />
                </div>
                <Button type="submit" className="w-full">Crear sector</Button>
              </form>
            </DialogContent>
          </Dialog>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" /> Nueva mesa</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nueva mesa</DialogTitle></DialogHeader>
              <form onSubmit={e => { e.preventDefault(); createTable.mutate(); }} className="space-y-4">
                <div className="space-y-2">
                  <Label>Número de mesa</Label>
                  <Input type="number" min="1" value={number} onChange={e => setNumber(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Capacidad</Label>
                  <Input type="number" min="1" value={capacity} onChange={e => setCapacity(e.target.value)} required />
                </div>
                {sectors.length > 0 && (
                  <div className="space-y-2">
                    <Label>Sector (opcional)</Label>
                    <Select value={sectorId} onValueChange={setSectorId}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin sector</SelectItem>
                        {sectors.map(s => (
                          <SelectItem key={s.id} value={s.id}>{(s as any).name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Button type="submit" className="w-full">Crear mesa</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">Lista de mesas</TabsTrigger>
          <TabsTrigger value="floorplan" className="gap-1">
            <Map className="h-3 w-3" /> Plano
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-6 mt-4">
          {/* Sectors with their tables */}
          {tablesBySector.map(({ sector, tables: sectorTables }) => (
            <div key={sector.id} className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">{(sector as any).name}</h2>
                <Button variant="ghost" size="sm" onClick={() => deleteSector.mutate(sector.id)}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
              {sectorTables.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin mesas en este sector</p>
              ) : (
                <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {sectorTables.map(renderTableCard)}
                </div>
              )}
            </div>
          ))}

          {/* Tables without sector */}
          {tablesWithoutSector.length > 0 && (
            <div className="space-y-3">
              {sectors.length > 0 && <h2 className="text-xl font-semibold">Sin sector</h2>}
              <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {tablesWithoutSector.map(renderTableCard)}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="floorplan" className="mt-4">
          <FloorPlanEditor />
        </TabsContent>
      </Tabs>

      <Dialog open={!!qrOpen} onOpenChange={() => setQrOpen(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>QR Mesa {tables.find(t => t.id === qrOpen)?.number}</DialogTitle></DialogHeader>
          <div className="flex flex-col items-center gap-4">
            {qrOpen && <QRCodeSVG value={menuUrl(qrOpen)} size={250} />}
            <p className="text-xs text-muted-foreground break-all">{qrOpen && menuUrl(qrOpen)}</p>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={qrGeneralOpen} onOpenChange={setQrGeneralOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>QR Carta General (solo lectura)</DialogTitle></DialogHeader>
          <div className="flex flex-col items-center gap-4">
            <QRCodeSVG value={cartaUrl} size={250} />
            <p className="text-xs text-muted-foreground break-all">{cartaUrl}</p>
            <p className="text-sm text-muted-foreground text-center">Este QR muestra la carta completa sin opción de pedir.</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
