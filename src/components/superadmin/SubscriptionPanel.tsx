import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, ExternalLink, Gift, HandCoins, Link2, PauseCircle, PlayCircle, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { billing, fmtDate, money, STATUS_BADGE, STATUS_LABELS, type BillingClient } from '@/lib/billingApi';

const EVENT_LABELS: Record<string, string> = {
  trial_started: 'Prueba gratis iniciada',
  payment: 'Pago registrado',
  status_active: 'Pasó a Al día',
  status_past_due: 'Pasó a Vencido',
  status_suspended: 'Suspendido',
  status_cancelled: 'Cancelado',
  mp_link_created: 'Link de Mercado Pago generado',
  mp_status: 'Estado de la suscripción en Mercado Pago',
  mp_cancelled: 'Suscripción de Mercado Pago cancelada',
  price_changed: 'Precio cambiado',
};

function describe(e: any) {
  const d = e.details ?? {};
  switch (e.type) {
    case 'trial_started': return `${d.days} días, hasta ${fmtDate(d.ends)}`;
    case 'payment': return `${money(d.amount)} (${d.source === 'mercadopago' ? 'Mercado Pago' : 'manual'}) — próximo vencimiento ${fmtDate(d.next_due_date)}`;
    case 'price_changed': return money(d.amount);
    case 'mp_status': return `${d.status}${d.next_payment_date ? ` — próximo cobro ${fmtDate(d.next_payment_date)}` : ''}`;
    case 'mp_link_created': return `${money(d.amount)} por mes${d.start ? `, desde ${fmtDate(d.start)}` : ''}`;
    default: return d.reason ?? '';
  }
}

/** Gestión de la suscripción de UN cliente: prueba gratis, pagos, link de Mercado Pago, suspensión e historial. */
export default function SubscriptionPanel({ client, mpEnabled, onChanged }: { client: BillingClient; mpEnabled: boolean; onChanged?: () => void }) {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<null | 'trial' | 'payment' | 'link' | 'price'>(null);
  const [days, setDays] = useState('15');
  const [pay, setPay] = useState({ amount: String(client.agreed_price || ''), method: 'transfer', notes: '' });
  const [email, setEmail] = useState(client.contact_email ?? '');
  const [price, setPrice] = useState(String(client.agreed_price || ''));
  const [createdLink, setCreatedLink] = useState<string | null>(client.mp_init_point);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['billing-overview'] });
    qc.invalidateQueries({ queryKey: ['billing-events', client.id] });
    qc.invalidateQueries({ queryKey: ['sa-clients'] });
    qc.invalidateQueries({ queryKey: ['sa-client-payments'] });
    onChanged?.();
  };
  const run = useMutation({
    mutationFn: async (fn: () => Promise<any>) => fn(),
    onSuccess: () => { refresh(); setDialog(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: events = [] } = useQuery({
    queryKey: ['billing-events', client.id],
    queryFn: async () => (await billing<{ events: any[] }>('events', { establishment_id: client.id, limit: 30 })).events,
  });

  const s = client.effective_status;
  const hasMp = !!client.mp_preapproval_id && ['pending', 'authorized'].includes(client.mp_status ?? '');
  const copy = async (text: string) => { await navigator.clipboard.writeText(text); toast.success('Link copiado'); };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div><span className="text-muted-foreground">Estado: </span><Badge variant={STATUS_BADGE[s]}>{STATUS_LABELS[s] ?? s}</Badge></div>
        <div><span className="text-muted-foreground">Precio mensual: </span>{money(client.agreed_price)}</div>
        <div><span className="text-muted-foreground">Próximo vencimiento: </span>{client.billing_configured ? fmtDate(client.next_due_date) : 'Sin configurar'}</div>
        <div><span className="text-muted-foreground">Último pago: </span>{client.last_payment_date ? `${fmtDate(client.last_payment_date)} (${money(client.last_payment_amount)})` : '—'}</div>
        {s === 'trial' && <div className="col-span-2"><span className="text-muted-foreground">La prueba termina: </span>{fmtDate(client.trial_ends_at)}</div>}
        {s === 'past_due' && <div className="col-span-2 text-destructive">Vencido hace {client.overdue_days} días — se suspende en {client.days_to_suspension} días.</div>}
        {s === 'suspended' && <div className="col-span-2 text-destructive">Suspendido{client.suspension_reason ? `: ${client.suspension_reason}` : ''}. Sus usuarios no pueden entrar.</div>}
        {!client.billing_configured && <div className="col-span-2 text-muted-foreground">Este cliente todavía no tiene facturación configurada: no se vence ni se suspende solo. Activá una prueba gratis o registrá un pago para empezar.</div>}
        <div className="col-span-2">
          <span className="text-muted-foreground">Mercado Pago: </span>
          {client.mp_preapproval_id ? <Badge variant="outline">{client.mp_status ?? 'sin estado'}</Badge> : 'sin suscripción'}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setDialog('trial')}><Gift className="h-4 w-4 mr-1" />Prueba gratis</Button>
        <Button size="sm" variant="outline" onClick={() => setDialog('payment')}><HandCoins className="h-4 w-4 mr-1" />Registrar pago</Button>
        <Button size="sm" variant="outline" onClick={() => setDialog('link')} disabled={!mpEnabled || hasMp}><Link2 className="h-4 w-4 mr-1" />Link de Mercado Pago</Button>
        {hasMp && <Button size="sm" variant="outline" onClick={() => window.confirm('¿Cancelar la suscripción en Mercado Pago? Dejará de cobrarse automáticamente.') && run.mutate(() => billing('cancel-subscription', { establishment_id: client.id }))}><XCircle className="h-4 w-4 mr-1" />Cancelar suscripción</Button>}
        <Button size="sm" variant="outline" onClick={() => setDialog('price')}>Cambiar precio</Button>
        {s === 'suspended' || s === 'cancelled' ? (
          <Button size="sm" onClick={() => run.mutate(() => billing('set-status', { establishment_id: client.id, status: 'active', extend_days: 30 }))}><PlayCircle className="h-4 w-4 mr-1" />Reactivar (30 días)</Button>
        ) : (
          <Button size="sm" variant="destructive" onClick={() => window.confirm('¿Suspender el servicio? Sus usuarios no podrán entrar.') && run.mutate(() => billing('set-status', { establishment_id: client.id, status: 'suspended', reason: 'Suspendido por el superadmin' }))}><PauseCircle className="h-4 w-4 mr-1" />Suspender</Button>
        )}
      </div>
      {!mpEnabled && <p className="text-xs text-muted-foreground">Mercado Pago todavía no está configurado en el servidor (falta la clave): los links de pago automático no están disponibles.</p>}
      {createdLink && hasMp && (
        <div className="flex items-center gap-2 rounded-md border p-2 text-xs break-all">
          <span className="flex-1">{createdLink}</span>
          <Button size="icon" variant="ghost" onClick={() => copy(createdLink)}><Copy className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" asChild><a href={createdLink} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a></Button>
        </div>
      )}

      <div>
        <h4 className="text-sm font-semibold mb-2">Historial</h4>
        {events.length === 0 ? <p className="text-sm text-muted-foreground">Sin movimientos todavía.</p> : (
          <div className="space-y-1 max-h-56 overflow-auto">
            {events.map((e: any) => (
              <div key={e.id} className="flex justify-between gap-3 text-xs border-b py-1">
                <span><strong>{EVENT_LABELS[e.type] ?? e.type}</strong> {describe(e) && <span className="text-muted-foreground">— {describe(e)}</span>}</span>
                <span className="text-muted-foreground whitespace-nowrap">{new Date(e.created_at).toLocaleString('es-AR')}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialog === 'trial'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Prueba gratis — {client.name}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Días de prueba (sin cobro)</Label>
            <Input type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} />
            <p className="text-xs text-muted-foreground">Al terminar la prueba el cliente pasa a "Vencido" y, si no paga, se suspende después de los días de gracia.</p>
          </div>
          <DialogFooter><Button onClick={() => run.mutate(() => billing('trial', { establishment_id: client.id, days: Number(days) }))}>Activar prueba</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'payment'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar pago — {client.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Monto</Label><Input type="number" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></div>
            <div>
              <Label>Medio de pago</Label>
              <Select value={pay.method} onValueChange={(v) => setPay({ ...pay, method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="transfer">Transferencia</SelectItem>
                  <SelectItem value="cash">Efectivo</SelectItem>
                  <SelectItem value="card">Tarjeta</SelectItem>
                  <SelectItem value="other">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Notas (opcional)</Label><Input value={pay.notes} onChange={(e) => setPay({ ...pay, notes: e.target.value })} /></div>
            <p className="text-xs text-muted-foreground">El cliente queda al día y el próximo vencimiento se corre un mes. Se registra en Caja Datta.</p>
          </div>
          <DialogFooter><Button disabled={!(Number(pay.amount) > 0)} onClick={() => run.mutate(() => billing('register-payment', { establishment_id: client.id, amount: Number(pay.amount), payment_method: pay.method, notes: pay.notes || null }))}>Registrar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'link'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cobro automático con Mercado Pago</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Email del titular de la tarjeta</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="duenio@restaurante.com" />
            <p className="text-xs text-muted-foreground">Se genera un link: el cliente lo abre, autoriza su tarjeta una sola vez y Mercado Pago le cobra {money(client.agreed_price)} todos los meses. {client.trial_ends_at && s === 'trial' ? 'El primer cobro será cuando termine la prueba gratis.' : ''}</p>
          </div>
          <DialogFooter>
            <Button disabled={!email} onClick={() => run.mutate(async () => { const r = await billing<{ init_point: string }>('create-subscription', { establishment_id: client.id, payer_email: email }); setCreatedLink(r.init_point); await copy(r.init_point); })}>Generar y copiar link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'price'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Precio mensual — {client.name}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Precio por mes (pesos)</Label>
            <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
            <p className="text-xs text-muted-foreground">{hasMp ? 'También se actualiza el monto de la suscripción en Mercado Pago.' : 'Se usará para los próximos cobros.'}</p>
          </div>
          <DialogFooter><Button disabled={!(Number(price) > 0)} onClick={() => run.mutate(() => billing('update-price', { amount: Number(price), establishment_id: client.id }))}>Guardar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
