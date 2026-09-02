// @generated from supabase/functions/classify-call-outcome — run: node backend/scripts/generate-handlers.mjs
// AI-powered call outcome classifier.
// Reads a transcript + summary and returns a structured verdict the system
// can trust to mark a lead "interested" / "qualified" only when a real human
// actually engaged positively. Voicemails, gatekeepers, hold music, no-replies
// are explicitly NOT interested.
//
// Used by elevenlabs-sync-active-conversations and elevenlabs-conversation-webhook.
//
// POST { transcript: string, summary?: string, durationSeconds?: number }
//   → { interest_level, qualify_as_lead, outcome, reason }

import { createClient } from "@supabase/supabase-js";


// ---------------------------------------------------------------------------
// Deterministic pre-classifier. Runs BEFORE the AI call so obvious
// voicemail / IVR / no-answer cases can NEVER be mislabeled as "not_interested".
// Returns null when the situation is ambiguous and we should defer to the AI.
// ---------------------------------------------------------------------------
function countCustomerTurns(transcript: string): number {
  return (transcript || "")
    .split("\n")
    .filter((l) => l.startsWith("Customer:") && l.replace("Customer:", "").trim().length > 2)
    .length;
}

function customerWordCount(transcript: string): number {
  return (transcript || "")
    .split("\n")
    .filter((l) => l.startsWith("Customer:"))
    .map((l) => l.replace("Customer:", "").trim())
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
}

function preClassify(transcript: string, summary: string, duration: number) {
  const tx = (transcript || "").toLowerCase();
  const sm = (summary || "").toLowerCase();
  const blob = `${sm}\n${tx}`;
  const turns = countCustomerTurns(transcript);
  const words = customerWordCount(transcript);

  // --- Voicemail / answering machine / automated greeting ---
  const voicemailSignals = [
    "voicemail", "voice mail", "leave a message", "leave your message",
    "after the tone", "after the beep", "at the tone", "at the beep",
    "answering machine", "automated message", "automated greeting",
    "you have reached", "you've reached", "is not available",
    "is unavailable", "cannot take your call", "can't take your call",
    "currently unavailable", "please record", "please leave",
    "mailbox", "no longer in service",
  ];
  if (voicemailSignals.some((k) => blob.includes(k))) {
    return {
      outcome: "voicemail",
      interest_level: "unclear",
      qualify_as_lead: false,
      reason: "Voicemail / answering machine greeting detected.",
    };
  }

  // --- IVR / phone tree / switchboard / gatekeeper ---
  const ivrSignals = [
    "press 1", "press 2", "press 3", "press one", "press two",
    "press the", "press star", "press pound", "main menu",
    "dial extension", "enter the extension", "for english press",
    "for spanish", "para español", "phone tree", "automated attendant",
    "interactive voice", "ivr", "if you know your party's extension",
    "for sales press", "for support press", "for billing press",
  ];
  const gatekeeperSignals = [
    "receptionist", "front desk", "switchboard", "operator speaking",
    "law office of", "law offices of", "thank you for calling",
    "how may i direct your call", "how can i direct your call",
    "transfer you", "transferring you", "let me transfer",
    "screening the call", "screened the call", "may i ask who",
    "what is this regarding", "what's this regarding",
    "secretary", "assistant speaking", "answering service",
  ];
  const holdSignals = [
    "please hold", "hold please", "one moment please", "one moment",
    "placed on hold", "put on hold", "hold music", "still on hold",
  ];
  if (
    ivrSignals.some((k) => blob.includes(k)) ||
    gatekeeperSignals.some((k) => blob.includes(k)) ||
    holdSignals.some((k) => blob.includes(k))
  ) {
    return {
      outcome: "gatekeeper",
      interest_level: "callback",
      qualify_as_lead: false,
      reason: "IVR / switchboard / receptionist intercepted the call.",
    };
  }

  // --- No real conversation: short call OR no/few customer words ---
  // We require an actual decline phrase before ever calling something
  // "not_interested" — silence is NOT a rejection.
  if (duration < 20 || turns === 0 || words < 5) {
    return {
      outcome: "no_answer",
      interest_level: "unclear",
      qualify_as_lead: false,
      reason: `No real conversation (duration=${duration}s, customer_turns=${turns}, customer_words=${words}).`,
    };
  }

  return null; // defer to AI
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM = `You are a call-outcome classifier for an outbound sales auto-dialer.
You receive a call transcript (Agent vs Customer turns) plus an optional summary.
Decide what actually happened. Be strict — only mark a lead as "interested" or
qualify them when a REAL HUMAN PROSPECT actually engaged in conversation and
expressed clear positive intent (asked for more info, agreed to follow-up,
booked a meeting, said yes to a demo, asked pricing, etc).

NEVER mark these as interested or qualified:
- Voicemail / answering machine / IVR / automated greeting → outcome="voicemail"
- Receptionist / gatekeeper / switchboard / "thank you for calling [Firm]" / "how may I direct your call" / "please hold" → outcome="gatekeeper"
- Hold music or being placed on hold without a real reply → outcome="gatekeeper"
- Calls under ~20 seconds with no real customer turns → outcome="no_answer"
- Agent did all the talking and customer never substantively replied (< 5 words total from customer) → outcome="no_answer"
- Customer said no, hung up, declined, "not interested", "remove me" → outcome="not_interested"

CRITICAL RULES:
1. Silence, voicemail beeps, IVR menus, or hold music are NEVER "not_interested".
2. Only use "not_interested" when a real human DECISION-MAKER explicitly declined IN WORDS.
3. If the only voice on the line was an automated system or a receptionist, the
   outcome is "voicemail" or "gatekeeper" — never "not_interested".
4. A short call where the customer never spoke is "no_answer" or "voicemail",
   never "not_interested".

Use these outcome buckets:
- voicemail        — answering machine / IVR / automated greeting, no human conversation
- gatekeeper       — receptionist / switchboard / IVR menu / on-hold, never reached decision-maker
- no_answer        — call connected but no real conversation (silence, < 5 customer words, < 20s)
- not_interested   — REAL human decision-maker explicitly declined / hung up / said no
- callback_requested — human asked us to call back later
- engaged_no_commit — human spoke substantively but no clear yes/no
- interested       — clear positive intent from a real decision-maker

Set qualify_as_lead = true ONLY when outcome === "interested".`;

async function classify(apiKey: string, transcript: string, summary: string, duration: number) {
  const userTurns = (transcript || "")
    .split("\n")
    .filter((l) => l.startsWith("Customer:") && l.replace("Customer:", "").trim().length > 2).length;

  const prompt = `Call duration: ${duration}s
Customer turns: ${userTurns}

Summary: ${summary || "(none)"}

Transcript:
${(transcript || "(empty)").slice(0, 8000)}`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
      tools: [{
        type: "function",
        function: {
          name: "record_outcome",
          description: "Record the call outcome verdict",
          parameters: {
            type: "object",
            properties: {
              outcome: {
                type: "string",
                enum: ["voicemail", "gatekeeper", "no_answer", "not_interested",
                       "callback_requested", "engaged_no_commit", "interested"],
              },
              interest_level: {
                type: "string",
                enum: ["interested", "not_interested", "callback", "unclear"],
              },
              qualify_as_lead: { type: "boolean" },
              reason: { type: "string", description: "1-2 sentence justification" },
            },
            required: ["outcome", "interest_level", "qualify_as_lead", "reason"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "record_outcome" } },
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`AI gateway ${resp.status}: ${t.slice(0, 200)}`);
  }
  const data = await resp.json();
  const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("No classifier output");
  return JSON.parse(args);
}

// Conservative fallback (no AI) — used only if AI gateway fails AND pre-classifier didn't fire
function fallback(transcript: string, summary: string, duration: number) {
  const turns = countCustomerTurns(transcript);
  const words = customerWordCount(transcript);
  const s = `${summary} ${transcript}`.toLowerCase();

  const pre = preClassify(transcript, summary, duration);
  if (pre) return pre;

  if (s.includes("not interested") || s.includes("no thanks") || s.includes("don't call") ||
      s.includes("do not call") || s.includes("remove me") || s.includes("stop calling"))
    return { outcome: "not_interested", interest_level: "not_interested", qualify_as_lead: false, reason: "explicit decline detected" };
  if (s.includes("call back") || s.includes("callback") || s.includes("call later"))
    return { outcome: "callback_requested", interest_level: "callback", qualify_as_lead: false, reason: "callback asked" };
  if (turns < 2 || words < 5)
    return { outcome: "no_answer", interest_level: "unclear", qualify_as_lead: false, reason: "no real conversation" };
  return { outcome: "engaged_no_commit", interest_level: "unclear", qualify_as_lead: false, reason: "fallback default" };
}

// Sanity guard: never let "not_interested" through unless the customer
// actually said a refusal phrase. Otherwise downgrade.
function sanitize(verdict: any, transcript: string, summary: string, duration: number) {
  if (!verdict || typeof verdict !== "object") return verdict;
  if (verdict.outcome !== "not_interested") return verdict;
  const blob = `${summary}\n${transcript}`.toLowerCase();
  const words = customerWordCount(transcript);
  const explicitDecline = [
    "not interested", "no thanks", "no thank you", "don't call", "do not call",
    "remove me", "stop calling", "take me off", "don't contact", "do not contact",
  ].some((k) => blob.includes(k));
  if (!explicitDecline) {
    const pre = preClassify(transcript, summary, duration);
    if (pre) return { ...pre, reason: `[sanitized] ${pre.reason}` };
    return {
      outcome: words < 5 ? "no_answer" : "engaged_no_commit",
      interest_level: "unclear",
      qualify_as_lead: false,
      reason: "Sanitized: AI returned not_interested but transcript has no explicit refusal.",
    };
  }
  return verdict;
}

export async function classifyOutcome(transcript: string, summary: string, duration: number) {
  // Deterministic pre-classifier first — voicemail / IVR / gatekeeper / no-answer
  // are decided here BEFORE the AI ever sees the call. This is the bug fix.
  const pre = preClassify(transcript, summary, duration);
  if (pre) return pre;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fallback(transcript, summary, duration);
  try {
    const verdict = await classify(apiKey, transcript, summary, duration);
    return sanitize(verdict, transcript, summary, duration);
  } catch (e) {
    console.error("classify-call-outcome AI failed, using fallback:", e);
    return fallback(transcript, summary, duration);
  }
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { transcript = "", summary = "", durationSeconds = 0, leadId } = body;

    // Optional: pull data straight from a lead+call if leadId supplied
    let tx = transcript, sm = summary, dur = durationSeconds;
    if (leadId && (!tx || !sm)) {
      const supabase = createClient(
        process.env.SUPABASE_URL ?? "",
        process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
      );
      const { data: lead } = await supabase
        .from("auto_dialer_leads")
        .select("ai_summary, call_id")
        .eq("id", leadId).maybeSingle();
      if (lead?.call_id) {
        const { data: call } = await supabase.from("calls")
          .select("transcript, duration_seconds").eq("id", lead.call_id).maybeSingle();
        tx = tx || call?.transcript || "";
        dur = dur || call?.duration_seconds || 0;
      }
      sm = sm || lead?.ai_summary || "";
    }

    const result = await classifyOutcome(tx, sm, dur);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("classify-call-outcome error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}
