/**
 * DoorDash Marketplace config.
 * @see https://developer.doordash.com/en-US/docs/marketplace/overview/getting_started/jwts_getting_started/
 * @see https://developer.doordash.com/en-US/api/marketplace
 */

const API_BASE = "https://openapi.doordash.com/marketplace";

export function getDoorDashConfig() {
  const env = String(process.env.DOORDASH_ENV || "sandbox").trim().toLowerCase();
  if (env !== "sandbox" && env !== "production") {
    throw new Error(`DOORDASH_ENV must be "sandbox" or "production" (got "${env}")`);
  }

  return {
    env,
    apiBase: String(process.env.DOORDASH_API_BASE || API_BASE).replace(/\/$/, ""),
    developerId: String(process.env.DOORDASH_DEVELOPER_ID || "").trim(),
    keyId: String(process.env.DOORDASH_KEY_ID || "").trim(),
    signingSecret: String(process.env.DOORDASH_SIGNING_SECRET || "").trim(),
    /** Exact Authorization value DoorDash should send on inbound webhooks (portal Auth Token). */
    webhookAuth: String(process.env.DOORDASH_WEBHOOK_AUTH || "").trim(),
    userAgent: String(process.env.DOORDASH_USER_AGENT || "AiRestaurant/1.0").trim(),
    autoAccept: String(process.env.DOORDASH_AUTO_ACCEPT || "false").trim().toLowerCase() === "true",
    defaultRestaurantId: String(process.env.DOORDASH_RESTAURANT_ID || "").trim() || null,
  };
}

export function isDoorDashConfigured(cfg = getDoorDashConfig()) {
  return Boolean(cfg.developerId && cfg.keyId && cfg.signingSecret && cfg.webhookAuth);
}
