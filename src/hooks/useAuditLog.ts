import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCallback } from 'react';

export function useAuditLog() {
  const { establishmentId, session } = useAuth();

  const log = useCallback(async (
    action: string,
    tableName: string,
    recordId?: string,
    details?: Record<string, any>
  ) => {
    if (!establishmentId) return;
    try {
      await supabase.from('audit_logs').insert({
        user_id: session?.user?.id ?? null,
        establishment_id: establishmentId,
        action,
        table_name: tableName,
        record_id: recordId ?? null,
        details: details ?? {},
      } as any);
    } catch (e) {
      console.warn('Audit log failed:', e);
    }
  }, [establishmentId, session?.user?.id]);

  return { log };
}
