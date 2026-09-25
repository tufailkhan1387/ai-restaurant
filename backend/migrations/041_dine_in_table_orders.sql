-- 041: Add dine_in fulfillment type, table, and reservation references to orders table

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT conname 
    FROM pg_constraint 
    WHERE conrelid = 'public.orders'::regclass 
      AND contype = 'c' 
      AND pg_get_constraintdef(oid) LIKE '%fulfillment_type%'
  ) LOOP
    EXECUTE 'ALTER TABLE public.orders DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;
END $$;

DO $$
BEGIN
  ALTER TABLE public.orders
    ADD CONSTRAINT orders_fulfillment_type_check
    CHECK (fulfillment_type IN ('delivery', 'pickup', 'dine_in'));
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS table_id uuid REFERENCES public.restaurant_tables(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS table_number text,
  ADD COLUMN IF NOT EXISTS reservation_id uuid REFERENCES public.table_reservations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_table_id ON public.orders(table_id);
CREATE INDEX IF NOT EXISTS idx_orders_reservation_id ON public.orders(reservation_id);
