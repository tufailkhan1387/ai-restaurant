import { getKnex } from "../db.js";
import { normalizeElevenLabsToolBody, resolveRestaurantIdForVoiceTools } from "../lib/voiceWebhookUtils.js";

function statusLabel(s) {
  const m = {
    pending: "received and waiting for confirmation",
    confirmed: "confirmed by the restaurant",
    preparing: "being prepared in the kitchen",
    ready: "ready and waiting for a driver",
    assigned: "assigned to a driver",
    out_for_delivery: "out for delivery",
    delivered: "delivered",
    cancelled: "cancelled",
  };
  return m[s] || s;
}

export async function aiOrderStatus(req, res) {
  res.set("Access-Control-Allow-Origin", "*");
  
  try {
    console.log("\n" + "-".repeat(40));
    console.log("🔍 STATUS CHECK REQUEST FROM AI");
    const rawBody = req.body || {};
    const body = normalizeElevenLabsToolBody(rawBody);
    
    console.log("📍 Query (tracking code):", body.tracking_code || "No code provided");
    console.log("-".repeat(40) + "\n");

    const knex = getKnex();
    const code = (body.tracking_code || "").trim().toUpperCase();
    
    if (!code) {
      return res.json({
        found: false,
        message: "I need the tracking code from your receipt to look that up.",
      });
    }

    let restaurantId = body.restaurant_id ?? null;
    if (!restaurantId && (body.twilio_to || body.elevenlabs_agent_id)) {
      const resolved = await resolveRestaurantIdForVoiceTools(knex, body);
      restaurantId = resolved.id;
    }

    let q = knex("orders").where({ tracking_code: code });
    if (restaurantId) q = q.andWhere({ restaurant_id: restaurantId });
    const order = await q
      .select("order_number", "tracking_code", "status", "total_amount", "estimated_delivery_at", "customer_name", "restaurant_id")
      .first();

    if (!order) {
      return res.json({
        found: false,
        message: `I couldn't find an order with tracking code ${code}. Could you double-check it?`,
      });
    }

    const eta = order.estimated_delivery_at
      ? new Date(order.estimated_delivery_at).toLocaleString("en-US", { hour: "numeric", minute: "2-digit" })
      : null;

    const message = `Order ${order.order_number} for ${order.customer_name} is ${statusLabel(order.status)}.${
      eta ? ` Estimated delivery around ${eta}.` : ""
    } Total ${Number(order.total_amount).toFixed(2)}.`;

    return res.json({
      found: true,
      order_number: order.order_number,
      status: order.status,
      status_label: statusLabel(order.status),
      estimated_delivery_at: order.estimated_delivery_at,
      total: order.total_amount,
      message,
    });
  } catch (e) {
    console.error("❌ Status Error:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
