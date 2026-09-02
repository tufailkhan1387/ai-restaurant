// @generated from supabase/functions/auto-dialer-scheduler — run: node backend/scripts/generate-handlers.mjs
import { functionsPublicUrl } from "../runtime/functionsPublicUrl.js";
// Cron-triggered scheduler. For each running session:
//   - Auto-starts 'scheduled' sessions whose scheduled_start_at has arrived
//   - Auto-stops 'running' sessions whose scheduled_end_at has passed
//   - Respects per-lead timezone + session dialing window + allowed weekdays
//   - Respects call_interval_seconds
//   - Picks next pending lead (analysis_status='ready', within local window)
//   - Invokes auto-dialer-call
//   - Auto-completes when no more pending leads
//   - Emits campaign_started / campaign_completed / call_dispatched events
import { createClient } from "@supabase/supabase-js";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function isWithinWindow(tz: string, startHHMM: string, endHHMM: string): boolean {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit",
    });
    const parts = fmt.formatToParts(new Date());
    const h = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
    const m = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
    const cur = h * 60 + m;
    const [sh, sm] = startHHMM.split(":").map((x) => parseInt(x, 10));
    const [eh, em] = endHHMM.split(":").map((x) => parseInt(x, 10));
    return cur >= sh * 60 + sm && cur < eh * 60 + em;
  } catch (_e) { return true; }
}

function isAllowedWeekday(tz: string, allowed: number[] | null): boolean {
  if (!allowed || allowed.length === 0 || allowed.length === 7) return true;
  try {
    const wd = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(new Date());
    const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return allowed.includes(map[wd] ?? 0);
  } catch { return true; }
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = process.env.SUPABASE_URL ?? "";
    const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY ?? "");
    const nowIso = new Date().toISOString();

    // 1. Auto-start any 'scheduled' sessions whose start time has arrived
    const { data: dueScheduled } = await supabase
      .from("auto_dialer_sessions")
      .select("id, name, scheduled_start_at")
      .eq("status", "scheduled")
      .lte("scheduled_start_at", nowIso);

    for (const s of dueScheduled || []) {
      await supabase.from("auto_dialer_sessions").update({ status: "running" }).eq("id", s.id);
      await supabase.from("auto_dialer_events").insert({
        session_id: s.id,
        event_type: "campaign_started",
        message: `Campaign auto-started at scheduled time`,
        metadata: { scheduled_start_at: s.scheduled_start_at, trigger: "scheduler" },
      });
    }

    // 2. Auto-stop running sessions whose end time has passed
    const { data: dueEnd } = await supabase
      .from("auto_dialer_sessions")
      .select("id, scheduled_end_at")
      .eq("status", "running")
      .not("scheduled_end_at", "is", null)
      .lte("scheduled_end_at", nowIso);

    for (const s of dueEnd || []) {
      await supabase.from("auto_dialer_sessions").update({ status: "completed" }).eq("id", s.id);
      await supabase.from("auto_dialer_events").insert({
        session_id: s.id,
        event_type: "campaign_completed",
        message: "Campaign auto-stopped at scheduled end time",
        metadata: { trigger: "scheduler", reason: "end_time_reached" },
      });
    }

    // 2.5. Auto-sync transcripts for any recently-completed leads whose calls row still
    // has no transcript. We fire-and-forget so the rest of the scheduler keeps running.
    const { data: needSync } = await supabase
      .from("auto_dialer_leads")
      .select("id, session_id")
      .in("call_status", ["completed", "no_answer", "failed"])
      .not("elevenlabs_conversation_id", "is", null)
      .gte("called_at", new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
      .limit(100);
    const sessionsNeedingSync = Array.from(new Set((needSync || []).map((l) => l.session_id)));
    for (const sid of sessionsNeedingSync) {
      fetch(`${functionsPublicUrl()}/functions/v1/sync-auto-dialer-call`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
        body: JSON.stringify({ sessionId: sid, onlyMissing: true }),
      }).catch((e) => console.error("sync invoke:", e));
    }

    // 2.6. Auto-retry AI analysis for any session (draft/scheduled/running/paused)
    // that still has pending or failed leads. We invoke fire-and-forget; the analyze
    // function itself runs in the background and is idempotent — safe to call repeatedly.
    const { data: needAnalysis } = await supabase
      .from("auto_dialer_leads")
      .select("session_id")
      .in("analysis_status", ["pending", "failed"])
      .limit(500);
    const sessionsNeedingAnalysis = Array.from(new Set((needAnalysis || []).map((l) => l.session_id)));
    // Filter to sessions that are NOT completed (avoid re-running on archived campaigns)
    let analysisTriggered = 0;
    if (sessionsNeedingAnalysis.length > 0) {
      const { data: liveSessions } = await supabase
        .from("auto_dialer_sessions")
        .select("id")
        .in("id", sessionsNeedingAnalysis)
        .neq("status", "completed");
      for (const s of liveSessions || []) {
        fetch(`${functionsPublicUrl()}/functions/v1/analyze-auto-dialer-leads`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
          body: JSON.stringify({ sessionId: s.id }),
        }).catch((e) => console.error("analyze invoke:", e));
        analysisTriggered++;
      }
    }

    const { data: sessions } = await supabase
      .from("auto_dialer_sessions").select("*").eq("status", "running");

    if (!sessions || sessions.length === 0) {
      return new Response(JSON.stringify({ message: "no running sessions", auto_started: dueScheduled?.length || 0, sync_triggered: sessionsNeedingSync.length, analysis_triggered: analysisTriggered }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const summary: any[] = [];

    // Globally clear ANY stuck "calling" leads (>5 min) so they don't block
    // duplicate-phone checks for other sessions.
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    await supabase.from("auto_dialer_leads")
      .update({ call_status: "no_answer" })
      .eq("call_status", "calling").lt("called_at", fiveMinAgo);
    // Also clear leads stuck "calling" with no called_at timestamp at all
    await supabase.from("auto_dialer_leads")
      .update({ call_status: "no_answer" })
      .eq("call_status", "calling").is("called_at", null);

    for (const session of sessions) {

      const { count: callingCount } = await supabase
        .from("auto_dialer_leads")
        .select("id", { count: "exact", head: true })
        .eq("session_id", session.id).eq("call_status", "calling");
      if ((callingCount ?? 0) > 0) { summary.push({ sessionId: session.id, action: "wait_for_active_call" }); continue; }

      if (session.last_dialed_at) {
        const elapsed = (Date.now() - new Date(session.last_dialed_at).getTime()) / 1000;
        if (elapsed < session.call_interval_seconds) {
          summary.push({ sessionId: session.id, action: "wait", wait_seconds: session.call_interval_seconds - Math.floor(elapsed) });
          continue;
        }
      }

      // Bypass mode skips ALL window/weekday/timezone checks for instant dialing
      const bypassWindow = (session as any).bypass_schedule_window === true;
      const respectTz = !bypassWindow && session.respect_timezone !== false;
      const winStart = (session.dialing_window_start as string) || "09:00";
      const winEnd = (session.dialing_window_end as string) || "18:00";
      const fallbackTz = (session.default_timezone as string) || "America/New_York";
      const allowedWeekdays = (session.allowed_weekdays as number[] | null) ?? [0,1,2,3,4,5,6];

      const { data: candidates } = await supabase
        .from("auto_dialer_leads")
        .select("id, phone_number, timezone")
        .eq("session_id", session.id).eq("call_status", "pending").eq("analysis_status", "ready")
        .order("sort_order", { ascending: true }).limit(50);

      const candidatePhones = Array.from(new Set((candidates || []).map((c) => c.phone_number).filter(Boolean)));
      const { data: activePhoneRows } = candidatePhones.length > 0
        ? await supabase
            .from("auto_dialer_leads")
            .select("phone_number")
            .neq("session_id", session.id)
            .eq("call_status", "calling")
            .in("phone_number", candidatePhones)
        : { data: [] as Array<{ phone_number: string }> };

      const blockedPhones = new Set((activePhoneRows || []).map((row) => row.phone_number));

      let pickedLeadId: string | null = null;
      let outsideWindow = 0;
      let blockedDuplicates = 0;

      for (const c of (candidates || [])) {
        if (blockedPhones.has(c.phone_number)) { blockedDuplicates++; continue; }
        const tz = (c.timezone as string | null) || fallbackTz;
        if (respectTz) {
          if (!isAllowedWeekday(tz, allowedWeekdays)) { outsideWindow++; continue; }
          if (!isWithinWindow(tz, winStart, winEnd)) { outsideWindow++; continue; }
        }
        pickedLeadId = c.id; break;
      }

      if (!pickedLeadId) {
        const { count: pendingCount } = await supabase
          .from("auto_dialer_leads")
          .select("id", { count: "exact", head: true })
          .eq("session_id", session.id).eq("call_status", "pending");

        if ((pendingCount ?? 0) === 0) {
          await supabase.from("auto_dialer_sessions").update({ status: "completed" }).eq("id", session.id);
          await supabase.from("auto_dialer_events").insert({
            session_id: session.id, event_type: "campaign_completed",
            message: "All leads processed", metadata: { trigger: "scheduler", reason: "all_leads_done" },
          });
          summary.push({ sessionId: session.id, action: "completed" });
        } else if (outsideWindow > 0) {
          summary.push({ sessionId: session.id, action: "waiting_for_window", outsideWindow });
        } else if (blockedDuplicates > 0) {
          summary.push({ sessionId: session.id, action: "waiting_for_duplicate_phone", blockedDuplicates });
        } else {
          summary.push({ sessionId: session.id, action: "waiting_for_analysis", pending: pendingCount });
        }
        continue;
      }

      const callResp = await fetch(`${functionsPublicUrl()}/functions/v1/auto-dialer-call`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
        body: JSON.stringify({ leadId: pickedLeadId }),
      });
      const callData = await callResp.json().catch(() => ({}));

      await supabase.from("auto_dialer_sessions")
        .update({ last_dialed_at: new Date().toISOString() })
        .eq("id", session.id);

      summary.push({ sessionId: session.id, action: "dialed", leadId: pickedLeadId, ok: callResp.ok, response: callData });
    }

    return new Response(JSON.stringify({ success: true, summary, auto_started: dueScheduled?.length || 0, auto_ended: dueEnd?.length || 0, analysis_triggered: analysisTriggered }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("auto-dialer-scheduler error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}
