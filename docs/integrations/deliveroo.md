# Deliveroo Order API — partner access checklist

Public docs used for the scaffold:

- [Order API](https://api-docs.deliveroo.com/docs/order-api)
- [API access / OAuth](https://api-docs.deliveroo.com/docs/api-access)
- [Order Events webhook](https://api-docs.deliveroo.com/docs/listen-to-new-order-events)
- [Signature-based authentication](https://api-docs.deliveroo.com/docs/signature-based-authentication)
- [PATCH order status](https://api-docs.deliveroo.com/reference/patch-order-1)
- [Get Order v2](https://api-docs.deliveroo.com/reference/get-order-v2)

This repo does **not** invent undocumented paths. Until you have partner credentials, `DELIVEROO_ENABLED=false` and the webhook returns **404**.

## 1. Request access

1. Create / sign in to the [Deliveroo Developer Portal](https://developers.deliveroo.com/) (or ask your Deliveroo Account Manager).
2. Request **Order API** access (Order Events webhook + OAuth client).
3. Confirm sandbox vs production. Public servers:
   - Production API: `https://api.developers.deliveroo.com/order/`
   - Sandbox API: `https://api-sandbox.developers.deliveroo.com/order/`
   - Production auth example: `https://auth.developers.deliveroo.com/oauth2/token`
4. **TODO(docs):** confirm the sandbox `AUTH_HOST` with Deliveroo (public page uses an `AUTH_HOST` placeholder).

## 2. Credentials you should receive

| Credential | Put in `backend/.env` as |
| --- | --- |
| OAuth client id | `DELIVEROO_CLIENT_ID` |
| OAuth client secret | `DELIVEROO_CLIENT_SECRET` |
| Webhook HMAC secret | `DELIVEROO_WEBHOOK_SECRET` |
| Environment | `DELIVEROO_ENV=sandbox` or `production` |

Then set `DELIVEROO_ENABLED=true`.

Never commit these values. `.env` is gitignored.

## 3. Register the webhook

Public HTTPS URL:

`https://<your-api-host>/webhooks/deliveroo`

Local:

```powershell
ngrok http 3033
```

Use `https://<ngrok-host>/webhooks/deliveroo` in the Deliveroo developer portal Order Events webhook settings.

Headers the adapter verifies (from public docs):

- `X-Deliveroo-Sequence-Guid`
- `X-Deliveroo-Hmac-Sha256` (HMAC-SHA256 of `{guid} {rawBody}`)
- `x-deliveroo-payload-type`: `event/order.new` or `event/order.status_update`

## 4. After credentials land (code left as TODOs)

- Confirm GET Order v2 path in OpenAPI, then implement `fetchOrderDetails`.
- Confirm sandbox auth host, then implement client_credentials token cache.
- PATCH `/v1/orders/{order_id}` with `{ "status": "accepted" }` or `"rejected"` (order id format `{market}:{uuid}`).
- Historical backfill: only if Deliveroo documents a list endpoint; until then orders arrive via webhook only.
