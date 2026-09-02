-- Idempotent patch for live DBs where restaurants already exists but Telnyx/Synthflow
-- columns are missing. Safe to re-run. Deploy this file then:
--   cd backend && npm run db:migrate
-- Or run this SQL directly against the LIVE DATABASE_URL (not local 127.0.0.1).

DO $$
BEGIN
  IF to_regclass('public.restaurants') IS NULL THEN
    RAISE EXCEPTION 'public.restaurants table does not exist';
  END IF;

  ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS telnyx_phone_number text,
    ADD COLUMN IF NOT EXISTS telnyx_phone_number_id text,
    ADD COLUMN IF NOT EXISTS telnyx_order_id text,
    ADD COLUMN IF NOT EXISTS synthflow_agent_id text,
    ADD COLUMN IF NOT EXISTS synthflow_action_ids jsonb DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS voice_provider text DEFAULT 'elevenlabs_twilio',
    ADD COLUMN IF NOT EXISTS synthflow_synced_at timestamptz;

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
    RAISE NOTICE 'public.calls missing — restaurant columns are enough for Telnyx assign';
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
