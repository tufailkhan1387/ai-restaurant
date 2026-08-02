-- Telnyx dedicated numbers + Synthflow AI agents (per restaurant)

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS telnyx_phone_number text,
  ADD COLUMN IF NOT EXISTS telnyx_phone_number_id text,
  ADD COLUMN IF NOT EXISTS telnyx_order_id text,
  ADD COLUMN IF NOT EXISTS synthflow_agent_id text,
  ADD COLUMN IF NOT EXISTS synthflow_action_ids jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS voice_provider text DEFAULT 'elevenlabs_twilio',
  ADD COLUMN IF NOT EXISTS synthflow_synced_at timestamptz;

COMMENT ON COLUMN public.restaurants.voice_provider IS
  'elevenlabs_twilio | synthflow_telnyx — primary phone AI stack for this restaurant';

CREATE UNIQUE INDEX IF NOT EXISTS restaurants_telnyx_phone_number_uidx
  ON public.restaurants (telnyx_phone_number)
  WHERE telnyx_phone_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS restaurants_synthflow_agent_id_uidx
  ON public.restaurants (synthflow_agent_id)
  WHERE synthflow_agent_id IS NOT NULL;

ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS synthflow_call_id text,
  ADD COLUMN IF NOT EXISTS restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider text DEFAULT 'twilio';

CREATE UNIQUE INDEX IF NOT EXISTS calls_synthflow_call_id_uidx
  ON public.calls (synthflow_call_id)
  WHERE synthflow_call_id IS NOT NULL;
