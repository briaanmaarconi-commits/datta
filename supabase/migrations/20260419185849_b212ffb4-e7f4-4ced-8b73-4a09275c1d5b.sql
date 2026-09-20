CREATE OR REPLACE FUNCTION public.cleanup_disabled_purchase_expenses()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.finance_transactions ft
  USING public.purchase_invoices pi, public.establishments e
  WHERE pi.finance_transaction_id = ft.id
    AND e.id = pi.establishment_id
    AND e.auto_purchase_to_expense = false;

  UPDATE public.purchase_invoices pi
  SET finance_transaction_id = NULL
  FROM public.establishments e
  WHERE e.id = pi.establishment_id
    AND e.auto_purchase_to_expense = false
    AND pi.finance_transaction_id IS NOT NULL;
END;
$$;