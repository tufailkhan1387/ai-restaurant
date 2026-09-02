// @generated from supabase/functions/auto-dialer-sms-fallback — run: node backend/scripts/generate-handlers.mjs
// Sends an SMS fallback to a lead whose call wasn't answered.
// Idempotent: checks sms_status before sending.
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => vars[k] ?? "");
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { leadId } = await req.json();
    if (!leadId) {
      return new Response(JSON.stringify({ error: "leadId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
    const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
    const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
      return new Response(JSON.stringify({ error: "Twilio not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL ?? "",
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    );

    const { data: lead } = await supabase
      .from("auto_dialer_leads")
      .select("*, session:auto_dialer_sessions(sms_fallback_enabled, sms_fallback_template)")
      .eq("id", leadId)
      .maybeSingle();

    if (!lead) {
      return new Response(JSON.stringify({ error: "lead not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const session = (lead as any).session;
    if (!session?.sms_fallback_enabled) {
      return new Response(JSON.stringify({ skipped: "not_enabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (lead.sms_status === "sent") {
      return new Response(JSON.stringify({ skipped: "already_sent" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // DNC check
    const { data: dnc } = await supabase
      .from("dnc_list").select("id").eq("phone_number", lead.phone_number).maybeSingle();
    if (dnc) {
      await supabase.from("auto_dialer_leads")
        .update({ sms_status: "skipped", sms_body: "DNC" }).eq("id", leadId);
      return new Response(JSON.stringify({ skipped: "dnc" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = renderTemplate(session.sms_fallback_template || "", {
      client_name: lead.client_name || "there",
      pitched_for: lead.pitched_for || "our services",
      company: lead.company || "",
    });

    const credentials = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
    const formData = new URLSearchParams();
    formData.append("To", lead.phone_number);
    formData.append("From", TWILIO_PHONE_NUMBER);
    formData.append("Body", body);

    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      { method: "POST", headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" }, body: formData.toString() },
    );

    const data = await resp.json();

    if (!resp.ok) {
      await supabase.from("auto_dialer_leads")
        .update({ sms_status: "failed", sms_body: body }).eq("id", leadId);
      return new Response(JSON.stringify({ error: data?.message || "sms failed" }), {
        status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("auto_dialer_leads").update({
      sms_status: "sent",
      sms_sent_at: new Date().toISOString(),
      sms_message_sid: data.sid,
      sms_body: body,
    }).eq("id", leadId);

    return new Response(JSON.stringify({ success: true, messageSid: data.sid }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("sms-fallback error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
}
