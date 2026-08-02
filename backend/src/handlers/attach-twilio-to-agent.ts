// @generated from supabase/functions/attach-twilio-to-agent — run: node backend/scripts/generate-handlers.mjs
// Imports a Twilio phone number into ElevenLabs and assigns it to the
// restaurant's dedicated Conversational AI agent so inbound calls are routed
// to the AI automatically.
//
// POST { restaurant_id }

import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EL_API = "https://api.elevenlabs.io";

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
    const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
    const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
    if (!ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY not configured");
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
      throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be configured");
    }

    const supabase = createClient(
      process.env.SUPABASE_URL ?? "",
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    );

    const { restaurant_id } = await req.json();
    if (!restaurant_id) throw new Error("restaurant_id is required");

    const { data: r, error: rErr } = await supabase
      .from("restaurants")
      .select("id, name, twilio_phone_number, elevenlabs_agent_id")
      .eq("id", restaurant_id)
      .maybeSingle();
    if (rErr || !r) throw new Error("Restaurant not found");
    if (!r.twilio_phone_number) throw new Error("Restaurant has no Twilio phone number");
    if (!r.elevenlabs_agent_id) throw new Error("Restaurant has no ElevenLabs agent — create one first");

    // Try to import the number into ElevenLabs (idempotent: if it already
    // exists, EL returns the existing phone_number_id we can re-use).
    const importResp = await fetch(`${EL_API}/v1/convai/phone-numbers/create`, {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        provider: "twilio",
        label: `${r.name} (${r.twilio_phone_number})`,
        phone_number: r.twilio_phone_number,
        sid: TWILIO_ACCOUNT_SID,
        token: TWILIO_AUTH_TOKEN,
      }),
    });
    const importText = await importResp.text();
    let phoneNumberId: string | undefined;
    if (importResp.ok) {
      phoneNumberId = JSON.parse(importText).phone_number_id;
    } else {
      // Already imported — look it up
      const listResp = await fetch(`${EL_API}/v1/convai/phone-numbers`, {
        headers: { "xi-api-key": ELEVENLABS_API_KEY },
      });
      if (!listResp.ok) {
        throw new Error(`EL import failed [${importResp.status}]: ${importText}`);
      }
      const list = await listResp.json();
      const match = (list.phone_numbers || list || []).find(
        (p: any) => p.phone_number === r.twilio_phone_number,
      );
      if (!match) throw new Error(`EL import failed [${importResp.status}]: ${importText}`);
      phoneNumberId = match.phone_number_id;
    }

    if (!phoneNumberId) throw new Error("Could not resolve ElevenLabs phone_number_id");

    // Assign agent to the phone number
    const assignResp = await fetch(`${EL_API}/v1/convai/phone-numbers/${phoneNumberId}`, {
      method: "PATCH",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ agent_id: r.elevenlabs_agent_id }),
    });
    if (!assignResp.ok) {
      throw new Error(`EL assign failed [${assignResp.status}]: ${await assignResp.text()}`);
    }

    return new Response(
      JSON.stringify({ success: true, phone_number_id: phoneNumberId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("attach-twilio-to-agent error:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}