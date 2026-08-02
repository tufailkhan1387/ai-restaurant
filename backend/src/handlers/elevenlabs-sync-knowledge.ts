// @generated from supabase/functions/elevenlabs-sync-knowledge — run: node backend/scripts/generate-handlers.mjs
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AgentConfig {
  agent_id: string;
  name: string;
  conversation_config: {
    agent: {
      prompt: {
        prompt: string;
        llm: string;
        temperature: number;
        max_tokens: number;
      };
      first_message: string;
      language: string;
    };
  };
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action } = await req.json();
    
    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
    const ELEVENLABS_AGENT_ID = process.env.ELEVENLABS_AGENT_ID;
    
    if (!ELEVENLABS_API_KEY || !ELEVENLABS_AGENT_ID) {
      return new Response(
        JSON.stringify({ error: "ElevenLabs credentials not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = process.env.SUPABASE_URL ?? "";
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (action === "push") {
      // Push knowledge from our DB to ElevenLabs agent prompt
      const { data: knowledge, error: kbError } = await supabase
        .from("agent_knowledge")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");

      if (kbError) {
        throw new Error(`Failed to fetch knowledge: ${kbError.message}`);
      }

      // Format knowledge as structured prompt content
      const knowledgeText = knowledge
        .map((k) => `## ${k.title}\nCategory: ${k.category}\n\n${k.content}`)
        .join("\n\n---\n\n");

      // Pull restaurant menu, deals, settings into the agent context
      const [{ data: settings }, { data: categories }, { data: items }, { data: deals }] = await Promise.all([
        supabase.from("restaurant_settings").select("*").maybeSingle(),
        supabase.from("menu_categories").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("menu_items").select("*").eq("is_available", true).order("sort_order"),
        supabase.from("deals").select("*").eq("is_active", true),
      ]);

      const itemsByCat = new Map<string, any[]>();
      for (const it of items || []) {
        const k = it.category_id || "uncat";
        if (!itemsByCat.has(k)) itemsByCat.set(k, []);
        itemsByCat.get(k)!.push(it);
      }

      let restaurantText = "";
      if (settings) {
        restaurantText += `# RESTAURANT: ${settings.name}\n`;
        if (settings.phone) restaurantText += `Phone: ${settings.phone}\n`;
        if (settings.address) restaurantText += `Address: ${settings.address}\n`;
        restaurantText += `Currency: ${settings.currency} | Tax: ${settings.tax_rate}% | Delivery fee: ${settings.delivery_fee} | Min order: ${settings.min_order_amount}\n`;
        restaurantText += `Status: ${settings.is_open ? "OPEN" : "CLOSED"}\n\n`;
      }
      restaurantText += `# MENU\n`;
      for (const cat of categories || []) {
        restaurantText += `\n## ${cat.name}\n`;
        for (const it of itemsByCat.get(cat.id) || []) {
          restaurantText += `- ${it.name} — $${it.price}${it.description ? ` (${it.description})` : ""}\n`;
        }
      }
      const uncat = itemsByCat.get("uncat");
      if (uncat?.length) {
        restaurantText += `\n## Other\n`;
        for (const it of uncat) restaurantText += `- ${it.name} — $${it.price}\n`;
      }
      if (deals?.length) {
        restaurantText += `\n# CURRENT DEALS\n`;
        for (const d of deals) {
          restaurantText += `- ${d.name} — $${d.price}${d.original_price ? ` (was $${d.original_price})` : ""}${d.description ? ` — ${d.description}` : ""}\n`;
        }
      }
      restaurantText += `\n# ORDER TAKING INSTRUCTIONS\nWhen a customer wants to order: collect their full name, phone number, complete delivery address, and the items they want with quantities. Confirm the full order back to them before ending the call. Mention applicable deals when relevant.`;

      // Get current agent config
      const agentResponse = await fetch(
        `https://api.elevenlabs.io/v1/convai/agents/${ELEVENLABS_AGENT_ID}`,
        {
          headers: {
            "xi-api-key": ELEVENLABS_API_KEY,
          },
        }
      );

      if (!agentResponse.ok) {
        throw new Error("Failed to fetch agent config");
      }

      const agentConfig: AgentConfig = await agentResponse.json();
      
      // Extract base prompt (before knowledge section)
      let basePrompt = agentConfig.conversation_config.agent.prompt.prompt;
      const knowledgeMarker = "## KNOWLEDGE BASE ##";
      const markerIndex = basePrompt.indexOf(knowledgeMarker);
      
      if (markerIndex !== -1) {
        basePrompt = basePrompt.substring(0, markerIndex).trim();
      }

      // Append new knowledge
      const updatedPrompt = `${basePrompt}\n\n${knowledgeMarker}\n\n${restaurantText}\n\n---\n\n${knowledgeText}`;

      // Update agent
      const updateResponse = await fetch(
        `https://api.elevenlabs.io/v1/convai/agents/${ELEVENLABS_AGENT_ID}`,
        {
          method: "PATCH",
          headers: {
            "xi-api-key": ELEVENLABS_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            conversation_config: {
              agent: {
                prompt: {
                  prompt: updatedPrompt,
                },
              },
            },
          }),
        }
      );

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        throw new Error(`Failed to update agent: ${errorText}`);
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Synced ${knowledge.length} knowledge items to ElevenLabs agent`,
          items_synced: knowledge.length,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else if (action === "pull") {
      // Pull agent config from ElevenLabs to view current state
      const agentResponse = await fetch(
        `https://api.elevenlabs.io/v1/convai/agents/${ELEVENLABS_AGENT_ID}`,
        {
          headers: {
            "xi-api-key": ELEVENLABS_API_KEY,
          },
        }
      );

      if (!agentResponse.ok) {
        throw new Error("Failed to fetch agent config");
      }

      const agentConfig = await agentResponse.json();

      return new Response(
        JSON.stringify({ 
          success: true, 
          agent: {
            name: agentConfig.name,
            first_message: agentConfig.conversation_config?.agent?.first_message,
            language: agentConfig.conversation_config?.agent?.language,
            prompt_length: agentConfig.conversation_config?.agent?.prompt?.prompt?.length || 0,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else if (action === "status") {
      // Check connection status
      const agentResponse = await fetch(
        `https://api.elevenlabs.io/v1/convai/agents/${ELEVENLABS_AGENT_ID}`,
        {
          headers: {
            "xi-api-key": ELEVENLABS_API_KEY,
          },
        }
      );

      return new Response(
        JSON.stringify({ 
          connected: agentResponse.ok,
          agent_id: ELEVENLABS_AGENT_ID,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else {
      return new Response(
        JSON.stringify({ error: "Invalid action. Use: push, pull, or status" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (error) {
    console.error("Knowledge sync error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}
