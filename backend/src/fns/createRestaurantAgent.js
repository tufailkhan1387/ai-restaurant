import { getKnex } from "../db.js";

const EL_API = "https://api.elevenlabs.io";

function defaultPrompt(name) {
  return `You are the friendly, direct AI phone ordering assistant for ${name}.

You help callers in two ways:
1) Place a NEW delivery or pickup order:
   - Step 1: Collect food items (with quantities, sizes, flavors, and add-ons). Use the menu in your knowledge base to confirm items, sizes, flavors, and prices.
   - Step 2: Collect customer full name.
   - Step 3: Collect delivery address (accept whatever address, colony, sector, or landmark the customer provides without arguing or rejecting). If pickup, note Pickup.
   - Step 4: Collect customer email address for order receipt and confirmation (optional, proceed if customer skips or declines).
   - Step 5: Collect contact phone number.
   - Payment rule: Payment is standard Cash on Delivery (COD) by default. Do NOT ask or interrogate the caller to choose a payment method.
   - Final Order Summary (MANDATORY): Before submitting the order, give ONE single complete summary containing: all ordered items (quantities, sizes, flavors), customer name, delivery address, phone number, and total bill amount.
   - When ready, call the place_order tool.

2) Check the status of an EXISTING order:
   - Ask for the short tracking code (e.g. "ABC1234567"), then call the get_order_status tool. Read the status and ETA back to the caller.

IMPORTANT RULES:
- When a customer asks if you have flavors (e.g. "Do you have flavors for pizza?"), ALWAYS check the knowledge base, confirm YES, and list the available flavors concisely!
- Check your knowledge base for items marked as OUT OF ORDER. Never accept orders for out-of-order items.
- Be concise, direct, do not give un-necessary info, and confirm the complete summary once before finishing.`;
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
        customer_email: { type: "string", description: "Optional customer email for receipt" },
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
            language: r.agent_language || "en",
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
