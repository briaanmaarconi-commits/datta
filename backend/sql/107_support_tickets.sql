-- Inconvenientes: los locales (admin/cajero) reportan problemas a Datta y conversan con el superadmin.
-- Estados: new | in_progress | resolved | archived. Solo el superadmin cambia el estado.
-- is_read: el superadmin ya lo vio. client_unread: hay una respuesta de Datta que el local no leyó.

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 5 AND 120),
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 30 AND 5000),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'resolved', 'archived')),
  is_read boolean NOT NULL DEFAULT false,
  client_unread boolean NOT NULL DEFAULT false,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_tickets_est_idx ON public.support_tickets (establishment_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_inbox_idx ON public.support_tickets (status, is_read, last_message_at DESC);

CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  from_datta boolean NOT NULL DEFAULT false,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_ticket_messages_ticket_idx ON public.support_ticket_messages (ticket_id, created_at);

-- Personal del local que puede usar la sección (admin y cajero).
CREATE OR REPLACE FUNCTION public.is_establishment_manager(_user_id uuid, _est uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = _user_id AND establishment_id = _est AND role IN ('admin', 'cashier')
  )
$$;

-- Alta de un inconveniente: el local, autor y estado los fija el servidor, no el cliente.
CREATE OR REPLACE FUNCTION public.support_ticket_before_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_superadmin(auth.uid()) THEN
    NEW.establishment_id := public.get_user_establishment(auth.uid());
  END IF;
  NEW.created_by := COALESCE(auth.uid(), NEW.created_by);
  NEW.title := btrim(NEW.title);
  NEW.description := btrim(NEW.description);
  NEW.status := 'new';
  NEW.is_read := false;
  NEW.client_unread := false;
  NEW.last_message_at := now();
  NEW.resolved_at := NULL;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS support_ticket_before_insert ON public.support_tickets;
CREATE TRIGGER support_ticket_before_insert BEFORE INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.support_ticket_before_insert();

-- Cambios: el local solo puede marcar como leídas las respuestas (client_unread); el resto es del superadmin.
CREATE OR REPLACE FUNCTION public.support_ticket_before_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_setting('datta.ticket_sync', true) = 'on' THEN
    NULL; -- actualización interna al llegar un mensaje
  ELSIF auth.uid() IS NOT NULL AND NOT public.is_superadmin(auth.uid()) THEN
    IF NEW.establishment_id IS DISTINCT FROM OLD.establishment_id
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.is_read IS DISTINCT FROM OLD.is_read
       OR NEW.last_message_at IS DISTINCT FROM OLD.last_message_at
       OR NEW.resolved_at IS DISTINCT FROM OLD.resolved_at
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Solo Datta puede cambiar el estado de un inconveniente' USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.establishment_id IS DISTINCT FROM OLD.establishment_id OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'No se puede cambiar el local ni el autor de un inconveniente' USING ERRCODE = '42501';
  END IF;
  IF NEW.status = 'resolved' AND OLD.status IS DISTINCT FROM 'resolved' THEN
    NEW.resolved_at := now();
  ELSIF NEW.status <> 'resolved' THEN
    NEW.resolved_at := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS support_ticket_before_update ON public.support_tickets;
CREATE TRIGGER support_ticket_before_update BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.support_ticket_before_update();

-- Mensajes: autor, origen (Datta o local) y local los fija el servidor.
CREATE OR REPLACE FUNCTION public.support_message_before_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT t.establishment_id INTO NEW.establishment_id FROM public.support_tickets t WHERE t.id = NEW.ticket_id;
  NEW.author_id := COALESCE(auth.uid(), NEW.author_id);
  NEW.from_datta := auth.uid() IS NOT NULL AND public.is_superadmin(auth.uid());
  NEW.body := btrim(NEW.body);
  NEW.created_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS support_message_before_insert ON public.support_ticket_messages;
CREATE TRIGGER support_message_before_insert BEFORE INSERT ON public.support_ticket_messages
  FOR EACH ROW EXECUTE FUNCTION public.support_message_before_insert();

-- Al llegar un mensaje se actualiza la bandeja: respuesta de Datta => el local tiene algo sin leer;
-- respuesta del local => vuelve a la bandeja de Datta como no leído (y se reabre si estaba cerrado).
CREATE OR REPLACE FUNCTION public.support_message_after_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('datta.ticket_sync', 'on', true);
  IF NEW.from_datta THEN
    UPDATE public.support_tickets
       SET last_message_at = NEW.created_at, client_unread = true, is_read = true,
           status = CASE WHEN status = 'new' THEN 'in_progress' ELSE status END
     WHERE id = NEW.ticket_id;
  ELSE
    UPDATE public.support_tickets
       SET last_message_at = NEW.created_at, is_read = false,
           status = CASE WHEN status IN ('resolved', 'archived') THEN 'in_progress' ELSE status END
     WHERE id = NEW.ticket_id;
  END IF;
  PERFORM set_config('datta.ticket_sync', 'off', true);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS support_message_after_insert ON public.support_ticket_messages;
CREATE TRIGGER support_message_after_insert AFTER INSERT ON public.support_ticket_messages
  FOR EACH ROW EXECUTE FUNCTION public.support_message_after_insert();

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.support_tickets, public.support_ticket_messages FROM anon;

DROP POLICY IF EXISTS "Superadmin full access support_tickets" ON public.support_tickets;
CREATE POLICY "Superadmin full access support_tickets" ON public.support_tickets
  FOR ALL TO authenticated USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));
DROP POLICY IF EXISTS "Managers read own support_tickets" ON public.support_tickets;
CREATE POLICY "Managers read own support_tickets" ON public.support_tickets
  FOR SELECT TO authenticated USING (public.is_establishment_manager(auth.uid(), establishment_id));
DROP POLICY IF EXISTS "Managers create own support_tickets" ON public.support_tickets;
CREATE POLICY "Managers create own support_tickets" ON public.support_tickets
  FOR INSERT TO authenticated WITH CHECK (public.is_establishment_manager(auth.uid(), establishment_id));
DROP POLICY IF EXISTS "Managers mark own support_tickets read" ON public.support_tickets;
CREATE POLICY "Managers mark own support_tickets read" ON public.support_tickets
  FOR UPDATE TO authenticated
  USING (public.is_establishment_manager(auth.uid(), establishment_id))
  WITH CHECK (public.is_establishment_manager(auth.uid(), establishment_id));

DROP POLICY IF EXISTS "Superadmin full access support_ticket_messages" ON public.support_ticket_messages;
CREATE POLICY "Superadmin full access support_ticket_messages" ON public.support_ticket_messages
  FOR ALL TO authenticated USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));
DROP POLICY IF EXISTS "Managers read own support_ticket_messages" ON public.support_ticket_messages;
CREATE POLICY "Managers read own support_ticket_messages" ON public.support_ticket_messages
  FOR SELECT TO authenticated USING (public.is_establishment_manager(auth.uid(), establishment_id));
DROP POLICY IF EXISTS "Managers reply own support_ticket_messages" ON public.support_ticket_messages;
CREATE POLICY "Managers reply own support_ticket_messages" ON public.support_ticket_messages
  FOR INSERT TO authenticated
  WITH CHECK (NOT from_datta AND public.is_establishment_manager(auth.uid(), establishment_id));

-- Tiempo real (el payload lleva el establecimiento; el superadmin recibe todo).
DROP TRIGGER IF EXISTS notify_change_support_tickets ON public.support_tickets;
CREATE TRIGGER notify_change_support_tickets AFTER INSERT OR UPDATE OR DELETE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.notify_change();
DROP TRIGGER IF EXISTS notify_change_support_ticket_messages ON public.support_ticket_messages;
CREATE TRIGGER notify_change_support_ticket_messages AFTER INSERT OR UPDATE OR DELETE ON public.support_ticket_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_change();
