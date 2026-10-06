import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '@/lib/db';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Bell, BellOff } from 'lucide-react';

interface UseWaiterCallsProps {
  establishmentId: string | null;
  tables: any[];
}

export default function WaiterCallNotifications({ establishmentId, tables }: UseWaiterCallsProps) {
  const [muted, setMuted] = useState(() => sessionStorage.getItem('waiter_calls_muted') === 'true');
  const audioCtxRef = useRef<AudioContext | null>(null);

  const getAudioContext = useCallback((): AudioContext => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  // Distinct doorbell-like chime (different from kitchen bell)
  const playCallSound = useCallback(() => {
    if (muted) return;
    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;

      const playTone = (freq: number, start: number, dur: number, vol: number, type: OscillatorType = 'sine') => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(vol, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + dur);
      };

      // Two-tone doorbell: ding-dong pattern, repeated twice
      playTone(659, now, 0.4, 0.5, 'sine');        // E5
      playTone(523, now + 0.4, 0.5, 0.5, 'sine');   // C5
      playTone(659, now + 1.0, 0.4, 0.5, 'sine');   // E5
      playTone(523, now + 1.4, 0.5, 0.5, 'sine');   // C5
    } catch (e) {
      console.warn('Waiter call sound failed:', e);
    }
  }, [muted, getAudioContext]);

  useEffect(() => {
    if (!establishmentId) return;

    const channel = db
      .channel('waiter-calls-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'waiter_calls',
          filter: `establishment_id=eq.${establishmentId}`,
        },
        (payload) => {
          const call = payload.new as any;
          const table = tables.find(t => t.id === call.table_id);
          const tableNum = table?.number || '?';

          playCallSound();
          try { navigator.vibrate?.([300, 150, 300]); } catch {}

          toast.info(`🛎️ Mesa ${tableNum} está llamando al mozo`, {
            duration: 15000,
            action: {
              label: 'Atender',
              onClick: () => {
                db
                  .from('waiter_calls' as any)
                  .update({ status: 'acknowledged', acknowledged_at: new Date().toISOString() })
                  .eq('id', call.id)
                  .then();
              },
            },
          });
        }
      )
      .subscribe();

    return () => {
      db.removeChannel(channel);
    };
  }, [establishmentId, tables, playCallSound]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    sessionStorage.setItem('waiter_calls_muted', String(next));
    toast.info(next ? 'Notificaciones de llamadas silenciadas' : 'Notificaciones de llamadas activadas');
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggleMute}
      className={`gap-1 ${muted ? 'text-muted-foreground' : ''}`}
      title={muted ? 'Activar notificaciones de llamadas' : 'Silenciar notificaciones de llamadas'}
    >
      {muted ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
      {muted ? 'Llamadas silenciadas' : 'Llamadas activas'}
    </Button>
  );
}
