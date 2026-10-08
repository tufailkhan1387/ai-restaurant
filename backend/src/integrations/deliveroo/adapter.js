/**
 * Deliveroo Order API adapter.
 *
 * Documented (public Order API):
 * - Auth: POST {AUTH_HOST}/oauth2/token client_credentials
 *   Production AUTH_HOST example: https://auth.developers.deliveroo.com
 *   @see https://api-docs.deliveroo.com/docs/api-access
 * - API servers: https://api.developers.deliveroo.com/order/ (production)
 *               https://api-sandbox.developers.deliveroo.com/order/ (sandbox)
 * - Order Events webhook: HMAC-SHA256 of `{X-Deliveroo-Sequence-Guid} {rawBody}`
 *   Headers: X-Deliveroo-Sequence-Guid, X-Deliveroo-Hmac-Sha256,
 *            x-deliveroo-payload-type (event/order.new | event/order.status_update)
 *   @see https://api-docs.deliveroo.com/docs/signature-based-authentication
 *   @see https://api-docs.deliveroo.com/reference/order-events-webhook-1
 * - PATCH /v1/orders/{order_id} body { status: accepted|rejected|confirmed }
 *   order_id format {market}:{order_uuid}
 *   @see https://api-docs.deliveroo.com/reference/patch-order-1
 * - GET single order: Get Order v2 on the same Order API servers
 *   @see https://api-docs.deliveroo.com/reference/get-order-v2
 *
 * TODO(docs): confirm sandbox AUTH_HOST (docs only show AUTH_HOST placeholder + production auth host).
 * TODO(docs): confirm exact GET path string inside the v2 OpenAPI (page title is Get Single Order Details).
 * TODO(docs): historical list/backfill path — public Order API emphasizes webhooks; do not invent a list URL.
 */
import crypto from "node:crypto";
import { NotConfiguredError } from "../errors.js";
import { isDeliverooEnabled } from "../flags.js";
import { createLogger } from "../../lib/safeLogger.js";

const log = createLogger("deliveroo");

export const id = "deliveroo";

const API_BASE = {
  production: "https://api.developers.deliveroo.com/order",
  sandbox: "https://api-sandbox.developers.deliveroo.com/order",
};

const AUTH_BASE = {
  // Documented production auth host.
  production: "https://auth.developers.deliveroo.com",
  // TODO(docs): sandbox OAuth host is not named in the public API-access page.
  sandbox: null,
};

export function isEnabled() {
  return isDeliverooEnabled();
}

export function getDeliverooConfig() {
  const env = String(process.env.DELIVEROO_ENV || "sandbox").trim().toLowerCase();
  if (env !== "sandbox" && env !== "production") {
    throw new Error(`DELIVEROO_ENV must be sandbox or production (got "${env}")`);
  }
  return {
    env,
    apiBase: API_BASE[env],
    authBase: AUTH_BASE[env],
    clientId: String(process.env.DELIVEROO_CLIENT_ID || "").trim(),
    clientSecret: String(process.env.DELIVEROO_CLIENT_SECRET || "").trim(),
    webhookSecret: String(process.env.DELIVEROO_WEBHOOK_SECRET || "").trim(),
  };
}

export function isConfigured() {
  const cfg = getDeliverooConfig();
  return Boolean(cfg.clientId && cfg.clientSecret && cfg.webhookSecret);
}

/**
 * @see https://api-docs.deliveroo.com/docs/signature-based-authentication
 * HMAC-SHA256 of: sequence GUID + space + raw request body.
 * TODO(docs): confirm hex vs base64 encoding of X-Deliveroo-Hmac-Sha256 (docs describe HMAC-SHA256 but not the encoding).
 */
export function verifyWebhook(req) {
  const cfg = getDeliverooConfig();
  if (!cfg.webhookSecret) return false;
  const guid =
    req.get?.("x-deliveroo-sequence-guid") ||
    req.headers?.["x-deliveroo-sequence-guid"];
  const provided =
    req.get?.("x-deliveroo-hmac-sha256") ||
    req.headers?.["x-deliveroo-hmac-sha256"];
  if (!guid || !provided) return false;

  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body ?? ""), "utf8");
  const payload = `${guid} ${raw.toString("utf8")}`;
  const hex = crypto.createHmac("sha256", cfg.webhookSecret).update(payload).digest("hex");
  const b64 = crypto.createHmac("sha256", cfg.webhookSecret).update(payload).digest("base64");

  return timingEqual(String(provided).trim(), hex) || timingEqual(String(provided).trim(), b64);
}

function timingEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function parseWebhook(body, req) {
  const payloadType =
    req?.get?.("x-deliveroo-payload-type") ||
    req?.headers?.["x-deliveroo-payload-type"] ||
    "event/order.status_update";
  const orderId = body?.order_id || body?.id || null;
  const statusLog = Array.isArray(body?.status_log) ? body.status_log : [];
  const latest = statusLog.length ? statusLog[statusLog.length - 1]?.status : body?.status;
  return [
    {
      event_id: body?.event_id || `${orderId}:${latest || payloadType}`,
      event_type: String(payloadType).toLowerCase(),
      external_order_id: orderId ? String(orderId) : null,
      status: latest || null,
      raw: body,
    },
  ];
}

function deliverooStatusToMarketplace(status) {
  switch (String(status || "").toLowerCase()) {
    case "placed":
      return "placed";
    case "accepted":
    case "confirmed":
      return "accepted";
    case "rejected":
    case "canceled":
    case "cancelled":
      return "cancelled";
    default:
      return "placed";
  }
}

export function normalizeOrder(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid Deliveroo order payload");
  }
  const orderId = raw.order_id || raw.id;
  if (!orderId) throw new Error("Deliveroo order missing order_id");
  const statusLog = Array.isArray(raw.status_log) ? raw.status_log : [];
  const latest = statusLog.length ? statusLog[statusLog.length - 1]?.status : raw.status;
  const items = Array.isArray(raw.items) ? raw.items : Array.isArray(raw.order_items) ? raw.order_items : [];
  return {
    source: "deliveroo",
    external_order_id: String(orderId),
    display_id: `DR-${String(raw.display_id || String(orderId).split(":").pop() || orderId).slice(-8)}`,
    store_id: raw.location_id || raw.site_id || raw.restaurant_id || null,
    status: deliverooStatusToMarketplace(latest),
    placed_at: raw.placed_at || raw.created_at || null,
    customer_name: raw.customer?.name || raw.customer_name || null,
    customer_phone: raw.customer?.phone || null,
    items: items.map((item) => ({
      id: item.id,
      name: item.name || item.pos_item_id,
      quantity: item.quantity,
    })),
    totals: raw.total || raw.totals || null,
    raw_payload: raw,
  };
}

export async function fetchOrderDetails(externalId) {
  const cfg = getDeliverooConfig();
  if (!cfg.clientId || !cfg.clientSecret) {
    throw new NotConfiguredError("Deliveroo credentials are not set");
  }
  // TODO(docs): confirm GET path on https://api-docs.deliveroo.com/reference/get-order-v2
  throw new NotConfiguredError(
    "TODO(docs): Deliveroo GET single order path must be confirmed from Get Order v2 OpenAPI before calling the API.",
  );
}

export async function acceptOrder(externalId) {
  return patchOrderStatus(externalId, "accepted");
}

export async function denyOrder(externalId, reason) {
  return patchOrderStatus(externalId, "rejected", reason);
}

async function patchOrderStatus(externalId, status, reason) {
  const cfg = getDeliverooConfig();
  if (!cfg.clientId || !cfg.clientSecret) {
    throw new NotConfiguredError("Deliveroo credentials are not set");
  }
  if (!cfg.authBase) {
    throw new NotConfiguredError(
      "TODO(docs): sandbox AUTH_HOST is not documented; set DELIVEROO_ENV=production only after partner access, or confirm sandbox auth host.",
    );
  }
  log.info("Deliveroo PATCH order status would be called", {
    path: `/v1/orders/${externalId}`,
    status,
    hasReason: Boolean(reason),
  });
  throw new NotConfiguredError(
    "Deliveroo accept/deny is scaffolded (PATCH /v1/orders/{order_id} per docs) but OAuth token + live call wait on partner credentials.",
  );
}

export async function* backfill() {
  log.info("Deliveroo backfill skipped — no documented public list-orders path for historical dump");
  throw new NotConfiguredError(
    "TODO(docs): Deliveroo historical order list/backfill endpoint is not implemented. Orders arrive via Order Events webhook once partner access is granted.",
  );
}
