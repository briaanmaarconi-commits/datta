-- Nuevas reglas de atraso: primera semana +6%, segunda +12%; a los 15 días se suspende y el equipo de Datta
-- llama al local desde Cobranzas. El vencimiento sigue fijo en el mismo día de cada mes. Idempotente.

UPDATE public.app_settings SET value = '15'::jsonb, updated_at = now() WHERE key = 'billing_grace_days';
