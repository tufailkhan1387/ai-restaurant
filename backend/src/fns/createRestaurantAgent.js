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
    if (!restaurant_id) throw new Error("restaurant_id is required");

    const r = await knex("restaurants").where({ id: restaurant_id }).first();
    if (!r) throw new Error("Restaurant not found");

    const API_KEY = r.elevenlabs_api_key || process.env.ELEVENLABS_API_KEY;
    if (!API_KEY) throw new Error("ElevenLabs API Key not found for this restaurant");

    const systemPrompt = (r.agent_system_prompt || "").trim() || defaultPrompt(r.name);
    const firstMessage = (r.agent_first_message || "").trim() || defaultFirstMessage(r.name);

    // 1. Create Tools (or find if they exist)
    console.log("🛠️ Syncing tools to ElevenLabs...");
    const toolIds = [];
    const ngrokUrl = process.env.PUBLIC_URL || "YOUR_NGROK_URL"; // Should be passed or in env

    for (const toolSpec of TOOLS_CONFIG) {
      const endpoint = toolSpec.name === "place_order" ? "ai-place-order" : "ai-order-status";
      const webhookUrl = `${ngrokUrl}/api/functions/${endpoint}`;
      
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
      if (resp.ok) {
        toolIds.push(data.tool_id);
        console.log(`✅ Tool created: ${toolSpec.name} (${data.tool_id})`);
      } else {
        // If it already exists, ElevenLabs might return an error, we should handle that or list tools to find ID
        console.log(`⚠️ Tool creation failed for ${toolSpec.name}:`, data);
      }
    }

    // 2. Create Agent
    console.log("🤖 Creating agent in ElevenLabs...");
    const conversation_config = {
      agent: {
        first_message: firstMessage,
        prompt: { prompt: systemPrompt },
        tools: toolIds.map(id => ({ type: "webhook", tool_id: id }))
      }
    };

    const resp = await fetch(`${EL_API}/v1/convai/agents/create`, {
      method: "POST",
      headers: { "xi-api-key": API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ name: `${r.name} (Automated Agent)`, conversation_config }),
    });

    if (!resp.ok) throw new Error(`Agent creation failed: ${await resp.text()}`);
    const created = await resp.json();
    const elAgentId = created.agent_id;

    // 3. Update local DB
    await knex("restaurants").where({ id: r.id }).update({
      elevenlabs_agent_id: elAgentId,
      agent_system_prompt: systemPrompt,
      agent_first_message: firstMessage
    });

    console.log("✨ Agent created and configured with tools:", elAgentId);
    return res.json({ success: true, action: "created", elevenlabs_agent_id: elAgentId });
  } catch (e) {
    console.error("❌ Create Agent Error:", e);
    return res.status(500).json({ success: false, error: e.message || "Unknown error" });
  }
}
