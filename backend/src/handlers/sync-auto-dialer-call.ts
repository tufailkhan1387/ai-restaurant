// @generated from supabase/functions/sync-auto-dialer-call — run: node backend/scripts/generate-handlers.mjs
import { functionsPublicUrl } from "../runtime/functionsPublicUrl.js";
// Pulls a conversation from ElevenLabs by conversation_id and writes transcript,
// recording_url, summary, and call status onto the linked `calls` row + auto_dialer_lead.
// Also extracts callback / gatekeeper intent from AI summary and flags the lead.
//
// Usable two ways:
//   1. POST { leadId }                 → sync that single lead (manual button)
//   2. POST { sessionId, onlyMissing } → batch-sync all completed leads in a session
//                                       whose calls row has no transcript yet (auto)
//
// Idempotent — safe to call repeatedly.

import { createClient } from "@supabase/supabase-js";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ConversationDetail {
  conversation_id: string;
  status: string;
  has_audio: boolean;
  transcript?: Array<{ role: "agent" | "user"; message: string; time_in_call_secs?: number }>;
  metadata?: { call_duration_secs?: number; phone_number?: string; call_sid?: string; [k: string]: unknown };
  analysis?: {
    transcript_summary?: string;
    call_successful?: boolean;
    data_collection_results?: Record<string, { value?: string }>;
    evaluation_results?: Record<string, { result?: string }>;
  };
}

// Heuristic flags pulled from summary text
function detectFlags(summary: string): {
  gatekeeper: boolean;
  callback: boolean;
  callbackReason?: string;
  hold: boolean;
} {
  const s = (summary || "").toLowerCase();
  const gatekeeperSignals = [
    "receptionist", "secretary", "answered by an assistant", "front desk",
    "screening the call", "screened the call", "transferred me to", "asked me to hold",
    "automated message", "voicemail", "answering machine", "ivr", "press 1", "dial extension",
  ];
  const callbackSignals = [
    "call back later", "call later", "callback", "another time",
    "busy right now", "in a meeting", "currently unavailable", "after hours",
    "out of office", "left a voicemail", "left a message",
  ];
  const holdSignals = [
    "put on hold", "placed on hold", "on hold for", "hold music", "still on hold",
    "long hold", "extended hold",
  ];
  const gatekeeper = gatekeeperSignals.some((k) => s.includes(k));
  const hold = holdSignals.some((k) => s.includes(k));
  const callback = callbackSignals.some((k) => s.includes(k)) || gatekeeper || hold;
  let callbackReason: string | undefined;
  if (hold) callbackReason = "Placed on hold — disconnected, retry later";
  else if (gatekeeper) callbackReason = "Gatekeeper / receptionist intercepted — try again";
  else if (callback) callbackReason = "Lead requested or implied callback";
  return { gatekeeper, callback, callbackReason, hold };
}

async function syncOne(supabase: any, ELEVENLABS_API_KEY: string, leadId: string) {
  const { data: lead } = await supabase
    .from("auto_dialer_leads")
    .select("id, call_id, elevenlabs_conversation_id, twilio_call_sid, ai_summary, phone_number")
    .eq("id", leadId)
    .maybeSingle();

  if (!lead) return { leadId, ok: false, reason: "lead_not_found" };
  const convId = lead.elevenlabs_conversation_id;
  if (!convId) return { leadId, ok: false, reason: "no_conversation_id" };

  const resp = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${convId}`, {
    headers: { "xi-api-key": ELEVENLABS_API_KEY },
  });
  if (!resp.ok) {
    const txt = await resp.text();
    return { leadId, ok: false, reason: `elevenlabs_${resp.status}`, error: txt.slice(0, 200) };
  }
  const detail: ConversationDetail = await resp.json();

  const transcriptText = (detail.transcript || [])
    .map((t) => `${t.role === "agent" ? "Agent" : "Customer"}: ${t.message}`)
    .join("\n");
  const recordingUrl = detail.has_audio
    ? `https://api.elevenlabs.io/v1/convai/conversations/${convId}/audio`
    : null;
  const summary = detail.analysis?.transcript_summary || lead.ai_summary || null;
  const duration = detail.metadata?.call_duration_secs || 0;

  // Locate or create the calls row
  let callId = lead.call_id as string | null;
  if (!callId) {
    const { data: byConv } = await supabase.from("calls").select("id")
      .eq("elevenlabs_conversation_id", convId).maybeSingle();
    if (byConv) callId = byConv.id;
  }
  if (!callId && lead.twilio_call_sid) {
    const { data: bySid } = await supabase.from("calls").select("id")
      .eq("twilio_call_sid", lead.twilio_call_sid).maybeSingle();
    if (bySid) callId = bySid.id;
  }
  if (!callId) {
    // Create fresh row
    const { data: newCall } = await supabase.from("calls").insert({
      phone_number: lead.phone_number,
      direction: "outbound",
      status: detail.status === "done" ? "completed" : "missed",
      duration_seconds: duration,
      transcript: transcriptText || null,
      recording_url: recordingUrl,
      notes: summary,
      elevenlabs_conversation_id: convId,
      twilio_call_sid: lead.twilio_call_sid,
      started_at: new Date().toISOString(),
      ended_at: new Date().toISOString(),
      metadata: { source: "auto_dialer_sync", auto_dialer_lead_id: leadId },
    }).select().single();
    callId = newCall?.id || null;
  } else {
    await supabase.from("calls").update({
      status: detail.status === "done" ? "completed" : (detail.status === "failed" ? "missed" : "in_progress"),
      duration_seconds: duration,
      transcript: transcriptText || null,
      recording_url: recordingUrl,
      notes: summary,
      elevenlabs_conversation_id: convId,
      ended_at: new Date().toISOString(),
    }).eq("id", callId);
  }

  // Replace conversations rows
  if (callId && detail.transcript && detail.transcript.length > 0) {
    await supabase.from("conversations").delete().eq("call_id", callId);
    await supabase.from("conversations").insert(
      detail.transcript.map((t, i) => ({
        call_id: callId,
        speaker: t.role === "agent" ? "ai" : "customer",
        message: t.message,
        timestamp: new Date(Date.now() - (detail.transcript!.length - i) * 3000).toISOString(),
      })),
    );
  }

  // Detect intent flags from summary (heuristic, fast)
  const flags = detectFlags(summary || "");

  // Run AI classifier — authoritative source for interest_level / qualification
  let interestLevel: string | null = null;
  let qualifyAsLead = false;
  let outcome = "engaged_no_commit";
  let verdictReason = "";
  try {
    const cr = await fetch(`${functionsPublicUrl()}/functions/v1/classify-call-outcome`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ transcript: transcriptText, summary: summary || "", durationSeconds: duration }),
    });
    if (cr.ok) {
      const v = await cr.json();
      interestLevel = v.interest_level;
      qualifyAsLead = v.qualify_as_lead === true;
      outcome = v.outcome;
      verdictReason = v.reason || "";
    }
  } catch (e) {
    console.error("classifier failed in sync-auto-dialer-call:", e);
  }

  const adUpdate: Record<string, unknown> = {
    call_id: callId,
    ai_summary: summary,
    gatekeeper_encountered: flags.gatekeeper || outcome === "gatekeeper",
    callback_requested: flags.callback || outcome === "callback_requested" || outcome === "gatekeeper",
    callback_reason: verdictReason || flags.callbackReason || null,
  };
  if (interestLevel) adUpdate.interest_level = interestLevel;

  await supabase.from("auto_dialer_leads").update(adUpdate).eq("id", leadId);

  // If AI says NOT a real qualified lead, demote any previously-created `leads` row
  if (!qualifyAsLead) {
    const { data: ad } = await supabase.from("auto_dialer_leads")
      .select("converted_lead_id, phone_number").eq("id", leadId).maybeSingle();
    const targetLeadId = ad?.converted_lead_id;
    if (targetLeadId) {
      await supabase.from("leads")
        .update({ status: "contacted", notes: `Auto-dialer reclassified (${outcome}): ${verdictReason}` })
        .eq("id", targetLeadId);
    } else if (ad?.phone_number) {
      // Also clean up any leads row that was auto-created from this phone via auto_dialer source
      await supabase.from("leads")
        .update({ status: "contacted", notes: `Auto-dialer reclassified (${outcome}): ${verdictReason}` })
        .eq("phone_number", ad.phone_number)
        .eq("source", "auto_dialer")
        .eq("status", "qualified");
    }
  }

  return { leadId, ok: true, callId, hasTranscript: !!transcriptText, hasRecording: !!recordingUrl, flags, outcome, interestLevel, qualifyAsLead };
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
    if (!ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY not configured");

    const supabase = createClient(
      process.env.SUPABASE_URL ?? "",
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    );

    const body = await req.json().catch(() => ({}));
    const { leadId, sessionId, onlyMissing = true } = body;

    // Single lead mode
    if (leadId) {
      const result = await syncOne(supabase, ELEVENLABS_API_KEY, leadId);
      return new Response(JSON.stringify(result), {
        status: result.ok ? 200 : 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Batch mode
    if (sessionId) {
      let q = supabase.from("auto_dialer_leads")
        .select("id, call_id, elevenlabs_conversation_id")
        .eq("session_id", sessionId)
        .in("call_status", ["completed", "no_answer", "failed"])
        .not("elevenlabs_conversation_id", "is", null);

      const { data: leads } = await q;
      if (!leads || leads.length === 0) {
        return new Response(JSON.stringify({ message: "no_leads", synced: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // If onlyMissing, skip those whose call already has transcript
      const targetIds: string[] = [];
      if (onlyMissing) {
        const callIds = leads.map((l: any) => l.call_id).filter(Boolean);
        const { data: callsWithTx } = callIds.length > 0
          ? await supabase.from("calls").select("id, transcript").in("id", callIds)
          : { data: [] as any[] };
        const haveTx = new Set((callsWithTx || []).filter((c: any) => c.transcript).map((c: any) => c.id));
        for (const l of leads) {
          if (!l.call_id || !haveTx.has(l.call_id)) targetIds.push(l.id);
        }
      } else {
        targetIds.push(...leads.map((l: any) => l.id));
      }

      const results: any[] = [];
      for (const id of targetIds.slice(0, 25)) {
        results.push(await syncOne(supabase, ELEVENLABS_API_KEY, id));
        await new Promise((r) => setTimeout(r, 150));
      }

      return new Response(JSON.stringify({ success: true, synced: results.filter(r => r.ok).length, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "leadId or sessionId required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("sync-auto-dialer-call error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}
