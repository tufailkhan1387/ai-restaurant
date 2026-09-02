// @generated from supabase/functions/twilio-inbound-webhook — run: node backend/scripts/generate-handlers.mjs
// Inbound webhook: when Twilio routes an inbound call here, we look up whether
// the caller is a known auto-dialer/converted lead and pass enriched context
// to the ElevenLabs agent via dynamic variables so the AI knows who's calling
// and what we last spoke to them about.

import { createClient } from "@supabase/supabase-js";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ "<":"&lt;", ">":"&gt;", "&":"&amp;", "'":"&apos;", '"':"&quot;" })[c]!);
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const formData = await req.formData();
    const callSid = (formData.get("CallSid") as string) || "";
    const from = (formData.get("From") as string) || "";
    const to = (formData.get("To") as string) || "";

    console.log(`Inbound: ${callSid} from ${from} to ${to}`);

    const supabase = createClient(
      process.env.SUPABASE_URL ?? "",
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    );

    // Resolve restaurant by the dialed Twilio number
    const { data: restaurant } = await supabase
      .from("restaurants")
      .select("id, name, elevenlabs_agent_id")
      .eq("twilio_phone_number", to)
      .maybeSingle();

    const ELEVENLABS_AGENT_ID =
      restaurant?.elevenlabs_agent_id || process.env.ELEVENLABS_AGENT_ID;
    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
    if (!ELEVENLABS_AGENT_ID || !ELEVENLABS_API_KEY) {
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">Our AI assistant is unavailable.</Say><Hangup/></Response>`,
        { headers: { ...corsHeaders, "Content-Type": "application/xml" } },
      );
    }

    // Log the call
    await supabase.from("calls").insert({
      phone_number: from,
      direction: "inbound",
      status: "in_progress",
      twilio_call_sid: callSid,
      started_at: new Date().toISOString(),
    });

    // === RETURNING-CALLER LOOKUP ===
    // 1. Check converted leads
    const { data: existingLead } = await supabase
      .from("leads")
      .select("full_name, company, status, notes, source")
      .eq("phone_number", from)
      .maybeSingle();

    // 2. Check most recent auto-dialer attempt
    const { data: lastAd } = await supabase
      .from("auto_dialer_leads")
      .select("client_name, company, pitched_for, ai_summary, interest_level, called_at")
      .eq("phone_number", from)
      .order("called_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    const isReturning = !!(existingLead || lastAd);
    const dynVars: Record<string, string> = {
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

    // Build a personalised first-message override when we have context
    let firstMessageOverride = "";
    if (isReturning) {
      const name = dynVars.caller_name || "there";
      const ctx = dynVars.previously_pitched_for
        ? ` calling back about ${dynVars.previously_pitched_for}`
        : "";
      firstMessageOverride = `Hi ${name}, thanks for calling QubeTech back${ctx}. How can I help you?`;
    }

    // Get signed URL for ElevenLabs
    const signedUrlResponse = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${ELEVENLABS_AGENT_ID}`,
      { headers: { "xi-api-key": ELEVENLABS_API_KEY } },
    );
    if (!signedUrlResponse.ok) {
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">Technical difficulties. Please call back later.</Say><Hangup/></Response>`,
        { headers: { ...corsHeaders, "Content-Type": "application/xml" } },
      );
    }
    const { signed_url } = await signedUrlResponse.json();

    // Encode dynamic vars as Stream <Parameter> entries — ElevenLabs reads these
    const paramEntries = Object.entries(dynVars).map(([k, v]) =>
      `<Parameter name="${escapeXml(k)}" value="${escapeXml(v || "")}"/>`).join("");
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

    console.log(`Returning TwiML, returning_caller=${isReturning}`);
    return new Response(twiml, {
      headers: { ...corsHeaders, "Content-Type": "application/xml" },
    });
  } catch (error) {
    console.error("Inbound webhook error:", error);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">An error occurred. Please try again.</Say><Hangup/></Response>`,
      { headers: { ...corsHeaders, "Content-Type": "application/xml" } },
    );
  }
}
