# DoorDash Marketplace — partner access checklist

Public docs used for this integration:

- [JWT authentication](https://developer.doordash.com/en-US/docs/marketplace/how_to/JWTs/)
- [Receive orders / confirm](https://developer.doordash.com/en-US/docs/marketplace/how_to/order_integration/)
- [Webhook subscriptions](https://developer.doordash.com/en-US/docs/marketplace/how_to/create_webhook_subscription/)
- [Marketplace OpenAPI](https://developer.doordash.com/en-US/api/marketplace)

Marketplace APIs require DoorDash approval. Until you have credentials, keep `DOORDASH_ENABLED=false`.

## 1. Request access

1. Create / sign in to the [DoorDash Developer Portal](https://developer.doordash.com/).
2. Apply for **Marketplace** from the Integrations tab.
3. Create a Credential (Sandbox or Production) and save **developer ID**, **key ID**, and **signing secret** (secret shown once).

## 2. Credentials → `backend/.env`

| Portal value | Env var |
| --- | --- |
| Developer ID | `DOORDASH_DEVELOPER_ID` |
| Key ID | `DOORDASH_KEY_ID` |
| Signing secret | `DOORDASH_SIGNING_SECRET` |
| Webhook Auth Token | `DOORDASH_WEBHOOK_AUTH` |
| Environment | `DOORDASH_ENV=sandbox` or `production` |

Then set `DOORDASH_ENABLED=true`.

Optional:

- `DOORDASH_RESTAURANT_ID` — kitchen restaurant UUID
- `DOORDASH_AUTO_ACCEPT=true` — after OrderCreate, PATCH confirm `order_status=success`
- Map store: set `restaurants.doordash_store_id` to DoorDash `store.merchant_supplied_id`

Never commit secrets. `.env` is gitignored.

## 3. Register the Orders webhook

Public HTTPS URL:

`https://<your-api-host>/webhooks/doordash`

Local tunnel example:

```powershell
ngrok http 3033
```

In Developer Portal → Webhook Subscriptions → **Orders**:

- URL: `https://<ngrok-host>/webhooks/doordash`
- Auth Token: same value as `DOORDASH_WEBHOOK_AUTH`

This handler:

1. Checks `Authorization` against `DOORDASH_WEBHOOK_AUTH`
2. Returns **202** on `OrderCreate` (async confirmation — do **not** treat 200 as sync accept)
3. Upserts into kitchen `orders` with `source=doordash`
4. If `DOORDASH_AUTO_ACCEPT=true`, calls `PATCH /api/v1/orders/{id}` with `order_status=success`

## 4. Confirm / deny (outbound)

API base: `https://openapi.doordash.com/marketplace`

- Confirm: `PATCH /api/v1/orders/{id}` body `{ merchant_supplied_id, order_status: "success"|"fail", ... }`
- Auth headers: `Authorization: Bearer <JWT>`, `auth-version: v2`, `User-Agent: …`

JWT is minted locally (HS256, `dd-ver: DD-JWT-V1`, secret base64-decoded) — no OAuth token URL.

## 5. Backfill

Public Marketplace Order Endpoints emphasize webhooks + PATCH confirm/cancel. There is **no** documented historical list for kitchen backfill in this scaffold. Live orders arrive via the Orders webhook only.

```powershell
npm run fetch-orders --prefix backend -- --source=doordash
```

Expects a clear “webhook-only” message when enabled — not dummy rows.
