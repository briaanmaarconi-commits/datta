import { useState, useEffect } from 'react';
import { db } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Bell } from 'lucide-react';
import { toast } from 'sonner';

interface CallWaiterButtonProps {
  tableId: string;
  establishmentId: string;
  sectorId?: string | null;
}

const COOLDOWN_MS = 120_000; // 2 minutes

export default function CallWaiterButton({ tableId, establishmentId, sectorId }: CallWaiterButtonProps) {
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleCall = async () => {
    if (cooldown > 0 || sending) return;
    setSending(true);
    try {
      const { error } = await db.from('waiter_calls' as any).insert({
        table_id: tableId,
        establishment_id: establishmentId,
        sector_id: sectorId || null,
        status: 'pending',
      });
      if (error) throw error;
      setCooldown(Math.floor(COOLDOWN_MS / 1000));
      toast.success('¡Mozo notificado! Ya viene a atenderte.');
    } catch {
      toast.error('No se pudo llamar al mozo. Intentá de nuevo.');
    } finally {
      setSending(false);
    }
  };

  const mins = Math.floor(cooldown / 60);
  const secs = cooldown % 60;

  return (
    <Button
      onClick={handleCall}
      disabled={cooldown > 0 || sending}
      className="w-full gap-2 h-12 text-base"
      variant={cooldown > 0 ? 'outline' : 'default'}
    >
      <Bell className="h-5 w-5" />
      {cooldown > 0
        ? `Mozo notificado (${mins}:${secs.toString().padStart(2, '0')})`
        : sending
          ? 'Llamando...'
          : '🛎️ Llamar al mozo'}
    </Button>
  );
}
