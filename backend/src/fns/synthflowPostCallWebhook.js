import { getKnex } from "../db.js";
import { createPhoneOrder, parseOrderItemsText } from "../lib/phoneOrderService.js";
import { normalizeE164 } from "../lib/voiceWebhookUtils.js";

function truthyYes(v) {
  if (v == null) return false;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  return ["yes", "true", "y", "1", "ordered", "order placed"].includes(s);
}

function emptyish(v) {
  if (v == null) return true;
  const s = String(v).trim().toLowerCase();
  return !s || s === "none" || s === "null" || s === "n/a" || s === "na" || s === "unknown";
}

function mapCallStatus(raw) {
  const s = String(raw || "").toLowerCase();
  if (s === "completed" || s === "done") return "completed";
  if (s === "in-progress" || s === "ringing" || s === "pending") return "in_progress";
  if (s === "no-answer" || s === "busy" || s === "failed" || s === "canceled" || s === "user-canceled") {
    return "missed";
  }
  return "completed";
}

/**
 * Pull plain-text values from Synthflow executed_actions / collected_variables.
 */
export function extractSynthflowFields(payload) {
  /** @type {Record<string, string>} */
  const fields = {};

  const collected = payload?.collected_variables;
  if (collected && typeof collected === "object") {
    for (const [key, val] of Object.entries(collected)) {
      if (val && typeof val === "object" && "value" in val) {
        if (val.value != null) fields[key] = String(val.value);
      } else if (val != null) {
        fields[key] = String(val);
      }
    }
  }

  const executed = payload?.executed_actions;
  if (executed && typeof executed === "object") {
    for (const action of Object.values(executed)) {
      if (!action || typeof action !== "object") continue;
      const name = String(action.name || "").toLowerCase();
      const hardId = String(action.parameters_hard_coded?.identifier || "").toLowerCase();
      const ret = action.return_value;
      let value = null;
      if (ret != null && typeof ret === "object") {
        const vals = Object.values(ret).filter((x) => x != null && String(x).trim() !== "");
        value = vals.length ? vals[0] : null;
      } else if (ret != null) {
        value = ret;
      }
      if (value == null) continue;

      const key =
        hardId ||
        name.replace(/^extract_info[_\s-]*/i, "").replace(/\s+/g, "_") ||
        null;
      if (key) fields[key] = String(value);
    }
  }

  // Common aliases
  const aliases = {
    customer_name: ["customer_name", "name", "user_name", "full_name"],
    customer_phone: ["customer_phone", "phone", "phone_number", "caller_phone"],
    delivery_address: ["delivery_address", "address", "shipping_address"],
    order_items: ["order_items", "items", "ordered_items", "food_items"],
    coupon_code: ["coupon_code", "promo_code", "discount_code", "coupon"],
    special_notes: ["special_notes", "notes", "delivery_notes", "instructions"],
    fulfillment_type: ["fulfillment_type", "order_type", "delivery_or_pickup"],
    payment_method: ["payment_method", "payment"],
    order_placed: ["order_placed", "placed_order", "order_confirmed"],
  };

  /** @type {Record<string, string | null>} */
  const out = {};
  for (const [canon, keys] of Object.entries(aliases)) {
    let found = null;
    for (const k of keys) {
      for (const [fk, fv] of Object.entries(fields)) {
        if (fk.toLowerCase() === k || fk.toLowerCase().includes(k)) {
          found = fv;
          break;
        }
      }
      if (found != null) break;
    }
    out[canon] = found;
  }
  return out;
}

async function resolveRestaurant(knex, payload) {
  const modelId =
    payload?.call?.model_id ||
    payload?.model_id ||
    payload?.executed_actions &&
      Object.values(payload.executed_actions)[0]?.model_id;

  if (modelId) {
    const row = await knex("restaurants")
      .where({ synthflow_agent_id: String(modelId) })
      .first();
    if (row) return row;
  }

  const toNumber =
    payload?.call?.to ||
    payload?.call?.to_number ||
    payload?.metadata?.to ||
    payload?.lead?.to_phone_number;

  if (toNumber) {
    const raw = String(toNumber).trim();
    const norm = normalizeE164(raw);
    let row = await knex("restaurants").where({ telnyx_phone_number: raw }).first();
    if (!row && norm) row = await knex("restaurants").where({ telnyx_phone_number: norm }).first();
    if (row) return row;
  }

  return null;
}

function verifyWebhookSecret(req) {
  const secret = String(process.env.SYNTHFLOW_WEBHOOK_SECRET || "").trim();
  if (!secret) return true;
  const header =
    req.get("x-synthflow-signature") ||
    req.get("x-webhook-secret") ||
    req.get("authorization") ||
    "";
  if (header === secret) return true;
  if (header.replace(/^Bearer\s+/i, "") === secret) return true;
  return false;
}

/**
 * Synthflow post-call webhook → persist call + auto-create order when extractors confirm one.
 */
export async function synthflowPostCallWebhook(req, res) {
  res.set("Access-Control-Allow-Origin", "*");
  try {
    if (!verifyWebhookSecret(req)) {
      return res.status(401).json({ success: false, error: "invalid webhook secret" });
    }

    const payload = req.body || {};
    console.log("\n" + "=".repeat(50));
    console.log("📞 SYNTHFLOW POST-CALL WEBHOOK");
    console.log("=".repeat(50));

    // Inbound routing probe (Synthflow may POST call_inbound before connecting)
    if (payload.event === "call_inbound" || payload.call_inbound) {
      return res.json({
        call_inbound: payload.call_inbound || {},
      });
    }

    const knex = getKnex();
    const restaurant = await resolveRestaurant(knex, payload);
    const callMeta = payload.call || {};
    const lead = payload.lead || {};
    const synthflowCallId = String(callMeta.call_id || payload.call_id || "").trim() || null;
    const callerPhone =
      normalizeE164(lead.phone_number) ||
      normalizeE164(callMeta.from) ||
      normalizeE164(callMeta.phone) ||
      "Unknown";

    let callRow = null;
    if (synthflowCallId) {
      callRow = await knex("calls").where({ synthflow_call_id: synthflowCallId }).first();
    }

    const callPatch = {
      phone_number: callerPhone,
      status: mapCallStatus(callMeta.status || payload.status),
      direction: "inbound",
      duration_seconds: Number(callMeta.duration || 0) || 0,
      recording_url: callMeta.recording_url || null,
      transcript: callMeta.transcript || null,
      notes: payload.analysis?.call_summary_feedback || payload.analysis?.all_feedback || null,
      synthflow_call_id: synthflowCallId,
      restaurant_id: restaurant?.id || null,
      provider: "synthflow",
      ended_at: new Date().toISOString(),
      started_at: callMeta.start_time || null,
    };

    if (callRow) {
      await knex("calls").where({ id: callRow.id }).update(callPatch);
    } else {
      const [created] = await knex("calls").insert(callPatch).returning("*");
      callRow = created;
    }

    const fields = extractSynthflowFields(payload);
    const orderPlaced = truthyYes(fields.order_placed);
    const items = parseOrderItemsText(fields.order_items);
    const hasCustomer = !emptyish(fields.customer_name);
    const shouldCreate = (orderPlaced || items.length > 0) && hasCustomer && items.length > 0;

    if (!restaurant) {
      console.warn("Synthflow webhook: restaurant not resolved");
      return res.json({
        success: true,
        call_id: callRow?.id,
        order_created: false,
        reason: "restaurant_not_resolved",
      });
    }

    // Idempotency: one order per Synthflow call
    if (synthflowCallId) {
      const existing = await knex("orders")
        .whereRaw("ai_extracted_data->>'synthflow_call_id' = ?", [synthflowCallId])
        .first();
      if (existing) {
        return res.json({
          success: true,
          call_id: callRow?.id,
          order_created: false,
          order_id: existing.id,
          order_number: existing.order_number,
          reason: "already_created",
        });
      }
    }

    if (!shouldCreate) {
      console.log("No order to create from call", {
        orderPlaced,
        itemCount: items.length,
        hasCustomer,
      });
      return res.json({
        success: true,
        call_id: callRow?.id,
        order_created: false,
        reason: "no_order_in_call",
        fields,
      });
    }

    const couponRaw = emptyish(fields.coupon_code) ? null : fields.coupon_code;
    const notesRaw = emptyish(fields.special_notes) ? null : fields.special_notes;
    const phone =
      (!emptyish(fields.customer_phone) && fields.customer_phone) || callerPhone;

    const { order, unmatched, coupon, totals } = await createPhoneOrder(knex, {
      restaurantId: restaurant.id,
      customer_name: fields.customer_name,
      customer_phone: phone,
      delivery_address: fields.delivery_address,
      delivery_notes: notesRaw,
      items,
      coupon_code: couponRaw,
      payment_method: emptyish(fields.payment_method) ? "cash" : fields.payment_method,
      fulfillment_type: fields.fulfillment_type || "delivery",
      call_id: callRow?.id,
      source: "phone",
      ai_extracted_data: {
        provider: "synthflow",
        synthflow_call_id: synthflowCallId,
        fields,
        raw_status: payload.status,
        end_call_reason: callMeta.end_call_reason,
      },
    });

    console.log(
      `✅ Synthflow order created: ${order.order_number} restaurant=${restaurant.id} total=${totals.total}`,
    );

    return res.json({
      success: true,
      call_id: callRow?.id,
      order_created: true,
      order_id: order.id,
      order_number: order.order_number,
      tracking_code: order.tracking_code,
      unmatched,
      coupon,
      totals,
    });
  } catch (e) {
    console.error("Synthflow post-call webhook error:", e);
    // Always 200-ish friendly for provider retries? Prefer 500 so they retry on transient failures.
    return res.status(500).json({ success: false, error: e.message || "webhook failed" });
  }
}
