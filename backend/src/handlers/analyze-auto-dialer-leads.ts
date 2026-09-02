// @generated from supabase/functions/analyze-auto-dialer-leads — run: node backend/scripts/generate-handlers.mjs
// Pre-call AI analysis: generates a personalised pitch script + talking points
// for each pending lead in a session. Uses Lovable AI Gateway (no key needed).

import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FOLLOWUP_SYSTEM = `You are a sales strategist for QubeTech (qubetech.us), a technology services company in Washington DC.
Given a single client's prior pitch history, generate a concise, personalised outbound-call playbook
that the AI calling agent will follow. The playbook MUST include guidance for these scenarios:
- If a receptionist or gatekeeper answers: politely ask to speak with the decision-maker by name (use client_name if it sounds like a contact, otherwise ask for "the owner" or "the person who handles your website / IT").
- If put on hold for more than ~30 seconds: politely end the call and request a callback.
- If routed to voicemail / IVR: leave a brief 15-second message including QubeTech name, callback number (201) 479-9258, and the reason for calling.
- If an extension is needed: use the dial_extension tool (the AI will have it).
Return ONLY a JSON object via the provided tool.`;

const COLD_PITCH_SYSTEM = `You are a sales strategist for QubeTech (qubetech.us), a digital agency in Washington DC offering:
website redesign / development, mobile & web app dev, SaaS development, AI integrations & chatbots,
logo & branding, SEO, e-commerce, CRM/automation, and custom software.

Given a COLD prospect (we have NOT contacted them before) and an analysis of their existing website,
generate a tailored discovery call playbook. Steps:
1. Identify the prospect's likely industry, target customers, and 2-3 concrete pain points / opportunities.
2. Pick the 2-3 services from QubeTech's catalog that would deliver the most value to THIS prospect,
   each with a one-line rationale tied to what you observed on their site.
3. Build a friendly opening that references something specific (current website, their service, location)
   so they don't feel cold-called.
4. Build a 3-5 sentence pitch script the AI agent can adapt naturally.
5. Cover gatekeeper / hold / voicemail / extension scenarios same as follow-up calls.
Always end by asking for a 15-minute discovery call or a follow-up email.`;

async function analyzeLead(lead: any, apiKey: string, campaignType: string, websiteAnalysis: any) {
  const isCold = campaignType === "cold_pitch";
  const systemPrompt = isCold ? COLD_PITCH_SYSTEM : FOLLOWUP_SYSTEM;

  const userPrompt = isCold
    ? `Cold prospect:
- Company: ${lead.company || lead.client_name || "Unknown"}
- Contact name (if any): ${lead.client_name || "n/a"}
- Website: ${lead.website_url || "n/a"}
- City / notes: ${lead.additional_notes || "n/a"}

Website analysis:
${websiteAnalysis ? JSON.stringify(websiteAnalysis, null, 2) : "(analysis unavailable — make reasonable assumptions from the company name)"}

Generate a tailored 2-3 minute discovery-call playbook.`
    : `Client info:
- Name: ${lead.client_name || "Unknown"}
- Company: ${lead.company || "Unknown"}
- Email: ${lead.email || "n/a"}
- Previously pitched for: ${lead.pitched_for || "n/a"}
- Services already delivered: ${lead.services_done || "none"}
- Additional notes: ${lead.additional_notes || "none"}

Generate a tailored 2-3 minute follow-up call playbook.`;

  const coldFields = isCold ? {
    industry: { type: "string", description: "Detected industry / vertical." },
    target_customers: { type: "string", description: "Who the prospect serves." },
    pain_points: {
      type: "array",
      items: { type: "string" },
      description: "2-3 concrete pain points or opportunities observed on their site.",
    },
    recommended_services: {
      type: "array",
      items: {
        type: "object",
        properties: {
          service: { type: "string", description: "QubeTech service name (e.g. Website Redesign, AI Chatbot, App Development)." },
          rationale: { type: "string", description: "Why this service fits THIS prospect (1 sentence)." },
        },
        required: ["service", "rationale"],
      },
      description: "Top 2-3 services to pitch, ranked.",
    },
  } : {};

  const required = isCold
    ? ["opening_hook", "pitch_script", "talking_points", "next_step_ask",
       "industry", "pain_points", "recommended_services"]
    : ["opening_hook", "pitch_script", "talking_points", "next_step_ask"];

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "create_pitch_playbook",
            description: "Generate a personalised outbound call playbook",
            parameters: {
              type: "object",
              properties: {
                opening_hook: { type: "string", description: "Friendly personalised opening line (1-2 sentences)." },
                pitch_script: { type: "string", description: "3-5 sentence script the agent should adapt." },
                talking_points: {
                  type: "array",
                  items: { type: "string" },
                  description: "3-5 bullet points the agent should cover.",
                },
                objection_handlers: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      objection: { type: "string" },
                      response: { type: "string" },
                    },
                    required: ["objection", "response"],
                  },
                  description: "2-3 likely objections + responses.",
                },
                next_step_ask: { type: "string", description: "Specific next step to propose if interest is shown." },
                ...coldFields,
              },
              required,
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "create_pitch_playbook" } },
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    const err: any = new Error(`AI gateway ${resp.status}: ${txt}`);
    err.status = resp.status;
    // OpenAI returns "Please try again in 20s" — extract it for smarter backoff
    const m = txt.match(/try again in ([\d.]+)\s*(ms|s)/i);
    if (m) {
      const v = parseFloat(m[1]);
      err.retryAfterMs = m[2].toLowerCase() === "ms" ? v : v * 1000;
    }
    throw err;
  }

  const data = await resp.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) throw new Error("No tool call returned");
  return JSON.parse(toolCall.function.arguments);
}

async function fetchWebsiteAnalysis(url: string, apiKey: string): Promise<any | null> {
  if (!url) return null;
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: `You analyse small/mid-business websites for a digital agency. Return ONLY JSON via the provided tool: industry, target_customers, missing_or_weak_services (array), design_score (0-100), seo_issues (array), mobile_friendly (bool), tech_stack (array), summary (1-2 sentences). Make best-effort inferences from the URL/company name even if you cannot fetch the site.` },
          { role: "user", content: `Analyse: ${url}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "return_analysis",
            parameters: {
              type: "object",
              properties: {
                industry: { type: "string" },
                target_customers: { type: "string" },
                missing_or_weak_services: { type: "array", items: { type: "string" } },
                design_score: { type: "number" },
                seo_issues: { type: "array", items: { type: "string" } },
                mobile_friendly: { type: "boolean" },
                tech_stack: { type: "array", items: { type: "string" } },
                summary: { type: "string" },
              },
              required: ["industry", "summary"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_analysis" } },
      }),
    });
    if (!resp.ok) {
      // Bubble up 429s so the outer retry loop can back off; swallow other errors.
      if (resp.status === 429) {
        const txt = await resp.text();
        const err: any = new Error(`AI gateway 429: ${txt}`);
        err.status = 429;
        const m = txt.match(/try again in ([\d.]+)\s*(ms|s)/i);
        if (m) {
          const v = parseFloat(m[1]);
          err.retryAfterMs = m[2].toLowerCase() === "ms" ? v : v * 1000;
        }
        throw err;
      }
      return null;
    }
    const data = await resp.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    return args ? JSON.parse(args) : null;
  } catch (e) {
    if ((e as any)?.status === 429) throw e;
    console.error("fetchWebsiteAnalysis failed:", e);
    return null;
  }
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sessionId } = await req.json();
    if (!sessionId) {
      return new Response(JSON.stringify({ error: "sessionId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

    const supabase = createClient(
      process.env.SUPABASE_URL ?? "",
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    );

    // Load campaign type so we know whether to run cold-pitch flow
    const { data: sessionRow } = await supabase
      .from("auto_dialer_sessions")
      .select("campaign_type")
      .eq("id", sessionId)
      .maybeSingle();
    const campaignType = (sessionRow as any)?.campaign_type || "follow_up";

    const { data: leads, error } = await supabase
      .from("auto_dialer_leads")
      .select("*")
      .eq("session_id", sessionId)
      .in("analysis_status", ["pending", "failed"]);

    if (error) throw error;

    const totalToAnalyze = leads?.length ?? 0;
    let analyzed = 0;
    let failed = 0;
    let fatalQuotaError: string | null = null;
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];

    // Pace requests to respect OpenAI RPM (default 3 RPM on free tier).
    // Configurable via OPENAI_RPM secret. We pace at ~80% of the limit to leave
    // headroom for the optional website-analysis call on cold pitches.
    const rpm = Math.max(1, parseInt(process.env.OPENAI_RPM ?? "3", 10));
    const baseDelayMs = Math.ceil((60_000 / rpm) * 1.25);
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    // Retry helper: on 429, wait the suggested retry-after (or exponential backoff) and try again.
    async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 5): Promise<T> {
      let attempt = 0;
      while (true) {
        try {
          return await fn();
        } catch (e: any) {
          attempt++;
          const isRate = e?.status === 429 || /rate.?limit|429/i.test(e?.message || "");
          if (!isRate || attempt >= maxAttempts) throw e;
          const wait = (e.retryAfterMs ?? Math.min(60_000, 2_000 * Math.pow(2, attempt))) + 500;
          console.log(`Rate limited; retry ${attempt}/${maxAttempts} after ${wait}ms`);
          await sleep(wait);
        }
      }
    }

    // Long-running work — must run in background to avoid the 150s edge idle timeout.
    // The UI watches `analysis_status` per lead via realtime, so no need to await.
    const work = (async () => {
      for (const lead of leads ?? []) {
        if (fatalQuotaError) {
          await supabase
            .from("auto_dialer_leads")
            .update({ analysis_status: "failed", ai_summary: `Analysis failed (quota): ${fatalQuotaError}` })
            .eq("id", lead.id);
          failed++;
          results.push({ id: lead.id, ok: false, error: fatalQuotaError });
          continue;
        }
        try {
          await supabase
            .from("auto_dialer_leads")
            .update({ analysis_status: "analyzing" })
            .eq("id", lead.id);

          let websiteAnalysis: any = null;
          if (campaignType === "cold_pitch" && lead.website_url) {
            websiteAnalysis = await withRetry(() => fetchWebsiteAnalysis(lead.website_url, apiKey));
            await sleep(baseDelayMs);
          }

          const playbook = await withRetry(() =>
            analyzeLead(lead, apiKey, campaignType, websiteAnalysis),
          );

          const update: Record<string, unknown> = {
            analysis_status: "ready",
            ai_pitch_script: playbook.pitch_script,
            ai_talking_points: playbook,
          };
          if (campaignType === "cold_pitch") {
            update.industry = playbook.industry || websiteAnalysis?.industry || null;
            update.pain_points = playbook.pain_points || null;
            update.recommended_services = playbook.recommended_services || null;
            update.analysis_source = websiteAnalysis ? "website+ai" : "ai_only";
            if (!lead.pitched_for && Array.isArray(playbook.recommended_services) && playbook.recommended_services[0]) {
              update.pitched_for = playbook.recommended_services[0].service;
            }
          }

          await supabase
            .from("auto_dialer_leads")
            .update(update)
            .eq("id", lead.id);

          analyzed++;
          results.push({ id: lead.id, ok: true });
          await sleep(baseDelayMs);
        } catch (e: any) {
          failed++;
          results.push({ id: lead.id, ok: false, error: e.message });
          const isQuota = /402|payment_required|insufficient_quota|exceeded your current quota|billing/i.test(e.message || "");
          if (isQuota) fatalQuotaError = e.message;
          await supabase
            .from("auto_dialer_leads")
            .update({ analysis_status: "failed", ai_summary: `Analysis failed: ${e.message}` })
            .eq("id", lead.id);
        }
      }

      if (fatalQuotaError) {
        await supabase
          .from("auto_dialer_sessions")
          .update({ status: "paused" })
          .eq("id", sessionId)
          .in("status", ["running", "scheduled", "draft"]);
        await supabase.from("auto_dialer_events").insert({
          session_id: sessionId,
          event_type: "campaign_paused",
          message: "Campaign auto-paused: AI analysis failed (OpenAI quota/billing issue). Add credits to your OpenAI account and resume.",
          metadata: { reason: "ai_quota_exhausted", error: fatalQuotaError, failed_count: failed },
        });
      }

      await supabase.from("auto_dialer_events").insert({
        session_id: sessionId,
        event_type: "leads_analyzed",
        message: `AI analysis finished: ${analyzed} ready, ${failed} failed`,
        metadata: { analyzed, failed, total: totalToAnalyze },
      });
    })();

    // @ts-ignore - EdgeRuntime is provided by Supabase Edge Runtime
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(work);
    } else {
      // Fallback: fire-and-forget
      work.catch((e) => console.error("Background analysis failed:", e));
    }

    return new Response(
      JSON.stringify({
        success: true,
        queued: true,
        total: totalToAnalyze,
        message: `Analysing ${totalToAnalyze} leads in the background. Watch the leads list for live status updates.`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("analyze-auto-dialer-leads error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
}
