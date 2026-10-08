import { getKnex } from "../db.js";
import { normalizeElevenLabsToolBody, resolveRestaurantIdForVoiceTools } from "../lib/voiceWebhookUtils.js";

export async function aiCheckPreviousOrder(req, res) {
  res.set("Access-Control-Allow-Origin", "*");
  
  try {
    console.log("\n" + "-".repeat(40));
    console.log("🔍 CHECK PREVIOUS ORDER REQUEST FROM AI");
    
    const rawBody = { ...(req.query || {}), ...(req.body || {}) };
    const body = normalizeElevenLabsToolBody(rawBody);

    let phone = body.customer_phone || body.twilio_from || body.from || "";
    // If Synthflow sends literal variable string when not found
    if (phone === "<user_phone_number>") phone = "";
    
    console.log("📍 Caller Phone:", phone || "Not provided");
    console.log("-".repeat(40) + "\n");

    const knex = getKnex();
    
    let restaurantId = body.restaurant_id ?? null;
    if (!restaurantId && (body.twilio_to || body.elevenlabs_agent_id || body.synthflow_agent_id)) {
      const resolved = await resolveRestaurantIdForVoiceTools(knex, body);
      restaurantId = resolved.id;
    }

    if (!phone || !restaurantId) {
      return res.json({
        found: false,
        message: "Translate and tell the caller in their language: I cannot check previous orders because the caller's phone number is not available."
      });
    }

    // Attempt to normalize phone to find any matching previous order
    const digitsOnly = phone.replace(/\D/g, "");
    
    const order = await knex("orders")
      .where({ restaurant_id: restaurantId })
      .andWhere(function() {
        this.where("customer_phone", phone);
        if (digitsOnly) {
          this.orWhere("customer_phone", `+${digitsOnly}`);
          if (digitsOnly.startsWith("1")) this.orWhere("customer_phone", `+${digitsOnly}`);
          if (digitsOnly.length === 10) this.orWhere("customer_phone", `+1${digitsOnly}`);
        }
      })
      .orderBy("created_at", "desc")
      .first();

    if (!order) {
      return res.json({
        found: false,
        message: "Translate and tell the caller in their language: No previous orders found for this caller."
      });
    }

    const items = await knex("order_items").where({ order_id: order.id }).orderBy("id", "asc");
    if (!items.length) {
      return res.json({
        found: false,
        message: "Translate and tell the caller in their language: Previous order found, but it had no items."
      });
    }

    const itemStrings = items.map(i => {
      let details = `${i.quantity} ${i.item_name}`;
      if (i.notes) details += ` (${i.notes})`;
      return details;
    });

    const itemDetails = itemStrings.join(", ");

    return res.json({
      found: true,
      message: `Translate and tell the caller in their language: The customer previously ordered: ${itemDetails}. Ask them if they would like to repeat this exact same order.`,
      previous_items: itemDetails,
      previous_fulfillment_type: order.fulfillment_type
    });

  } catch (err) {
    console.error("aiCheckPreviousOrder error:", err);
    return res.json({ found: false, message: "Error checking previous order." });
  }
}
