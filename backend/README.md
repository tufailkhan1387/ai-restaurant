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

## Marketplace orders (Uber Eats, DoorDash, Deliveroo, Just Eat)

Platforms upsert into the kitchen `orders` table (`source`, `external_order_id`, `display_id` / `order_number`). The All Orders UI mixes them and filters by Channel. **Do not put dummy orders in the database.** Marketplace secrets belong only in `backend/.env` (gitignored). Copy placeholders from `backend/.env.example`.

**Rotate `JWT_SECRET`** if application JWTs were ever printed in logs (Authorization: Bearer …). After rotating, every user must sign in again.

### Feature flags

| Env | Default | Disabled webhook | Disabled backfill |
| --- | --- | --- | --- |
| `UBER_ENABLED` | `true` | 404 | skipped with a log line |
| `DOORDASH_ENABLED` | `false` | 404 | skipped |
| `DELIVEROO_ENABLED` | `false` | 404 | skipped |
| `JUSTEAT_ENABLED` | `false` | 404 | skipped |

### Uber Eats (implemented)

| `UBER_ENV` | Token URL | API base |
| --- | --- | --- |
| `sandbox` | `https://sandbox-login.uber.com/oauth/v2/token` | `https://test-api.uber.com` |
| `production` | `https://auth.uber.com/oauth/v2/token` | `https://api.uber.com` |

Those two URLs are paired in one config module — do not mix sandbox auth with production API.

Default `UBER_SCOPES`: `eats.order eats.store` (must appear on the app **Access Token** tab). `eats.store.orders.read` often returns `invalid_scope` on Testing apps.

Webhook (Uber Developer Dashboard → Primary Webhook URL): `https://<your-api-host>/webhooks/uber`  
Signature: `X-Uber-Signature` HMAC-SHA256 of the **raw** body with the **client secret**. Invalid → `401`. Success → `200` then async `GET /v2/eats/order/{id}`. Auto-accept only if `UBER_AUTO_ACCEPT=true` (Uber auto-cancels after ~11.5 minutes).

### DoorDash Marketplace (implemented — needs portal credentials)

See `docs/integrations/doordash.md`.

- Webhook: `https://<your-api-host>/webhooks/doordash` (Auth Token = `DOORDASH_WEBHOOK_AUTH`)
- `OrderCreate` ACK is **202** (async), then optional `PATCH /api/v1/orders/{id}` if `DOORDASH_AUTO_ACCEPT=true`
- Outbound auth: self-signed JWT (`DOORDASH_DEVELOPER_ID` / `KEY_ID` / `SIGNING_SECRET`) against `https://openapi.doordash.com/marketplace`

### Deliveroo / Just Eat (scaffold)

See `docs/integrations/deliveroo.md` and `docs/integrations/justeat.md`. Webhook URLs:

- Deliveroo portal Order Events: `https://<your-api-host>/webhooks/deliveroo`
- Just Eat / JET Connect (when they give you a field): `https://<your-api-host>/webhooks/justeat`

### Local webhooks (ngrok) — PowerShell

API default listen port is `PORT` in `.env` (often `3033` in `src/index.js` if unset).

```powershell
ngrok http 3033
```

Put `https://<ngrok-host>/webhooks/uber` (and `/webhooks/doordash`, deliveroo/justeat) in each dashboard. Restart ngrok ⇒ URL changes ⇒ update the dashboard.

### Diagnostics and backfill (PowerShell)

Do **not** use bash `curl -F` with `\` line continuations in PowerShell.

```powershell
# Optional one-off override (normally set these in backend/.env)
$env:UBER_CLIENT_SECRET = "..."
$env:UBER_ENV = "sandbox"

npm run uber:check --prefix backend
npm run fetch-orders --prefix backend
npm run fetch-orders --prefix backend -- --source=uber
```

`uber:check` prints env, token URL, granted scope, expiry — **never the token** — then how many stores `GET /v1/eats/stores` returned. Zero stores means the app is not linked yet (ask Uber for a sandbox test store, or order-manager linking for a live store). That is not a successful backfill.

### List API

```
GET /api/orders?source=uber&status=placed&page=1&pageSize=20
```

`source` = `uber` | `deliveroo` | `justeat`. Sorted by `placed_at` / `created_at` desc. Response includes `source` and `display_id`.

### Tests

```powershell
npm test --prefix backend
```


<!-- Trigger deploy 10/08/2026 11:58:57 -->

<!-- Transcript Fix 10/08/2026 12:11:32 -->
