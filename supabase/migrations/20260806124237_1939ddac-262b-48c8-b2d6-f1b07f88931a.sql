DO $$
DECLARE
  _est uuid := '72c14bf0-9a6e-4903-8305-d696b9e8d26c';
  _o uuid;
BEGIN
  INSERT INTO orders (establishment_id, table_id, status, total, created_at, prepared_at)
  VALUES (_est,'57ad83af-c78b-4f38-a472-61b0d6bd4aac','ready',19800, now()-interval '20 minutes', now()-interval '3 minutes')
  RETURNING id INTO _o;
  INSERT INTO order_items (order_id, product_id, quantity, unit_price, notes) VALUES
    (_o,'d15f3ac0-7408-4821-9e1d-c6ab2617f38c',1,8500,'sin panceta'),
    (_o,'7c7ad5ed-4a0a-4dd7-bce6-3df5a7b74476',1,8200,null),
    (_o,'f107f67b-0c2e-4c85-b155-a2147a2052b1',1,2800,null);
  UPDATE tables SET status='occupied', guest_count=3 WHERE id='57ad83af-c78b-4f38-a472-61b0d6bd4aac';

  INSERT INTO orders (establishment_id, table_id, status, total, created_at, prepared_at)
  VALUES (_est,'463934f3-02e8-4111-b9b9-7fda2362cd82','ready',18000, now()-interval '12 minutes', now()-interval '1 minute')
  RETURNING id INTO _o;
  INSERT INTO order_items (order_id, product_id, quantity, unit_price, notes) VALUES
    (_o,'cf206960-6cb0-4de3-b52b-43d84e8e1778',1,13500,'punto medio'),
    (_o,'03d2fed5-a4be-44af-8c38-d36898fe26d0',1,4500,null);
  UPDATE tables SET status='occupied', guest_count=2 WHERE id='463934f3-02e8-4111-b9b9-7fda2362cd82';

  INSERT INTO orders (establishment_id, table_id, status, total, created_at, prepared_at)
  VALUES (_est,'468a5cd2-32b9-4387-8853-8dbbe1b7afcf','ready',42481, now()-interval '38 minutes', now()-interval '12 minutes')
  RETURNING id INTO _o;
  INSERT INTO order_items (order_id, product_id, quantity, unit_price, notes) VALUES
    (_o,'fb2ff202-205c-4aad-ac92-f9d68ee868d5',1,28481,'jugoso'),
    (_o,'99a6f5de-fadc-4d3e-9e90-e840a533716b',1,7800,null),
    (_o,'ab75b60b-393a-4e44-8cd8-eb9d9fbbde3c',1,5500,null);
  UPDATE tables SET status='occupied', guest_count=4 WHERE id='468a5cd2-32b9-4387-8853-8dbbe1b7afcf';

  INSERT INTO orders (establishment_id, table_id, status, total, created_at)
  VALUES (_est,'7347f2e1-79c6-4281-ace2-bf4ef6a049be','preparing',11300, now()-interval '5 minutes')
  RETURNING id INTO _o;
  INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES
    (_o,'99a6f5de-fadc-4d3e-9e90-e840a533716b',1,7800),
    (_o,'ab75b60b-393a-4e44-8cd8-eb9d9fbbde3c',1,3500);
  UPDATE tables SET status='occupied', guest_count=2 WHERE id='7347f2e1-79c6-4281-ace2-bf4ef6a049be';
END $$;