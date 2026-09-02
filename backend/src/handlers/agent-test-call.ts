// @generated from supabase/functions/agent-test-call — run: node backend/scripts/generate-handlers.mjs
// Places a one-off outbound test call via ElevenLabs' native Twilio outbound endpoint.
// Same approach as auto-dialer-call to guarantee the agent actually speaks.

import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

let CACHED_PHONE_NUMBER_ID: string | null = null;

async function resolvePhoneNumberId(apiKey: string, twilioPhone: string): Promise<string | null> {
  const fromEnv = process.env.ELEVENLABS_AGENT_PHONE_NUMBER_ID;
  if (fromEnv) return fromEnv;
  if (CACHED_PHONE_NUMBER_ID) return CACHED_PHONE_NUMBER_ID;
  try {
    const r = await fetch("https://api.elevenlabs.io/v1/convai/phone-numbers", {
      headers: { "xi-api-key": apiKey },
    });
    if (!r.ok) return null;
    const d = await r.json();
    const numbers = Array.isArray(d) ? d : (d.phone_numbers ?? []);
    const norm = (p: string) => p.replace(/[^\d+]/g, "");
    const target = norm(twilioPhone);
    const match = numbers.find((p: any) => norm(p.phone_number || "") === target);
    const id = match?.phone_number_id ?? numbers[0]?.phone_number_id ?? null;
    if (id) CACHED_PHONE_NUMBER_ID = id;
    return id;
  } catch { return null; }
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { agentId, to, firstMessage } = await req.json();
    if (!agentId || !to) {
      return new Response(JSON.stringify({ error: "agentId and to are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
    const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
    if (!ELEVENLABS_API_KEY || !TWILIO_PHONE_NUMBER) {
      return new Response(JSON.stringify({ error: "ElevenLabs/Twilio not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL ?? "",
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    );

    // Resolve agent (id can be local uuid or elevenlabs_agent_id)
    let elevenlabsAgentId: string | null = null;
    let agentDbId: string | null = null;
    const { data: byId } = await supabase
      .from("ai_agents")
      .select("id, elevenlabs_agent_id")
      .eq("id", agentId)
      .maybeSingle();
    if (byId) { elevenlabsAgentId = byId.elevenlabs_agent_id; agentDbId = byId.id; }
    else {
      const { data: byEl } = await supabase
        .from("ai_agents")
        .select("id, elevenlabs_agent_id")
        .eq("elevenlabs_agent_id", agentId)
        .maybeSingle();
      if (byEl) { elevenlabsAgentId = byEl.elevenlabs_agent_id; agentDbId = byEl.id; }
    }

    if (!elevenlabsAgentId || elevenlabsAgentId === "__USE_ENV__") {
      return new Response(JSON.stringify({ error: "Agent not found or invalid" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const phoneNumberId = await resolvePhoneNumberId(ELEVENLABS_API_KEY, TWILIO_PHONE_NUMBER);
    if (!phoneNumberId) {
      return new Response(JSON.stringify({
        error: "No phone number imported into ElevenLabs. Go to ElevenLabs → Telephony → Phone Numbers → Import from Twilio.",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: callRow } = await supabase.from("calls").insert({
      phone_number: to,
      direction: "outbound",
      status: "queued",
      started_at: new Date().toISOString(),
      notes: `Agent test call (agent ${elevenlabsAgentId})`,
      metadata: { source: "agent_test_call", agent_db_id: agentDbId, elevenlabs_agent_id: elevenlabsAgentId },
    }).select().single();

    console.log(`agent-test-call (native): dialing ${to} via agent ${elevenlabsAgentId} phone_id ${phoneNumberId}`);

    const elResp = await fetch("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", {
      method: "POST",
      headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_id: elevenlabsAgentId,
        agent_phone_number_id: phoneNumberId,
        to_number: to,
        ...(firstMessage ? {
          conversation_initiation_client_data: {
            conversation_config_override: { agent: { first_message: firstMessage } },
          },
        } : {}),
      }),
    });

    const elData = await elResp.json().catch(() => ({}));

    if (!elResp.ok) {
      console.error("ElevenLabs outbound-call error:", elResp.status, elData);
      const reason = elData?.detail?.message || elData?.message || elData?.detail || `ElevenLabs error ${elResp.status}`;
      if (callRow) {
        await supabase.from("calls").update({
          status: "missed",
          ended_at: new Date().toISOString(),
          notes: typeof reason === "string" ? reason : JSON.stringify(reason),
        }).eq("id", callRow.id);
      }
      return new Response(JSON.stringify({ error: reason }), {
        status: elResp.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callSid = elData?.callSid || elData?.call_sid || null;
    const conversationId = elData?.conversation_id || null;

    if (callRow) {
      await supabase.from("calls").update({
        twilio_call_sid: callSid,
        elevenlabs_conversation_id: conversationId,
        status: "in_progress",
        agent_id: agentDbId,
      }).eq("id", callRow.id);
    }

    return new Response(JSON.stringify({
      success: true, callSid, conversationId, callId: callRow?.id ?? null, elevenlabsAgentId,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("agent-test-call error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
}
