// @generated from supabase/functions/elevenlabs-sync-active-conversations — run: node backend/scripts/generate-handlers.mjs
import { functionsPublicUrl } from "../runtime/functionsPublicUrl.js";
// Polls ElevenLabs for any in-flight conversations and syncs status, transcript,
// recording, duration, and analysis back into `calls` and `auto_dialer_leads`.
//
// Why: ElevenLabs' native Twilio integration bypasses our Twilio webhook AND the
// post-call webhook may be unconfigured. Polling is the deterministic source of truth.
//
// Triggered by cron every 30s. Also safe to invoke manually.

import { createClient } from "@supabase/supabase-js";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ELConversation {
  conversation_id: string;
  agent_id: string;
  status: "initiated" | "in-progress" | "processing" | "done" | "failed" | string;
  call_duration_secs?: number;
  metadata?: {
    call_duration_secs?: number;
    start_time_unix_secs?: number;
    [k: string]: unknown;
  };
  transcript?: Array<{ role: "agent" | "user"; message: string; time_in_call_secs?: number }>;
  analysis?: {
    transcript_summary?: string;
    call_successful?: string | boolean;
    data_collection_results?: Record<string, { value: string | number | boolean }>;
  };
  has_audio?: boolean;
}

const TERMINAL_STATUSES = ["done", "failed", "completed", "missed", "cancelled"];

async function fetchConversation(apiKey: string, id: string): Promise<ELConversation | null> {
  const r = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${id}`, {
    headers: { "xi-api-key": apiKey },
  });
  if (!r.ok) {
    console.error(`EL fetch ${id} failed:`, r.status, await r.text().catch(() => ""));
    return null;
  }
  return (await r.json()) as ELConversation;
}

// Strict AI-driven classifier — calls our classify-call-outcome edge function.
// Returns { interest_level, qualify_as_lead, outcome, reason }.
async function classifyCall(transcript: string, summary: string, duration: number) {
  const url = `${functionsPublicUrl()}/functions/v1/classify-call-outcome`;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ transcript, summary, durationSeconds: duration }),
    });
    if (!r.ok) throw new Error(`classifier ${r.status}`);
    return await r.json();
  } catch (e) {
    console.error("classifyCall failed:", e);
    return { interest_level: "unclear", qualify_as_lead: false, outcome: "no_answer", reason: "classifier error" };
  }
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "ELEVENLABS_API_KEY not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  );

  // 1. Find every call still in-flight that has an ElevenLabs conversation_id
  const { data: openCalls } = await supabase
    .from("calls")
    .select("id, elevenlabs_conversation_id, status, started_at, transcript")
    .not("elevenlabs_conversation_id", "is", null)
    .in("status", ["queued", "in_progress"])
    .limit(50);

  // 2. Plus any auto_dialer_leads still in 'calling' that have a conversation_id (catches rows where call_id is missing)
  const { data: openLeads } = await supabase
    .from("auto_dialer_leads")
    .select("id, elevenlabs_conversation_id, twilio_call_sid, call_id, session_id, phone_number, client_name, email, company, pitched_for, session:auto_dialer_sessions(max_call_duration_seconds)")
    .not("elevenlabs_conversation_id", "is", null)
    .in("call_status", ["calling", "pending"])
    .limit(50);

  const convIds = new Set<string>();
  (openCalls || []).forEach((c) => c.elevenlabs_conversation_id && convIds.add(c.elevenlabs_conversation_id));
  (openLeads || []).forEach((l) => l.elevenlabs_conversation_id && convIds.add(l.elevenlabs_conversation_id));

  console.log(`Polling ${convIds.size} active EL conversations`);

  // Build a map conv_id → lead so we can early-end calls + know the twilio_call_sid
  const leadByConv = new Map<string, any>();
  for (const l of openLeads || []) {
    if (l.elevenlabs_conversation_id) leadByConv.set(l.elevenlabs_conversation_id, l);
  }

  let synced = 0, terminated = 0, errors = 0, earlyEnded = 0;

  // Helper: ask Twilio to hang up immediately. Used when we detect voicemail / hold-too-long.
  async function endTwilioCall(callSid: string, reason: string) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const tok = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !tok || !callSid) return false;
    try {
      const auth = btoa(`${sid}:${tok}`);
      const body = new URLSearchParams({ Status: "completed" });
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls/${callSid}.json`, {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      console.log(`Early-ended Twilio call ${callSid} (${reason}): ${r.status}`);
      return r.ok;
    } catch (e) {
      console.error(`Failed to end Twilio call ${callSid}:`, e);
      return false;
    }
  }

  // Heuristic in-call detectors used to kill calls before we burn minutes.
  function isVoicemailInProgress(transcript: string): boolean {
    const tx = (transcript || "").toLowerCase();
    if (!tx) return false;
    return [
      "leave a message", "leave your message", "after the tone", "after the beep",
      "at the tone", "at the beep", "you have reached", "you've reached",
      "is not available", "currently unavailable", "please record",
      "answering machine", "automated greeting", "voicemail", "voice mail",
      "mailbox", "no longer in service",
    ].some((k) => tx.includes(k));
  }

  function isReceptionOrExtensionFlow(transcript: string): boolean {
    const tx = (transcript || "").toLowerCase();
    if (!tx) return false;
    return [
      "receptionist",
      "front desk",
      "operator",
      "dial extension",
      "enter extension",
      "press 1",
      "press one",
      "transfer",
      "connecting you",
    ].some((k) => tx.includes(k));
  }

  function isStuckOnHold(conv: ELConversation, duration: number): boolean {
    // Only the agent is talking (no real customer turns) AND we are 90+ s in,
    // excluding reception / extension routing where the call may still reach a person.
    const turns = (conv.transcript || []).filter(
      (t) => t.role === "user" && (t.message || "").trim().length > 2,
    ).length;
    if (turns > 0) return false;
    const transcriptText = (conv.transcript || []).map((t) => t.message || "").join("\n");
    if (isReceptionOrExtensionFlow(transcriptText)) return false;
    return duration >= 90;
  }

  for (const cid of convIds) {
    try {
      const conv = await fetchConversation(apiKey, cid);
      if (!conv) { errors++; continue; }

      const isTerminal = TERMINAL_STATUSES.includes(conv.status);

      // ----- EARLY-END GUARD: save ElevenLabs minutes -----
      if (!isTerminal) {
        const liveDuration = conv.metadata?.call_duration_secs ?? conv.call_duration_secs ?? 0;
        const liveTranscript = (conv.transcript || [])
          .map((t) => `${t.role}: ${t.message}`).join("\n");
        const lead = leadByConv.get(cid);
        const sidToKill = lead?.twilio_call_sid;

        const maxDurationCap = Math.max(30, lead?.session?.max_call_duration_seconds ?? 120);

        // ----- Auto-hangup TIMELINE markers -----
        // We emit one event per phase, deduped on (lead_id, event_type) so the
        // Timeline tab can render: scheduled → kill_window → confirmed.
        async function emitOnce(eventType: string, message: string, metadata: Record<string, unknown>) {
          if (!lead) return;
          const { count } = await supabase
            .from("auto_dialer_events")
            .select("id", { count: "exact", head: true })
            .eq("lead_id", lead.id)
            .eq("event_type", eventType);
          if ((count ?? 0) > 0) return;
          await supabase.from("auto_dialer_events").insert({
            session_id: lead.session_id,
            lead_id: lead.id,
            event_type: eventType,
            message,
            metadata: { conversation_id: cid, ...metadata },
          });
        }

        if (lead && liveDuration > 0) {
          // Phase 1: scheduled — recorded as soon as we see a live call
          await emitOnce(
            "auto_hangup_scheduled",
            `Auto-hangup armed at ${maxDurationCap}s cap`,
            { cap_seconds: maxDurationCap, started_duration: liveDuration },
          );
          // Phase 2: kill window — within 15s of cap
          if (liveDuration >= maxDurationCap - 15 && liveDuration < maxDurationCap) {
            await emitOnce(
              "auto_hangup_kill_window",
              `Entered final 15s before cap (at ${liveDuration}s of ${maxDurationCap}s)`,
              { cap_seconds: maxDurationCap, duration: liveDuration },
            );
          }
        }

        // Detect a real human conversation: at least 2 substantive user turns
        // means a person is actively talking — don't cut them off mid-sentence.
        const humanTurns = (conv.transcript || []).filter(
          (t) => t.role === "user" && (t.message || "").trim().length > 8,
        ).length;
        const humanIsTalking = humanTurns >= 2;

        let killReason: string | null = null;
        // Voicemail: hang up on first detection (no grace period — saves minutes & avoids leaving messages).
        // Only trust voicemail detection BEFORE a human has clearly engaged (avoids false positives mid-conversation).
        if (!humanIsTalking && isVoicemailInProgress(liveTranscript)) killReason = "voicemail_detected";
        else if (isStuckOnHold(conv, liveDuration)) killReason = "stuck_on_hold_or_ivr";
        else if (liveDuration >= maxDurationCap && !humanIsTalking) killReason = `max_duration_${maxDurationCap}s`; // per-campaign cap — skipped while a real human is talking

        if (killReason && sidToKill) {
          const ok = await endTwilioCall(sidToKill, killReason);
          earlyEnded++;
          // Mark lead immediately so UI reflects it; the next poll will finish the sync
          if (lead) {
            await supabase.from("auto_dialer_leads").update({
              call_status:
                killReason === "voicemail_detected" || killReason === "stuck_on_hold_or_ivr"
                  ? "no_answer"
                  : "completed",
              callback_requested: false,
              gatekeeper_encountered: killReason === "stuck_on_hold_or_ivr",
              callback_reason:
                killReason === "voicemail_detected" ? "Voicemail — auto-ended to save minutes" :
                killReason === "stuck_on_hold_or_ivr" ? "Stuck on hold/IVR — auto-ended after 90s" :
                `Per-campaign call cap reached (${maxDurationCap}s)`,
              ai_summary: `Auto-ended (${killReason}) at ${liveDuration}s. ${conv.analysis?.transcript_summary || ""}`.trim(),
            }).eq("id", lead.id);
            // Phase 3: confirmed
            await emitOnce(
              "auto_hangup_confirmed",
              `Auto-hangup confirmed (${killReason}) at ${liveDuration}s — Twilio ack: ${ok ? "ok" : "failed"}`,
              { cap_seconds: maxDurationCap, duration: liveDuration, reason: killReason, twilio_ack: ok },
            );
            // Keep legacy event for older Logs UI compatibility
            await supabase.from("auto_dialer_events").insert({
              session_id: lead.session_id,
              lead_id: lead.id,
              event_type: "call_auto_ended",
              message: `Auto-ended call (${killReason}) at ${liveDuration}s to save minutes`,
              metadata: { conversation_id: cid, duration: liveDuration, reason: killReason, twilio_ack: ok },
            });
          }
          continue; // Don't run terminal-flow logic on this poll; next tick will catch it.
        }
      }

      const callStatus = conv.status === "done" ? "completed"
        : conv.status === "failed" ? "missed"
        : "in_progress";

      const duration = conv.metadata?.call_duration_secs ?? conv.call_duration_secs ?? 0;
      const transcriptText = (conv.transcript || [])
        .map((t) => `${t.role === "agent" ? "Agent" : "Customer"}: ${t.message}`)
        .join("\n");

      const recordingUrl = conv.has_audio
        ? `https://api.elevenlabs.io/v1/convai/conversations/${cid}/audio`
        : null;
      const summary = conv.analysis?.transcript_summary || null;

      const callPatch: Record<string, unknown> = {
        status: callStatus,
        duration_seconds: duration,
        transcript: transcriptText || null,
        recording_url: recordingUrl,
        notes: summary,
      };
      if (isTerminal) callPatch.ended_at = new Date().toISOString();

      // Update calls row(s) by conversation id
      await supabase.from("calls").update(callPatch).eq("elevenlabs_conversation_id", cid);

      // Update auto-dialer lead(s) — only flip to terminal when EL says so
      if (isTerminal) {
        // Run AI classification on the actual transcript instead of trusting EL flags
        const verdict = await classifyCall(transcriptText, summary || "", duration);

        // Map the AI verdict outcome → user-facing call_status bucket.
        // We trust the verdict over EL's `conv.status` because EL marks calls
        // as "failed" whenever the agent didn't reach a clean conclusion, even
        // if a real human conversation took place (voicemail, gatekeeper, etc).
        const outcomeToStatus: Record<string, string> = {
          interested: "completed",
          engaged_no_commit: "completed",
          callback_requested: "callback",
          not_interested: "not_interested",
          voicemail: "voicemail",
          gatekeeper: "gatekeeper",
          no_answer: "no_answer",
        };
        let nextCallStatus = outcomeToStatus[verdict.outcome] ?? "completed";
        // Only fall back to "failed" if EL truly failed AND there was no transcript
        // to classify (i.e., the call never produced anything we can analyze).
        if (conv.status !== "done" && (!transcriptText || transcriptText.length < 10)) {
          nextCallStatus = "failed";
        }

        const adPatch: Record<string, unknown> = {
          call_status: nextCallStatus,
          ai_summary: summary,
          interest_level: verdict.interest_level,
          callback_requested: verdict.outcome === "callback_requested",
          gatekeeper_encountered: verdict.outcome === "gatekeeper",
          callback_reason: ["callback_requested", "voicemail"].includes(verdict.outcome)
            ? verdict.reason : null,
        };

        const { data: adRows } = await supabase
          .from("auto_dialer_leads")
          .update(adPatch)
          .eq("elevenlabs_conversation_id", cid)
          .select("id, session_id, phone_number, client_name, email, company, pitched_for, interest_level, ai_summary");

        // Auto-convert ONLY when AI verdict says qualify_as_lead === true
        for (const ad of adRows || []) {
          if (verdict.qualify_as_lead === true && ad.interest_level === "interested") {
            const { data: existingLead } = await supabase
              .from("leads")
              .select("id")
              .eq("phone_number", ad.phone_number)
              .maybeSingle();

            const leadPayload = {
              phone_number: ad.phone_number,
              full_name: ad.client_name,
              email: ad.email,
              company: ad.company,
              status: "qualified" as const,
              source: "auto_dialer",
              notes: `Auto-dialer interested. ${ad.ai_summary || ""}`.trim(),
            };

            let convertedLeadId: string | null = null;
            if (existingLead) {
              await supabase.from("leads").update({ ...leadPayload, updated_at: new Date().toISOString() }).eq("id", existingLead.id);
              convertedLeadId = existingLead.id;
            } else {
              const { data: newLead } = await supabase.from("leads").insert(leadPayload).select("id").maybeSingle();
              convertedLeadId = newLead?.id || null;
            }

            if (convertedLeadId) {
              await supabase.from("auto_dialer_leads").update({ converted_lead_id: convertedLeadId }).eq("id", ad.id);
            }
          }

          // Bump session.completed_leads
          const { count: completedCount } = await supabase
            .from("auto_dialer_leads")
            .select("id", { count: "exact", head: true })
            .eq("session_id", ad.session_id)
            .in("call_status", [
              "completed", "failed", "no_answer", "skipped", "skipped_non_us",
              "voicemail", "gatekeeper", "not_interested", "callback",
            ]);

          await supabase.from("auto_dialer_sessions")
            .update({ completed_leads: completedCount ?? 0 })
            .eq("id", ad.session_id);

          // Emit terminal event
          await supabase.from("auto_dialer_events").insert({
            session_id: ad.session_id,
            lead_id: ad.id,
            event_type: "call_ended",
            message: `Call ${adPatch.call_status} (${duration}s)`,
            metadata: { conversation_id: cid, duration, interest: ad.interest_level },
          });
        }

        // Persist transcript line-by-line for any call we just terminated
        const { data: callRow } = await supabase
          .from("calls")
          .select("id")
          .eq("elevenlabs_conversation_id", cid)
          .maybeSingle();

        if (callRow && conv.transcript && conv.transcript.length > 0) {
          await supabase.from("conversations").delete().eq("call_id", callRow.id);
          await supabase.from("conversations").insert(
            conv.transcript.map((t, i) => ({
              call_id: callRow.id,
              speaker: t.role === "agent" ? "ai" : "customer",
              message: t.message,
              timestamp: new Date(Date.now() - (conv.transcript!.length - i) * 3000).toISOString(),
            })),
          );
        }
        terminated++;
      }
      synced++;
    } catch (e) {
      console.error(`Error syncing ${cid}:`, e);
      errors++;
    }
  }

  // Stale-call sweep #1: anything in_progress > 15 minutes with no EL id → mark missed
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  await supabase
    .from("calls")
    .update({ status: "missed", ended_at: new Date().toISOString(), notes: "Auto-closed: no activity for 15+ minutes" })
    .in("status", ["queued", "in_progress"])
    .lt("started_at", fifteenMinAgo)
    .is("elevenlabs_conversation_id", null);

  // Stale-call sweep #2: EL-linked calls stuck in_progress > 30 minutes — EL sometimes never
  // flips a conversation to terminal (orphan/phantom). Force-close so the queue clears.
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: stuckCalls } = await supabase
    .from("calls")
    .update({
      status: "missed",
      ended_at: new Date().toISOString(),
      notes: "Auto-closed: ElevenLabs conversation stuck in non-terminal state for 30+ minutes",
    })
    .in("status", ["queued", "in_progress"])
    .lt("started_at", thirtyMinAgo)
    .not("elevenlabs_conversation_id", "is", null)
    .select("id, elevenlabs_conversation_id");

  // Mirror onto auto_dialer_leads still flagged as calling/pending for those convos
  if (stuckCalls && stuckCalls.length > 0) {
    const stuckConvIds = stuckCalls.map((c: any) => c.elevenlabs_conversation_id).filter(Boolean);
    if (stuckConvIds.length > 0) {
      await supabase
        .from("auto_dialer_leads")
        .update({
          call_status: "no_answer",
          ai_summary: "Auto-closed: ElevenLabs never reported a terminal status (>30 min)",
        })
        .in("elevenlabs_conversation_id", stuckConvIds)
        .in("call_status", ["calling", "pending"]);
    }
  }

  const stuckClosedCount = stuckCalls?.length ?? 0;
  console.log(`Sweep closed ${stuckClosedCount} stuck EL-linked calls`);

  return new Response(
    JSON.stringify({ polled: convIds.size, synced, terminated, errors, earlyEnded, stuckClosed: stuckClosedCount }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
