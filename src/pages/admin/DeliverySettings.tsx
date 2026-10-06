import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { useDeliverySettings } from '@/hooks/useDeliverySettings';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Bike, Copy, Plug, RefreshCw, ShieldCheck, AlertTriangle, Info } from 'lucide-react';
import { toast } from 'sonner';

type PlatformKey = 'rappi' | 'peya';

const PLATFORM_META: Record<PlatformKey, { label: string; secretLabel: string; idLabel: string; storeLabel: string }> = {
  rappi: { label: 'Rappi', secretLabel: 'Client Secret', idLabel: 'Client ID', storeLabel: 'Store ID' },
  peya: { label: 'PedidosYa', secretLabel: 'API Key / Client Secret', idLabel: 'Vendor ID', storeLabel: 'Punto de venta (opcional)' },
};

interface IntegrationStatus {
  platform: PlatformKey;
  environment: 'sandbox' | 'production';
  store_id: string | null;
  external_vendor_id: string | null;
  client_id: string | null;
  has_credentials: boolean;
  secret_last4: string | null;
  status: 'not_configured' | 'configured' | 'connected' | 'error';
  last_checked_at: string | null;
  last_error: string | null;
  webhook_token: string | null;
}

const STATUS_META: Record<IntegrationStatus['status'], { label: string; variant: 'secondary' | 'default' | 'destructive'; className?: string }> = {
  not_configured: { label: 'Sin configurar', variant: 'secondary' },
  configured: { label: 'Credenciales cargadas', variant: 'default' },
  connected: { label: 'Conectada', variant: 'default', className: 'bg-green-600 hover:bg-green-600' },
  error: { label: 'Error', variant: 'destructive' },
};

function PlatformCard({ platform, status, commission, onSaved }: {
  platform: PlatformKey;
  status?: IntegrationStatus;
  commission: number;
  onSaved: () => void;
}) {
  const { establishmentId } = useAuth();
  const meta = PLATFORM_META[platform];

  const [environment, setEnvironment] = useState<'sandbox' | 'production'>('sandbox');
  const [clientId, setClientId] = useState('');
  const [storeId, setStoreId] = useState('');
  const [secret, setSecret] = useState('');
  const [replacing, setReplacing] = useState(false);

  useEffect(() => {
    setEnvironment(status?.environment ?? 'sandbox');
    setClientId((platform === 'rappi' ? status?.client_id : status?.external_vendor_id) ?? '');
    setStoreId(status?.store_id ?? '');
    setSecret('');
    setReplacing(false);
  }, [status, platform]);

  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.functions.invoke('delivery-credentials', {
        body: {
          establishment_id: establishmentId,
          platform,
          environment,
          store_id: storeId,
          client_id: platform === 'rappi' ? clientId : null,
          external_vendor_id: platform === 'peya' ? clientId : null,
          client_secret: platform === 'rappi' ? secret : null,
          api_key: platform === 'peya' ? secret : null,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
    },
    onSuccess: () => { toast.success('Credenciales guardadas'); setSecret(''); setReplacing(false); onSaved(); },
    onError: (e: Error) => toast.error(e.message || 'No se pudo guardar'),
  });

  const test = useMutation({
    mutationFn: async () => {
      const { data, error } = await db.functions.invoke('delivery-test-connection', {
        body: { establishment_id: establishmentId, platform },
      });
      if (error) throw error;
      return data as { ok: boolean; message: string };
    },
    onSuccess: (res) => { res?.ok ? toast.success(res.message) : toast.error(res?.message || 'Falló la conexión'); onSaved(); },
    onError: (e: Error) => toast.error(e.message || 'No se pudo probar la conexión'),
  });

  const webhookUrl = status?.webhook_token
    ? `${window.location.origin}/api/delivery-webhook?token=${status.webhook_token}`
    : null;

  const st = STATUS_META[status?.status ?? 'not_configured'];
  const showSecretInput = !status?.has_credentials || replacing;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="flex items-center gap-2"><Bike className="h-5 w-5 text-primary" />{meta.label}</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline">Comisión {commission}%</Badge>
            <Badge variant={st.variant} className={st.className}>{st.label}</Badge>
          </div>
        </div>
        {status?.last_checked_at && (
          <CardDescription>Última verificación: {new Date(status.last_checked_at).toLocaleString('es-AR')}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {status?.last_error && (
          <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /><span>{status.last_error}</span>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Ambiente</Label>
            <Select value={environment} onValueChange={(v) => setEnvironment(v as 'sandbox' | 'production')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sandbox">Sandbox (pruebas)</SelectItem>
                <SelectItem value="production">Producción</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{meta.idLabel}</Label>
            <Input value={clientId} onChange={e => setClientId(e.target.value)} placeholder={`Pegá acá el ${meta.idLabel}`} />
          </div>
          <div className="space-y-2">
            <Label>{meta.storeLabel}</Label>
            <Input value={storeId} onChange={e => setStoreId(e.target.value)} placeholder="Identificador de la tienda" />
          </div>
          <div className="space-y-2">
            <Label>{meta.secretLabel}</Label>
            {showSecretInput ? (
              <Input type="password" value={secret} onChange={e => setSecret(e.target.value)} placeholder="Pegá la clave secreta" autoComplete="off" />
            ) : (
              <div className="flex items-center gap-2">
                <Input value={`•••• •••• ${status?.secret_last4 ?? '••••'}`} readOnly className="font-mono" />
                <Button type="button" variant="outline" onClick={() => setReplacing(true)}>Reemplazar</Button>
              </div>
            )}
          </div>
        </div>

        {webhookUrl && (
          <div className="space-y-2">
            <Label>URL de webhook (pegar en el panel de {meta.label})</Label>
            <div className="flex gap-2">
              <Input value={webhookUrl} readOnly className="font-mono text-xs" />
              <Button type="button" variant="outline" size="icon" title="Copiar"
                onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success('URL copiada'); }}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Guardando...' : 'Guardar credenciales'}
          </Button>
          <Button variant="outline" onClick={() => test.mutate()} disabled={test.isPending || !status?.has_credentials} className="gap-2">
            <Plug className="h-4 w-4" />{test.isPending ? 'Probando...' : 'Probar conexión'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MenuMappingTab() {
  const { establishmentId } = useAuth();
  const queryClient = useQueryClient();

  const { data: mappings = [] } = useQuery({
    queryKey: ['delivery-mapping', establishmentId],
    queryFn: async () => {
      const { data, error } = await db
        .from('delivery_menu_mapping')
        .select('*')
        .eq('establishment_id', establishmentId!)
        .order('platform')
        .order('external_item_name');
      if (error) throw error;
      return data as any[];
    },
    enabled: !!establishmentId,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['delivery-mapping-products', establishmentId],
    queryFn: async () => {
      const { data, error } = await db
        .from('products')
        .select('id, name')
        .eq('establishment_id', establishmentId!)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!establishmentId,
  });

  const link = useMutation({
    mutationFn: async ({ id, productId }: { id: string; productId: string }) => {
      const { error } = await db.from('delivery_menu_mapping').update({ product_id: productId }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['delivery-mapping', establishmentId] }); toast.success('Producto vinculado'); },
    onError: () => toast.error('No se pudo vincular'),
  });

  const pending = mappings.filter((m: any) => !m.product_id).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mapeo de menú</CardTitle>
        <CardDescription>
          Cada ítem que llega desde la plataforma se traduce a un producto de Datta. Los ítems desconocidos se listan
          automáticamente acá la primera vez que llega un pedido con ellos.
          {pending > 0 && <span className="text-destructive font-medium"> Hay {pending} ítem(s) sin vincular.</span>}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Plataforma</TableHead>
              <TableHead>Ítem externo</TableHead>
              <TableHead>ID externo</TableHead>
              <TableHead>Producto en Datta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mappings.map((m: any) => (
              <TableRow key={m.id}>
                <TableCell>{PLATFORM_META[m.platform as PlatformKey]?.label ?? m.platform}</TableCell>
                <TableCell className="font-medium">{m.external_item_name || '—'}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{m.external_item_id}</TableCell>
                <TableCell>
                  <Select value={m.product_id ?? ''} onValueChange={v => link.mutate({ id: m.id, productId: v })}>
                    <SelectTrigger className="w-64"><SelectValue placeholder="Sin vincular" /></SelectTrigger>
                    <SelectContent>
                      {products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
            {mappings.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                Todavía no llegaron ítems desde las plataformas.
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function AdminDeliverySettings() {
  const { establishmentId } = useAuth();
  const queryClient = useQueryClient();
  const { enabled, commissions, isLoading: settingsLoading } = useDeliverySettings();

  const { data: statuses = [], isLoading } = useQuery({
    queryKey: ['delivery-integrations', establishmentId],
    queryFn: async () => {
      const { data, error } = await (db as any).rpc('get_delivery_integration_status', { _establishment_id: establishmentId });
      if (error) throw error;
      return (data ?? []) as IntegrationStatus[];
    },
    enabled: !!establishmentId,
  });

  const byPlatform = useMemo(() => {
    const map = new Map<PlatformKey, IntegrationStatus>();
    statuses.forEach(s => map.set(s.platform, s));
    return map;
  }, [statuses]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['delivery-integrations', establishmentId] });

  if (settingsLoading || isLoading) {
    return <div className="p-6 text-muted-foreground">Cargando...</div>;
  }

  if (!enabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bike className="h-5 w-5" />Delivery</CardTitle>
          <CardDescription>El módulo de delivery no está habilitado para este establecimiento. Contactá a Datta para activarlo.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Delivery</h1>
          <p className="text-muted-foreground">Vinculación con Rappi y PedidosYa</p>
        </div>
        <Button variant="outline" onClick={refresh} className="gap-2"><RefreshCw className="h-4 w-4" />Actualizar</Button>
      </div>

      <Tabs defaultValue="conexion">
        <TabsList>
          <TabsTrigger value="conexion">Conexión</TabsTrigger>
          <TabsTrigger value="mapeo">Mapeo de menú</TabsTrigger>
          <TabsTrigger value="ayuda">Cómo vincular</TabsTrigger>
        </TabsList>

        <TabsContent value="conexion" className="space-y-4">
          <div className="flex gap-2 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
            <span>Las claves se guardan cifradas en el servidor. Una vez guardadas no se vuelven a mostrar: sólo se ven los últimos 4 caracteres.</span>
          </div>
          <PlatformCard platform="rappi" status={byPlatform.get('rappi')} commission={commissions.rappi} onSaved={refresh} />
          <PlatformCard platform="peya" status={byPlatform.get('peya')} commission={commissions.pedidosya} onSaved={refresh} />
        </TabsContent>

        <TabsContent value="mapeo"><MenuMappingTab /></TabsContent>

        <TabsContent value="ayuda">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Info className="h-5 w-5" />Pasos para vincular</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="list-decimal space-y-3 pl-5 text-sm">
                <li>Pedí a Rappi o PedidosYa el alta como <strong>integración POS</strong>. Te van a entregar credenciales de sandbox y el identificador de tu tienda.</li>
                <li>Pegá esas credenciales en la pestaña <strong>Conexión</strong> y guardá.</li>
                <li>Copiá la <strong>URL de webhook</strong> que aparece en la tarjeta y cargala en el panel de la plataforma como destino de pedidos.</li>
                <li>Presioná <strong>Probar conexión</strong>. Si da error, el detalle aparece en la misma tarjeta.</li>
                <li>Entrá a <strong>Mapeo de menú</strong> y vinculá cada ítem de la plataforma con su producto en Datta.</li>
                <li>Cuando todo esté en verde, cambiá el ambiente a <strong>Producción</strong> con las credenciales definitivas.</li>
              </ol>
              <p className="mt-4 text-sm text-muted-foreground">
                Mientras tanto, los pedidos se pueden seguir cargando a mano desde <strong>Caja → Delivery</strong>: se registran igual y suman a las analíticas por canal.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
