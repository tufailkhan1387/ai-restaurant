// @generated from supabase/functions/twilio-make-call — run: node backend/scripts/generate-handlers.mjs
import { Buffer } from "node:buffer";
const base64Encode = (input: string) => Buffer.from(input).toString("base64");
import { functionsPublicUrl } from "../runtime/functionsPublicUrl.js";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { to, message, voiceId } = await req.json();

    if (!to) {
      return new Response(
        JSON.stringify({ error: "Phone number 'to' is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
    const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
    const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
      console.error("Twilio credentials not configured");
      return new Response(
        JSON.stringify({ error: "Twilio credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build TwiML for the call
    let twiml: string;
    if (message) {
      // Use ElevenLabs TTS via our edge function for high-quality voice
      const supabaseUrl = process.env.SUPABASE_URL;
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${functionsPublicUrl()}/functions/v1/twilio-tts-audio?text=${encodeURIComponent(message)}&amp;voiceId=${voiceId || 'JBFqnCBsd6RMkjVDRZzb'}</Play>
</Response>`;
    } else {
      // Default greeting
      twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Hello, this is a call from the support center. How can we assist you today?</Say>
</Response>`;
    }

    const credentials = base64Encode(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);

    const formData = new URLSearchParams();
    formData.append("To", to);
    formData.append("From", TWILIO_PHONE_NUMBER);
    formData.append("Twiml", twiml);

    console.log(`Making call to ${to} from ${TWILIO_PHONE_NUMBER}`);

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`,
      {
        method: "POST",
        headers: {
          "Authorization": `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Twilio API error:", data);
      return new Response(
        JSON.stringify({ error: data.message || "Failed to make call" }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Call initiated:", data.sid);

    // Log the outbound call so it shows up in Call Logs even for repeated dials.
    // (Twilio status callbacks will update this row later via twilio_call_sid.)
    try {
      const supabaseUrl = process.env.SUPABASE_URL ?? "";
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
      const supabase = createClient(supabaseUrl, supabaseKey);

      const statusMap: Record<string, string> = {
        queued: "queued",
        ringing: "queued",
        "in-progress": "in_progress",
        completed: "completed",
        busy: "missed",
        failed: "missed",
        "no-answer": "missed",
        canceled: "missed",
      };

      const initialStatus = statusMap[String(data.status || "queued")] || "queued";

      const { error: insertError } = await supabase.from("calls").insert({
        phone_number: String(to),
        direction: "outbound",
        status: initialStatus,
        twilio_call_sid: String(data.sid),
        started_at: new Date().toISOString(),
      });

      if (insertError) {
        console.error("Failed to log outbound call:", insertError);
      }
    } catch (logError) {
      console.error("Outbound call logging error:", logError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        callSid: data.sid,
        status: data.status,
        to: data.to,
        from: data.from,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Make call error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}
