/**
 * OAuth 2.0 client_credentials for Uber Eats Marketplace.
 * Caches the access token in memory; refreshes before expiry or on 401.
 * Never logs the token or client secret.
 */
import { UberAuthError } from "../integrations/errors.js";
import { assertUberCredentials, getUberConfig } from "./config.js";
import { uberLog } from "./logger.js";

/** @type {{ accessToken: string; expiresAtMs: number; scopes: string; grantedScope: string; expiresIn: number } | null} */
let cached = null;

const EXPIRY_SKEW_MS = 5 * 60 * 1000;

export function clearUberTokenCache() {
  cached = null;
}

export function formatUberTokenError({ env, tokenUrl, scopes, status, error, errorDescription }) {
  const code = String(error || "").toLowerCase();
  const likely = [];
  if (code === "invalid_scope") {
    likely.push("UBER_SCOPES includes a scope not granted to this app (common: eats.store.orders.read on a sandbox Testing app).");
    likely.push("The app's Access Token tab in Uber Developer Dashboard does not list these scopes.");
    likely.push("The Marketplace / order-manager agreement is not signed for this application.");
    likely.push("UBER_ENV does not match the app type (sandbox Testing app vs production).");
  } else if (code === "unauthorized_client") {
    likely.push("Client id/secret belong to a different environment than UBER_ENV / token URL.");
    likely.push("This is a Testing app but UBER_ENV=production, or the reverse.");
  } else if (code === "invalid_client") {
    likely.push("UBER_CLIENT_ID or UBER_CLIENT_SECRET is wrong or the secret was rotated.");
  } else {
    likely.push("Wrong UBER_ENV (sandbox vs production).");
    likely.push("Agreement not signed, or scopes not granted on the Access Token tab.");
  }

  return [
    `Uber token request failed (env=${env}, tokenUrl=${tokenUrl}, requestedScopes=${JSON.stringify(scopes)}, status=${status ?? "n/a"}, error=${error || "unknown"}).`,
    errorDescription ? `Uber said: ${errorDescription}` : null,
    `Likely causes: ${likely.join(" ")}`,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * @param {{ force?: boolean }} [opts]
 * @returns {Promise<string>}
 */
export async function getUberAccessToken(opts = {}) {
  const meta = await requestUberToken(opts);
  return meta.accessToken;
}

/**
 * Request (or return cached) token metadata. The access token is never logged.
 * @param {{ force?: boolean }} [opts]
 */
export async function requestUberToken(opts = {}) {
  const cfg = assertUberCredentials(getUberConfig());
  const now = Date.now();

  if (
    !opts.force &&
    cached?.accessToken &&
    cached.scopes === cfg.scopes &&
    cached.expiresAtMs - EXPIRY_SKEW_MS > now
  ) {
    return {
      accessToken: cached.accessToken,
      env: cfg.env,
      tokenUrl: cfg.tokenUrl,
      apiBase: cfg.apiBase,
      requestedScopes: cfg.scopes,
      grantedScope: cached.grantedScope,
      expiresIn: Math.max(0, Math.round((cached.expiresAtMs - now) / 1000)),
      cached: true,
    };
  }

  const tokenUrl = cfg.tokenUrl;
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: "client_credentials",
    scope: cfg.scopes,
  });

  uberLog.info("Requesting Uber access token", {
    env: cfg.env,
    tokenUrl,
    apiBase: cfg.apiBase,
    scopes: cfg.scopes,
  });

  const resp = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  const text = await resp.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!resp.ok) {
    const message = formatUberTokenError({
      env: cfg.env,
      tokenUrl,
      scopes: cfg.scopes,
      status: resp.status,
      error: json?.error,
      errorDescription: json?.error_description,
    });
    uberLog.error("Uber token request failed", {
      env: cfg.env,
      tokenUrl,
      scopes: cfg.scopes,
      status: resp.status,
      error: json?.error,
    });
    throw new UberAuthError(message, {
      code: json?.error || "UBER_TOKEN",
      status: resp.status,
      env: cfg.env,
      tokenUrl,
      scopes: cfg.scopes,
    });
  }

  const accessToken = json?.access_token;
  const expiresIn = Number(json?.expires_in || 0);
  if (!accessToken) {
    throw new UberAuthError("Uber token response missing access_token", {
      env: cfg.env,
      tokenUrl,
      scopes: cfg.scopes,
    });
  }

  const grantedScope = String(json?.scope || cfg.scopes);

  cached = {
    accessToken,
    expiresAtMs: now + Math.max(expiresIn, 60) * 1000,
    scopes: cfg.scopes,
    grantedScope,
    expiresIn,
  };

  uberLog.info("Uber access token cached", {
    env: cfg.env,
    expiresInSec: expiresIn,
    grantedScope,
  });

  return {
    accessToken,
    env: cfg.env,
    tokenUrl,
    apiBase: cfg.apiBase,
    requestedScopes: cfg.scopes,
    grantedScope,
    expiresIn,
    cached: false,
  };
}
