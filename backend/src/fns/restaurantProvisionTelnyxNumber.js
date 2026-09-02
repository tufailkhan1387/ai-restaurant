import { getKnex } from "../db.js";
import { searchAvailableNumbers, purchaseNumber, listOwnedNumbers } from "../lib/telnyxClient.js";
import { importCustomNumber } from "../lib/synthflowClient.js";
import { normalizeE164 } from "../lib/voiceWebhookUtils.js";

export async function restaurantTelnyxSearch(req, res) {
  res.set("Access-Control-Allow-Origin", "*");
  try {
    const body = req.body || {};
    const numbers = await searchAvailableNumbers({
      country_code: body.country_code,
      locality: body.locality,
      national_destination_code: body.area_code || body.national_destination_code,
      limit: body.limit || 10,
    });
    return res.json({ success: true, numbers });
  } catch (e) {
    console.error("Telnyx search error:", e);
    return res.status(500).json({ success: false, error: e.message || "search failed" });
  }
}

export async function restaurantTelnyxList(req, res) {
  res.set("Access-Control-Allow-Origin", "*");
  try {
    const numbers = await listOwnedNumbers(100);
    return res.json({ success: true, numbers });
  } catch (e) {
    console.error("Telnyx list error:", e);
    return res.status(500).json({ success: false, error: e.message || "list failed" });
  }
}

/**
 * Purchase (or assign existing) Telnyx number for a restaurant, import into Synthflow.
 */
export async function restaurantProvisionTelnyxNumber(req, res) {
  res.set("Access-Control-Allow-Origin", "*");
  try {
    const knex = getKnex();
    const body = req.body || {};
    const restaurant_id = body.restaurant_id;
    if (!restaurant_id) throw new Error("restaurant_id is required");

    const r = await knex("restaurants").where({ id: restaurant_id }).first();
    if (!r) throw new Error("Restaurant not found");

    let phone = normalizeE164(body.phone_number || body.telnyx_phone_number || "");
    if (!phone) throw new Error("phone_number is required (E.164)");

    // Ensure uniqueness across restaurants
    const taken = await knex("restaurants")
      .where({ telnyx_phone_number: phone })
      .whereNot({ id: restaurant_id })
      .first();
    if (taken) throw new Error(`Number ${phone} is already assigned to another restaurant`);

    let provisioned = null;
    if (body.skip_purchase) {
      provisioned = {
        phone_number: phone,
        phone_number_id: body.telnyx_phone_number_id || null,
        order_id: null,
        status: "existing",
      };
    } else {
      provisioned = await purchaseNumber(phone);
      phone = normalizeE164(provisioned.phone_number) || phone;
    }

    // Import into Synthflow so inbound SIP routing can bind the agent
    let synthflowImport = null;
    let importWarning = null;
    try {
      synthflowImport = await importCustomNumber({
        phone_number: phone,
        friendly_name: `${r.name} (${phone})`,
      });
    } catch (e) {
      // Number may already be imported — continue and let agent attach handle assignment
      importWarning = e.message || "Synthflow import failed";
      console.warn("Synthflow number import warning:", importWarning);
    }

    await knex("restaurants").where({ id: restaurant_id }).update({
      telnyx_phone_number: phone,
      telnyx_phone_number_id: provisioned.phone_number_id,
      telnyx_order_id: provisioned.order_id,
      voice_provider: "synthflow_telnyx",
      phone: r.phone || phone,
      updated_at: knex.fn.now(),
    });

    return res.json({
      success: true,
      telnyx_phone_number: phone,
      telnyx_phone_number_id: provisioned.phone_number_id,
      telnyx_order_id: provisioned.order_id,
      synthflow_import: synthflowImport,
      warning: importWarning,
    });
  } catch (e) {
    console.error("Provision Telnyx number error:", e);
    return res.status(500).json({ success: false, error: e.message || "provision failed" });
  }
}
