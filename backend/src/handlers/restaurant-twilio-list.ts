// @generated from supabase/functions/restaurant-twilio-list — run: node backend/scripts/generate-handlers.mjs
// Lists Twilio incoming phone numbers for the calling restaurant, using the
// restaurant's own TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN stored on the row.
//
// POST { restaurant_id }

import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
      .select("twilio_account_sid, twilio_auth_token")
      .eq("id", restaurant_id)
      .maybeSingle();
    if (error || !r) throw new Error("Restaurant not found");
    if (!r.twilio_account_sid || !r.twilio_auth_token) {
      throw new Error("Twilio not connected for this restaurant");
    }

    const auth = btoa(`${r.twilio_account_sid}:${r.twilio_auth_token}`);
    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${r.twilio_account_sid}/IncomingPhoneNumbers.json?PageSize=100`,
      { headers: { Authorization: `Basic ${auth}` } },
    );
    if (!resp.ok) throw new Error(`Twilio [${resp.status}]: ${await resp.text()}`);
    const json = await resp.json();
    const numbers = (json.incoming_phone_numbers ?? []).map((n: any) => ({
      sid: n.sid,
      phone_number: n.phone_number,
      friendly_name: n.friendly_name,
    }));

    return new Response(JSON.stringify({ success: true, numbers }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("restaurant-twilio-list:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}