import { getKnex } from "../db.js";

const EL_API = "https://api.elevenlabs.io";

export async function attachTwilioToAgent(req, res) {
  res.set("Access-Control-Allow-Origin", "*");
  try {
    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
    const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
    const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
    if (!ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY not configured");
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
      throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be configured");
    }

    const knex = getKnex();
    const { restaurant_id } = req.body || {};
    if (!restaurant_id) throw new Error("restaurant_id is required");

    const r = await knex("restaurants").where({ id: restaurant_id }).first();
    if (!r) throw new Error("Restaurant not found");
    if (!r.twilio_phone_number) throw new Error("Restaurant has no Twilio phone number");
    if (!r.elevenlabs_agent_id) throw new Error("Restaurant has no ElevenLabs agent — create one first");

    const importResp = await fetch(`${EL_API}/v1/convai/phone-numbers/create`, {
      method: "POST",
      headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "twilio",
        label: `${r.name} (${r.twilio_phone_number})`,
        phone_number: r.twilio_phone_number,
        sid: TWILIO_ACCOUNT_SID,
        token: TWILIO_AUTH_TOKEN,
      }),
    });
    const importText = await importResp.text();
    let phoneNumberId;
    if (importResp.ok) {
      phoneNumberId = JSON.parse(importText).phone_number_id;
    } else {
      const listResp = await fetch(`${EL_API}/v1/convai/phone-numbers`, {
        headers: { "xi-api-key": ELEVENLABS_API_KEY },
      });
      if (!listResp.ok) throw new Error(`EL import failed [${importResp.status}]: ${importText}`);
      const list = await listResp.json();
      const match = (list.phone_numbers || list || []).find((p) => p.phone_number === r.twilio_phone_number);
      if (!match) throw new Error(`EL import failed [${importResp.status}]: ${importText}`);
      phoneNumberId = match.phone_number_id;
    }
    if (!phoneNumberId) throw new Error("Could not resolve ElevenLabs phone_number_id");

    const assignResp = await fetch(`${EL_API}/v1/convai/phone-numbers/${phoneNumberId}`, {
      method: "PATCH",
      headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ agent_id: r.elevenlabs_agent_id }),
    });
    if (!assignResp.ok) throw new Error(`EL assign failed [${assignResp.status}]: ${await assignResp.text()}`);

    return res.json({ success: true, phone_number_id: phoneNumberId });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, error: e.message || "Unknown error" });
  }
}
