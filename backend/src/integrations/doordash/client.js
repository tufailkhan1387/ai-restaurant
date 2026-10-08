/**
 * DoorDash Marketplace outbound API (JWT + auth-version: v2).
 * @see https://developer.doordash.com/en-US/docs/marketplace/how_to/order_integration/
 * @see https://developer.doordash.com/en-US/api/marketplace
 */
import { createDoorDashJwt } from "./jwt.js";
import { getDoorDashConfig } from "./config.js";
import { createLogger } from "../../lib/safeLogger.js";

const log = createLogger("doordash");

async function marketplaceFetch(path, { method = "GET", body } = {}) {
  const cfg = getDoorDashConfig();
  const token = createDoorDashJwt();
  const url = `${cfg.apiBase}${path.startsWith("/") ? path : `/${path}`}`;

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "auth-version": "v2",
      "User-Agent": cfg.userAgent,
      Accept: "application/json",
      ...(body != null ? { "Content-Type": "application/json" } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!res.ok) {
    const err = new Error(
      `DoorDash API ${method} ${path} failed (${res.status}): ${data?.message || data?.error || text || "unknown"}`,
    );
    err.status = res.status;
    err.body = data;
    throw err;
  }

  return data;
}

/**
 * Confirm or fail an order (async confirmation follow-up).
 * PATCH /api/v1/orders/{id}
 */
export async function confirmOrder(orderId, { merchantSuppliedId, orderStatus, failureReason, prepTime } = {}) {
  const id = encodeURIComponent(String(orderId));
  const body = {
    merchant_supplied_id: String(merchantSuppliedId || orderId),
    order_status: orderStatus === "fail" ? "fail" : "success",
  };
  if (body.order_status === "fail" && failureReason) {
    body.failure_reason = String(failureReason);
  }
  if (prepTime) body.prep_time = prepTime;

  log.info("Confirming DoorDash order", {
    orderId: String(orderId),
    order_status: body.order_status,
  });
  return marketplaceFetch(`/api/v1/orders/${id}`, { method: "PATCH", body });
}

/**
 * Merchant-initiated cancel after prior acceptance.
 * PATCH /api/v1/orders/{id}/cancellation
 */
export async function cancelOrder(orderId, { cancelReason = "OTHER", cancelDetails } = {}) {
  const id = encodeURIComponent(String(orderId));
  const body = { cancel_reason: String(cancelReason || "OTHER") };
  if (cancelDetails) body.cancel_details = String(cancelDetails);
  return marketplaceFetch(`/api/v1/orders/${id}/cancellation`, { method: "PATCH", body });
}
