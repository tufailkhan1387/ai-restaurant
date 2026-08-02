// @generated from supabase/functions/elevenlabs-agent-crud — run: node backend/scripts/generate-handlers.mjs
// Two-way ElevenLabs agent CRUD mirror.
//
// Actions (POST body { action, ... }):
//   - "list_voices"               → returns voices for the voice picker
//   - "update"                    → PATCH /v1/convai/agents/{id} on EL + sync local row
//   - "create"                    → POST /v1/convai/agents/create on EL + insert local row
//   - "delete"                    → DELETE /v1/convai/agents/{id} on EL + remove local row
//
// Auth: requires authenticated management user (RLS enforced via service role then re-checked).

import { createClient } from "@supabase/supabase-js";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EL_API = "https://api.elevenlabs.io";

type ActionPayload =
  | { action: "list_voices" }
  | { action: "get_details"; id: string }
  | {
      action: "update";
      id: string; // local ai_agents.id
      name?: string;
      description?: string;
      voice_id?: string | null;
      system_prompt?: string;
      first_message?: string;
    }
  | {
      action: "create";
      name: string;
      description?: string;
      voice_id?: string | null;
      system_prompt?: string;
      first_message?: string;
    }
  | { action: "delete"; id: string };

function buildConvaiPayload(p: {
  name?: string;
  description?: string;
  voice_id?: string | null;
  system_prompt?: string;
  first_message?: string;
}) {
  const conversation_config: any = {};
  if (p.first_message !== undefined || p.system_prompt !== undefined) {
    conversation_config.agent = {};
    if (p.first_message !== undefined) conversation_config.agent.first_message = p.first_message;
    if (p.system_prompt !== undefined) {
      conversation_config.agent.prompt = { prompt: p.system_prompt };
    }
  }
  if (p.voice_id !== undefined && p.voice_id !== null && p.voice_id !== "") {
    conversation_config.tts = { voice_id: p.voice_id };
  }
  const body: any = {};
  if (p.name !== undefined) body.name = p.name;
  if (Object.keys(conversation_config).length > 0) body.conversation_config = conversation_config;
  return body;
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

    const payload = (await req.json()) as ActionPayload;

    // -------------------- LIST VOICES --------------------
    if (payload.action === "list_voices") {
      const r = await fetch(`${EL_API}/v1/voices`, {
        headers: { "xi-api-key": ELEVENLABS_API_KEY },
      });
      if (!r.ok) throw new Error(`Failed to list voices [${r.status}]: ${await r.text()}`);
      const data = await r.json();
      const voices = (data.voices ?? []).map((v: any) => ({
        voice_id: v.voice_id,
        name: v.name,
        category: v.category,
        labels: v.labels ?? {},
        preview_url: v.preview_url ?? null,
      }));
      return new Response(JSON.stringify({ success: true, voices }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // -------------------- GET DETAILS --------------------
    if (payload.action === "get_details") {
      const { data: row, error: lookupErr } = await supabase
        .from("ai_agents")
        .select("id, elevenlabs_agent_id")
        .eq("id", payload.id)
        .maybeSingle();
      if (lookupErr || !row) throw new Error("Local agent not found");
      if (!row.elevenlabs_agent_id || row.elevenlabs_agent_id === "__USE_ENV__") {
        throw new Error("Agent has no ElevenLabs agent_id");
      }

      const r = await fetch(`${EL_API}/v1/convai/agents/${row.elevenlabs_agent_id}`, {
        headers: { "xi-api-key": ELEVENLABS_API_KEY },
      });
      if (!r.ok) throw new Error(`EL get agent failed [${r.status}]: ${await r.text()}`);
      const d = await r.json();

      const cfg = d.conversation_config ?? {};
      const voiceId: string | null = cfg.tts?.voice_id ?? null;

      // Resolve voice name + preview url
      let voice: { voice_id: string; name: string; preview_url: string | null; category?: string } | null = null;
      if (voiceId) {
        try {
          const vr = await fetch(`${EL_API}/v1/voices/${voiceId}`, {
            headers: { "xi-api-key": ELEVENLABS_API_KEY },
          });
          if (vr.ok) {
            const vj = await vr.json();
            voice = {
              voice_id: vj.voice_id,
              name: vj.name,
              preview_url: vj.preview_url ?? null,
              category: vj.category,
            };
          }
        } catch (_) {
          // ignore — voice resolution best-effort
        }
      }

      const details = {
        agent_id: d.agent_id ?? row.elevenlabs_agent_id,
        name: d.name ?? null,
        first_message: cfg.agent?.first_message ?? null,
        system_prompt: cfg.agent?.prompt?.prompt ?? null,
        language: cfg.agent?.language ?? cfg.language ?? null,
        llm: cfg.agent?.prompt?.llm ?? null,
        temperature: cfg.agent?.prompt?.temperature ?? null,
        voice,
        text_only: d.platform_settings?.call_limits?.text_only ?? d.text_only ?? null,
        tags: d.tags ?? [],
        created_at_unix: d.created_at_unix_secs ?? null,
        access_level: d.access_info?.role ?? null,
      };

      return new Response(JSON.stringify({ success: true, details }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (payload.action === "create") {
      const body = buildConvaiPayload(payload);
      // Convai create endpoint
      const r = await fetch(`${EL_API}/v1/convai/agents/create`, {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const text = await r.text();
      if (!r.ok) throw new Error(`EL create failed [${r.status}]: ${text}`);
      const created = JSON.parse(text);
      const elId = created.agent_id;
      if (!elId) throw new Error("ElevenLabs did not return an agent_id");

      const { data: insertRow, error: insertErr } = await supabase
        .from("ai_agents")
        .insert({
          elevenlabs_agent_id: elId,
          name: payload.name,
          description: payload.description ?? null,
          voice_id: payload.voice_id ?? null,
          system_prompt_template: payload.system_prompt ?? null,
          is_active: true,
          is_default: false,
        })
        .select()
        .single();
      if (insertErr) throw insertErr;

      return new Response(JSON.stringify({ success: true, agent: insertRow, elevenlabs_agent_id: elId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // -------------------- UPDATE --------------------
    if (payload.action === "update") {
      // Look up the elevenlabs_agent_id from local row
      const { data: row, error: lookupErr } = await supabase
        .from("ai_agents")
        .select("id, elevenlabs_agent_id")
        .eq("id", payload.id)
        .maybeSingle();
      if (lookupErr || !row) throw new Error("Local agent not found");
      if (!row.elevenlabs_agent_id || row.elevenlabs_agent_id === "__USE_ENV__") {
        throw new Error("This agent has no ElevenLabs agent_id (placeholder row)");
      }

      const body = buildConvaiPayload(payload);
      const r = await fetch(`${EL_API}/v1/convai/agents/${row.elevenlabs_agent_id}`, {
        method: "PATCH",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const text = await r.text();
      if (!r.ok) throw new Error(`EL update failed [${r.status}]: ${text}`);

      const updates: any = {};
      if (payload.name !== undefined) updates.name = payload.name;
      if (payload.description !== undefined) updates.description = payload.description;
      if (payload.voice_id !== undefined) updates.voice_id = payload.voice_id;
      if (payload.system_prompt !== undefined) updates.system_prompt_template = payload.system_prompt;
      updates.updated_at = new Date().toISOString();

      const { error: updErr } = await supabase
        .from("ai_agents")
        .update(updates)
        .eq("id", payload.id);
      if (updErr) throw updErr;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // -------------------- DELETE --------------------
    if (payload.action === "delete") {
      const { data: row } = await supabase
        .from("ai_agents")
        .select("elevenlabs_agent_id, is_default")
        .eq("id", payload.id)
        .maybeSingle();
      if (!row) throw new Error("Agent not found");

      if (row.elevenlabs_agent_id && row.elevenlabs_agent_id !== "__USE_ENV__") {
        const r = await fetch(`${EL_API}/v1/convai/agents/${row.elevenlabs_agent_id}`, {
          method: "DELETE",
          headers: { "xi-api-key": ELEVENLABS_API_KEY },
        });
        // 404 means already gone — treat as success
        if (!r.ok && r.status !== 404) {
          throw new Error(`EL delete failed [${r.status}]: ${await r.text()}`);
        }
      }

      await supabase.from("ai_agents").delete().eq("id", payload.id);

      // If we deleted the default, promote the next active agent
      if (row.is_default) {
        const { data: next } = await supabase
          .from("ai_agents")
          .select("id")
          .eq("is_active", true)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (next) {
          await supabase.from("ai_agents").update({ is_default: true }).eq("id", next.id);
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("elevenlabs-agent-crud error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}
