import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/db';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { disablePush, enablePush, pushState, testPush, type PushState } from '@/lib/push';

/**
 * Avisos al celular del mozo cuando cocina marca listo un pedido suyo. Solo aparece en los locales que
 * tienen la opción activada (Clientes → superadmin). Cada mozo lo activa una vez en su celular.
 */
export default function WaiterPushCard({ hideWhenOn = false }: { hideWhenOn?: boolean }) {
  const { establishmentId, viewAs } = useAuth();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: enabled = false } = useQuery({
    queryKey: ['waiter-push-enabled', establishmentId],
    queryFn: async () => {
      const { data } = await db.from('establishments').select('waiter_push_enabled').eq('id', establishmentId!).maybeSingle();
      return !!(data as { waiter_push_enabled?: boolean } | null)?.waiter_push_enabled;
    },
    enabled: !!establishmentId,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!enabled || viewAs) return;
    pushState().then(setState).catch(() => setState('unsupported'));
  }, [enabled, viewAs]);

  if (!enabled || viewAs || state === null) return null;

  const run = async (fn: () => Promise<PushState>, ok: string) => {
    setBusy(true);
    try {
      const s = await fn();
      setState(s);
      if (s === 'on') toast.success(ok);
      else if (s === 'denied') toast.error('El celular bloqueó los avisos. Habilitalos en la configuración del navegador.');
      else if (ok.startsWith('Avisos desactivados')) toast.success(ok);
    } catch (e) {
      toast.error((e as Error).message || 'No se pudieron activar los avisos');
    } finally {
      setBusy(false);
    }
  };

  if (state === 'on') {
    if (hideWhenOn) return null;
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
        <Bell className="h-4 w-4 text-green-600" />
        <span className="flex-1">Avisos activados: te llega una notificación cuando tu pedido está listo.</span>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => testPush().then(() => toast.success('Aviso de prueba enviado'), () => toast.error('No se pudo enviar'))}>
          Probar
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(disablePush, 'Avisos desactivados en este celular')}>
          Desactivar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border-2 border-primary/40 bg-primary/5 p-4 text-sm">
      <div className="flex items-center gap-2 font-semibold">
        <Bell className="h-5 w-5 text-primary" /> Avisos de pedido listo en tu celular
      </div>
      {state === 'ios-install' && (
        <p>
          En iPhone, primero agregá Datta a la pantalla de inicio: tocá <strong>Compartir</strong> →{' '}
          <strong>Agregar a inicio</strong>, abrí Datta desde ese ícono y volvé a esta pantalla.
        </p>
      )}
      {state === 'unsupported' && <p>Este navegador no admite avisos. Usá Chrome (Android) o Safari (iPhone).</p>}
      {state === 'denied' && (
        <p className="flex items-start gap-2">
          <BellOff className="mt-0.5 h-4 w-4 shrink-0" />
          Los avisos están bloqueados. Entrá a la configuración del navegador → Notificaciones y permití Datta.
        </p>
      )}
      {state === 'off' && (
        <>
          <p>Te llega una notificación, como un mensaje, cuando cocina marca listo un pedido que tomaste vos.</p>
          <Button disabled={busy} onClick={() => run(enablePush, 'Listo: vas a recibir los avisos en este celular')} className="gap-2">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Activar avisos
          </Button>
        </>
      )}
    </div>
  );
}
