-- 040: Table reservations module
-- restaurant_tables: physical tables catalog
-- table_reservations: individual booking slots

CREATE TABLE IF NOT EXISTS public.restaurant_tables (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  table_number    text NOT NULL,
  capacity        int  NOT NULL DEFAULT 2,
  location        text,
  is_active       boolean NOT NULL DEFAULT true,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, table_number)
);

ALTER TABLE public.restaurant_tables
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notes text;

DO $$ BEGIN
  CREATE TRIGGER trg_restaurant_tables_updated_at
    BEFORE UPDATE ON public.restaurant_tables
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.table_reservations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id       uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  table_id            uuid REFERENCES public.restaurant_tables(id) ON DELETE SET NULL,
  customer_name       text NOT NULL,
  customer_phone      text,
  customer_email      text,
  party_size          int  NOT NULL DEFAULT 1,
  reservation_date    date NOT NULL,
  start_time          time NOT NULL,
  slot_duration_hours numeric(4,2) NOT NULL DEFAULT 1,
  status              text NOT NULL DEFAULT 'pending',
  notes               text,
  source              text NOT NULL DEFAULT 'phone',
  call_id             uuid REFERENCES public.calls(id) ON DELETE SET NULL,
  ai_extracted_data   jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  CREATE TRIGGER trg_table_reservations_updated_at
    BEFORE UPDATE ON public.table_reservations
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS idx_table_reservations_restaurant_date
  ON public.table_reservations(restaurant_id, reservation_date);
CREATE INDEX IF NOT EXISTS idx_table_reservations_table_date
  ON public.table_reservations(table_id, reservation_date);
CREATE INDEX IF NOT EXISTS idx_table_reservations_status
  ON public.table_reservations(status);