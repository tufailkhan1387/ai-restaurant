import { getKnex } from "../db.js";

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c],
  );
}

export async function twilioInboundWebhook(req, res) {
  const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/xml" };
  try {
    const callSid = req.body?.CallSid || "";
    const from = req.body?.From || "";
    const to = req.body?.To || "";
    console.log(`Inbound: ${callSid} from ${from} to ${to}`);

    const knex = getKnex();
    const restaurant = await knex("restaurants").where({ twilio_phone_number: to }).select("id", "name", "elevenlabs_agent_id").first();

    const agentId = restaurant?.elevenlabs_agent_id || process.env.ELEVENLABS_AGENT_ID;
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!agentId || !apiKey) {
      return res
        .status(200)
        .set(cors)
        .send(
          `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">Our AI assistant is unavailable.</Say><Hangup/></Response>`,
        );
    }

    await knex("calls").insert({
      phone_number: from,
      direction: "inbound",
      status: "in_progress",
      twilio_call_sid: callSid,
      started_at: new Date().toISOString(),
    });

    const existingLead = await knex("leads").where({ phone_number: from }).select("full_name", "company", "status", "notes", "source").first();

    const lastAd = await knex("auto_dialer_leads")
      .where({ phone_number: from })
      .select("client_name", "company", "pitched_for", "ai_summary", "interest_level", "called_at")
      .orderBy("called_at", "desc")
      .first();

    const isReturning = !!(existingLead || lastAd);
    const dynVars = {
      caller_phone: from,
      restaurant_id: restaurant?.id ?? "",
      restaurant_name: restaurant?.name ?? "",
      twilio_to: to,
      is_returning_caller: isReturning ? "true" : "false",
      caller_name: existingLead?.full_name || lastAd?.client_name || "",
      caller_company: existingLead?.company || lastAd?.company || "",
      previously_pitched_for: lastAd?.pitched_for || "",
      last_call_summary: lastAd?.ai_summary || existingLead?.notes || "",
      last_interest_level: lastAd?.interest_level || "",
      lead_status: existingLead?.status || "",
    };

    let firstMessageOverride = "";
    if (isReturning) {
      const name = dynVars.caller_name || "there";
      const ctx = dynVars.previously_pitched_for ? ` calling back about ${dynVars.previously_pitched_for}` : "";
      firstMessageOverride = `Hi ${name}, thanks for calling QubeTech back${ctx}. How can I help you?`;
    }

    const signedUrlResponse = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`,
      { headers: { "xi-api-key": apiKey } },
    );
    if (!signedUrlResponse.ok) {
      return res
        .status(200)
        .set(cors)
        .send(
          `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">Technical difficulties. Please call back later.</Say><Hangup/></Response>`,
        );
    }
    const { signed_url } = await signedUrlResponse.json();

    const paramEntries = Object.entries(dynVars)
      .map(([k, v]) => `<Parameter name="${escapeXml(k)}" value="${escapeXml(v || "")}"/>`)
      .join("");
    const firstMsgParam = firstMessageOverride
      ? `<Parameter name="first_message_override" value="${escapeXml(firstMessageOverride)}"/>`
      : "";

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${signed_url}">
      <Parameter name="callSid" value="${escapeXml(callSid)}"/>
      <Parameter name="from" value="${escapeXml(from)}"/>
      ${paramEntries}
      ${firstMsgParam}
    </Stream>
  </Connect>
</Response>`;

    return res.status(200).set(cors).send(twiml);
  } catch (e) {
    console.error("Inbound webhook error:", e);
    return res
      .status(200)
      .set(cors)
      .send(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">An error occurred. Please try again.</Say><Hangup/></Response>`,
      );
  }
}
