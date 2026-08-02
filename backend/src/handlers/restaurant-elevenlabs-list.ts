// @generated from supabase/functions/restaurant-elevenlabs-list — run: node backend/scripts/generate-handlers.mjs
// Lists ElevenLabs agents and phone numbers for the calling restaurant,
// using the restaurant's own ELEVENLABS_API_KEY stored on the row.
//
// POST { restaurant_id }

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
    const { restaurant_id } = await req.json();
    if (!restaurant_id) throw new Error("restaurant_id is required");

    const { data: r, error } = await supabase
      .from("restaurants")
      .select("elevenlabs_api_key")
      .eq("id", restaurant_id)
      .maybeSingle();
    if (error || !r) throw new Error("Restaurant not found");
    const key = r.elevenlabs_api_key;
    if (!key) throw new Error("ElevenLabs not connected for this restaurant");

    const [agentsResp, phonesResp] = await Promise.all([
      fetch(`${EL}/v1/convai/agents?page_size=100`, { headers: { "xi-api-key": key } }),
      fetch(`${EL}/v1/convai/phone-numbers`, { headers: { "xi-api-key": key } }),
    ]);
    if (!agentsResp.ok) throw new Error(`EL agents [${agentsResp.status}]: ${await agentsResp.text()}`);

    const agentsJson = await agentsResp.json();
    const phonesJson = phonesResp.ok ? await phonesResp.json() : { phone_numbers: [] };

    const agents = (agentsJson.agents ?? []).map((a: any) => ({
      agent_id: a.agent_id,
      name: a.name,
    }));
    const phone_numbers = (phonesJson.phone_numbers ?? phonesJson ?? []).map((p: any) => ({
      phone_number_id: p.phone_number_id,
      phone_number: p.phone_number,
      label: p.label,
      assigned_agent: p.assigned_agent ?? p.agent_id ?? null,
    }));

    return new Response(JSON.stringify({ success: true, agents, phone_numbers }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("restaurant-elevenlabs-list:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}