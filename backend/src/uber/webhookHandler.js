/**
 * Uber Eats webhook: signature verification + async event processing.
 * @see https://developer.uber.com/docs/eats/guides/webhooks
 */
import crypto from "node:crypto";
import { getUberConfig } from "./config.js";
import { acceptOrder, getOrderDetails, uberRequest } from "./uberClient.js";
import {
  claimWebhookEvent,
  getUberOrderById,
  updateUberOrderState,
  upsertUberOrder,
} from "./orderService.js";
import { uberLog } from "./logger.js";
import { isUberEnabled } from "../integrations/flags.js";

const HANDLED_EVENTS = new Set([
  "orders.notification",
  "orders.scheduled.notification",
  "orders.cancel",
  "orders.failure",
]);

/**
 * Verify X-Uber-Signature: lowercase hex HMAC-SHA256 of raw body with client secret.
 * @param {Buffer|string} rawBody
 * @param {string|undefined} signatureHeader
 * @param {string} clientSecret
 */
export function verifyUberSignature(rawBody, signatureHeader, clientSecret) {
  if (process.env.BYPASS_WEBHOOK_AUTH === "true") return true;
  if (!clientSecret) return false;
  if (!signatureHeader || typeof signatureHeader !== "string") return false;

  const bodyBuf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody ?? ""), "utf8");
  const expected = crypto.createHmac("sha256", clientSecret).update(bodyBuf).digest("hex");
  const provided = signatureHeader.trim().toLowerCase();

  const expectedBuf = Buffer.from(expected, "utf8");
  const providedBuf = Buffer.from(provided, "utf8");
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

export function extractOrderIdFromWebhook(payload) {
  const metaId = payload?.meta?.resource_id;
  if (metaId) return String(metaId);

  const href = payload?.resource_href;
  if (typeof href === "string") {
    // e.g. https://api.uber.com/v2/eats/order/{uuid}
    const m = href.match(/\/(?:order|orders)\/([0-9a-fA-F-]{36})/);
    if (m) return m[1];
  }

  if (payload?.meta?.order_id) return String(payload.meta.order_id);
  if (payload?.order_id) return String(payload.order_id);
  return null;
}

/**
 * Process a verified webhook payload (idempotent on order id + event_id).
 */
export async function processUberWebhookEvent(payload) {
  const eventType = payload?.event_type;
  const eventId = payload?.event_id;
  const orderId = extractOrderIdFromWebhook(payload);
  const storeId = payload?.meta?.user_id || null;

  if (!HANDLED_EVENTS.has(eventType)) {
    uberLog.info("Ignoring unknown Uber webhook event_type", { eventType, eventId });
    return { ignored: true, eventType };
  }

  const isNewEvent = await claimWebhookEvent(eventId, eventType, orderId);
  if (!isNewEvent) {
    uberLog.info("Duplicate Uber webhook event ignored", { eventId, eventType, orderId });
    return { duplicate: true, eventId, orderId };
  }

  if (eventType === "orders.notification" || eventType === "orders.scheduled.notification") {
    return handleOrderNotification({ orderId, storeId, eventType, payload });
  }

  if (eventType === "orders.cancel" || eventType === "orders.failure") {
    if (!orderId) {
      uberLog.warn("Cancel/failure webhook missing order id", { eventType, eventId });
      return { error: "missing_order_id" };
    }
    const state = eventType === "orders.cancel" ? "CANCELED" : "FAILED";
    // TODO: Confirm exact current_state enum Uber returns on cancel/failure for your API version
    // (docs use CANCELED for canceled-orders; failure may map to FAILED or CANCELED).
    const result = await updateUberOrderState(orderId, state, {
      store_id: storeId,
      raw_payload: payload,
    });
    uberLog.info("Updated order from cancel/failure webhook", {
      orderId,
      state,
      eventType,
    });
    return { updated: true, ...result };
  }

  return { ignored: true, eventType };
}

async function handleOrderNotification({ orderId, storeId, eventType, payload }) {
  if (!orderId) {
    uberLog.warn("Order notification missing order id", { eventType });
    return { error: "missing_order_id" };
  }

  const cfg = getUberConfig();

  let details;
  try {
    // Prefer resource_href path when present (may already include API version).
    if (payload?.resource_href && typeof payload.resource_href === "string") {
      // resource_href may point at api.uber.com even in sandbox — rewrite host to configured apiBase.
      let href = payload.resource_href;
      try {
        const u = new URL(href);
        const base = new URL(cfg.apiBase);
        u.protocol = base.protocol;
        u.host = base.host;
        href = u.toString();
      } catch {
        /* keep original */
      }
      details = await uberRequest(href);
    } else {
      details = await getOrderDetails(orderId);
    }
  } catch (e) {
    uberLog.error("Failed to fetch Uber order details", {
      orderId,
      status: e?.status,
      message: e?.message,
    });
    throw e;
  }

  // Ensure store_id from webhook if details omit it
  if (!details.store && storeId) {
    details = { ...details, store: { ...(details.store || {}), id: storeId } };
  }

  const { row, created } = await upsertUberOrder(details, { notify: true });

  let accepted = false;
  if (cfg.autoAccept) {
    const existing = await getUberOrderById(orderId);
    const state = String(existing?.current_state || details.current_state || "").toUpperCase();
    // Idempotent: do not re-accept already accepted / terminal orders
    const skipAccept = ["ACCEPTED", "DENIED", "CANCELED", "CANCELLED", "FAILED", "FULFILLED", "SUCCEEDED"].includes(
      state,
    );
    if (!skipAccept) {
      try {
        await acceptOrder(orderId, { reason: "Auto-accepted by integration" });
        accepted = true;
        await updateUberOrderState(orderId, "ACCEPTED");
        uberLog.info("Auto-accepted Uber order", { orderId });
      } catch (e) {
        uberLog.error("Auto-accept failed", {
          orderId,
          status: e?.status,
          message: e?.message,
        });
        // Do not throw — order is stored; operator can accept manually / retry
      }
    } else {
      uberLog.info("Skipping auto-accept (already terminal/accepted)", { orderId, state });
    }
  } else {
    uberLog.info("UBER_AUTO_ACCEPT=false — order stored, not accepted", { orderId });
  }

  return { orderId, created, accepted, state: row?.current_state };
}

/**
 * Express handler for POST /webhooks/uber
 * Expects raw Buffer body (express.raw).
 */
export function uberWebhookHttpHandler(req, res) {
  if (!isUberEnabled()) {
    return res.status(404).json({ error: "uber webhooks are disabled" });
  }
  const cfg = getUberConfig();
  const signature = req.get("x-uber-signature") || req.get("X-Uber-Signature");
  const rawBody = req.body;

  if (!verifyUberSignature(rawBody, signature, cfg.clientSecret)) {
    uberLog.warn("Rejected Uber webhook — invalid signature");
    return res.status(401).json({ error: "invalid signature" });
  }

  let payload;
  try {
    const text = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody ?? "");
    payload = text ? JSON.parse(text) : {};
  } catch {
    return res.status(400).json({ error: "invalid json" });
  }

  // Acknowledge immediately so Uber does not retry (processing continues async).
  res.status(200).end();

  setImmediate(() => {
    processUberWebhookEvent(payload).catch((e) => {
      uberLog.error("Async Uber webhook processing failed", {
        message: e?.message,
        event_type: payload?.event_type,
        event_id: payload?.event_id,
      });
    });
  });
}
