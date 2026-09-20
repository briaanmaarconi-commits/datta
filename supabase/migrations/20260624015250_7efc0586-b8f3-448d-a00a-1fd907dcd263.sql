
CREATE OR REPLACE FUNCTION public.get_business_health(_establishment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _today_start timestamptz := date_trunc('day', now());
  _today_end   timestamptz := _today_start + interval '1 day';
  _week_start  timestamptz := _today_start - interval '7 days';
  _week_end    timestamptz := _today_start;
  _prev_week_start timestamptz := _today_start - interval '14 days';
  _prev_week_end   timestamptz := _today_start - interval '7 days';

  _sales_week numeric;
  _sales_prev numeric;
  _orders_week int;
  _orders_prev int;
  _ticket_week numeric;
  _ticket_prev numeric;
  _cost_week numeric;
  _expenses_week numeric;
  _active_tables int;
  _total_tables int;

  _growth_score numeric;
  _ticket_score numeric;
  _cost_score numeric;
  _occ_score numeric;
  _final_score int;
BEGIN
  SELECT COALESCE(SUM(total), 0), COUNT(*)
    INTO _sales_week, _orders_week
  FROM orders
  WHERE establishment_id = _establishment_id
    AND status = 'closed'
    AND created_at >= _week_start AND created_at < _week_end;

  SELECT COALESCE(SUM(total), 0), COUNT(*)
    INTO _sales_prev, _orders_prev
  FROM orders
  WHERE establishment_id = _establishment_id
    AND status = 'closed'
    AND created_at >= _prev_week_start AND created_at < _prev_week_end;

  _ticket_week := CASE WHEN _orders_week > 0 THEN _sales_week / _orders_week ELSE 0 END;
  _ticket_prev := CASE WHEN _orders_prev > 0 THEN _sales_prev / _orders_prev ELSE 0 END;

  SELECT COALESCE(SUM(oi.quantity * oi.cost_snapshot), 0)
    INTO _cost_week
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE o.establishment_id = _establishment_id
    AND o.status = 'closed'
    AND o.created_at >= _week_start AND o.created_at < _week_end;

  SELECT COALESCE(SUM(amount), 0)
    INTO _expenses_week
  FROM finance_transactions
  WHERE establishment_id = _establishment_id
    AND type = 'expense'
    AND date >= _week_start::date AND date < _week_end::date;

  SELECT COUNT(*) FILTER (WHERE status <> 'free'), COUNT(*)
    INTO _active_tables, _total_tables
  FROM tables WHERE establishment_id = _establishment_id;

  -- Sub-scores 0-100
  _growth_score := CASE
    WHEN _sales_prev = 0 AND _sales_week > 0 THEN 80
    WHEN _sales_prev = 0 THEN 50
    ELSE LEAST(100, GREATEST(0, 50 + ((_sales_week - _sales_prev) / _sales_prev) * 100))
  END;

  _ticket_score := CASE
    WHEN _ticket_prev = 0 AND _ticket_week > 0 THEN 70
    WHEN _ticket_prev = 0 THEN 50
    ELSE LEAST(100, GREATEST(0, 50 + ((_ticket_week - _ticket_prev) / _ticket_prev) * 100))
  END;

  -- Cost ratio (mercadería + gastos operativos) sobre ventas: ideal <60%
  _cost_score := CASE
    WHEN _sales_week = 0 THEN 50
    ELSE LEAST(100, GREATEST(0, 100 - ((_cost_week + _expenses_week) / _sales_week) * 100))
  END;

  _occ_score := CASE
    WHEN _total_tables = 0 THEN 50
    ELSE LEAST(100, (_active_tables::numeric / _total_tables) * 100)
  END;

  _final_score := ROUND((_growth_score * 0.35 + _ticket_score * 0.20 + _cost_score * 0.30 + _occ_score * 0.15))::int;

  RETURN jsonb_build_object(
    'score', _final_score,
    'sales_week', _sales_week,
    'sales_prev', _sales_prev,
    'orders_week', _orders_week,
    'orders_prev', _orders_prev,
    'avg_ticket_week', _ticket_week,
    'avg_ticket_prev', _ticket_prev,
    'cost_week', _cost_week,
    'expenses_week', _expenses_week,
    'active_tables', _active_tables,
    'total_tables', _total_tables,
    'sub_scores', jsonb_build_object(
      'growth', ROUND(_growth_score),
      'ticket', ROUND(_ticket_score),
      'cost',   ROUND(_cost_score),
      'occupancy', ROUND(_occ_score)
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_business_health(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_business_health(uuid) TO authenticated, service_role;
