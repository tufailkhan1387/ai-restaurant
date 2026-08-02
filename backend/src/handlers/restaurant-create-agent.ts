// @generated from supabase/functions/restaurant-create-agent — run: node backend/scripts/generate-handlers.mjs
// Creates a new ElevenLabs Conversational AI agent under the restaurant's
// own ElevenLabs account, then stores the agent_id on the restaurant.
//
// POST { restaurant_id, name?, voice_id?, language?, first_message?, system_prompt? }

import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EL = "https://api.elevenlabs.io";

function defaultPrompt(name: string) {
  return `You are the friendly AI phone assistant for ${name}. Help callers place a NEW delivery order or check the status of an EXISTING order using the place_order and get_order_status tools. On every tool call include twilio_to (dialed E.164) and/or elevenlabs_agent_id when the platform provides them. Confirm details, never invent prices, and stay concise.`;
}
function defaultFirstMessage(name: string) {
  return `Hi, thanks for calling ${name}! Would you like to place a new order or check on an existing one?`;
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL ?? "",
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    );
    const body = await req.json();
    const { restaurant_id, voice_id, language, first_message, system_prompt, name } = body ?? {};
    if (!restaurant_id) throw new Error("restaurant_id is required");

    const { data: r, error } = await supabase
      .from("restaurants")
      .select("id, name, elevenlabs_api_key, agent_language, agent_voice_id, agent_first_message, agent_system_prompt")
      .eq("id", restaurant_id)
      .maybeSingle();
    if (error || !r) throw new Error("Restaurant not found");
    if (!r.elevenlabs_api_key) throw new Error("ElevenLabs not connected for this restaurant");

    const lang = language || r.agent_language || "en";
    const sp = (system_prompt ?? r.agent_system_prompt)?.trim() || defaultPrompt(r.name);
    const fm = (first_message ?? r.agent_first_message)?.trim() || defaultFirstMessage(r.name);
    const voice = voice_id ?? r.agent_voice_id ?? null;
    const agentName = name || `${r.name} (Order Taker)`;

    const conversation_config: any = {
      agent: { first_message: fm, language: lang, prompt: { prompt: sp } },
    };
    if (voice) conversation_config.tts = { voice_id: voice };

    const resp = await fetch(`${EL}/v1/convai/agents/create`, {
      method: "POST",
      headers: { "xi-api-key": r.elevenlabs_api_key, "Content-Type": "application/json" },
      body: JSON.stringify({ name: agentName, conversation_config }),
    });
    const text = await resp.text();
    if (!resp.ok) throw new Error(`EL create [${resp.status}]: ${text}`);
    const created = JSON.parse(text);
    const elAgentId = created.agent_id;
    if (!elAgentId) throw new Error("ElevenLabs did not return agent_id");

    await supabase.from("restaurants").update({
      elevenlabs_agent_id: elAgentId,
      agent_language: lang,
      agent_voice_id: voice,
      agent_first_message: fm,
      agent_system_prompt: sp,
    }).eq("id", r.id);

    return new Response(JSON.stringify({ success: true, elevenlabs_agent_id: elAgentId, name: agentName }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("restaurant-create-agent:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}