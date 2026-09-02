-- Telnyx dedicated numbers + Synthflow AI agents (per restaurant)
-- Safe to re-run: only adds missing columns/indexes when tables already exist.
-- Restaurant columns are applied even if public.calls is missing.

DO $$
BEGIN
  IF to_regclass('public.restaurants') IS NULL THEN
    RAISE NOTICE 'public.restaurants does not exist — skip Telnyx/Synthflow restaurant columns';
    RETURN;
  END IF;

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

  EXECUTE $i$
    CREATE UNIQUE INDEX IF NOT EXISTS restaurants_telnyx_phone_number_uidx
      ON public.restaurants (telnyx_phone_number)
      WHERE telnyx_phone_number IS NOT NULL
  $i$;

  EXECUTE $i$
    CREATE UNIQUE INDEX IF NOT EXISTS restaurants_synthflow_agent_id_uidx
      ON public.restaurants (synthflow_agent_id)
      WHERE synthflow_agent_id IS NOT NULL
  $i$;
END $$;

DO $$
BEGIN
  IF to_regclass('public.calls') IS NULL THEN
    RAISE NOTICE 'public.calls does not exist — skip Synthflow call columns';
    RETURN;
  END IF;

  ALTER TABLE public.calls
    ADD COLUMN IF NOT EXISTS synthflow_call_id text,
    ADD COLUMN IF NOT EXISTS restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS provider text DEFAULT 'twilio';

  EXECUTE $i$
    CREATE UNIQUE INDEX IF NOT EXISTS calls_synthflow_call_id_uidx
      ON public.calls (synthflow_call_id)
      WHERE synthflow_call_id IS NOT NULL
  $i$;
END $$;
