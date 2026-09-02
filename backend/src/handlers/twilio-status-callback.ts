// @generated from supabase/functions/twilio-status-callback — run: node backend/scripts/generate-handlers.mjs
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
    // Parse form data from Twilio
    const formData = await req.formData();
    const callSid = (formData.get("CallSid") as string) || "";
    const callStatus = (formData.get("CallStatus") as string) || "";
    const callDuration = (formData.get("CallDuration") as string) || "";
    const recordingUrl = (formData.get("RecordingUrl") as string | null) || null;
    const from = (formData.get("From") as string | null) || null;
    const to = (formData.get("To") as string | null) || null;

    if (!callSid) {
      console.error("Status callback missing CallSid");
      return new Response("", {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "text/plain" },
      });
    }

    console.log(`Status callback: ${callSid} -> ${callStatus}, duration: ${callDuration}`);

    const supabaseUrl = process.env.SUPABASE_URL ?? "";
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER ?? null;

    // Map Twilio status to our status enum
    const statusMap: Record<string, string> = {
      "queued": "queued",
      "ringing": "queued",
      "in-progress": "in_progress",
      "completed": "completed",
      "busy": "missed",
      "failed": "missed",
      "no-answer": "missed",
      "canceled": "missed",
    };

    const mappedStatus = statusMap[callStatus] || "completed";
    const durationSeconds = callDuration ? parseInt(callDuration, 10) : 0;

    // Update the call record
    const updateData: Record<string, unknown> = {
      status: mappedStatus,
      duration_seconds: durationSeconds,
    };

    if (mappedStatus === "completed" || mappedStatus === "missed") {
      updateData.ended_at = new Date().toISOString();
    }

    if (recordingUrl) {
      updateData.recording_url = recordingUrl;
    }

    // Ensure the call exists (outbound calls were previously not always logged).
    const { data: existing } = await supabase
      .from("calls")
      .select("id")
      .eq("twilio_call_sid", callSid)
      .maybeSingle();

    const direction = TWILIO_PHONE_NUMBER && from === TWILIO_PHONE_NUMBER ? "outbound" : "inbound";
    const phoneNumber = direction === "outbound" ? (to || "Unknown") : (from || "Unknown");

    if (!existing?.id) {
      const { error: insertError } = await supabase.from("calls").insert({
        phone_number: phoneNumber,
        direction,
        status: mappedStatus,
        duration_seconds: durationSeconds,
        twilio_call_sid: callSid,
        started_at: new Date().toISOString(),
        ...(updateData.ended_at ? { ended_at: updateData.ended_at } : {}),
        ...(recordingUrl ? { recording_url: recordingUrl } : {}),
      });

      if (insertError) {
        console.error("Error inserting call from status callback:", insertError);
      }
    } else {
      const { data, error } = await supabase
        .from("calls")
        .update(updateData)
        .eq("twilio_call_sid", callSid)
        .select()
        .maybeSingle();

      if (error) {
        console.error("Error updating call:", error);
      } else {
        console.log("Call updated:", data?.id, "->", mappedStatus);
      }
    }

    // Find related auto-dialer lead (if any) — used for SMS fallback AND event log
    const { data: adLead } = await supabase
      .from("auto_dialer_leads")
      .select("id, session_id, client_name, phone_number, session:auto_dialer_sessions(agent_id)")
      .eq("twilio_call_sid", callSid)
      .maybeSingle();

    // Emit call_ended event when terminal status received
    if (adLead?.id && ["completed", "busy", "failed", "no-answer", "canceled"].includes(callStatus)) {
      await supabase.from("auto_dialer_events").insert({
        session_id: (adLead as any).session_id,
        lead_id: adLead.id,
        agent_id: (adLead as any).session?.agent_id ?? null,
        event_type: "call_ended",
        message: `Call to ${(adLead as any).client_name || (adLead as any).phone_number} ended (${callStatus})`,
        metadata: {
          twilio_status: callStatus,
          mapped_status: mappedStatus,
          duration_seconds: durationSeconds,
          twilio_call_sid: callSid,
          recording_url: recordingUrl,
        },
      });
    }

    // SMS fallback trigger
    if (["busy", "failed", "no-answer", "canceled"].includes(callStatus) && adLead?.id) {
      fetch(`${functionsPublicUrl()}/functions/v1/auto-dialer-sms-fallback`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}` },
        body: JSON.stringify({ leadId: adLead.id }),
      }).catch((e) => console.error("sms-fallback invoke:", e));
    }

    // Return TwiML-compatible empty response
    return new Response("", {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });

  } catch (error) {
    console.error("Status callback error:", error);
    return new Response("", {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
  }
}
