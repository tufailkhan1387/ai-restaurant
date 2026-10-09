-- Voice-minute allowance (plan included + purchased top-ups) and purchase history.

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS voice_minutes_included integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS voice_minutes_purchased integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS voice_minutes_used integer NOT NULL DEFAULT 0;

-- Seed included minutes from known plans (legacy / unset → Growth allotment).
UPDATE public.restaurants
SET voice_minutes_included = CASE lower(coalesce(subscription_plan, ''))
  WHEN 'starter' THEN 1000
  WHEN 'growth' THEN 2500
  WHEN 'pilot' THEN 2500
  ELSE 2500
END
WHERE voice_minutes_included = 0;

CREATE TABLE IF NOT EXISTS public.billing_minute_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  pack_id text NOT NULL,
  minutes integer NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  status text NOT NULL DEFAULT 'incomplete',
  mode text NOT NULL DEFAULT 'dummy',
  customer_email text,
  card_last4 text,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS billing_minute_purchases_checkout_session_idx
  ON public.billing_minute_purchases (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS billing_minute_purchases_restaurant_id_idx
  ON public.billing_minute_purchases (restaurant_id);
