import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Download, FileKey, FileText, Loader2, PlugZap, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/db';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fmtDate, money } from '@/lib/billingApi';
import { CONDICION_IVA, callFn, downloadInvoicePdf, invoiceLabel, type DattaInvoice } from '@/lib/dattaInvoice';

interface Fiscal {
  cuit: string | null;
  razon_social: string | null;
  condicion_iva: 'monotributo' | 'responsable_inscripto' | 'exento';
  punto_venta: number | null;
  environment: 'testing' | 'production';
  domicilio: string | null;
  iibb: string | null;
  inicio_actividades: string | null;
  auto_issue: boolean;
  has_private_key: boolean;
  has_certificate: boolean;
  certificate_expires_at: string | null;
  missing: string[];
}

interface PaymentRow {
  id: string;
  establishment_id: string;
  amount: number;
  period_month: number;
  period_year: number;
  payment_date: string;
  payment_method: string;
  establishments: { name: string; cuit: string | null } | null;
}

const FISCAL_KEY = ['datta-fiscal'];

function saveFile(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Facturación de Datta a sus clientes: datos fiscales, certificado de ARCA y emisión por pago. */
export default function DattaInvoicing() {
  const qc = useQueryClient();
  const { data: fiscal, isLoading } = useQuery({ queryKey: FISCAL_KEY, queryFn: () => callFn<Fiscal>('datta-fiscal/get') });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Facturación Datta</h1>
        <p className="mt-1 text-muted-foreground">Facturas electrónicas que Datta emite a sus clientes por la suscripción. Cada cliente las ve en su sección Suscripción.</p>
      </div>
      {isLoading || !fiscal ? (
        <div className="flex justify-center p-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {fiscal.environment === 'testing' && (
            <Alert>
              <AlertDescription>
                Estás en <strong>homologación</strong> (pruebas de ARCA): las facturas no tienen validez fiscal y los clientes las ven marcadas como "Prueba".
                Cuando las pruebas salgan bien, pasá el ambiente a Producción con el certificado de producción.
              </AlertDescription>
            </Alert>
          )}
          <div className="grid gap-6 xl:grid-cols-2">
            <FiscalForm fiscal={fiscal} onSaved={() => qc.invalidateQueries({ queryKey: FISCAL_KEY })} />
            <CertificateCard fiscal={fiscal} onChanged={() => qc.invalidateQueries({ queryKey: FISCAL_KEY })} />
          </div>
          <PaymentsCard fiscal={fiscal} />
        </>
      )}
    </div>
  );
}

function FiscalForm({ fiscal, onSaved }: { fiscal: Fiscal; onSaved: () => void }) {
  const [f, setF] = useState(fiscal);
  useEffect(() => setF(fiscal), [fiscal]);
  const set = <K extends keyof Fiscal>(k: K, v: Fiscal[K]) => setF((p) => ({ ...p, [k]: v }));

  const save = useMutation({
    mutationFn: () => callFn('datta-fiscal/save', {
      cuit: f.cuit, razon_social: f.razon_social, condicion_iva: f.condicion_iva, punto_venta: f.punto_venta ? Number(f.punto_venta) : null,
      environment: f.environment, domicilio: f.domicilio, iibb: f.iibb, inicio_actividades: f.inicio_actividades || null, auto_issue: f.auto_issue,
    }),
    onSuccess: () => {
      toast.success('Datos fiscales guardados');
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cuitChanged = !!fiscal.cuit && (f.cuit ?? '').replace(/\D/g, '') !== fiscal.cuit;

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Datos fiscales de Datta</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label>CUIT</Label><Input value={f.cuit ?? ''} onChange={(e) => set('cuit', e.target.value)} placeholder="20-12345678-9" /></div>
          <div className="space-y-2"><Label>Razón social</Label><Input value={f.razon_social ?? ''} onChange={(e) => set('razon_social', e.target.value)} /></div>
          <div className="space-y-2">
            <Label>Condición frente al IVA</Label>
            <Select value={f.condicion_iva} onValueChange={(v) => set('condicion_iva', v as Fiscal['condicion_iva'])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monotributo">Monotributo (Factura C)</SelectItem>
                <SelectItem value="responsable_inscripto">Responsable inscripto (Factura A o B)</SelectItem>
                <SelectItem value="exento">Exento</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Punto de venta (web services)</Label><Input type="number" min={1} value={f.punto_venta ?? ''} onChange={(e) => set('punto_venta', e.target.value ? Number(e.target.value) : null)} /></div>
          <div className="space-y-2 sm:col-span-2"><Label>Domicilio comercial</Label><Input value={f.domicilio ?? ''} onChange={(e) => set('domicilio', e.target.value)} /></div>
          <div className="space-y-2"><Label>Ingresos Brutos</Label><Input value={f.iibb ?? ''} onChange={(e) => set('iibb', e.target.value)} placeholder="Nº o Exento" /></div>
          <div className="space-y-2"><Label>Inicio de actividades</Label><Input type="date" value={f.inicio_actividades ?? ''} onChange={(e) => set('inicio_actividades', e.target.value)} /></div>
          <div className="space-y-2">
            <Label>Ambiente de ARCA</Label>
            <Select value={f.environment} onValueChange={(v) => set('environment', v as Fiscal['environment'])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="testing">Homologación (pruebas)</SelectItem>
                <SelectItem value="production">Producción (facturas reales)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <label className="flex items-start justify-between gap-4 rounded-lg border p-3">
          <span className="text-sm">
            <span className="font-medium">Facturar automáticamente cada pago</span>
            <span className="block text-muted-foreground">Al registrar un pago (manual o de Mercado Pago) se emite la factura sola. Si ARCA la rechaza, el pago queda registrado igual y la podés emitir desde la lista.</span>
          </span>
          <Switch checked={f.auto_issue} onCheckedChange={(v) => set('auto_issue', v)} />
        </label>
        {cuitChanged && <p className="text-sm text-destructive">Al cambiar el CUIT se borra el certificado actual y hay que generar uno nuevo.</p>}
        <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? 'Guardando…' : 'Guardar datos fiscales'}</Button>
      </CardContent>
    </Card>
  );
}

function CertificateCard({ fiscal, onChanged }: { fiscal: Fiscal; onChanged: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [test, setTest] = useState<{ tipo_label: string; last_number: number; next_number: number; punto_venta: number } | null>(null);

  const csr = useMutation({
    mutationFn: () => callFn<{ csr: string; filename: string }>('datta-fiscal/csr'),
    onSuccess: (r) => {
      saveFile(r.filename, r.csr);
      toast.success('CSR generado y descargado. Subilo en ARCA para obtener el certificado.');
      setTest(null);
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const upload = useMutation({
    mutationFn: async (file: File) => callFn<{ expires_at: string }>('datta-fiscal/certificate', { certificate_pem: await file.text() }),
    onSuccess: (r) => {
      toast.success(`Certificado cargado (vence el ${fmtDate(r.expires_at)})`);
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const probe = useMutation({
    mutationFn: () => callFn<{ tipo_label: string; last_number: number; next_number: number; punto_venta: number }>('datta-fiscal/test'),
    onSuccess: (r) => {
      setTest(r);
      toast.success('Conexión con ARCA correcta');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const step = (done: boolean, n: number) => done
    ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
    : <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs">{n}</span>;

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><FileKey className="h-5 w-5" />Certificado de ARCA</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <div className="flex gap-3">
          {step(fiscal.has_private_key, 1)}
          <div className="flex-1 space-y-2">
            <p className="text-sm"><strong>Generá el pedido de certificado (CSR).</strong> Se descarga un archivo .csr; la clave privada queda guardada cifrada en el servidor.</p>
            <Button size="sm" variant="outline" className="gap-2" onClick={() => csr.mutate()} disabled={csr.isPending}>
              {csr.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {fiscal.has_private_key ? 'Generar un CSR nuevo' : 'Generar CSR'}
            </Button>
            {fiscal.has_private_key && <p className="text-xs text-muted-foreground">Generar uno nuevo invalida el certificado cargado.</p>}
          </div>
        </div>
        <div className="flex gap-3">
          {step(fiscal.has_certificate, 2)}
          <div className="flex-1 space-y-2">
            <p className="text-sm">
              <strong>En ARCA:</strong> entrá con la clave fiscal de Datta a "Administración de Certificados Digitales" ({fiscal.environment === 'testing' ? 'WSASS para homologación' : 'producción'}),
              creá un alias, subí el .csr y descargá el certificado (.crt). Después asociá el servicio "wsfe" en "Administrador de Relaciones".
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          {step(fiscal.has_certificate, 3)}
          <div className="flex-1 space-y-2">
            <p className="text-sm"><strong>Subí el certificado (.crt)</strong> que te dio ARCA.</p>
            <input ref={fileRef} type="file" accept=".crt,.pem,.cer" className="hidden" onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload.mutate(file);
              e.target.value = '';
            }} />
            <Button size="sm" variant="outline" className="gap-2" onClick={() => fileRef.current?.click()} disabled={!fiscal.has_private_key || upload.isPending}>
              {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Subir certificado
            </Button>
            {fiscal.has_certificate && fiscal.certificate_expires_at && <p className="text-xs text-muted-foreground">Certificado cargado, vence el {fmtDate(fiscal.certificate_expires_at)}.</p>}
          </div>
        </div>
        <div className="flex gap-3">
          {step(!!test, 4)}
          <div className="flex-1 space-y-2">
            <p className="text-sm"><strong>Probá la conexión</strong> con ARCA.</p>
            <Button size="sm" className="gap-2" onClick={() => probe.mutate()} disabled={probe.isPending || fiscal.missing.length > 0}>
              {probe.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />} Probar conexión
            </Button>
            {test && <p className="text-sm text-emerald-700 dark:text-emerald-400">Conectado. {test.tipo_label} PV {test.punto_venta}: último número {test.last_number}, la próxima será la {test.next_number}.</p>}
          </div>
        </div>
        {fiscal.missing.length > 0
          ? <p className="text-sm text-muted-foreground">Falta: {fiscal.missing.join(', ')}.</p>
          : <Badge className="bg-emerald-600 hover:bg-emerald-600">Listo para facturar</Badge>}
      </CardContent>
    </Card>
  );
}

function PaymentsCard({ fiscal }: { fiscal: Fiscal }) {
  const qc = useQueryClient();
  const [onlyPending, setOnlyPending] = useState(false);
  const [issuing, setIssuing] = useState<string | null>(null);

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['datta-invoicing', 'payments'],
    queryFn: async () => {
      const { data, error } = await db
        .from('client_payments')
        .select('id, establishment_id, amount, period_month, period_year, payment_date, payment_method, establishments(name, cuit)')
        .order('payment_date', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as PaymentRow[];
    },
  });
  const { data: invoices = [] } = useQuery({
    queryKey: ['datta-invoicing', 'invoices'],
    queryFn: async () => {
      const { data, error } = await db.from('datta_invoices').select('*').order('issue_date', { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as DattaInvoice[];
    },
  });

  const byPayment = useMemo(() => {
    const m = new Map<string, DattaInvoice>();
    for (const i of invoices) if (i.client_payment_id && i.environment === fiscal.environment) m.set(i.client_payment_id, i);
    return m;
  }, [invoices, fiscal.environment]);
  const rows = onlyPending ? payments.filter((p) => !byPayment.has(p.id)) : payments;
  const ready = fiscal.missing.length === 0;

  async function issue(p: PaymentRow) {
    setIssuing(p.id);
    try {
      const r = await callFn<{ invoice: DattaInvoice; created: boolean }>('datta-invoice/issue', { client_payment_id: p.id });
      toast.success(r.created ? `${invoiceLabel(r.invoice)} emitida` : 'Ese pago ya estaba facturado');
      qc.invalidateQueries({ queryKey: ['datta-invoicing'] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setIssuing(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <CardTitle>Pagos y facturas</CardTitle>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={onlyPending} onCheckedChange={setOnlyPending} /> Solo sin facturar
        </label>
      </CardHeader>
      <CardContent>
        {!ready && <p className="mb-3 text-sm text-muted-foreground">Completá los datos fiscales y el certificado para poder emitir.</p>}
        {isLoading ? (
          <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{onlyPending ? 'Todos los pagos están facturados.' : 'Todavía no hay pagos registrados. Se registran desde Cobranzas.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead>Pago</TableHead>
                  <TableHead className="text-right">Importe</TableHead>
                  <TableHead>Factura</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => {
                  const inv = byPayment.get(p.id);
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="font-medium">{p.establishments?.name ?? '—'}</div>
                        <div className="text-xs text-muted-foreground">{p.establishments?.cuit ? `CUIT ${p.establishments.cuit}` : 'Sin CUIT: sale a consumidor final'}</div>
                      </TableCell>
                      <TableCell>{String(p.period_month).padStart(2, '0')}/{p.period_year}</TableCell>
                      <TableCell className="whitespace-nowrap">{fmtDate(p.payment_date)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">{money(Number(p.amount))}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {inv ? (
                          <Button size="sm" variant="ghost" className="gap-2" onClick={() => downloadInvoicePdf(inv).catch((e) => toast.error(e.message))}>
                            <Download className="h-4 w-4" />{invoiceLabel(inv)}
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" disabled={!ready || issuing === p.id} onClick={() => issue(p)} className="gap-2">
                            {issuing === p.id && <Loader2 className="h-4 w-4 animate-spin" />} Emitir factura
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          El tipo de factura sale solo: {CONDICION_IVA[fiscal.condicion_iva]}{fiscal.condicion_iva === 'monotributo' ? ' emite Factura C' : ' emite Factura A al cliente responsable inscripto con CUIT y Factura B al resto'}.
        </p>
      </CardContent>
    </Card>
  );
}
