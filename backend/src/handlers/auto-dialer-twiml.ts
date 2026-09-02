// @generated from supabase/functions/auto-dialer-twiml — run: node backend/scripts/generate-handlers.mjs
// TwiML webhook called by Twilio when an auto-dialer call connects.
// Returns TwiML that bridges the call to ElevenLabs Conversational AI via <Connect><Stream>.
// The lead's personalised pitch context is forwarded as <Parameter> overrides so the AI agent
// uses dynamic_variables on the ElevenLabs side.

import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fallbackTwiml(message: string) {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${escapeXml(message)}</Say>
  <Hangup/>
</Response>`;
  return new Response(twiml, {
    headers: { ...corsHeaders, "Content-Type": "application/xml" },
  });
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const leadId = url.searchParams.get("leadId");
    const callSid =
      url.searchParams.get("CallSid") ||
      (req.method === "POST"
        ? (await req.clone().formData().catch(() => null))?.get("CallSid")?.toString()
        : null);

    if (!leadId) {
      console.error("auto-dialer-twiml: missing leadId");
      return fallbackTwiml("We're sorry, this call could not be connected. Goodbye.");
    }

    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
    const FALLBACK_AGENT_ID = process.env.ELEVENLABS_AGENT_ID;

    if (!ELEVENLABS_API_KEY) {
      console.error("auto-dialer-twiml: ELEVENLABS_API_KEY missing");
      return fallbackTwiml("Our AI assistant is currently unavailable. Please try again later.");
    }

    const supabase = createClient(
      process.env.SUPABASE_URL ?? "",
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    );

    const { data: lead, error: leadErr } = await supabase
      .from("auto_dialer_leads")
      .select("*, session:auto_dialer_sessions(agent_id, name), variant:auto_dialer_prompt_variants(label, system_prompt_override, first_message_override)")
      .eq("id", leadId)
      .maybeSingle();

    if (leadErr || !lead) {
      console.error("auto-dialer-twiml: lead lookup failed", leadErr);
      return fallbackTwiml("We're sorry, this call could not be connected.");
    }

    // Pick agent: session's chosen agent → default agent → env fallback
    let agentId: string | null = null;
    const sessionAgentId = (lead as any).session?.agent_id as string | null | undefined;

    if (sessionAgentId) {
      const { data: agent } = await supabase
        .from("ai_agents")
        .select("elevenlabs_agent_id")
        .eq("id", sessionAgentId)
        .maybeSingle();
      if (agent?.elevenlabs_agent_id && agent.elevenlabs_agent_id !== "__USE_ENV__") {
        agentId = agent.elevenlabs_agent_id;
      }
    }

    if (!agentId) {
      const { data: defaultAgent } = await supabase
        .from("ai_agents")
        .select("elevenlabs_agent_id")
        .eq("is_default", true)
        .maybeSingle();
      if (defaultAgent?.elevenlabs_agent_id && defaultAgent.elevenlabs_agent_id !== "__USE_ENV__") {
        agentId = defaultAgent.elevenlabs_agent_id;
      }
    }

    if (!agentId) agentId = FALLBACK_AGENT_ID ?? null;

    if (!agentId) {
      console.error("auto-dialer-twiml: no ElevenLabs agent_id available");
      return fallbackTwiml("Our AI agent is not configured. Please contact support.");
    }

    // Persist twilio call sid linkage if present
    if (callSid) {
      await supabase
        .from("auto_dialer_leads")
        .update({ twilio_call_sid: callSid })
        .eq("id", leadId);

      await supabase
        .from("calls")
        .update({ twilio_call_sid: callSid })
        .eq("id", lead.call_id ?? "00000000-0000-0000-0000-000000000000");
    }

    // Get signed URL for ElevenLabs WebSocket
    const signedResp = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`,
      { headers: { "xi-api-key": ELEVENLABS_API_KEY } },
    );

    if (!signedResp.ok) {
      const err = await signedResp.text();
      console.error("auto-dialer-twiml: ElevenLabs signed URL error", err);
      return fallbackTwiml("Our AI assistant is temporarily unavailable. Please try again later.");
    }

    const { signed_url } = await signedResp.json();

    // Build the personalised first message — variant override wins if present
    const variant = (lead as any).variant;
    const defaultFirst = lead.client_name
      ? `Hi ${lead.client_name}, this is QubeTech calling. I'm following up on the email we sent you regarding ${lead.pitched_for || "our services"}. Do you have a quick moment?`
      : `Hi, this is QubeTech calling. I'm following up on the email we sent regarding ${lead.pitched_for || "our services"}. Do you have a moment to chat?`;

    const firstMessage = (variant?.first_message_override as string | undefined) || defaultFirst;
    const pitchScript = (variant?.system_prompt_override as string | undefined)
      || (lead.ai_pitch_script as string | null) || "";
    const talkingPoints = lead.ai_talking_points
      ? JSON.stringify(lead.ai_talking_points)
      : "";

    // Pass dynamic variables so the agent can reference them
    // ElevenLabs reads <Parameter> children of <Stream> as `customParameters`
    const params = [
      { name: "leadId", value: leadId },
      { name: "callSid", value: callSid || "" },
      { name: "client_name", value: lead.client_name || "" },
      { name: "company", value: lead.company || "" },
      { name: "email", value: lead.email || "" },
      { name: "pitched_for", value: lead.pitched_for || "" },
      { name: "services_done", value: lead.services_done || "" },
      { name: "additional_notes", value: lead.additional_notes || "" },
      { name: "first_message", value: firstMessage },
      { name: "pitch_script", value: pitchScript },
      { name: "talking_points", value: talkingPoints },
      { name: "variant_label", value: (variant?.label as string | undefined) || "" },
      { name: "source", value: "auto_dialer" },
    ]
      .map(
        (p) =>
          `    <Parameter name="${escapeXml(p.name)}" value="${escapeXml(p.value)}"/>`,
      )
      .join("\n");

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${escapeXml(signed_url)}">
${params}
    </Stream>
  </Connect>
</Response>`;

    console.log(`auto-dialer-twiml: bridging lead ${leadId} to ElevenLabs agent ${agentId}`);

    return new Response(twiml, {
      headers: { ...corsHeaders, "Content-Type": "application/xml" },
    });
  } catch (error) {
    console.error("auto-dialer-twiml error:", error);
    return fallbackTwiml("We're sorry, an error occurred. Please try again later.");
  }
}
