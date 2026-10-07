import { useSupportUnread } from '@/lib/support';

/** Contador de inconvenientes sin leer para el ítem de la barra lateral. */
export default function SupportNavBadge({ collapsed }: { collapsed: boolean }) {
  const unread = useSupportUnread();
  if (!unread) return null;
  if (collapsed) return <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary" aria-label={`${unread} sin leer`} />;
  return (
    <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold leading-none text-primary-foreground">
      {unread > 99 ? '99+' : unread}
    </span>
  );
}
