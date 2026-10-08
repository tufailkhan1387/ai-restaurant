/**
 * Express webhook factory: raw body, 401 on bad signature, 200 then async work.
 */
import { createLogger } from "../lib/safeLogger.js";
import { claimMarketplaceEvent, upsertOrder } from "./orderService.js";
import { NotConfiguredError } from "./errors.js";

const log = createLogger("webhooks");

export function makeWebhookHttpHandler(adapter) {
  const source = adapter.id;

  return (req, res) => {
    if (typeof adapter.isEnabled === "function" && !adapter.isEnabled()) {
      return res.status(404).json({ error: `${source} webhooks are disabled` });
    }

    if (!adapter.verifyWebhook(req)) {
      log.warn("Rejected webhook — invalid signature", { source });
      return res.status(401).json({ error: "invalid signature" });
    }

    let payload;
    try {
      const text = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body ?? "");
      payload = text ? JSON.parse(text) : {};
    } catch {
      return res.status(400).json({ error: "invalid json" });
    }

    // DoorDash OrderCreate must ACK 202 for async confirmation (not 200 = sync accept).
    const ack =
      typeof adapter.webhookAckStatus === "function" ? Number(adapter.webhookAckStatus(payload)) || 200 : 200;
    res.status(ack).end();

    setImmediate(() => {
      processAdapterWebhook(adapter, payload, req).catch((e) => {
        log.error("Async webhook processing failed", {
          source,
          message: e?.message,
        });
      });
    });
  };
}

export async function processAdapterWebhook(adapter, payload, req) {
  const source = adapter.id;
  let events;
  try {
    events = adapter.parseWebhook(payload, req) || [];
  } catch (e) {
    if (e instanceof NotConfiguredError) {
      log.warn("Webhook parse not configured", { source, message: e.message });
      return;
    }
    throw e;
  }

  for (const event of events) {
    const isNew = await claimMarketplaceEvent(
      source,
      event.event_id,
      event.event_type,
      event.external_order_id,
    );
    if (!isNew) {
      log.info("Duplicate webhook event ignored", { source, event_id: event.event_id });
      continue;
    }

    const externalId = event.external_order_id;
    if (!externalId) {
      log.warn("Webhook event missing order id", { source, event_type: event.event_type });
      continue;
    }

    let raw = event.raw || payload;
    try {
      raw = await adapter.fetchOrderDetails(externalId);
    } catch (e) {
      if (e instanceof NotConfiguredError) {
        log.warn("fetchOrderDetails not configured — using webhook body", { source, message: e.message });
      } else {
        log.error("fetchOrderDetails failed", { source, message: e.message });
        throw e;
      }
    }

    let normalized;
    try {
      normalized = adapter.normalizeOrder(raw, event);
    } catch (e) {
      if (e instanceof NotConfiguredError) {
        log.warn("normalizeOrder not configured", { source, message: e.message });
        continue;
      }
      throw e;
    }

    await upsertOrder(normalized, { notify: true });

    if (typeof adapter.afterUpsert === "function") {
      try {
        await adapter.afterUpsert(normalized, event);
      } catch (e) {
        log.error("afterUpsert failed", { source, message: e?.message });
      }
    }
  }
}
