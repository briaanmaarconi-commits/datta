-- Verificación de RLS de 120_company_accounts.sql. Ejecutar dentro de BEGIN; <migración 120> + este archivo + ROLLBACK;
-- Usa usuarios reales de Olavarría y de otro local; no deja datos.
-- Prueba de comportamiento de RLS de 120_company_accounts.sql (se ejecuta dentro de una transacción y se descarta).
CREATE TEMP TABLE ids AS SELECT
  (SELECT id FROM auth.users WHERE email = 'caja@datta.com') AS caja,
  (SELECT id FROM auth.users WHERE email = 'mozo@datta.com') AS mozo,
  (SELECT id FROM auth.users WHERE email = 'restaurantolavarria@datta.com') AS admin,
  (SELECT id FROM auth.users WHERE email = 'agrocalifa@gmail.com') AS otro;
GRANT SELECT ON ids TO authenticated;

-- Fixture (como dueño de la base): una empresa del local Olavarría.
INSERT INTO public.company_accounts (id, establishment_id, name, cuit)
VALUES ('00000000-0000-0000-0000-0000000000a1', '018b04a8-18d9-49f7-86f8-b30be9307dd7', 'Empresa Test', '30712345678');

-- ───── CAJA ─────
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT caja FROM ids), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

DO $$ DECLARE n int; BEGIN
  INSERT INTO public.company_accounts (establishment_id, name) VALUES ('018b04a8-18d9-49f7-86f8-b30be9307dd7', 'Empresa de caja');
  RAISE NOTICE 'OK  caja crea una empresa nueva';
  UPDATE public.company_accounts SET name = 'Hackeada' WHERE name = 'Empresa de caja';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FALLA: la caja edito una empresa'; END IF;
  RAISE NOTICE 'OK  caja NO edita empresas';
  DELETE FROM public.company_accounts WHERE name = 'Empresa de caja';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FALLA: la caja borro una empresa'; END IF;
  RAISE NOTICE 'OK  caja NO borra empresas';
  BEGIN
    INSERT INTO public.company_accounts (establishment_id, name) VALUES ('00000000-0000-0000-0000-00000000dead', 'Fuera de local');
    RAISE EXCEPTION 'FALLA: la caja creo una empresa en otro local';
  EXCEPTION WHEN insufficient_privilege OR foreign_key_violation THEN RAISE NOTICE 'OK  caja NO crea empresas en otro local'; END;
END $$;

INSERT INTO public.company_vouchers (establishment_id, account_id, voucher_number, diners, signed_by, amount)
VALUES ('018b04a8-18d9-49f7-86f8-b30be9307dd7', '00000000-0000-0000-0000-0000000000a1', 'V-001', 3, 'Juan Perez', 30000);
DO $$ BEGIN RAISE NOTICE 'OK  caja registra un vale'; END $$;

DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.company_vouchers WHERE created_by = auth.uid();
  IF n <> 1 THEN RAISE EXCEPTION 'FALLA: created_by no lo fijo el servidor (n=%)', n; END IF;
  RAISE NOTICE 'OK  created_by lo fija el servidor';
  BEGIN
    INSERT INTO public.company_vouchers (establishment_id, account_id, voucher_number, amount)
    VALUES ('018b04a8-18d9-49f7-86f8-b30be9307dd7', '00000000-0000-0000-0000-0000000000a1', ' v-001 ', 100);
    RAISE EXCEPTION 'FALLA: se duplico el numero de vale';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'OK  vale duplicado rechazado (sin importar mayusculas/espacios)'; END;
  BEGIN
    INSERT INTO public.company_vouchers (establishment_id, account_id, voucher_number, amount, verified_at)
    VALUES ('018b04a8-18d9-49f7-86f8-b30be9307dd7', '00000000-0000-0000-0000-0000000000a1', 'V-002', 100, now());
    RAISE EXCEPTION 'FALLA: la caja pudo crear un vale ya verificado';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK  el vale siempre nace pendiente'; END;
  UPDATE public.company_vouchers SET amount = 1 WHERE voucher_number = 'V-001';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FALLA: la caja edito un vale'; END IF;
  RAISE NOTICE 'OK  caja NO edita vales';
  DELETE FROM public.company_vouchers WHERE voucher_number = 'V-001';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FALLA: la caja borro un vale'; END IF;
  RAISE NOTICE 'OK  caja NO borra vales';
  SELECT count(*) INTO n FROM public.company_accounts;
  IF n <> 2 THEN RAISE EXCEPTION 'FALLA: la caja no ve las empresas (n=%)', n; END IF;
  RAISE NOTICE 'OK  caja lee empresas y vales de su local';
END $$;

-- ───── MOZO ─────
RESET ROLE;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT mozo FROM ids), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.company_vouchers;
  IF n <> 0 THEN RAISE EXCEPTION 'FALLA: el mozo ve vales (n=%)', n; END IF;
  SELECT count(*) INTO n FROM public.company_accounts;
  IF n <> 0 THEN RAISE EXCEPTION 'FALLA: el mozo ve empresas (n=%)', n; END IF;
  BEGIN
    INSERT INTO public.company_vouchers (establishment_id, account_id, voucher_number, amount)
    VALUES ('018b04a8-18d9-49f7-86f8-b30be9307dd7', '00000000-0000-0000-0000-0000000000a1', 'V-MOZO', 100);
    RAISE EXCEPTION 'FALLA: el mozo registro un vale';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK  mozo no ve ni registra nada'; END;
END $$;

-- ───── ADMIN (Silvia) ─────
RESET ROLE;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT admin FROM ids), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE n int; sid uuid; BEGIN
  INSERT INTO public.company_accounts (establishment_id, name, cutoff_day) VALUES ('018b04a8-18d9-49f7-86f8-b30be9307dd7', 'Empresa Dos', 25);
  RAISE NOTICE 'OK  admin crea empresas';
  UPDATE public.company_vouchers SET verified_at = now(), verified_by = auth.uid() WHERE voucher_number = 'V-001';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'FALLA: el admin no pudo verificar el vale'; END IF;
  RAISE NOTICE 'OK  admin verifica vales';
  INSERT INTO public.company_settlements (establishment_id, account_id, amount, payment_method)
  VALUES ('018b04a8-18d9-49f7-86f8-b30be9307dd7', '00000000-0000-0000-0000-0000000000a1', 30000, 'check') RETURNING id INTO sid;
  UPDATE public.company_vouchers SET settlement_id = sid WHERE voucher_number = 'V-001';
  RAISE NOTICE 'OK  admin registra un cobro (cheque) y lo aplica al vale';
  BEGIN
    INSERT INTO public.company_settlements (establishment_id, account_id, amount, payment_method)
    VALUES ('018b04a8-18d9-49f7-86f8-b30be9307dd7', '00000000-0000-0000-0000-0000000000a1', 10, 'bitcoin');
    RAISE EXCEPTION 'FALLA: medio de pago invalido aceptado';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'OK  medio de pago invalido rechazado'; END;
END $$;

-- ───── OTRO RESTAURANTE ─────
RESET ROLE;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT otro FROM ids), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.company_accounts;
  IF n <> 0 THEN RAISE EXCEPTION 'FALLA: otro restaurante ve empresas (n=%)', n; END IF;
  SELECT count(*) INTO n FROM public.company_vouchers;
  IF n <> 0 THEN RAISE EXCEPTION 'FALLA: otro restaurante ve vales (n=%)', n; END IF;
  BEGIN
    INSERT INTO public.company_vouchers (establishment_id, account_id, voucher_number, amount)
    VALUES ('018b04a8-18d9-49f7-86f8-b30be9307dd7', '00000000-0000-0000-0000-0000000000a1', 'V-ATAQUE', 100);
    RAISE EXCEPTION 'FALLA: otro restaurante registro un vale en Olavarria';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'OK  aislamiento entre restaurantes'; END;
END $$;
RESET ROLE;
