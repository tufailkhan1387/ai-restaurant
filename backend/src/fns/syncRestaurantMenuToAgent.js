import { getKnex } from "../db.js";

const EL_API = "https://api.elevenlabs.io";

function buildMenuDoc({ restaurantName, settings, categories, items, deals }) {
  const lines = [];
  lines.push(`# ${restaurantName} — Menu and Information`);
  lines.push("");
  if (settings) {
    lines.push(`Currency: ${settings.currency || "USD"}`);
    if (settings.address) lines.push(`Address: ${settings.address}`);
    if (settings.phone) lines.push(`Phone: ${settings.phone}`);
    lines.push(`Tax rate: ${settings.tax_rate ?? 0}%`);
    lines.push(`Delivery fee: ${settings.delivery_fee ?? 0}`);
    lines.push(`Minimum order: ${settings.min_order_amount ?? 0}`);
    lines.push(`Currently accepting orders: ${settings.is_open ? "yes" : "no"}`);
    lines.push("");
  }

  lines.push("## Menu");
  const byCategory = new Map();
  for (const it of items.filter((i) => i.is_available)) {
    const k = it.category_id || "uncategorized";
    if (!byCategory.has(k)) byCategory.set(k, []);
    byCategory.get(k).push(it);
  }
  for (const cat of categories) {
    const list = byCategory.get(cat.id) || [];
    if (!list.length) continue;
    lines.push("");
    lines.push(`### ${cat.name}`);
    if (cat.description) lines.push(cat.description);
    for (const it of list) {
      const tags = (it.dietary_tags || []).join(", ");
      const desc = it.description ? ` — ${it.description}` : "";
      lines.push(`- ${it.name}: ${Number(it.price).toFixed(2)}${desc}${tags ? ` [${tags}]` : ""}`);
    }
  }
  const uncategorized = byCategory.get("uncategorized") || [];
  if (uncategorized.length) {
    lines.push("");
    lines.push("### Other items");
    for (const it of uncategorized) {
      lines.push(`- ${it.name}: ${Number(it.price).toFixed(2)}`);
    }
  }

  if (deals.length) {
    lines.push("");
    lines.push("## Active deals & offers");
    for (const d of deals) {
      lines.push(`- ${d.name}: ${Number(d.price).toFixed(2)}${d.description ? ` — ${d.description}` : ""}`);
    }
  }

  lines.push("");
  lines.push("## How to place an order");
  lines.push(
    "Collect the customer's name, phone, delivery address, and the items they'd like with quantities. Confirm the total before submitting.",
  );
  lines.push("");
  lines.push("## Order tracking");
  lines.push(
    "Customers can check their order using the short tracking code printed on their receipt (10 characters, e.g. ABC1234567).",
  );

  return lines.join("\n");
}

export async function syncRestaurantMenuToAgent(req, res) {
  res.set("Access-Control-Allow-Origin", "*");
  try {
    const knex = getKnex();
    // Support both direct body or nested body
    const body = req.body || {};
    const restaurant_id = body.restaurant_id || body.body?.restaurant_id;

    if (!restaurant_id) {
      console.log("❌ Missing restaurant_id in request body:", body);
      return res.status(400).json({ success: false, error: "restaurant_id is required" });
    }

    console.log("🔄 Starting Menu Sync for restaurant:", restaurant_id);
    const r = await knex("restaurants").where({ id: restaurant_id }).first();
    if (!r) throw new Error(`Restaurant ${restaurant_id} not found in database`);
    if (!r.elevenlabs_agent_id) throw new Error("This restaurant doesn't have an ElevenLabs Agent ID yet.");
    
    const ELEVENLABS_API_KEY = r.elevenlabs_api_key || process.env.ELEVENLABS_API_KEY;
    if (!ELEVENLABS_API_KEY) throw new Error("ElevenLabs API key is missing. Please connect ElevenLabs first.");

    const [settings, categories, items, deals] = await Promise.all([
      knex("restaurant_settings").where({ restaurant_id }).first(),
      knex("menu_categories").where({ restaurant_id }).orderBy("sort_order", "asc"),
      knex("menu_items").where({ restaurant_id }).orderBy("sort_order", "asc"),
      knex("deals").where({ restaurant_id, is_active: true }),
    ]);

    const doc = buildMenuDoc({ restaurantName: r.name, settings, categories, items, deals });

    if (r.agent_knowledge_doc_id) {
      await fetch(`${EL_API}/v1/convai/knowledge-base/${r.agent_knowledge_doc_id}?force=true`, {
        method: "DELETE",
        headers: { "xi-api-key": ELEVENLABS_API_KEY },
      }).catch(() => {});
    }

    console.log("📤 Uploading new Menu to ElevenLabs KB (JSON)...");
    const upload = await fetch(`${EL_API}/v1/convai/knowledge-base/text`, {
      method: "POST",
      headers: { 
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: `${r.name} — Menu`,
        text: doc
      }),
    });
    
    if (!upload.ok) {
      const err = await upload.text();
      throw new Error(`ElevenLabs KB Upload Failed: ${err}`);
    }
    
    const { id: docId } = await upload.json();

    const patch = await fetch(`${EL_API}/v1/convai/agents/${r.elevenlabs_agent_id}`, {
      method: "PATCH",
      headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        conversation_config: {
          agent: {
            prompt: {
              knowledge_base: [{ type: "text", id: docId, name: `${r.name} — Menu`, usage_mode: "auto" }],
            },
          },
        },
      }),
    });

    if (!patch.ok) throw new Error(`ElevenLabs Agent Patch Failed: ${await patch.text()}`);

    await knex("restaurants")
      .where({ id: r.id })
      .update({ agent_knowledge_doc_id: docId, agent_menu_synced_at: new Date().toISOString() });

    console.log("✅ Sync complete for", r.name);
    return res.json({ success: true, doc_id: docId });
  } catch (e) {
    console.error("❌ Sync Error:", e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
}
