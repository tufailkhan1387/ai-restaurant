import { getKnex } from "../db.js";

const EL_API = "https://api.elevenlabs.io";

function defaultPrompt(name) {
  return `You are the friendly AI phone assistant for ${name}. You help callers in two ways:
1) Place a NEW delivery order — collect customer name, phone, delivery address, items (with quantities), and any special notes. Use the menu in your knowledge base to confirm items and prices. When ready, call the place_order tool.
2) Check the status of an EXISTING order — ask for the short tracking code (e.g. "ABC1234567"), then call the get_order_status tool. Read the status and ETA back to the caller.

IMPORTANT AVAILABILITY RULES:
- Check your knowledge base for items marked as OUT OF ORDER / OUT OF STOCK.
- NEVER accept or place an order for out-of-order items. If a caller asks for an out-of-order item, politely apologize and say: "I am sorry, [item name] is currently out of order today. Would you like to try another item from our menu instead?"

Be concise, friendly, and confirm details before submitting. If an item isn't on the menu, politely say so. Never invent prices.`;
}

function defaultFirstMessage(name) {
  return `Hi, thanks for calling ${name}! Would you like to place a new order or check on an existing one?`;
}

const TOOLS_CONFIG = [
  {
    name: "place_order",
    description: "Use this to place a food delivery order. Call ONLY when you have: customer name, phone, delivery address, and items.",
    parameters: {
      type: "object",
      properties: {
        customer_name: { type: "string" },
        customer_phone: { type: "string" },
        delivery_address: { type: "string" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              quantity: { type: "integer" },
              notes: { type: "string" }
            }
          }
        }
      },
      required: ["customer_name", "customer_phone", "delivery_address", "items"]
    }
  },
  {
    name: "get_order_status",
    description: "Check the status of a food order using the customer's tracking code.",
    parameters: {
      type: "object",
      properties: {
        tracking_code: { type: "string", description: "The 10-char tracking code from the receipt" }
      },
      required: ["tracking_code"]
    }
  }
];

export async function createRestaurantAgent(req, res) {
  res.set("Access-Control-Allow-Origin", "*");
  try {
    const knex = getKnex();
    const { restaurant_id } = req.body || {};
    if (!restaurant_id) return res.status(400).json({ error: "restaurant_id is required" });

    const r = await knex("restaurants").where({ id: restaurant_id }).first();
    if (!r) return res.status(404).json({ error: "Restaurant not found" });

    const API_KEY = r.elevenlabs_api_key || process.env.ELEVENLABS_API_KEY;
    const systemPrompt = (r.agent_system_prompt || "").trim() || defaultPrompt(r.name);
    const firstMessage = (r.agent_first_message || "").trim() || defaultFirstMessage(r.name);

    let elAgentId = r.elevenlabs_agent_id;
    let action = "skipped";
    let warning = null;

    if (!API_KEY) {
      warning = "ELEVENLABS_API_KEY not configured — saved agent prompt locally; no ElevenLabs agent created.";
      action = "skipped";
    } else {
      try {
        // 1. Create Tools (or find if they exist)
        const toolIds = [];
        const ngrokUrl = process.env.PUBLIC_URL || "";

        if (ngrokUrl && ngrokUrl !== "YOUR_NGROK_URL") {
          for (const toolSpec of TOOLS_CONFIG) {
            const endpoint = toolSpec.name === "place_order" ? "ai-place-order" : "ai-order-status";
            const webhookUrl = `${ngrokUrl}/api/functions/${endpoint}`;
            
            try {
              const resp = await fetch(`${EL_API}/v1/convai/tools`, {
                method: "POST",
                headers: { "xi-api-key": API_KEY, "Content-Type": "application/json" },
                body: JSON.stringify({
                  name: toolSpec.name,
                  description: toolSpec.description,
                  api_schema: {
                    request_body_schema: toolSpec.parameters,
                    url: webhookUrl,
                    method: "POST"
                  }
                }),
              });
              
              const data = await resp.json();
              if (resp.ok && data.tool_id) {
                toolIds.push(data.tool_id);
              }
            } catch (tErr) {
              console.warn(`Tool setup notice for ${toolSpec.name}:`, tErr.message);
            }
          }
        }

        // 2. Create or Update Agent
        const conversation_config = {
          agent: {
            first_message: firstMessage,
            prompt: { prompt: systemPrompt },
            ...(toolIds.length > 0 ? { tools: toolIds.map(id => ({ type: "webhook", tool_id: id })) } : {})
          }
        };

        if (r.agent_voice_id) {
          conversation_config.tts = { voice_id: r.agent_voice_id };
        }

        if (!elAgentId) {
          const resp = await fetch(`${EL_API}/v1/convai/agents/create`, {
            method: "POST",
            headers: { "xi-api-key": API_KEY, "Content-Type": "application/json" },
            body: JSON.stringify({ name: `${r.name} (Automated Agent)`, conversation_config }),
          });

          const text = await resp.text();
          if (!resp.ok) {
            let msg = text;
            try {
              const p = JSON.parse(text);
              msg = p.detail?.message || p.message || text;
            } catch {}
            throw new Error(`ElevenLabs notice: ${msg}`);
          }
          const created = JSON.parse(text);
          elAgentId = created.agent_id;
          action = "created";
        } else {
          const resp = await fetch(`${EL_API}/v1/convai/agents/${elAgentId}`, {
            method: "PATCH",
            headers: { "xi-api-key": API_KEY, "Content-Type": "application/json" },
            body: JSON.stringify({ name: `${r.name} (Automated Agent)`, conversation_config }),
          });
          if (!resp.ok) {
            const text = await resp.text();
            let msg = text;
            try {
              const p = JSON.parse(text);
              msg = p.detail?.message || p.message || text;
            } catch {}
            throw new Error(`ElevenLabs notice: ${msg}`);
          }
          action = "updated";
        }
      } catch (err) {
        console.warn("⚠️ ElevenLabs agent creation skipped:", err.message);
        warning = err instanceof Error ? err.message : String(err);
        action = "skipped";
      }
    }

    // 3. Update local DB
    const updateData = {
      agent_system_prompt: systemPrompt,
      agent_first_message: firstMessage
    };
    if (elAgentId) {
      updateData.elevenlabs_agent_id = elAgentId;
    }

    await knex("restaurants").where({ id: r.id }).update(updateData);

    return res.json({
      success: true,
      action,
      warning: warning || undefined,
      elevenlabs_agent_id: elAgentId || r.elevenlabs_agent_id || null,
    });
  } catch (e) {
    console.error("❌ Create Agent Error:", e);
    return res.status(500).json({ success: false, error: e.message || "Unknown error" });
  }
}
