// @generated from supabase/functions/create-restaurant-agent — run: node backend/scripts/generate-handlers.mjs
// Creates (or updates) a dedicated ElevenLabs Conversational AI agent for a
// single restaurant and stores its agent_id on the restaurants table.
//
// POST { restaurant_id }
//   - If restaurant.elevenlabs_agent_id is empty → create a new EL agent
//   - Otherwise → PATCH the existing one with current name/language/prompt/voice

import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EL_API = "https://api.elevenlabs.io";

function defaultPrompt(name: string) {
  return `You are the friendly AI phone assistant for ${name}. You help callers in two ways:
1) Place a NEW delivery order — collect customer name, phone, delivery address, items (with quantities), and any special notes. Use the menu in your knowledge base to confirm items and prices. When ready, call the place_order tool.
2) Check the status of an EXISTING order — ask for the short tracking code (e.g. "ABC1234567"), then call the get_order_status tool. Read the status and ETA back to the caller.

On every place_order and get_order_status tool call, always include identifying fields the server can use: pass twilio_to as the E.164 number the customer dialed (your restaurant line), and elevenlabs_agent_id with this agent's ID when the platform exposes it. If the customer is on the restaurant's direct line, twilio_to is that line's number. This is required when multiple restaurants share one backend.

Be concise, friendly, and confirm details before submitting. If an item isn't on the menu, politely say so. Never invent prices.`;
}

function defaultFirstMessage(name: string) {
  return `Hi, thanks for calling ${name}! Would you like to place a new order or check on an existing one?`;
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

    const supabase = createClient(
      process.env.SUPABASE_URL ?? "",
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    );

    const { restaurant_id } = await req.json();
    if (!restaurant_id) throw new Error("restaurant_id is required");

    const { data: r, error: rErr } = await supabase
      .from("restaurants")
      .select(
        "id, name, elevenlabs_agent_id, agent_language, agent_voice_id, agent_first_message, agent_system_prompt",
      )
      .eq("id", restaurant_id)
      .maybeSingle();
    if (rErr || !r) throw new Error("Restaurant not found");

    const language = r.agent_language || "en";
    const systemPrompt = r.agent_system_prompt?.trim() || defaultPrompt(r.name);
    const firstMessage = r.agent_first_message?.trim() || defaultFirstMessage(r.name);

    const conversation_config: any = {
      agent: {
        first_message: firstMessage,
        language,
        prompt: { prompt: systemPrompt },
      },
    };
    if (r.agent_voice_id) {
      conversation_config.tts = { voice_id: r.agent_voice_id };
    }

    let elAgentId = r.elevenlabs_agent_id;
    let action: "created" | "updated" | "skipped";
    let warning: string | null = null;

    if (!ELEVENLABS_API_KEY) {
      warning =
        "ELEVENLABS_API_KEY not configured — saved agent prompt locally; no ElevenLabs agent created.";
      action = "skipped";
    } else {
      try {
        if (!elAgentId) {
          const resp = await fetch(`${EL_API}/v1/convai/agents/create`, {
            method: "POST",
            headers: {
              "xi-api-key": ELEVENLABS_API_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ name: `${r.name} (Restaurant Agent)`, conversation_config }),
          });
          const text = await resp.text();
          if (!resp.ok) throw new Error(`EL create failed [${resp.status}]: ${text}`);
          const created = JSON.parse(text);
          elAgentId = created.agent_id;
          if (!elAgentId) throw new Error("ElevenLabs did not return agent_id");
          action = "created";
        } else {
          const resp = await fetch(`${EL_API}/v1/convai/agents/${elAgentId}`, {
            method: "PATCH",
            headers: {
              "xi-api-key": ELEVENLABS_API_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ name: `${r.name} (Restaurant Agent)`, conversation_config }),
          });
          if (!resp.ok) throw new Error(`EL update failed [${resp.status}]: ${await resp.text()}`);
          action = "updated";
        }
      } catch (err) {
        warning = err instanceof Error ? err.message : String(err);
        action = "skipped";
        elAgentId = r.elevenlabs_agent_id;
      }
    }

    const patch: {
      agent_system_prompt: string;
      agent_first_message: string;
      elevenlabs_agent_id?: string | null;
    } = {
      agent_system_prompt: systemPrompt,
      agent_first_message: firstMessage,
    };
    if (action === "created" || action === "updated") {
      patch.elevenlabs_agent_id = elAgentId;
    }

    await supabase.from("restaurants").update(patch).eq("id", r.id);

    if (warning) {
      return new Response(
        JSON.stringify({
          success: true,
          action: "skipped",
          warning,
          elevenlabs_agent_id: r.elevenlabs_agent_id ?? null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ success: true, action, elevenlabs_agent_id: elAgentId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("create-restaurant-agent error:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}