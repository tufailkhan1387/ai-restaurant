---
name: AI Auto-Dialer Module
description: Production background dialer with TZ-aware scheduling, A/B prompts, SMS fallback, CSV export, multi-campaign live queue, ElevenLabs Conversational AI bridge, scheduled start/end + weekday rules, full event audit log
type: feature
---
- Page: /auto-dialer (campaigns) + /live-queue (unified inbound+outbound real-time view)
- Excel columns: Client Name, Email, Phone, Company, Pitched For, Services Done, Notes, Timezone (optional)
- Excel import: keeps duplicate phones (each row = one contact); skips empty rows; reports skipped/duplicate counts; logs `leads_imported` event with parse stats
- Phone country-code → IANA TZ inference at upload (+44→Europe/London, +92→Asia/Karachi, etc.); session default_timezone fallback for +1
- Sessions: configurable interval, dialing_window_start/end, respect_timezone, default_timezone, sms_fallback_enabled, sms_fallback_template, scheduled_start_at, scheduled_end_at, allowed_weekdays (int[] 0-6 Sun-Sat)
- Status values: draft | scheduled | running | paused | completed
- Per-lead: timezone, variant_id, sms_status/sent_at/sid/body, retry_count, interest_level, ai_pitch_script
- A/B prompt variants table (auto_dialer_prompt_variants): label, system_prompt_override, first_message_override, weight; weighted-random assignment at upload; conversion stats per variant in UI
- Background scheduler (auto-dialer-scheduler) cron-triggered every minute: auto-flips scheduled→running at scheduled_start_at, auto-stops at scheduled_end_at, respects allowed_weekdays + interval + each lead's local dialing window; auto-completes when no pending; survives sign-out
- auto-dialer-twiml bridges to ElevenLabs via <Connect><Stream>; uses variant overrides if present; passes dynamic variables (client_name, pitched_for, pitch_script, etc.)
- twilio-status-callback triggers auto-dialer-sms-fallback on no-answer/busy/failed/canceled when session has SMS fallback enabled (idempotent, DNC-checked); also emits call_ended events with duration
- elevenlabs-conversation-webhook links transcripts/recordings to lead.call_id; auto-converts high-interest leads into public.leads
- DNC checked before every call AND every SMS
- CSV export (exportSessionToCsv): client info, call_status, interest_level, variant, duration, ai_summary, transcript preview (500 chars), recording_url, sms_status, timezone
- Event log table `auto_dialer_events` (session_id, lead_id, agent_id, event_type, message, metadata, created_at) — event types: campaign_created, campaign_scheduled, campaign_started, campaign_paused, campaign_resumed, campaign_stopped, campaign_completed, leads_imported, call_started, call_ended, sms_sent
- Logs tab in SessionDetailView: realtime timeline filterable by event type, shows agent, duration, lead, message; CSV export; running totals (events count, calls count, total talk time)
- Per-agent test call: /agents has Test call button → agent-test-call edge function dials a one-off outbound using a specific elevenlabs_agent_id
- Live queue page: realtime active inbound/outbound, auto-dialer queue depth, completed-today counts; click row → CallDetailDialog
