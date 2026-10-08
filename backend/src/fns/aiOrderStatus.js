import { getKnex } from "../db.js";
import { canonicalOrderNumber } from "../lib/orderNumbers.js";
import { resolveRestaurantFamilyIds } from "../lib/tableSessions.js";
import { normalizeElevenLabsToolBody, resolveRestaurantIdForVoiceTools } from "../lib/voiceWebhookUtils.js";

function statusLabel(status, fulfillmentType) {
  const dineIn = String(fulfillmentType || "").toLowerCase() === "dine_in";
  const m = {
    pending: "received and waiting for confirmation",
    confirmed: "confirmed by the restaurant",
    preparing: "being prepared in the kitchen",
    ready: dineIn ? "ready to be served" : "ready for pickup or a driver",
    assigned: "assigned to a driver",
    out_for_delivery: dineIn ? "served to the table" : "out for delivery",
    delivered: dineIn ? "complete and paid" : "delivered",
    cancelled: "cancelled",
  };
  return m[status] || status;
}

function normalizeLookup(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/^ORDER\s+/, "")
    .replace(/\s+/g, "");
}

const ORDER_LOOKUP_COLUMNS = [
  "order_number",
  "tracking_code",
  "status",
  "total_amount",
  "estimated_delivery_at",
  "customer_name",
  "restaurant_id",
  "fulfillment_type",
  "table_number",
];

async function findOrder(knex, { code, restaurantId }) {
  if (!code) return null;
  const canonical = canonicalOrderNumber(code);
  const familyIds = restaurantId ? await resolveRestaurantFamilyIds(knex, restaurantId) : [];

  let q = knex("orders").where((builder) => {
    builder.whereRaw("UPPER(tracking_code) = ?", [code]).orWhereRaw("UPPER(order_number) = ?", [code]);
    if (canonical && canonical !== code) builder.orWhere({ order_number: canonical });
  });
  if (familyIds.length) q = q.whereIn("restaurant_id", familyIds);
  return q.select(ORDER_LOOKUP_COLUMNS).orderBy("created_at", "desc").first();
}

export async function aiOrderStatus(req, res) {
  res.set("Access-Control-Allow-Origin", "*");

  try {
    console.log("\n" + "-".repeat(40));
    console.log("🔍 STATUS CHECK REQUEST FROM AI");
    const rawBody = { ...(req.query || {}), ...(req.body || {}) };
    const body = normalizeElevenLabsToolBody(rawBody);

    const code = normalizeLookup(
      body.order_number ||
        body.tracking_code ||
        body.order_num ||
        body.code ||
        body.orderNumber ||
        body.order_no,
    );
    console.log("📍 Query:", code || "No order number provided");
    console.log("-".repeat(40) + "\n");

    if (!code) {
      return res.json({
        found: false,
        message: "Translate and tell the caller in their language: I need your order number, for example ORD-260929-01, to look that up.",
      });
    }

    const knex = getKnex();
    let restaurantId = body.restaurant_id ?? null;
    if (!restaurantId && (body.twilio_to || body.elevenlabs_agent_id || body.synthflow_agent_id)) {
      const resolved = await resolveRestaurantIdForVoiceTools(knex, body);
      restaurantId = resolved.id;
    }

    const order = await findOrder(knex, { code, restaurantId });

    if (!order) {
      return res.json({
        found: false,
        message: `Translate and tell the caller in their language: I couldn't find an order with number ${code}. Could you double-check the order number?`,
      });
    }

    const eta = order.estimated_delivery_at
      ? new Date(order.estimated_delivery_at).toLocaleString("en-US", { hour: "numeric", minute: "2-digit" })
      : null;

    const tableBit = order.table_number ? ` for table ${order.table_number}` : "";
    const message = `Translate and tell the caller in their language: Order ${order.order_number} for ${order.customer_name}${tableBit} is ${statusLabel(order.status, order.fulfillment_type)}.${
      eta ? ` Estimated time around ${eta}.` : ""
    } Total ${Number(order.total_amount).toFixed(2)}.`;

    return res.json({
      found: true,
      order_number: order.order_number,
      tracking_code: order.tracking_code,
      status: order.status,
      status_label: statusLabel(order.status, order.fulfillment_type),
      fulfillment_type: order.fulfillment_type,
      estimated_delivery_at: order.estimated_delivery_at,
      total: order.total_amount,
      message,
    });
  } catch (e) {
    console.error("❌ Status Error:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
