/** Marketplace / ordering channel inferred from `orders.source`. */
export const ORDER_CHANNELS = [
  "dashboard",
  "phone",
  "qr",
  "web",
  "uber",
  "doordash",
  "deliveroo",
  "justeat",
  "app",
] as const;

export type OrderChannel = (typeof ORDER_CHANNELS)[number];

export const ORDER_CHANNEL_LABELS: Record<OrderChannel, string> = {
  dashboard: "Dashboard",
  phone: "Phone / AI",
  qr: "QR / Dine-in",
  web: "Website",
  uber: "Uber Eats",
  doordash: "DoorDash",
  deliveroo: "Deliveroo",
  justeat: "Just Eat",
  app: "App",
};

export function orderChannel(source?: string | null, callId?: string | null): OrderChannel | null {
  const src = String(source || "").trim().toLowerCase();
  if (!src && callId) return "phone";
  if (!src) return null;

  if (src.includes("uber")) return "uber";
  if (src.includes("doordash") || src.includes("door_dash") || src.includes("door-dash")) return "doordash";
  if (src.includes("deliveroo")) return "deliveroo";
  if (src.includes("justeat") || src.includes("just_eat") || src.includes("just-eat") || src.includes("just eat")) {
    return "justeat";
  }
  if (src.includes("qr") || src.includes("dine")) return "qr";
  if (src.includes("phone") || src.includes("call") || src.includes("voice") || src.includes("synthflow") || src.includes("elevenlabs") || src.includes("ai")) {
    return "phone";
  }
  if (callId) return "phone";
  if (src.includes("online") || src.includes("web")) return "web";
  if (src.includes("dashboard") || src.includes("pos") || src.includes("house") || src.includes("manual") || src === "staff") {
    return "dashboard";
  }
  if (src.includes("app") || src.includes("foodpanda")) {
    return "app";
  }
  return null;
}

export function matchesOrderChannel(
  channelFilter: string,
  source?: string | null,
  callId?: string | null,
): boolean {
  if (!channelFilter || channelFilter === "all") return true;
  const channel = orderChannel(source, callId);
  if (channelFilter === "phone") {
    return channel === "phone" || Boolean(callId);
  }
  return channel === channelFilter;
}
