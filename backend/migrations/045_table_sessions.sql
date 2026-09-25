-- 045: Table dining sessions group multiple dine-in orders for one customer at one table

CREATE TABLE IF NOT EXISTS public.table_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  table_id uuid REFERENCES public.restaurant_tables(id) ON DELETE SET NULL,
  table_number text NOT NULL,
  customer_name text,
  customer_phone text NOT NULL DEFAULT '',
  customer_phone_normalized text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open',
  source text NOT NULL DEFAULT 'qr',
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  closed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT table_sessions_status_check CHECK (status IN ('open', 'closed')),
  CONSTRAINT table_sessions_source_check CHECK (source IN ('qr', 'staff'))
);

CREATE INDEX IF NOT EXISTS idx_table_sessions_open
  ON public.table_sessions (restaurant_id, table_number, customer_phone_normalized, status);

CREATE INDEX IF NOT EXISTS idx_table_sessions_table
  ON public.table_sessions (restaurant_id, table_id, status);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS table_session_id uuid REFERENCES public.table_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS taken_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_table_session_id ON public.orders(table_session_id);
CREATE INDEX IF NOT EXISTS idx_orders_taken_by ON public.orders(taken_by);
