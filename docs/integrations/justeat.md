# Just Eat — partner access checklist

Public site: [developers.just-eat.com](https://developers.just-eat.com)

The pages that are public today are mostly **JET Go** (courier / delivery-network) APIs. A restaurant POS / marketplace **order ingest** API (the piece this app needs for All Orders) is **not** fully documented there. Do not copy JET Go paths and pretend they are restaurant order endpoints.

## 1. Request access (France and other markets)

1. Contact the **Just Eat Takeaway.com integration / JET Connect** team (Account Manager, or the partner form on the developer site).
2. For France specifically, ask for restaurant / marketplace order integration (order webhooks + accept/deny if offered), not only JET Go courier APIs.
3. Request sandbox and production environments and a written API contract (OpenAPI or PDF).

## 2. Credentials you should receive

Until the partner pack arrives, env names are placeholders only:

| Likely credential | Put in `backend/.env` as |
| --- | --- |
| API key or client credentials | `JUSTEAT_API_KEY` (split later if they issue id+secret) |
| Webhook signing secret | `JUSTEAT_WEBHOOK_SECRET` |
| Environment | `JUSTEAT_ENV=sandbox` or `production` |

Keep `JUSTEAT_ENABLED=false` until the contract is in hand. A disabled webhook returns **404**.

Never commit secrets. `.env` is gitignored.

## 3. Register the webhook (after they give you the URL field)

We already expose:

`POST https://<your-api-host>/webhooks/justeat`

Local:

```powershell
ngrok http 3033
```

**TODO(docs):** paste their required path/headers into `backend/src/integrations/justeat/adapter.js` (`verifyWebhook`, `parseWebhook`, `fetchOrderDetails`, `normalizeOrder`, `acceptOrder`, `denyOrder`, `backfill`).

## 4. What to ask them for (so we can finish the adapter)

- Webhook signature: header name, algorithm, encoding, which bytes are signed
- Sample `placed` / `cancelled` JSON payloads
- GET order-by-id URL and auth scheme
- Accept / reject URLs and body
- Historical list/pagination for backfill (if any)
- Sandbox vs production base URLs
