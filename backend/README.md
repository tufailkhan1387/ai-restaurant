# Standalone API (Node.js + PostgreSQL)

This server replaces **Supabase Edge Functions** and **Supabase Auth** while keeping your existing **Postgres** schema and data.

## Setup

1. **PostgreSQL** — use the same database you already have (dump from Supabase or a running Postgres instance).

2. **Run the auth migration once** (removes dependency on `auth.users` and adds local passwords):

   ```bash
   psql "$DATABASE_URL" -f migrations/001_standalone_auth.sql
   ```

3. **Set a password** for at least one profile (bcrypt). You can register the first user via `POST /api/auth/register` from the app sign-up page, or insert/update `profiles.password_hash` manually.

4. **Configure environment** — copy `.env.example` to `.env` and set `DATABASE_URL`, `JWT_SECRET`, `ELEVENLABS_*`, `TWILIO_*`, `PUBLIC_APP_URL`, etc.

5. **Install and run**

   ```bash
   npm install
   npm run dev
   ```

   Default port: **3001**.

6. **Create the first super admin** (after `DATABASE_URL` is set in `backend/.env`):

   ```bash
   npm run seed:super-admin --prefix backend
   ```

   Defaults: `admin@admin.com` / `11223344`. Override with `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

## Frontend

From the repo root, use `VITE_API_URL` empty in development so the Vite dev server proxies `/api` to `http://127.0.0.1:3001`.

In production, set `VITE_API_URL` to your public API origin (e.g. `https://api.yourdomain.com`).

## Twilio / ElevenLabs

Set `PUBLIC_API_URL` (or `PUBLIC_APP_URL`) to the public HTTPS origin of this API (no trailing slash), e.g. `https://airestaurant.toolkitpro.cloud`, so **Restaurant → Telephony** shows the correct copy-paste URLs.

### Mode A — `VOICE_ROUTING=twilio_webhook` (default)

Twilio **Voice → webhook** receives the call first. Our handler returns TwiML that streams audio to ElevenLabs.

- Twilio **POST** URL: `{PUBLIC_API}/api/functions/twilio-inbound-webhook`

Still configure **ElevenLabs agent tools** (server webhooks) to:

- `{PUBLIC_API}/api/functions/ai-place-order`
- `{PUBLIC_API}/api/functions/ai-order-status`

### Mode B — `VOICE_ROUTING=elevenlabs_native`

Twilio is **imported in ElevenLabs** and assigned to your ConvAI agent (use **Restaurant settings → Import Twilio number into ElevenLabs**, or the ElevenLabs UI). Do **not** set Twilio’s “A call comes in” URL to our inbound webhook for that number.

You still configure the same **agent tool** URLs as above. On every tool call, include **`twilio_to`** (dialed E.164) and/or **`elevenlabs_agent_id`** so the API picks the correct restaurant when more than one exists.

Optional **post-call** webhook in ElevenLabs:

- `{PUBLIC_API}/api/functions/elevenlabs-conversation-webhook`

## Implemented edge functions

Core restaurant / telephony / order flows are ported. Other legacy `supabase/functions/*` names return **501** until ported—see `src/routes/functions.js`.
