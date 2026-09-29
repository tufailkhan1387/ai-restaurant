import { getKnex } from "../db.js";
import { normalizeElevenLabsToolBody, resolveRestaurantIdForVoiceTools } from "../lib/voiceWebhookUtils.js";
import { createPhoneOrder } from "../lib/phoneOrderService.js";

export async function aiPlaceOrder(req, res) {
  res.set("Access-Control-Allow-Origin", "*");

  try {
    console.log("\n" + "=".repeat(50));
    console.log("🔔 NEW ORDER REQUEST RECEIVED FROM ELEVENLABS!");
    console.log("=".repeat(50));

    const rawBody = req.body || {};
    const body = normalizeElevenLabsToolBody(rawBody);
    if (!body.elevenlabs_agent_id && process.env.ELEVENLABS_AGENT_ID) {
      body.elevenlabs_agent_id = String(process.env.ELEVENLABS_AGENT_ID).trim();
    }

    if (String(body.customer_email || "").trim().toLowerCase() === "none") body.customer_email = null;
    if (String(body.coupon_code || "").trim().toLowerCase() === "none") body.coupon_code = null;

    if (!body.customer_name || !body.items) {
      console.error("❌ Validation Failed: Missing customer_name or items");
      return res.status(200).json({
        message:
          "I'm sorry, I missed some details. Could you please provide your name and the items you'd like to order again?",
      });
    }

    const knex = getKnex();
    const resolved = await resolveRestaurantIdForVoiceTools(knex, body);
    const restaurantId = resolved.id;

    console.log("👤 Customer:", body.customer_name);
    console.log("📦 Items:", JSON.stringify(body.items));
    console.log(
      restaurantId
        ? `🏪 Restaurant resolved: ${restaurantId}`
        : `❌ No restaurant_id — ${resolved.error || "unknown"}`,
    );

    if (!restaurantId) {
      const hint = resolved.error || "could not resolve restaurant";
      return res.status(200).json({
        success: false,
        message: `${hint}. Set ELEVENLABS_AGENT_ID + restaurants.elevenlabs_agent_id, send restaurant_id in the tool, or set ELEVENLABS_DEFAULT_RESTAURANT_ID.`,
      });
    }

    let callId = null;
    if (body.call_sid) {
      const c = await knex("calls").where({ twilio_call_sid: body.call_sid }).select("id").first();
      callId = c?.id ?? null;
    }

    const { order, unmatched, coupon, totals, targetRestaurantId, assignmentStatus } = await createPhoneOrder(knex, {
      restaurantId,
      customer_name: body.customer_name,
      customer_phone: body.customer_phone,
      customer_email: body.customer_email || body.email || null,
      delivery_address: body.delivery_address,
      delivery_notes: body.delivery_notes || body.notes || null,
      items: body.items,
      coupon_code: body.coupon_code || body.discount_code || null,
      payment_method: body.payment_method ?? "cash",
      fulfillment_type: body.fulfillment_type || "delivery",
      delivery_latitude: body.delivery_latitude ?? body.latitude ?? null,
      delivery_longitude: body.delivery_longitude ?? body.longitude ?? null,
      call_id: callId,
      source: "phone",
      ai_extracted_data: { raw: body, provider: "elevenlabs" },
    });

    console.log(`✅ Order saved: id=${order.id} order_number=${order.order_number} restaurant_id=${order.restaurant_id} status=${assignmentStatus}`);

    const couponNote =
      coupon?.amount > 0
        ? ` Discount ${coupon.code} applied (${coupon.amount.toFixed(2)}).`
        : coupon?.error
          ? ` Coupon not applied (${coupon.error}).`
          : "";

    return res.json({
      success: true,
      order_number: order.order_number,
      tracking_code: order.tracking_code,
      total: totals.total,
      discount_amount: coupon.amount,
      speak: `Your order number is ${order.order_number}. Please save it. You can call back with this number to track your order.`,
      message: `Tell the caller this exact sentence: Your order number is ${order.order_number}. Please save it. You can call back with this number to track your order. Total ${totals.total.toFixed(2)}.${couponNote}`,
    });
  } catch (e) {
    console.error("❌ Order Error:", e);
    if (e.isOutOfStock || e.outOfStock?.length) {
      const itemsList = (e.outOfStock || []).join(", ");
      return res.status(200).json({
        success: false,
        out_of_stock: true,
        message: `I am sorry, but ${itemsList} is currently out of order and unavailable. Would you like to order another item from our menu instead?`,
      });
    }
    return res.status(500).json({ error: e.message || "failed" });
  }
}
