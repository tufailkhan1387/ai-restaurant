-- Uber Eats Marketplace orders (webhook + backfill storage)

CREATE TABLE IF NOT EXISTS public.uber_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uber_order_id text NOT NULL,
  display_id text,
  store_id text,
  current_state text,
  placed_at timestamptz,
  customer_name text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  totals jsonb,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uber_orders_uber_order_id_key UNIQUE (uber_order_id)
);

CREATE INDEX IF NOT EXISTS uber_orders_store_id_idx ON public.uber_orders (store_id);
CREATE INDEX IF NOT EXISTS uber_orders_current_state_idx ON public.uber_orders (current_state);
CREATE INDEX IF NOT EXISTS uber_orders_placed_at_idx ON public.uber_orders (placed_at DESC);

-- Optional: dedupe webhook retries by Uber event_id
CREATE TABLE IF NOT EXISTS public.uber_webhook_events (
  event_id text PRIMARY KEY,
  event_type text,
  uber_order_id text,
  received_at timestamptz NOT NULL DEFAULT now()
);
