// @generated from supabase/functions/auto-dialer-call — run: node backend/scripts/generate-handlers.mjs
// Initiates a single outbound auto-dialer call via ElevenLabs' native Twilio outbound endpoint.
// This eliminates the broken TwiML <Stream> bridge that caused silent calls.
//
// Flow:
//   1. Validate DNC, look up agent's elevenlabs_agent_id
//   2. Resolve agent_phone_number_id (from cached secret OR by listing /v1/convai/phone-numbers)
//   3. Create local `calls` row + emit call_started event
//   4. POST /v1/convai/twilio/outbound-call with dynamic_variables for personalization
//   5. ElevenLabs spawns the Twilio call AND bridges audio automatically — agent will speak.

import { createClient } from "@supabase/supabase-js";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Cache the phone number id for the duration of the function instance
let CACHED_PHONE_NUMBER_ID: string | null = null;

async function resolveAgentPhoneNumberId(
  apiKey: string,
  twilioPhone: string,
): Promise<string | null> {
  // 1. Check explicit secret first
  const fromEnv = process.env.ELEVENLABS_AGENT_PHONE_NUMBER_ID;
  if (fromEnv) return fromEnv;

  // 2. In-memory cache
  if (CACHED_PHONE_NUMBER_ID) return CACHED_PHONE_NUMBER_ID;

  // 3. List phone numbers from ElevenLabs and match by phone
  try {
    const resp = await fetch("https://api.elevenlabs.io/v1/convai/phone-numbers", {
      headers: { "xi-api-key": apiKey },
    });
    if (!resp.ok) {
      console.error("Failed to list ElevenLabs phone numbers:", resp.status, await resp.text());
      return null;
    }
    const data = await resp.json();
    const numbers = Array.isArray(data) ? data : (data.phone_numbers ?? []);
    const normalize = (p: string) => p.replace(/[^\d+]/g, "");
    const target = normalize(twilioPhone);
    const match = numbers.find((p: any) => normalize(p.phone_number || "") === target);
    const id = match?.phone_number_id ?? numbers[0]?.phone_number_id ?? null;
    if (id) {
      CACHED_PHONE_NUMBER_ID = id;
      console.log(`Resolved agent_phone_number_id=${id} for ${twilioPhone}`);
    }
    return id;
  } catch (e) {
    console.error("Error resolving phone_number_id:", e);
    return null;
  }
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { leadId } = await req.json();
    if (!leadId) {
      return new Response(JSON.stringify({ error: "leadId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = process.env.SUPABASE_URL ?? "";
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
    const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
    const FALLBACK_AGENT_ID = process.env.ELEVENLABS_AGENT_ID;

    if (!ELEVENLABS_API_KEY) {
      return new Response(JSON.stringify({ error: "ELEVENLABS_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!TWILIO_PHONE_NUMBER) {
      return new Response(JSON.stringify({ error: "TWILIO_PHONE_NUMBER not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: lead, error: leadError } = await supabase
      .from("auto_dialer_leads")
      .select("*, session:auto_dialer_sessions(agent_id), variant:auto_dialer_prompt_variants(label, system_prompt_override, first_message_override)")
      .eq("id", leadId)
      .single();

    if (leadError || !lead) {
      return new Response(JSON.stringify({ error: "Lead not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const sessionAgentId = (lead as any).session?.agent_id ?? null;
    const variant = (lead as any).variant;

    const { data: duplicateLiveLead } = await supabase
      .from("auto_dialer_leads")
      .select("id, session_id, call_status")
      .eq("phone_number", lead.phone_number)
      .neq("id", leadId)
      .eq("call_status", "calling")
      .order("called_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (duplicateLiveLead) {
      return new Response(JSON.stringify({ skipped: true, reason: "duplicate_phone_active" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // DNC check
    const { data: dnc } = await supabase
      .from("dnc_list")
      .select("id")
      .eq("phone_number", lead.phone_number)
      .maybeSingle();

    if (dnc) {
      await supabase
        .from("auto_dialer_leads")
        .update({ call_status: "skipped", ai_summary: "Phone number on Do Not Call list" })
        .eq("id", leadId);
      return new Response(JSON.stringify({ skipped: true, reason: "dnc" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Self-dial guard — calling our own Twilio number from itself causes the
    // outbound leg to be torn down within seconds (you'll see "Call failed (3s)").
    const normalize = (p: string) => (p || "").replace(/[^\d+]/g, "");
    if (normalize(lead.phone_number) === normalize(TWILIO_PHONE_NUMBER)) {
      const reason =
        "Self-dial blocked: this lead's phone number is the same as your Twilio caller ID. Use a different test number.";
      await supabase
        .from("auto_dialer_leads")
        .update({ call_status: "skipped", ai_summary: reason })
        .eq("id", leadId);
      await supabase.from("auto_dialer_events").insert({
        session_id: lead.session_id,
        lead_id: leadId,
        agent_id: sessionAgentId,
        event_type: "self_dial_blocked",
        message: reason,
        metadata: { phone: lead.phone_number, twilio_number: TWILIO_PHONE_NUMBER },
      });
      return new Response(JSON.stringify({ skipped: true, reason: "self_dial" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve which ElevenLabs agent to use
    let elevenlabsAgentId: string | null = null;
    if (sessionAgentId) {
      const { data: agent } = await supabase
        .from("ai_agents")
        .select("elevenlabs_agent_id")
        .eq("id", sessionAgentId)
        .maybeSingle();
      if (agent?.elevenlabs_agent_id && agent.elevenlabs_agent_id !== "__USE_ENV__") {
        elevenlabsAgentId = agent.elevenlabs_agent_id;
      }
    }
    if (!elevenlabsAgentId) {
      const { data: defaultAgent } = await supabase
        .from("ai_agents")
        .select("elevenlabs_agent_id")
        .eq("is_default", true)
        .maybeSingle();
      if (defaultAgent?.elevenlabs_agent_id && defaultAgent.elevenlabs_agent_id !== "__USE_ENV__") {
        elevenlabsAgentId = defaultAgent.elevenlabs_agent_id;
      }
    }
    if (!elevenlabsAgentId) elevenlabsAgentId = FALLBACK_AGENT_ID ?? null;

    if (!elevenlabsAgentId) {
      const reason = "No ElevenLabs agent configured. Sync agents on /agents and set a default.";
      await supabase.from("auto_dialer_leads").update({ call_status: "failed", ai_summary: reason }).eq("id", leadId);
      return new Response(JSON.stringify({ error: reason }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve agent_phone_number_id (required by ElevenLabs outbound endpoint)
    const agentPhoneNumberId = await resolveAgentPhoneNumberId(ELEVENLABS_API_KEY, TWILIO_PHONE_NUMBER);
    if (!agentPhoneNumberId) {
      const reason =
        "No phone number imported into ElevenLabs. Go to ElevenLabs → Telephony → Phone Numbers → Import from Twilio, or set ELEVENLABS_AGENT_PHONE_NUMBER_ID secret.";
      await supabase.from("auto_dialer_leads").update({ call_status: "failed", ai_summary: reason }).eq("id", leadId);
      return new Response(JSON.stringify({ error: reason }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark calling BEFORE invoking
    await supabase
      .from("auto_dialer_leads")
      .update({ call_status: "calling", called_at: new Date().toISOString() })
      .eq("id", leadId);

    // Pre-create the call row
    const { data: callRow, error: callErr } = await supabase
      .from("calls")
      .insert({
        phone_number: lead.phone_number,
        direction: "outbound",
        status: "queued",
        started_at: new Date().toISOString(),
        notes: `Auto-dialer call to ${lead.client_name || "Unknown"} - ${lead.pitched_for || "Follow-up"}`,
        metadata: {
          source: "auto_dialer",
          auto_dialer_lead_id: leadId,
          session_id: lead.session_id,
          elevenlabs_agent_id: elevenlabsAgentId,
        },
      })
      .select()
      .single();

    if (callErr) console.error("Failed to pre-create call row:", callErr);

    if (callRow) {
      await supabase.from("auto_dialer_leads").update({ call_id: callRow.id }).eq("id", leadId);
    }

    // Build personalised first message + dynamic variables
    const talkingPointsData = lead.ai_talking_points && typeof lead.ai_talking_points === "object"
      ? lead.ai_talking_points as Record<string, unknown>
      : null;
    const openingHook = typeof talkingPointsData?.opening_hook === "string"
      ? talkingPointsData.opening_hook.trim()
      : "";
    const defaultFirst = lead.client_name
      ? `Hi ${lead.client_name}, this is QubeTech calling. I'm following up on the email we sent you regarding ${lead.pitched_for || "our services"}. Do you have a quick moment?`
      : `Hi, this is QubeTech calling. I'm following up regarding ${lead.pitched_for || "our services"}. Do you have a moment?`;

    const firstMessage = ((variant?.first_message_override as string | undefined)?.trim())
      || openingHook
      || defaultFirst;
    const basePitchScript = (variant?.system_prompt_override as string | undefined)
      || (lead.ai_pitch_script as string | null) || "";
    // Extension support: declared early so call-handling rules below can reference it.
    const extension = (lead as any).extension ? String((lead as any).extension).replace(/[^\d#*]/g, "") : "";
    const callHandlingRules = [
      // Voicemail
      "VOICEMAIL: If you hear ANY voicemail/answering-machine greeting (e.g. 'leave a message', 'after the tone', 'you have reached', 'mailbox', 'currently unavailable'), say nothing and end the call immediately. Do NOT leave a message.",
      // IVR / extension routing
      `IVR / EXTENSION: If you reach an automated menu, receptionist, or are asked for an extension, ${extension ? `dial extension ${extension} by speaking the digits clearly one by one (e.g. "one zero two") and also say 'extension ${extension}' so DTMF and speech routing both work.` : "ask politely to be transferred to the person you're trying to reach by name, or say 'sales department' if no name is known."}`,
      "IVR PROMPTS: If asked 'press 1 for X, press 2 for Y...', respond verbally with the matching number AND say the option name (e.g. 'one, sales').",
      // Human pickup
      "HUMAN: If a real person answers, continue the conversation normally with the first_message and pitch_script.",
      // Hard caps
      "MAX DURATION: Keep the entire call under 2 minutes if you have not reached your intended contact. End politely if you're stuck on hold over 30 seconds with no progress.",
    ].join("\n");
    const outboundModeInstruction = [
      "This is an OUTBOUND campaign call initiated by QubeTech.",
      "Do not say 'thanks for calling QubeTech' or act like the lead called us.",
      "Open using the provided first_message and then continue with the provided campaign context.",
    ].join(" ");
    const pitchScript = [outboundModeInstruction, basePitchScript, callHandlingRules].filter(Boolean).join("\n\n");
    const talkingPoints = lead.ai_talking_points
      ? JSON.stringify(lead.ai_talking_points)
      : "";

    // Extension support: ElevenLabs/Twilio dial DTMF tones if we append `wWWW123` to the
    // number (each `w` = 0.5s wait). `extension` was declared above.
    const toNumber = extension
      ? `${lead.phone_number},${"w".repeat(6)}${extension}`  // 3-second pause then DTMF dial
      : lead.phone_number;

    const dynamicVariables: Record<string, string> = {
      client_name: lead.client_name || "",
      company: lead.company || "",
      email: lead.email || "",
      pitched_for: lead.pitched_for || "",
      services_done: lead.services_done || "",
      additional_notes: lead.additional_notes || "",
      pitch_script: pitchScript,
      talking_points: talkingPoints,
      variant_label: (variant?.label as string | undefined) || "",
      lead_id: leadId,
      extension: extension,
      has_extension: extension ? "true" : "false",
      first_message: firstMessage,
      call_handling_rules: callHandlingRules,
      call_direction: "outbound",
      conversation_mode: "outbound_campaign",
      source: "auto_dialer",
    };

    console.log(
      `Auto-dialer (native): calling ${lead.phone_number} via ElevenLabs agent=${elevenlabsAgentId} phone_id=${agentPhoneNumberId}`,
    );

    const elResp = await fetch("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        agent_id: elevenlabsAgentId,
        agent_phone_number_id: agentPhoneNumberId,
        to_number: toNumber,
        conversation_initiation_client_data: {
          dynamic_variables: dynamicVariables,
          // Override the agent's base prompt + greeting so it acts like an OUTBOUND
          // caller and never says "Thanks for calling QubeTech". Requires
          // "Overrides" enabled for prompt + first_message in the ElevenLabs agent UI.
          conversation_config_override: {
            agent: {
              prompt: { prompt: pitchScript },
              first_message: firstMessage,
            },
          },
        },
      }),
    });

    const elData = await elResp.json().catch(() => ({}));

    if (!elResp.ok) {
      console.error("ElevenLabs outbound-call error:", elResp.status, elData);
      const failureReason =
        elData?.detail?.message ||
        elData?.message ||
        elData?.detail ||
        `ElevenLabs error ${elResp.status}`;

      await supabase
        .from("auto_dialer_leads")
        .update({
          call_status: "failed",
          ai_summary: typeof failureReason === "string" ? failureReason : JSON.stringify(failureReason),
          retry_count: (lead.retry_count || 0) + 1,
        })
        .eq("id", leadId);

      if (callRow) {
        await supabase
          .from("calls")
          .update({
            status: "missed",
            ended_at: new Date().toISOString(),
            notes: typeof failureReason === "string" ? failureReason : JSON.stringify(failureReason),
          })
          .eq("id", callRow.id);
      }

      await supabase.from("auto_dialer_events").insert({
        session_id: lead.session_id,
        lead_id: leadId,
        agent_id: sessionAgentId,
        event_type: "call_failed",
        message: `ElevenLabs error: ${typeof failureReason === "string" ? failureReason : "unknown"}`,
        metadata: { phone: lead.phone_number, status: elResp.status, response: elData },
      });

      return new Response(JSON.stringify({ error: failureReason }), {
        status: elResp.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callSid = elData?.callSid || elData?.call_sid || elData?.conversation_id || null;
    const conversationId = elData?.conversation_id || null;

    // Link Twilio SID + conversation_id back to lead and call row
    await supabase
      .from("auto_dialer_leads")
      .update({
        twilio_call_sid: callSid,
        elevenlabs_conversation_id: conversationId,
      })
      .eq("id", leadId);

    if (callRow) {
      await supabase
        .from("calls")
        .update({
          twilio_call_sid: callSid,
          elevenlabs_conversation_id: conversationId,
          status: "in_progress",
          agent_id: sessionAgentId,
        })
        .eq("id", callRow.id);
    }

    await supabase.from("auto_dialer_events").insert({
      session_id: lead.session_id,
      lead_id: leadId,
      agent_id: sessionAgentId,
      event_type: "call_started",
      message: `Calling ${lead.client_name || lead.phone_number}`,
      metadata: {
        phone: lead.phone_number,
        twilio_call_sid: callSid,
        elevenlabs_conversation_id: conversationId,
        elevenlabs_agent_id: elevenlabsAgentId,
        call_id: callRow?.id ?? null,
        retry_count: lead.retry_count || 0,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        callSid,
        conversationId,
        callId: callRow?.id ?? null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Auto-dialer error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
}
