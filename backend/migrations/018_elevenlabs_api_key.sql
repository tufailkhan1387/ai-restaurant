-- Add ElevenLabs and Twilio credential columns to restaurants table
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS elevenlabs_api_key TEXT,
  ADD COLUMN IF NOT EXISTS elevenlabs_connected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS twilio_account_sid TEXT,
  ADD COLUMN IF NOT EXISTS twilio_auth_token TEXT,
  ADD COLUMN IF NOT EXISTS twilio_connected_at TIMESTAMPTZ;
