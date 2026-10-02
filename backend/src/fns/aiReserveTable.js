import { getKnex } from "../db.js";
import { resolveSpokenBranchId } from "../lib/branchLocation.js";
import { normalizeElevenLabsToolBody, resolveRestaurantIdForVoiceTools } from "../lib/voiceWebhookUtils.js";
import { findAvailableTable, createReservation, parseReservationDate, parseReservationTime, lastSpokenReservationTime } from "../lib/tableReservationService.js";

export async function aiReserveTable(req, res) {
  res.set("Access-Control-Allow-Origin", "*");
  try {
    console.log("\n" + "=".repeat(50));
    console.log("📅 TABLE RESERVATION REQUEST FROM AI");
    console.log("=".repeat(50));

    const rawBody = { ...(req.query || {}), ...(req.body || {}) };
    const body = normalizeElevenLabsToolBody(rawBody);
    if (!body.elevenlabs_agent_id && process.env.ELEVENLABS_AGENT_ID) {
      body.elevenlabs_agent_id = String(process.env.ELEVENLABS_AGENT_ID).trim();
    }

    const {
      customer_name,
      customer_phone,
      customer_email,
      party_size,
      reservation_date,
      reservation_time, // HH:MM
      slot_duration_hours = 1,
      notes,
    } = body;

    if (!customer_name || !reservation_date || !reservation_time || !party_size) {
      return res.status(200).json({
        success: false,
        message:
          "I need a few more details: your name, date of reservation, preferred time, and number of guests. Could you provide those?",
      });
    }

    const knex = getKnex();
    const resolved = await resolveRestaurantIdForVoiceTools(knex, body);
    const restaurantId = resolved.id;

    if (!restaurantId) {
      return res.status(200).json({ success: false, message: resolved.error || "Could not identify the restaurant." });
    }
    const branchRestaurantId = await resolveSpokenBranchId(
      knex,
      restaurantId,
      body.branch_name || body.branch || body.area || null,
    );

    const pSize = Math.max(1, parseInt(party_size, 10) || 1);
    const duration = Number(slot_duration_hours) || 1;
    const isoDate = parseReservationDate(reservation_date);
    const isoTime =
      parseReservationTime(reservation_time) ||
      parseReservationTime(String(reservation_time).replace(/[^\d:apm.\s]/gi, "")) ||
      lastSpokenReservationTime(String(reservation_time));

    if (!isoTime) {
      return res.status(200).json({
        success: false,
        message: "What time would you like to book? Please say the time once, for example 7 PM.",
      });
    }

    console.log(`👤 Customer: ${customer_name} | Party: ${pSize} | Date: ${isoDate} | Time: ${isoTime} (raw=${reservation_time}) | Duration: ${duration}h`);

    const availableTable = await findAvailableTable(knex, {
      restaurantId: branchRestaurantId,
      partySize: pSize,
      reservationDate: isoDate,
      startTime: isoTime,
      slotDurationHours: duration,
    });

    if (!availableTable) {
      return res.status(200).json({
        success: false,
        available: false,
        message:
          `I'm sorry, no table is free at ${isoTime} on ${isoDate}. ` +
          `Would you like a different time?`,
      });
    }

    let callId = null;
    if (body.call_sid) {
      const c = await knex("calls").where({ twilio_call_sid: body.call_sid }).select("id").first();
      callId = c?.id ?? null;
    }

    const synthflowCallId =
      body.synthflow_call_id ||
      body.call_id ||
      body.conversation_id ||
      body.executed_action_id ||
      null;

    const reservation = await createReservation(knex, {
      restaurantId: branchRestaurantId,
      tableId: availableTable.id,
      customerName: customer_name,
      customerPhone: customer_phone,
      customerEmail: customer_email,
      partySize: pSize,
      reservationDate: isoDate,
      startTime: isoTime,
      slotDurationHours: duration,
      status: "confirmed",
      notes: notes || null,
      source: "phone",
      callId,
      aiExtractedData: {
        raw: body,
        provider: body.synthflow_agent_id ? "synthflow" : "elevenlabs",
        synthflow_call_id: synthflowCallId ? String(synthflowCallId) : null,
        reservation_time_raw: reservation_time,
        reservation_time: isoTime,
        reservation_date: isoDate,
      },
    });

    console.log(`✅ Reservation created: id=${reservation.id} table=${availableTable.table_number}`);

    const confirmMsg =
      `Your table reservation is confirmed! Table ${availableTable.table_number} ` +
      `(seats up to ${availableTable.capacity}) has been reserved for ${pSize} guest(s) ` +
      `on ${isoDate} at ${isoTime}. ` +
      `Your reservation ID is ${reservation.id.slice(0, 8).toUpperCase()}. ` +
      `We look forward to seeing you!`;

    return res.json({
      success: true,
      available: true,
      reservation_id: reservation.id,
      table_number: availableTable.table_number,
      table_capacity: availableTable.capacity,
      reservation_date: isoDate,
      reservation_time: isoTime,
      party_size: pSize,
      slot_duration_hours: duration,
      message: confirmMsg,
    });
  } catch (e) {
    console.error("❌ Reserve Table Error:", e);
    return res.status(500).json({ error: e.message || "Failed to create reservation" });
  }
}
