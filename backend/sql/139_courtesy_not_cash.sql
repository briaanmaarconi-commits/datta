-- El gasto de una cortesía (invitación, comida de personal, consumo interno) es el costo de la
-- mercadería regalada: no sale plata del cajón. Se guardaba con affects_cash = true y el arqueo lo
-- restaba del efectivo esperado (Bodegón 65: 04/10 $2.644, 16/10 $5.026, 14/11 $2.644 con el turno
-- sin efectivo, esperado -$2.644). Se marcan los ya cargados como fuera de caja. Idempotente.
-- Las diferencias guardadas de los turnos cerrados no se tocan acá.

UPDATE public.finance_transactions ft
SET affects_cash = false
FROM public.courtesy_charges cc
WHERE cc.finance_transaction_id = ft.id
  AND ft.affects_cash;
