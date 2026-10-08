import { getKnex } from "../db.js";
import { resolveRestaurantFamilyIds } from "../lib/tableSessions.js";
import { normalizeElevenLabsToolBody, phoneMatchVariants, resolveRestaurantIdForVoiceTools } from "../lib/voiceWebhookUtils.js";

function applyPhoneWhere(qb, phone) {
  const variants = phoneMatchVariants(phone);
  if (!variants.length) return false;
  qb.andWhere(function () {
    for (const v of variants) {
      this.orWhere("customer_phone", v);
    }
  });
  return true;
}

export async function aiCheckPreviousOrder(req, res) {
  res.set("Access-Control-Allow-Origin", "*");

  try {
    console.log("\n" + "-".repeat(40));
    console.log("🔍 CHECK PREVIOUS ORDER / RETURNING CALLER");

    const rawBody = { ...(req.query || {}), ...(req.body || {}) };
    const body = normalizeElevenLabsToolBody(rawBody);

    let phone = body.customer_phone || body.caller_phone || body.twilio_from || body.from || "";
    if (phone === "<user_phone_number>" || /same|this|my\s*number/i.test(String(phone))) phone = "";

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
        has_active_reservation: false,
        has_previous_order: false,
        message:
          "Translate and tell the caller in their language: I cannot check previous orders because the caller's phone number is not available. Continue taking a new order normally.",
      });
    }

    const familyIds = await resolveRestaurantFamilyIds(knex, restaurantId);
    const ids = familyIds.length ? familyIds : [restaurantId];

    // Active table reservation across parent + branches
    let activeReservation = null;
    const reservationQb = knex("table_reservations")
      .whereIn("restaurant_id", ids)
      .whereIn("status", ["pending", "confirmed"])
      .where("reservation_date", ">=", knex.raw("CURRENT_DATE"))
      .orderBy("reservation_date", "asc")
      .orderBy("start_time", "asc");
    if (applyPhoneWhere(reservationQb, phone)) {
      activeReservation = await reservationQb.first();
    }

    // Latest food order across parent + branches (exclude empty / reservation-only noise)
    let order = null;
    const orderQb = knex("orders")
      .whereIn("restaurant_id", ids)
      .whereNotIn("status", ["cancelled"])
      .orderBy("created_at", "desc");
    if (applyPhoneWhere(orderQb, phone)) {
      order = await orderQb.first();
    }

    let itemDetails = null;
    let previousFulfillment = null;
    if (order) {
      const items = await knex("order_items").where({ order_id: order.id }).orderBy("id", "asc");
      if (items.length) {
        itemDetails = items
          .map((i) => {
            let details = `${i.quantity} ${i.item_name}`;
            if (i.notes) details += ` (${i.notes})`;
            return details;
          })
          .join(", ");
        previousFulfillment = order.fulfillment_type;
      }
    }

    const parts = [];
    if (activeReservation) {
      const when = [
        activeReservation.reservation_date,
        String(activeReservation.start_time || "").slice(0, 5),
      ]
        .filter(Boolean)
        .join(" at ");
      parts.push(
        `This caller already has an active table reservation for ${when} (party of ${activeReservation.party_size}). ` +
          `Tell them in their language that their table is already reserved, they should complete that booking first, ` +
          `and do NOT create another table reservation until it is done. They may still place a food order.`,
      );
    }

    if (itemDetails) {
      parts.push(
        `The customer previously ordered: ${itemDetails}. Ask them in their language if they would like to repeat this exact same order. ` +
          `If yes, reuse these items and still collect branch / delivery-or-pickup details before place_order.`,
      );
    }

    if (!parts.length) {
      return res.json({
        found: false,
        has_active_reservation: false,
        has_previous_order: false,
        message:
          "Translate and tell the caller in their language: No previous orders or active table reservations found. Continue taking a new order normally.",
      });
    }

    return res.json({
      found: true,
      has_active_reservation: !!activeReservation,
      has_previous_order: !!itemDetails,
      message: `Translate and tell the caller in their language: ${parts.join(" ")}`,
      previous_items: itemDetails,
      previous_fulfillment_type: previousFulfillment,
      reservation_date: activeReservation?.reservation_date || null,
      reservation_time: activeReservation ? String(activeReservation.start_time || "").slice(0, 5) : null,
      party_size: activeReservation?.party_size || null,
    });
  } catch (err) {
    console.error("aiCheckPreviousOrder error:", err);
    return res.json({ found: false, has_active_reservation: false, has_previous_order: false, message: "Error checking previous order." });
  }
}
