DO $$
DECLARE
  _est uuid := '5a56bc2d-c69b-49e7-96b4-7ff690ad8140';
  _o uuid;
BEGIN
  -- Mesa 3
  INSERT INTO orders (establishment_id, table_id, status, total, created_at, prepared_at)
  VALUES (_est,'23036627-407c-4a32-ac90-a650534caa8d','ready',18500, now()-interval '22 minutes', now()-interval '7 minutes')
  RETURNING id INTO _o;
  INSERT INTO order_items (order_id, product_id, quantity, unit_price, notes) VALUES
    (_o,'19b611b9-e833-44fe-9f1d-a9f7d5167c7b',2,7000,'sin aceitunas'),
    (_o,'3b3f32fe-a70a-4898-af70-d319e7a092f0',1,4500,null);
  UPDATE tables SET status='occupied', guest_count=3 WHERE id='23036627-407c-4a32-ac90-a650534caa8d';

  -- Mesa 5
  INSERT INTO orders (establishment_id, table_id, status, total, created_at, prepared_at)
  VALUES (_est,'6b402a69-9b76-4541-b79e-492658ce6f60','ready',15200, now()-interval '14 minutes', now()-interval '2 minutes')
  RETURNING id INTO _o;
  INSERT INTO order_items (order_id, product_id, quantity, unit_price, notes) VALUES
    (_o,'fe2a3daa-8496-40d4-b25f-0a05df2aa92a',1,8200,'sin cebolla'),
    (_o,'54957e17-6ba1-40f0-b1c9-1ecb243beb95',1,7000,null);
  UPDATE tables SET status='occupied', guest_count=2 WHERE id='6b402a69-9b76-4541-b79e-492658ce6f60';

  -- Mesa 8 (esperando hace rato)
  INSERT INTO orders (establishment_id, table_id, status, total, created_at, prepared_at)
  VALUES (_est,'ee4f7a5b-c206-4dd4-95d3-7db85b7894a7','ready',21000, now()-interval '35 minutes', now()-interval '11 minutes')
  RETURNING id INTO _o;
  INSERT INTO order_items (order_id, product_id, quantity, unit_price, notes) VALUES
    (_o,'b5619c0e-9f96-4dea-9959-086adfc6fb30',1,9000,null),
    (_o,'cb3b52de-5bd1-4c6e-a182-98b012a78087',6,1500,'bien calientes'),
    (_o,'3d218509-064b-4179-a76d-45a1d778ffcc',1,3000,null);
  UPDATE tables SET status='occupied', guest_count=4 WHERE id='ee4f7a5b-c206-4dd4-95d3-7db85b7894a7';

  -- Mesa 2 en preparación (para contraste)
  INSERT INTO orders (establishment_id, table_id, status, total, created_at)
  VALUES (_est,'2c2ecd4c-ad31-4562-8013-4a7c46a516db','preparing',9600, now()-interval '6 minutes')
  RETURNING id INTO _o;
  INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES
    (_o,'ad687c16-c4d9-48c7-82b7-164cde54eabf',1,6600),
    (_o,'92e0a915-9b96-440d-a2e7-f7c2ed6e6c1d',1,3000);
  UPDATE tables SET status='occupied', guest_count=2 WHERE id='2c2ecd4c-ad31-4562-8013-4a7c46a516db';
END $$;