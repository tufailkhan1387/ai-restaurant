/**
 * DoorDash Marketplace Order adapter.
 *
 * Public docs used:
 * - JWT auth: https://developer.doordash.com/en-US/docs/marketplace/how_to/JWTs/
 * - Order webhook + confirm: https://developer.doordash.com/en-US/docs/marketplace/how_to/order_integration/
 * - Webhook Auth Token: https://developer.doordash.com/en-US/docs/marketplace/how_to/create_webhook_subscription/
 * - OpenAPI: https://developer.doordash.com/en-US/api/marketplace
 *
 * Orders arrive via webhook (full Order object). Public Marketplace Order Endpoints
 * document PATCH confirm/cancel/adjustment — not a historical list/backfill GET.
 */
import crypto from "node:crypto";
import { NotConfiguredError } from "../errors.js";
import { isDoorDashEnabled } from "../flags.js";
import { createLogger } from "../../lib/safeLogger.js";
import { getDoorDashConfig, isDoorDashConfigured } from "./config.js";
import { confirmOrder, cancelOrder } from "./client.js";

const log = createLogger("doordash");

export const id = "doordash";

export function isEnabled() {
  return isDoorDashEnabled();
}

export function isConfigured() {
  return isDoorDashConfigured();
}

/**
 * DoorDash does not HMAC-sign marketplace webhooks; partners configure an Auth Token
 * in the Developer Portal and DoorDash sends it in the Authorization header.
 */
export function verifyWebhook(req) {
  if (process.env.BYPASS_WEBHOOK_AUTH === "true") return true;
  const cfg = getDoorDashConfig();
  if (!cfg.webhookAuth) return false;

  const header =
    req.get?.("authorization") ||
    req.headers?.authorization ||
    req.headers?.Authorization ||
    "";
  const provided = String(header).trim();
  if (!provided) return false;

  const expected = cfg.webhookAuth;
  const candidates = new Set([expected]);
  if (!expected.toLowerCase().startsWith("bearer ")) {
    candidates.add(`Bearer ${expected}`);
  } else {
    candidates.add(expected.slice("Bearer ".length).trim());
  }

  for (const cand of candidates) {
    if (timingEqual(provided, cand)) return true;
  }
  return false;
}

function timingEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * OrderCreate must be ACKed with 202 for async confirmation (then PATCH confirm).
 * Returning 200 on OrderCreate is treated by DoorDash as synchronous success.
 * @see https://developer.doordash.com/en-US/docs/marketplace/how_to/order_integration/
 */
export function webhookAckStatus(payload) {
  const type = String(payload?.event?.type || "").toLowerCase();
  if (type === "ordercreate" || type === "order_create") return 202;
  return 200;
}

export function parseWebhook(body) {
  const eventType = String(body?.event?.type || "").trim();
  const typeLower = eventType.toLowerCase();

  // Menu / non-order callbacks share the subscription model; ignore for kitchen upsert.
  if (
    typeLower.startsWith("menu") ||
    typeLower === "menucreate" ||
    typeLower === "menuupdate" ||
    typeLower === "menurequest"
  ) {
    log.info("Ignoring non-order DoorDash webhook", { event_type: eventType });
    return [];
  }

  const order = body?.order && typeof body.order === "object" ? body.order : body;
  const orderId = order?.id || body?.order_id || null;
  if (!orderId) {
    log.warn("DoorDash webhook missing order id", { event_type: eventType });
    return [];
  }

  const eventStatus = body?.event?.status || order?.status || null;
  const eventId =
    body?.event?.id ||
    body?.event_id ||
    body?.event?.reference ||
    `${orderId}:${eventType || "order"}:${eventStatus || "na"}`;

  return [
    {
      event_id: String(eventId),
      event_type: eventType || "OrderCreate",
      external_order_id: String(orderId),
      status: eventStatus,
      raw: order,
    },
  ];
}

function centsToMajor(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n / 100;
}

function flattenItems(categories) {
  const items = [];
  if (!Array.isArray(categories)) return items;
  for (const cat of categories) {
    for (const item of cat?.items || []) {
      items.push({
        id: item.merchant_supplied_id || item.line_item_id || item.id,
        name: item.name || item.merchant_supplied_id || "Item",
        quantity: Math.max(1, Number(item.quantity) || 1),
        unit_price: centsToMajor(item.price) ?? 0,
        notes: item.special_instructions || null,
      });
    }
  }
  return items;
}

function doordashStatusToMarketplace(eventType, eventStatus, order) {
  const type = String(eventType || "").toLowerCase();
  const status = String(eventStatus || order?.status || "").toLowerCase();

  if (type.includes("cancel") || status.includes("cancel")) return "cancelled";
  if (status === "fail" || status === "failed") return "failed";
  if (status === "success" || status === "confirmed" || status === "accepted") return "accepted";
  if (status === "new" || type === "ordercreate" || type === "order_create") return "placed";
  if (status === "ready") return "ready";
  return "placed";
}

export function normalizeOrder(raw, eventMeta = {}) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid DoorDash order payload");
  }
  const order = raw.order && typeof raw.order === "object" && !raw.id ? raw.order : raw;
  const orderId = order.id;
  if (!orderId) throw new Error("DoorDash order missing id");

  const consumer = order.consumer || {};
  const name = [consumer.first_name, consumer.last_name].filter(Boolean).join(" ").trim() || null;
  const items = flattenItems(order.categories);
  const fulfillment = String(order.fulfillment_type || "").toLowerCase();
  const isPickup = order.is_pickup === true || fulfillment === "pickup";

  const eventType = eventMeta.event_type || raw.event?.type;
  const eventStatus = eventMeta.status || raw.event?.status;

  return {
    source: "doordash",
    external_order_id: String(orderId),
    display_id: `DD-${String(order.delivery_short_code || String(orderId).slice(-8)).toUpperCase()}`,
    store_id: order.store?.merchant_supplied_id || order.store?.id || null,
    restaurant_id: getDoorDashConfig().defaultRestaurantId,
    status: doordashStatusToMarketplace(eventType, eventStatus, order),
    placed_at: order.ordered_at || order.created_at || order.estimated_pickup_time || null,
    customer_name: name,
    customer_phone: consumer.phone ? String(consumer.phone) : "doordash",
    delivery_address: isPickup ? "DoorDash pickup" : "DoorDash delivery",
    fulfillment_type: isPickup ? "pickup" : "delivery",
    notes: order.delivery_short_code ? `DD short code ${order.delivery_short_code}` : null,
    items,
    totals: {
      subtotal: centsToMajor(order.subtotal) ?? 0,
      tax: centsToMajor(order.tax) ?? 0,
      deliveryFee: 0,
      discount: 0,
      total: (centsToMajor(order.subtotal) ?? 0) + (centsToMajor(order.tax) ?? 0),
      tip: centsToMajor(order.merchant_tip_amount) ?? 0,
    },
    raw_payload: order,
  };
}

/**
 * Public Marketplace Order Endpoints list PATCH confirm/cancel — not GET-by-id.
 * Webhook body already includes the Order object.
 */
export async function fetchOrderDetails(_externalId) {
  throw new NotConfiguredError(
    "DoorDash Marketplace public Order Endpoints do not document GET-by-id; using webhook Order payload.",
  );
}

export async function acceptOrder(externalId, merchantSuppliedId) {
  return confirmOrder(externalId, {
    merchantSuppliedId: merchantSuppliedId || externalId,
    orderStatus: "success",
  });
}

export async function denyOrder(externalId, reason, merchantSuppliedId) {
  return confirmOrder(externalId, {
    merchantSuppliedId: merchantSuppliedId || externalId,
    orderStatus: "fail",
    failureReason: reason || "Store Unavailable - Connectivity Issue",
  });
}

export async function cancelAcceptedOrder(externalId, reason) {
  return cancelOrder(externalId, { cancelReason: "OTHER", cancelDetails: reason });
}

/**
 * After OrderCreate upsert, optionally PATCH confirm (async flow).
 */
export async function afterUpsert(normalized, event) {
  const cfg = getDoorDashConfig();
  const type = String(event?.event_type || "").toLowerCase();
  if (!cfg.autoAccept) return;
  if (type !== "ordercreate" && type !== "order_create") return;
  if (normalized.status === "cancelled" || normalized.status === "failed") return;

  try {
    await acceptOrder(normalized.external_order_id, normalized.external_order_id);
    log.info("Auto-accepted DoorDash order", { orderId: normalized.external_order_id });
  } catch (e) {
    log.error("DoorDash auto-accept failed", {
      orderId: normalized.external_order_id,
      message: e?.message,
      status: e?.status,
    });
  }
}

export async function* backfill() {
  log.info("DoorDash backfill skipped — orders arrive via Orders webhook only");
  throw new NotConfiguredError(
    "DoorDash Marketplace historical order list/backfill is not in the public Order Endpoints. Configure the Orders webhook; live OrderCreate events will upsert kitchen orders.",
  );
}
