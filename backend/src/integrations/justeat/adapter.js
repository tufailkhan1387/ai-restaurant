/**
 * Just Eat restaurant order adapter (scaffold).
 *
 * Public developer site (https://developers.just-eat.com) currently documents
 * JET Go / courier APIs more than a restaurant POS order-ingest API.
 * France / restaurant POS typically goes through Just Eat Takeaway integration
 * / JET Connect with partner-only docs.
 *
 * Do not invent endpoint paths, auth schemes, or webhook header names.
 */
import { NotConfiguredError } from "../errors.js";
import { isJustEatEnabled } from "../flags.js";
import { createLogger } from "../../lib/safeLogger.js";

const log = createLogger("justeat");

export const id = "justeat";

export function isEnabled() {
  return isJustEatEnabled();
}

export function getJustEatConfig() {
  const env = String(process.env.JUSTEAT_ENV || "sandbox").trim().toLowerCase();
  return {
    env,
    apiKey: String(process.env.JUSTEAT_API_KEY || "").trim(),
    webhookSecret: String(process.env.JUSTEAT_WEBHOOK_SECRET || "").trim(),
  };
}

export function isConfigured() {
  const cfg = getJustEatConfig();
  return Boolean(cfg.apiKey && cfg.webhookSecret);
}

export function verifyWebhook(_req) {
  // TODO(docs): Just Eat restaurant webhook signature algorithm, header name, and encoding
  // are not in the public JET Go docs. Partner docs from the JET Connect / integration team
  // are required before verification can be implemented.
  return false;
}

export function parseWebhook(_body) {
  throw new NotConfiguredError(
    "TODO(docs): Just Eat restaurant order webhook payload schema is partner-only. Ask the JET Connect / France integration team for the Order Events contract.",
  );
}

export async function fetchOrderDetails(_externalId) {
  throw new NotConfiguredError(
    "TODO(docs): Just Eat restaurant GET-order path is not published on developers.just-eat.com (JET Go is courier-focused). Confirm with JET Connect.",
  );
}

export function normalizeOrder(_raw) {
  throw new NotConfiguredError(
    "TODO(docs): cannot map Just Eat orders until the partner payload schema is provided. No public sample order JSON was found.",
  );
}

export async function acceptOrder(_externalId) {
  throw new NotConfiguredError(
    "TODO(docs): Just Eat accept-order API is not in the public docs used for this scaffold.",
  );
}

export async function denyOrder(_externalId, _reason) {
  throw new NotConfiguredError(
    "TODO(docs): Just Eat deny-order API is not in the public docs used for this scaffold.",
  );
}

export async function* backfill() {
  log.info("Just Eat backfill skipped — adapter not configured");
  throw new NotConfiguredError(
    "TODO(docs): Just Eat historical order list API is partner-only. Backfill cannot run until JET Connect documents the endpoint.",
  );
}
