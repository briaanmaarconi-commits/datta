import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Copy, Loader2, PlayCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { clientsApi } from '@/lib/billingApi';

interface DemoUser { role: string; label: string; email: string; password: string }
interface DemoResult {
  establishment_id: string;
  name: string;
  users: DemoUser[];
  summary: { products: number; tables: number; closed_orders: number; open_orders: number };
}

const ROLE_HINT: Record<string, string> = {
  admin: 'Ve todo: carta, mesas, stock, caja, analíticas y personal.',
  kitchen: 'Ve la pantalla de cocina con los pedidos en curso.',
  cashier: 'Cobra mesas, abre/cierra la caja y carga pedidos.',
};

/**
 * Crea (o rearma) el restaurante de demostración: un local completo con carta chica, mesas, plano, historial de ventas,
 * caja abierta y pedidos en curso, más tres usuarios (administrador, cocina y caja). Las claves se muestran una sola vez.
 */
export default function DemoRestaurantButton({ exists }: { exists: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<DemoResult | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const build = useMutation({
    mutationFn: (reset: boolean) => clientsApi<DemoResult>('create-demo', { reset }),
    onSuccess: (r) => {
      setResult(r);
      setConfirmReset(false);
      for (const key of ['sa-clients', 'billing-overview', 'monitor-establishments', 'sa-users']) qc.invalidateQueries({ queryKey: [key] });
      toast.success('Restaurante demo listo');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      toast.error('No se pudo copiar: seleccionalo y copialo a mano');
    }
  };
  const allText = result
    ? `Datta — restaurante demo\nIngresar en: ${origin}/login\n\n` + result.users.map((u) => `${u.label}\n  Email: ${u.email}\n  Clave: ${u.password}`).join('\n\n')
    : '';

  const close = (v: boolean) => {
    setOpen(v);
    if (!v) { setResult(null); setConfirmReset(false); }
  };

  return (
    <>
      <Button variant="outline" className="gap-2" onClick={() => setOpen(true)}>
        <PlayCircle className="h-4 w-4" /> Restaurante demo
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Restaurante demo</DialogTitle>
            <DialogDescription>
              Un local de ejemplo para mostrar cómo funciona Datta, con carta, mesas, plano, ventas de los últimos 14 días, caja abierta y pedidos en curso.
              No toca datos de clientes reales ni factura en AFIP.
            </DialogDescription>
          </DialogHeader>

          {result ? (
            <div className="space-y-4">
              <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <strong>Guardá estas claves ahora:</strong> no se vuelven a mostrar. Si las perdés, usá «Restablecer» y se generan nuevas.
              </p>
              <div className="space-y-3">
                {result.users.map((u) => (
                  <div key={u.role} className="rounded-lg border p-3 text-sm">
                    <div className="font-semibold">{u.label}</div>
                    <div className="text-xs text-muted-foreground">{ROLE_HINT[u.role]}</div>
                    <div className="mt-2 grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1">
                      <span className="text-muted-foreground">Email</span>
                      <code className="break-all">{u.email}</code>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copy(`${u.role}-e`, u.email)} title="Copiar email">
                        {copied === `${u.role}-e` ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                      <span className="text-muted-foreground">Clave</span>
                      <code className="font-semibold">{u.password}</code>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copy(`${u.role}-p`, u.password)} title="Copiar clave">
                        {copied === `${u.role}-p` ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Se cargaron {result.summary.products} productos, {result.summary.tables} mesas, {result.summary.closed_orders} ventas y {result.summary.open_orders} pedidos en curso.
                Ingresar en <strong>{origin}/login</strong>.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button className="gap-2" onClick={() => copy('all', allText)}>
                  {copied === 'all' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copiar todo
                </Button>
                <Button variant="outline" onClick={() => close(false)}>Listo</Button>
              </div>
            </div>
          ) : exists ? (
            <div className="space-y-4">
              <p className="text-sm">
                <strong>DEMO Datta</strong> ya existe. Las claves solo se muestran al crearlo. Si las perdiste, o querés dejar la demo como nueva
                (se borra lo que se haya cargado y se vuelven a generar ventas, pedidos y claves), restablecela.
              </p>
              {confirmReset ? (
                <div className="space-y-2 rounded-md border border-destructive/40 p-3">
                  <p className="text-sm">Se borra el restaurante demo actual y se arma uno nuevo. ¿Seguro?</p>
                  <div className="flex gap-2">
                    <Button variant="destructive" disabled={build.isPending} onClick={() => build.mutate(true)}>
                      {build.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Armando…</> : 'Sí, restablecer'}
                    </Button>
                    <Button variant="outline" disabled={build.isPending} onClick={() => setConfirmReset(false)}>Cancelar</Button>
                  </div>
                </div>
              ) : (
                <Button variant="outline" className="gap-2" onClick={() => setConfirmReset(true)}>
                  <RefreshCw className="h-4 w-4" /> Restablecer demo (claves nuevas)
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <ul className="list-disc space-y-1 pl-5 text-sm">
                <li>3 usuarios: administrador, cocina y caja (te mostramos las claves al terminar).</li>
                <li>Carta chica: 13 productos en 4 categorías, con bebidas con stock.</li>
                <li>10 mesas en 2 sectores, con plano.</li>
                <li>Ventas de los últimos 14 días, caja abierta y 4 pedidos en curso.</li>
              </ul>
              <Button className="gap-2" disabled={build.isPending} onClick={() => build.mutate(false)}>
                {build.isPending ? <><Loader2 className="h-4 w-4 animate-spin" />Armando… (unos segundos)</> : <><PlayCircle className="h-4 w-4" />Crear restaurante demo</>}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
