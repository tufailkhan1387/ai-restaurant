// @generated from supabase/functions/elevenlabs-sync-agents — run: node backend/scripts/generate-handlers.mjs
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
    if (!ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY not configured");

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Page through ElevenLabs agents list
    const fetched: Array<{
      agent_id: string;
      name: string;
      description?: string | null;
      voice_id?: string | null;
      system_prompt?: string | null;
    }> = [];

    let cursor: string | null = null;
    let pages = 0;
    do {
      const url = new URL("https://api.elevenlabs.io/v1/convai/agents");
      url.searchParams.set("page_size", "100");
      if (cursor) url.searchParams.set("cursor", cursor);

      const res = await fetch(url.toString(), {
        headers: { "xi-api-key": ELEVENLABS_API_KEY },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`ElevenLabs list agents failed [${res.status}]: ${text}`);
      }
      const json = await res.json();
      const agents = json.agents ?? [];
      for (const a of agents) {
        fetched.push({
          agent_id: a.agent_id,
          name: a.name ?? "Unnamed Agent",
        });
      }
      cursor = json.has_more && json.next_cursor ? json.next_cursor : null;
      pages++;
      if (pages > 20) break; // safety
    } while (cursor);

    // For each agent, fetch detail (voice_id + system prompt + description)
    const detailed = await Promise.all(
      fetched.map(async (a) => {
        try {
          const res = await fetch(
            `https://api.elevenlabs.io/v1/convai/agents/${a.agent_id}`,
            { headers: { "xi-api-key": ELEVENLABS_API_KEY } },
          );
          if (!res.ok) return a;
          const d = await res.json();
          return {
            ...a,
            name: d.name ?? a.name,
            description:
              d.conversation_config?.agent?.first_message ?? null,
            voice_id: d.conversation_config?.tts?.voice_id ?? null,
            system_prompt:
              d.conversation_config?.agent?.prompt?.prompt ?? null,
          };
        } catch {
          return a;
        }
      }),
    );

    // Check if there's already an ACTIVE real default (ignore placeholder/inactive rows)
    const { data: existingDefault } = await supabase
      .from("ai_agents")
      .select("id, elevenlabs_agent_id, is_active")
      .eq("is_default", true)
      .maybeSingle();
    const hasRealDefault =
      !!existingDefault &&
      existingDefault.is_active &&
      existingDefault.elevenlabs_agent_id !== "__USE_ENV__";

    // Upsert each by elevenlabs_agent_id
    let inserted = 0;
    let updated = 0;
    for (const a of detailed) {
      const { data: existing } = await supabase
        .from("ai_agents")
        .select("id")
        .eq("elevenlabs_agent_id", a.agent_id)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("ai_agents")
          .update({
            name: a.name,
            description: a.description ?? null,
            voice_id: a.voice_id ?? null,
            system_prompt_template: a.system_prompt ?? null,
            is_active: true,
          })
          .eq("id", existing.id);
        updated++;
      } else {
        await supabase.from("ai_agents").insert({
          elevenlabs_agent_id: a.agent_id,
          name: a.name,
          description: a.description ?? null,
          voice_id: a.voice_id ?? null,
          system_prompt_template: a.system_prompt ?? null,
          is_active: true,
          is_default: !hasRealDefault && inserted === 0,
        });
        inserted++;
      }
    }

    // Mark agents not present in ElevenLabs as inactive
    const ids = detailed.map((a) => a.agent_id);
    if (ids.length > 0) {
      await supabase
        .from("ai_agents")
        .update({ is_active: false })
        .not("elevenlabs_agent_id", "in", `(${ids.map((i) => `"${i}"`).join(",")})`);
    }

    // If no active real default exists after sync, promote the first active synced agent
    const { data: currentDefault } = await supabase
      .from("ai_agents")
      .select("id, is_active, elevenlabs_agent_id")
      .eq("is_default", true)
      .maybeSingle();
    const defaultIsValid =
      currentDefault &&
      currentDefault.is_active &&
      currentDefault.elevenlabs_agent_id !== "__USE_ENV__";
    if (!defaultIsValid) {
      // Clear any stale defaults
      await supabase
        .from("ai_agents")
        .update({ is_default: false })
        .eq("is_default", true);
      const { data: firstActive } = await supabase
        .from("ai_agents")
        .select("id")
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (firstActive) {
        await supabase
          .from("ai_agents")
          .update({ is_default: true })
          .eq("id", firstActive.id);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        total: detailed.length,
        inserted,
        updated,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("sync-agents error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}
