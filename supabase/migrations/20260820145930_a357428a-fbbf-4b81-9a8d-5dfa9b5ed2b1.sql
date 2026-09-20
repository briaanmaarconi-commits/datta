ALTER TABLE public.establishments ADD COLUMN IF NOT EXISTS ai_invoice_reader boolean NOT NULL DEFAULT false;
ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS receipt_url text;

UPDATE public.establishments SET ai_invoice_reader = true WHERE name IN ('la cabrera', 'Restaurante prueba');

CREATE POLICY "Users read own establishment receipts"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'purchase-receipts'
  AND (
    public.is_superadmin(auth.uid())
    OR (storage.foldername(name))[1] = public.get_user_establishment(auth.uid())::text
  )
);

CREATE POLICY "Users upload own establishment receipts"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'purchase-receipts'
  AND (
    public.is_superadmin(auth.uid())
    OR (storage.foldername(name))[1] = public.get_user_establishment(auth.uid())::text
  )
);

CREATE POLICY "Users delete own establishment receipts"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'purchase-receipts'
  AND (
    public.is_superadmin(auth.uid())
    OR (storage.foldername(name))[1] = public.get_user_establishment(auth.uid())::text
  )
);