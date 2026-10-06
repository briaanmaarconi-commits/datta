import { AlertTriangle, Gift } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

/**
 * Aviso de suscripción para los usuarios del restaurante: vencida (con los días que faltan para la suspensión)
 * o prueba gratis por terminar. No se muestra al superadmin ni cuando está todo al día.
 */
export default function ServiceBanner() {
  const { service, role } = useAuth();
  if (!service || role === 'superadmin') return null;

  if (service.status === 'past_due') {
    const days = service.daysToSuspension ?? 0;
    return (
      <div className="flex flex-wrap items-center gap-3 bg-destructive px-4 py-2 text-sm text-destructive-foreground">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="flex-1">
          Tu suscripción de Datta está vencida hace {service.overdueDays} {service.overdueDays === 1 ? 'día' : 'días'}. Si no se regulariza, el servicio se suspende en {days} {days === 1 ? 'día' : 'días'}.
        </span>
        {service.payUrl && role === 'admin' ? (
          <a href={service.payUrl} target="_blank" rel="noreferrer" className="rounded bg-white/90 px-3 py-1 font-medium text-destructive hover:bg-white">Pagar ahora</a>
        ) : <span className="opacity-90">Avisale al administrador.</span>}
      </div>
    );
  }

  if (service.status === 'trial' && service.trialEndsAt) {
    const left = Math.round((Date.parse(service.trialEndsAt + 'T00:00:00Z') - Date.parse(new Date().toISOString().slice(0, 10) + 'T00:00:00Z')) / 86_400_000);
    if (left > 5) return null;
    return (
      <div className="flex items-center gap-3 bg-amber-500 px-4 py-2 text-sm text-black">
        <Gift className="h-4 w-4 shrink-0" />
        <span className="flex-1">Tu prueba gratis termina {left <= 0 ? 'hoy' : `en ${left} ${left === 1 ? 'día' : 'días'}`}.</span>
        {service.payUrl && role === 'admin' && <a href={service.payUrl} target="_blank" rel="noreferrer" className="rounded bg-black/80 px-3 py-1 font-medium text-white">Activar suscripción</a>}
      </div>
    );
  }
  return null;
}
