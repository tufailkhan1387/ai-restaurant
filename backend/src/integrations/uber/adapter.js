import { isUberEnabled } from "../flags.js";
import { getUberConfig } from "../../uber/config.js";
import { acceptOrder, denyOrder, getOrderDetails, listStores } from "../../uber/uberClient.js";
import { mapUberOrderToRow } from "../../uber/orderService.js";
import { mapUberStateToStatus, unwrapUberOrder } from "../../uber/syncRestaurantOrder.js";
import {
  extractOrderIdFromWebhook,
  processUberWebhookEvent,
  verifyUberSignature,
} from "../../uber/webhookHandler.js";
import { kitchenToMarketplaceStatus } from "../status.js";
import { backfillUberOrders } from "../../uber/backfill.js";
import { NotConfiguredError } from "../errors.js";

export const id = "uber";

export function isEnabled() {
  return isUberEnabled();
}

export function verifyWebhook(req) {
  const cfg = getUberConfig();
  const signature = req.get?.("x-uber-signature") || req.headers?.["x-uber-signature"];
  return verifyUberSignature(req.body, signature, cfg.clientSecret);
}

export function parseWebhook(body) {
  const orderId = extractOrderIdFromWebhook(body);
  return [
    {
      event_id: body?.event_id || null,
      event_type: body?.event_type || null,
      external_order_id: orderId,
      raw: body,
    },
  ];
}

export async function fetchOrderDetails(externalId) {
  return getOrderDetails(externalId);
}

function uberStateToMarketplace(state) {
  const kitchen = mapUberStateToStatus(state);
  return kitchenToMarketplaceStatus(kitchen);
}

export function normalizeOrder(raw) {
  const order = unwrapUberOrder(raw);
  const mapped = mapUberOrderToRow(order);
  return {
    source: "uber",
    external_order_id: mapped.uber_order_id,
    display_id: mapped.display_id ? `UE-${mapped.display_id}` : `UE-${String(mapped.uber_order_id).slice(-5).toUpperCase()}`,
    store_id: mapped.store_id,
    status: uberStateToMarketplace(mapped.current_state),
    placed_at: mapped.placed_at,
    customer_name: mapped.customer_name,
    customer_phone: order.eater?.phone || order.customers?.[0]?.contact?.phone?.number || "uber-eats",
    items: Array.isArray(mapped.items)
      ? mapped.items.map((item) => ({
          id: item.id,
          name: item.title || item.name,
          quantity: item.quantity?.amount || item.quantity || 1,
        }))
      : [],
    totals: mapped.totals,
    raw_payload: mapped.raw_payload,
  };
}

export async function acceptOrderOnPlatform(externalId) {
  return acceptOrder(externalId);
}

export async function denyOrderOnPlatform(externalId, reason) {
  return denyOrder(externalId, reason);
}

export async function* backfill(options = {}) {
  const result = await backfillUberOrders(options);
  yield result;
}

export { processUberWebhookEvent, listStores };
export { acceptOrderOnPlatform as acceptOrder, denyOrderOnPlatform as denyOrder };

/** Unused helper — keep adapter shape honest if credentials missing. */
export function assertConfigured() {
  const cfg = getUberConfig();
  if (!cfg.clientId || !cfg.clientSecret) {
    throw new NotConfiguredError("Uber is not configured (UBER_CLIENT_ID / UBER_CLIENT_SECRET)");
  }
}
