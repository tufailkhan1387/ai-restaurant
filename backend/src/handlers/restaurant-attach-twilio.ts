// @generated from supabase/functions/restaurant-attach-twilio — run: node backend/scripts/generate-handlers.mjs
// Imports the chosen Twilio number into the restaurant's ElevenLabs account
// and assigns it to the restaurant's agent. Uses the restaurant's own
// ElevenLabs API key + Twilio SID/token (stored on the restaurants row).
//
// POST { restaurant_id, twilio_phone_number, agent_id? }

import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EL = "https://api.elevenlabs.io";

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL ?? "",
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    );
    const { restaurant_id, twilio_phone_number, agent_id } = await req.json();
    if (!restaurant_id) throw new Error("restaurant_id is required");

    const { data: r, error } = await supabase
      .from("restaurants")
      .select("id, name, elevenlabs_api_key, twilio_account_sid, twilio_auth_token, elevenlabs_agent_id")
      .eq("id", restaurant_id)
      .maybeSingle();
    if (error || !r) throw new Error("Restaurant not found");
    if (!r.elevenlabs_api_key) throw new Error("ElevenLabs not connected");
    if (!r.twilio_account_sid || !r.twilio_auth_token) throw new Error("Twilio not connected");

    const number = (twilio_phone_number || "").trim();
    if (!number) throw new Error("twilio_phone_number is required");
    const targetAgent = agent_id || r.elevenlabs_agent_id;
    if (!targetAgent) throw new Error("No ElevenLabs agent to bind — create one first");

    // Try to import number into ElevenLabs (idempotent: if already imported,
    // look it up from the existing list).
    let phoneNumberId: string | undefined;
    const importResp = await fetch(`${EL}/v1/convai/phone-numbers/create`, {
      method: "POST",
      headers: { "xi-api-key": r.elevenlabs_api_key, "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "twilio",
        label: `${r.name} (${number})`,
        phone_number: number,
        sid: r.twilio_account_sid,
        token: r.twilio_auth_token,
      }),
    });
    const importText = await importResp.text();
    if (importResp.ok) {
      phoneNumberId = JSON.parse(importText).phone_number_id;
    } else {
      const listResp = await fetch(`${EL}/v1/convai/phone-numbers`, {
        headers: { "xi-api-key": r.elevenlabs_api_key },
      });
      if (!listResp.ok) throw new Error(`EL import [${importResp.status}]: ${importText}`);
      const listJson = await listResp.json();
      const list = listJson.phone_numbers ?? listJson ?? [];
      const match = list.find((p: any) => p.phone_number === number);
      if (!match) throw new Error(`EL import [${importResp.status}]: ${importText}`);
      phoneNumberId = match.phone_number_id;
    }
    if (!phoneNumberId) throw new Error("Could not resolve ElevenLabs phone_number_id");

    // Assign agent
    const assignResp = await fetch(`${EL}/v1/convai/phone-numbers/${phoneNumberId}`, {
      method: "PATCH",
      headers: { "xi-api-key": r.elevenlabs_api_key, "Content-Type": "application/json" },
      body: JSON.stringify({ agent_id: targetAgent }),
    });
    if (!assignResp.ok) throw new Error(`EL assign [${assignResp.status}]: ${await assignResp.text()}`);

    await supabase.from("restaurants").update({
      twilio_phone_number: number,
      elevenlabs_agent_id: targetAgent,
    }).eq("id", r.id);

    return new Response(JSON.stringify({ success: true, phone_number_id: phoneNumberId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("restaurant-attach-twilio:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}