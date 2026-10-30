import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarClock } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { money } from '@/lib/billingApi';
import { nextStep, shortDate } from '@/lib/billingSchedule';

const NOTICE_DAYS = 7;

/**
 * Aviso de vencimiento de la suscripción para Caja y Admin: desde 7 días antes del vencimiento (amarillo)
 * y vencida con el recargo que corre (rojo). Solo el admin tiene el botón para subir el comprobante.
 * No se muestra al superadmin ni cuando falta más de una semana.
 */
export default function ServiceBanner() {
  const { service, role } = useAuth();
  if (!service || role === 'superadmin' || !service.nextDueDate) return null;
  const action = role === 'admin'
    ? <Link to="/admin/suscripcion" className="rounded bg-black/80 px-3 py-1 font-medium text-white hover:bg-black">Subir comprobante</Link>
    : <span className="opacity-90">Avisale al administrador.</span>;
  const amount = service.amountDue != null ? ` · ${money(service.amountDue)}` : '';

  if (service.status === 'past_due') {
    const step = nextStep(service.nextDueDate, service.overdueDays);
    return (
      <div className="flex flex-wrap items-center gap-3 bg-destructive px-4 py-2 text-sm text-destructive-foreground">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="flex-1">
          Tu suscripción de Datta venció el {shortDate(service.nextDueDate)}{amount}
          {service.surchargePct > 0 ? ` (incluye ${service.surchargePct}% de recargo)` : ''}. El {shortDate(step.date)} {step.what}.
        </span>
        {role === 'admin'
          ? <Link to="/admin/suscripcion" className="rounded bg-white/90 px-3 py-1 font-medium text-destructive hover:bg-white">Subir comprobante</Link>
          : <span className="opacity-90">Avisale al administrador.</span>}
      </div>
    );
  }

  const left = service.daysToDue;
  if (left == null || left > NOTICE_DAYS || !['trial', 'active'].includes(service.status)) return null;
  const when = left === 0 ? 'hoy' : left === 1 ? 'mañana' : `el ${shortDate(service.nextDueDate)}`;
  return (
    <div className="flex flex-wrap items-center gap-3 bg-amber-400 px-4 py-2 text-sm text-black">
      <CalendarClock className="h-4 w-4 shrink-0" />
      {service.autoDebit ? (
        <span className="flex-1">Tu suscripción de Datta se debita automáticamente {when}{amount}.</span>
      ) : (
        <>
          <span className="flex-1">
            {service.status === 'trial' ? 'Tu prueba gratis termina' : 'Tu suscripción de Datta vence'} {when}{amount}.
          </span>
          {action}
        </>
      )}
    </div>
  );
}
