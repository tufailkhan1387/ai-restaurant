/**
 * Uber Eats Marketplace env/config.
 * Token domain is always paired with the API domain — never mix sandbox auth with production API.
 */

export const UBER_ENV_URLS = {
  sandbox: {
    tokenUrl: "https://sandbox-login.uber.com/oauth/v2/token",
    apiBase: "https://test-api.uber.com",
  },
  production: {
    tokenUrl: "https://auth.uber.com/oauth/v2/token",
    apiBase: "https://api.uber.com",
  },
};

export const DEFAULT_UBER_SCOPES = "eats.order eats.store";

export function getUberConfig() {
  const raw = String(process.env.UBER_ENV || "sandbox").trim().toLowerCase();
  const env = raw === "undefined" || raw === "null" || raw === "" ? "sandbox" : raw;
  if (env !== "sandbox" && env !== "production") {
    throw new Error(`UBER_ENV must be "sandbox" or "production" (got "${env}")`);
  }

  const urls = UBER_ENV_URLS[env];
  const clientId = String(process.env.UBER_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.UBER_CLIENT_SECRET || "").trim();
  const scopes = String(process.env.UBER_SCOPES || DEFAULT_UBER_SCOPES).trim();
  const autoAccept = String(process.env.UBER_AUTO_ACCEPT || "false").trim().toLowerCase() === "true";
  const defaultStoreId = String(process.env.UBER_STORE_ID || "").trim() || null;
  const defaultRestaurantId = String(process.env.UBER_RESTAURANT_ID || "").trim() || null;

  return {
    env,
    tokenUrl: urls.tokenUrl,
    apiBase: urls.apiBase.replace(/\/$/, ""),
    /** @deprecated use tokenUrl — kept so older callers that used authBase still resolve the same host */
    authBase: urls.tokenUrl.replace(/\/oauth\/v2\/token$/, ""),
    clientId,
    clientSecret,
    scopes,
    autoAccept,
    defaultStoreId,
    defaultRestaurantId,
  };
}

export function assertUberCredentials(cfg = getUberConfig()) {
  if (!cfg.clientId || !cfg.clientSecret) {
    throw new Error("UBER_CLIENT_ID and UBER_CLIENT_SECRET are required");
  }
  return cfg;
}
