/**
 * Uber Eats Marketplace Order API client.
 * Endpoints taken from Uber developer docs / Marketplace Order API reference.
 */
import { getUberConfig } from "./config.js";
import { clearUberTokenCache, getUberAccessToken } from "./uberAuth.js";
import { uberLog } from "./logger.js";

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 500;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function shouldRetry(status) {
  return status === 429 || status >= 500;
}

/**
 * @param {string} pathOrUrl
 * @param {{ method?: string; body?: unknown; headers?: Record<string, string>; retryOn401?: boolean }} [opts]
 */
export async function uberRequest(pathOrUrl, opts = {}) {
  const cfg = getUberConfig();
  const url = pathOrUrl.startsWith("http")
    ? pathOrUrl
    : `${cfg.apiBase}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;

  let lastErr = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const token = await getUberAccessToken({ force: attempt > 0 && lastErr?.status === 401 });
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      ...(opts.body != null ? { "Content-Type": "application/json" } : {}),
      ...(opts.headers || {}),
    };

    let resp;
    try {
      resp = await fetch(url, {
        method: opts.method || "GET",
        headers,
        body: opts.body != null ? JSON.stringify(opts.body) : undefined,
      });
    } catch (e) {
      lastErr = e;
      if (attempt < MAX_RETRIES) {
        await sleep(BASE_DELAY_MS * 2 ** attempt);
        continue;
      }
      throw e;
    }

    if (resp.status === 401 && opts.retryOn401 !== false && attempt === 0) {
      uberLog.warn("Uber API 401 — refreshing token and retrying once", { url });
      clearUberTokenCache();
      lastErr = Object.assign(new Error("Unauthorized"), { status: 401 });
      continue;
    }

    const text = await resp.text();
    let json = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = { raw: text };
      }
    }

    if (!resp.ok) {
      const err = new Error(
        json?.message || json?.error || json?.title || text || `Uber HTTP ${resp.status}`,
      );
      err.status = resp.status;
      err.payload = json;
      if (shouldRetry(resp.status) && attempt < MAX_RETRIES) {
        const retryAfter = Number(resp.headers.get("retry-after"));
        const delay = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : BASE_DELAY_MS * 2 ** attempt;
        uberLog.warn("Uber API retryable error", { status: resp.status, attempt, delayMs: delay, url });
        lastErr = err;
        await sleep(delay);
        continue;
      }
      throw err;
    }

    // 204 No Content (accept/deny)
    if (resp.status === 204) return null;
    return json;
  }

  throw lastErr || new Error("Uber request failed");
}

/**
 * GET /v2/eats/order/{order_id}
 * @see https://developer.uber.com/docs/eats/references/api/v2/get-eats-order-orderid
 */
export async function getOrderDetails(orderId) {
  if (!orderId) throw new Error("orderId is required");
  return uberRequest(`/v2/eats/order/${encodeURIComponent(orderId)}`);
}

/**
 * POST /v1/eats/orders/{order_id}/accept_pos_order
 * @see https://developer.uber.com/docs/eats/references/api/v1/post-eats-order-orderid-acceptposorder
 */
export async function acceptOrder(orderId, body = { reason: "Accepted via API" }) {
  if (!orderId) throw new Error("orderId is required");
  return uberRequest(`/v1/eats/orders/${encodeURIComponent(orderId)}/accept_pos_order`, {
    method: "POST",
    body,
  });
}

/**
 * POST /v1/eats/orders/{order_id}/deny_pos_order
 * @see https://developer.uber.com/docs/eats/references/api/v1/post-eats-order-orderid-denyposorder
 */
export async function denyOrder(orderId, reason) {
  if (!orderId) throw new Error("orderId is required");
  return uberRequest(`/v1/eats/orders/${encodeURIComponent(orderId)}/deny_pos_order`, {
    method: "POST",
    body: {
      reason: reason || {
        explanation: "Unable to fulfill order",
        code: "OTHER",
      },
    },
  });
}

/**
 * List orders for a store (paginated).
 * Path from Uber Marketplace Order API (Postman / Order suite):
 *   GET /v1/delivery/store/{store_id}/orders
 * Supports start_time, end_time, next_page_token, page_size (max 50), expand, state, status.
 *
 * TODO: Confirm this path is enabled for your app in the Uber Developer Dashboard.
 * If unavailable, fall back to:
 *   GET /v1/eats/stores/{store_id}/created-orders
 *   GET /v1/eats/stores/{store_id}/canceled-orders
 * which only cover CREATED / recent CANCELED orders (no full history pagination).
 *
 * @param {string} storeId
 * @param {{ startTime?: string; endTime?: string; pageSize?: number; nextPageToken?: string; expand?: string; state?: string; status?: string }} [opts]
 */
export async function listStoreOrders(storeId, opts = {}) {
  if (!storeId) throw new Error("storeId is required");
  const params = new URLSearchParams();
  if (opts.expand) params.set("expand", opts.expand);
  else params.set("expand", "carts,payment");
  if (opts.state) params.set("state", opts.state);
  if (opts.status) params.set("status", opts.status);
  if (opts.startTime) params.set("start_time", opts.startTime);
  if (opts.endTime) params.set("end_time", opts.endTime);
  if (opts.nextPageToken) params.set("next_page_token", opts.nextPageToken);
  if (opts.pageSize) params.set("page_size", String(Math.min(Number(opts.pageSize) || 50, 50)));

  const qs = params.toString();
  return uberRequest(
    `/v1/delivery/store/${encodeURIComponent(storeId)}/orders${qs ? `?${qs}` : ""}`,
  );
}

/**
 * GET /v1/eats/stores/{store_id}/canceled-orders
 * @see https://developer.uber.com/docs/eats/references/api/v1/get-eats-stores-storeid-canceledorders
 */
export async function listCanceledOrders(storeId) {
  if (!storeId) throw new Error("storeId is required");
  return uberRequest(`/v1/eats/stores/${encodeURIComponent(storeId)}/canceled-orders`);
}

export async function listCreatedOrders(storeId, limit) {
  if (!storeId) throw new Error("storeId is required");
  const qs = limit != null ? `?limit=${encodeURIComponent(String(limit))}` : "";
  return uberRequest(`/v1/eats/stores/${encodeURIComponent(storeId)}/created-orders${qs}`);
}

/**
 * GET /v1/eats/stores — enumerate stores for this client credentials token.
 * @see https://developer.uber.com/docs/eats/references/api/v1/get-eats-stores
 */
export async function listStores(opts = {}) {
  const params = new URLSearchParams();
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.startKey) params.set("start_key", opts.startKey);
  const qs = params.toString();
  return uberRequest(`/v1/eats/stores${qs ? `?${qs}` : ""}`);
}
