import crypto from "crypto";
import { getKnex } from "../db.js";
import { createPhoneOrder, parseOrderItemsText } from "../lib/phoneOrderService.js";
import { normalizeE164 } from "../lib/voiceWebhookUtils.js";
import { parseTranscriptIntoTurns } from "./synthflowSyncCalls.js";

function truthyYes(v) {
  if (v == null) return false;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  return ["yes", "true", "y", "1", "ordered", "order placed", "oui", "vrai", "commande passée", "commande validée"].includes(s);
}

function emptyish(v) {
  if (v == null) return true;
  const s = String(v).trim().toLowerCase();
  return !s || s === "none" || s === "null" || s === "n/a" || s === "na" || s === "unknown" || s === "aucun" || s === "aucune";
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
    customer_email: ["customer_email", "email", "email_address", "user_email"],
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
    (payload?.executed_actions && Object.values(payload.executed_actions)[0]?.model_id);

  if (modelId) {
    const row = await knex("restaurants")
      .where({ synthflow_agent_id: String(modelId) })
      .first();
    if (row) return row;
  }

  const promptVars = payload?.lead?.prompt_variables || {};
  const candidates = [
    // Restaurant DID is often the "from" in Synthflow prompt vars when customer dials in
    promptVars.from_phone_number,
    promptVars.to_phone_number,
    payload?.call?.to,
    payload?.call?.to_number,
    payload?.call?.from,
    payload?.metadata?.to,
    payload?.lead?.to_phone_number,
  ].filter(Boolean);

  for (const toNumber of candidates) {
    const raw = String(toNumber).trim();
    const norm = normalizeE164(raw);
    const phones = [...new Set([raw, norm].filter(Boolean))];
    for (const phone of phones) {
      let row = await knex("restaurants").where({ telnyx_phone_number: phone }).first();
      if (row) return row;
      row = await knex("restaurants").where({ twilio_phone_number: phone }).first();
      if (row) return row;
    }
  }

  return null;
}

/**
 * Synthflow signs call_id with HMAC-SHA256 and sends base64 in HTTP_SYNTHFLOW_SIGNATURE.
 * @see https://docs.synthflow.ai/security
 */
function getSynthflowSignatureHeader(req) {
  const h = req.headers || {};
  const keys = [
    "x-synthflow-signature",
    "synthflow-signature",
    "http-synthflow-signature",
    "http_synthflow_signature",
    "x-webhook-secret",
  ];
  for (const k of keys) {
    const v = req.get?.(k) || h[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  const auth = req.get?.("authorization") || h.authorization;
  if (auth != null && String(auth).trim()) return String(auth).trim();
  return "";
}

function verifyWebhookSecret(req, payload = {}) {
  const secret = String(process.env.SYNTHFLOW_WEBHOOK_SECRET || "").trim();
  if (!secret) return true;

  const header = getSynthflowSignatureHeader(req);
  if (!header) return false;

  // Legacy shared-secret compare (custom setups)
  if (header === secret) return true;
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (token === secret) return true;

  // Official Synthflow: HMAC-SHA256(call_id) → base64
  const callId =
    payload?.call?.call_id ||
    payload?.call_id ||
    payload?.lead?.prompt_variables?.call_id ||
    "";
  if (!callId) return false;

  const expected = crypto.createHmac("sha256", secret).update(String(callId), "utf8").digest("base64");
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(token || header);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Synthflow post-call webhook → persist call + auto-create order when extractors confirm one.
 */
export async function synthflowPostCallWebhook(req, res) {
  res.set("Access-Control-Allow-Origin", "*");
  try {
    if (!verifyWebhookSecret(req, req.body || {})) {
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
    const synthflowCallId = String(payload.call_id || callMeta.call_id || lead.call_id || "").trim() || null;
    const callerPhone =
      normalizeE164(payload.phone_number_from) ||
      normalizeE164(lead.phone_number) ||
      normalizeE164(callMeta.from) ||
      normalizeE164(callMeta.phone) ||
      normalizeE164(payload.caller_phone) ||
      "Unknown";

    const recordingUrl =
      payload.recording_url ||
      payload.recording ||
      callMeta.recording_url ||
      callMeta.recording ||
      payload.audio_url ||
      null;

    const rawTranscript =
      payload.transcript ||
      callMeta.transcript ||
      payload.conversation_history ||
      payload.transcript_object ||
      null;
    const transcript =
      typeof rawTranscript === "object" && rawTranscript !== null
        ? JSON.stringify(rawTranscript)
        : rawTranscript;

    const durationSeconds =
      Number(payload.recording_duration || callMeta.recording_duration || callMeta.duration || payload.duration || 0) || 0;

    const rawNotes =
      payload.analysis?.call_summary ||
      payload.analysis?.summary ||
      payload.analysis?.call_summary_feedback ||
      payload.analysis?.all_feedback ||
      payload.summary ||
      payload.call_summary ||
      null;
    const callNotes =
      typeof rawNotes === "object" && rawNotes !== null
        ? JSON.stringify(rawNotes)
        : rawNotes;

    let callRow = null;
    if (synthflowCallId) {
      callRow = await knex("calls").where({ synthflow_call_id: synthflowCallId }).first();
    }

    const callPatch = {
      phone_number: callerPhone,
      status: mapCallStatus(callMeta.status || payload.status || payload.call_status),
      direction: "inbound",
      duration_seconds: durationSeconds,
      recording_url: recordingUrl,
      transcript: transcript,
      notes: callNotes,
      synthflow_call_id: synthflowCallId,
      restaurant_id: restaurant?.id || null,
      provider: "synthflow",
      ended_at: new Date().toISOString(),
      started_at: callMeta.start_time || payload.start_time || null,
    };

    if (callRow) {
      await knex("calls").where({ id: callRow.id }).update(callPatch);
    } else {
      const [created] = await knex("calls").insert(callPatch).returning("*");
      callRow = created;
    }

    // Save conversation turns into conversations table
    if (callRow?.id && transcript) {
      try {
        const turns = parseTranscriptIntoTurns(transcript);
        if (turns.length > 0) {
          await knex("conversations").where({ call_id: callRow.id }).del();
          await knex("conversations").insert(
            turns.map((t) => ({
              call_id: callRow.id,
              speaker: t.speaker,
              message: t.message,
              timestamp: new Date().toISOString(),
            }))
          );
        }
      } catch (convErr) {
        console.warn("Could not insert conversations for call:", convErr.message);
      }
    }

    // Also link any existing order by same caller phone for this restaurant
    if (callRow?.id && callerPhone !== "Unknown" && restaurant?.id) {
      try {
        const recentOrderByPhone = await knex("orders")
          .where({ restaurant_id: restaurant.id, customer_phone: callerPhone })
          .whereNull("call_id")
          .orderBy("created_at", "desc")
          .first();
        if (recentOrderByPhone) {
          const currentAiData = recentOrderByPhone.ai_extracted_data || {};
          await knex("orders").where({ id: recentOrderByPhone.id }).update({
            call_id: callRow.id,
            ai_extracted_data: {
              ...currentAiData,
              synthflow_call_id: synthflowCallId,
              recording_url: recordingUrl || currentAiData.recording_url,
              transcript: transcript || currentAiData.transcript,
              call_summary: callNotes || currentAiData.call_summary,
              provider: "synthflow",
            },
          });
        }
      } catch (linkErr) {
        console.warn("Could not auto-link recent order by phone:", linkErr.message);
      }
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

    // Idempotency: one order per Synthflow call - update recording & transcript if exists
    if (synthflowCallId) {
      const existing = await knex("orders")
        .whereRaw("ai_extracted_data->>'synthflow_call_id' = ?", [synthflowCallId])
        .first();
      if (existing) {
        const currentAiData = existing.ai_extracted_data || {};
        const updatedAiData = {
          ...currentAiData,
          synthflow_call_id: synthflowCallId,
          recording_url: recordingUrl || currentAiData.recording_url,
          transcript: transcript || currentAiData.transcript,
          call_summary: callNotes || currentAiData.call_summary,
          provider: "synthflow",
        };
        await knex("orders").where({ id: existing.id }).update({
          call_id: callRow?.id || existing.call_id,
          ai_extracted_data: updatedAiData,
        });

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

    function cleanEmail(v) {
      if (emptyish(v)) return null;
      const s = String(v).trim().toLowerCase();
      if (
        s === "none" ||
        s === "null" ||
        s === "n/a" ||
        s === "no" ||
        s === "skip" ||
        s.endsWith("@example.com") ||
        s.endsWith("@test.com")
      ) {
        return null;
      }
      return s.includes("@") && s.includes(".") ? s : null;
    }

    const couponRaw = emptyish(fields.coupon_code) ? null : fields.coupon_code;
    const notesRaw = emptyish(fields.special_notes) ? null : fields.special_notes;
    const phone =
      (!emptyish(fields.customer_phone) && fields.customer_phone) || callerPhone;

    const { order, unmatched, coupon, totals } = await createPhoneOrder(knex, {
      restaurantId: restaurant.id,
      customer_name: fields.customer_name,
      customer_phone: phone,
      customer_email: cleanEmail(fields.customer_email),
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
        recording_url: recordingUrl,
        transcript: transcript,
        call_summary: callNotes,
        fields,
        raw_status: payload.status,
        end_call_reason: callMeta.end_call_reason || payload.end_call_reason,
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
