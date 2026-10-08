-- Marketplace columns on kitchen orders (Uber / Deliveroo / Just Eat)
-- Unique (source, external_order_id). Migrates existing Uber rows without dropping data.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS external_order_id text,
  ADD COLUMN IF NOT EXISTS marketplace_store_id text,
  ADD COLUMN IF NOT EXISTS marketplace_status text,
  ADD COLUMN IF NOT EXISTS marketplace_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS marketplace_totals jsonb,
  ADD COLUMN IF NOT EXISTS raw_payload jsonb;

UPDATE public.orders
SET
  source = 'uber',
  external_order_id = substring(tracking_code from 6)
WHERE tracking_code LIKE 'UBER-%'
  AND (external_order_id IS NULL OR external_order_id = '');

UPDATE public.orders o
SET
  source = 'uber',
  external_order_id = COALESCE(o.external_order_id, u.uber_order_id),
  marketplace_store_id = COALESCE(o.marketplace_store_id, u.store_id),
  marketplace_items = CASE
    WHEN o.marketplace_items IS NULL OR o.marketplace_items = '[]'::jsonb THEN COALESCE(u.items, '[]'::jsonb)
    ELSE o.marketplace_items
  END,
  marketplace_totals = COALESCE(o.marketplace_totals, u.totals),
  raw_payload = COALESCE(o.raw_payload, u.raw_payload)
FROM public.uber_orders u
WHERE u.local_order_id = o.id;

UPDATE public.orders
SET marketplace_status = CASE status
  WHEN 'pending' THEN 'placed'
  WHEN 'confirmed' THEN 'accepted'
  WHEN 'preparing' THEN 'preparing'
  WHEN 'ready' THEN 'ready'
  WHEN 'assigned' THEN 'completed'
  WHEN 'out_for_delivery' THEN 'completed'
  WHEN 'delivered' THEN 'completed'
  WHEN 'cancelled' THEN 'cancelled'
  ELSE marketplace_status
END
WHERE source IN ('uber', 'deliveroo', 'justeat')
  AND marketplace_status IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_source_external_order_id_key
  ON public.orders (source, external_order_id)
  WHERE external_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_source_created_at_idx
  ON public.orders (source, created_at DESC);

CREATE TABLE IF NOT EXISTS public.marketplace_webhook_events (
  source text NOT NULL,
  event_id text NOT NULL,
  event_type text,
  external_order_id text,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source, event_id)
);
