/** Normalized marketplace statuses. */
export const MARKETPLACE_STATUSES = [
  "placed",
  "accepted",
  "preparing",
  "ready",
  "completed",
  "cancelled",
  "failed",
];

export const FINAL_MARKETPLACE_STATUSES = new Set(["completed", "cancelled", "failed"]);

const RANK = {
  placed: 1,
  accepted: 2,
  preparing: 3,
  ready: 4,
  completed: 5,
  cancelled: 5,
  failed: 5,
};

export function rankMarketplaceStatus(status) {
  return RANK[String(status || "").toLowerCase()] || 0;
}

/** Kitchen `orders.status` values used by the existing All Orders UI. */
export function marketplaceToKitchenStatus(status) {
  switch (String(status || "").toLowerCase()) {
    case "placed":
      return "pending";
    case "accepted":
      return "confirmed";
    case "preparing":
      return "preparing";
    case "ready":
      return "ready";
    case "completed":
      return "delivered";
    case "cancelled":
    case "failed":
      return "cancelled";
    default:
      return "pending";
  }
}

export function kitchenToMarketplaceStatus(status) {
  switch (String(status || "").toLowerCase()) {
    case "pending":
      return "placed";
    case "confirmed":
      return "accepted";
    case "preparing":
      return "preparing";
    case "ready":
      return "ready";
    case "assigned":
    case "out_for_delivery":
    case "delivered":
      return "completed";
    case "cancelled":
      return "cancelled";
    default:
      return "placed";
  }
}

export function wouldDowngrade(existingMarketplaceStatus, nextMarketplaceStatus) {
  if (!FINAL_MARKETPLACE_STATUSES.has(String(existingMarketplaceStatus || "").toLowerCase())) {
    return false;
  }
  const from = rankMarketplaceStatus(existingMarketplaceStatus);
  const to = rankMarketplaceStatus(nextMarketplaceStatus);
  return to < from;
}

export function displayPrefix(source) {
  if (source === "uber") return "UE";
  if (source === "deliveroo") return "DR";
  if (source === "justeat") return "JE";
  if (source === "doordash") return "DD";
  return "MP";
}
