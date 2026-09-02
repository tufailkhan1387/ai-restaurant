import { getKnex } from "../db.js";

const EL_API = "https://api.elevenlabs.io";

function buildMenuDoc({ restaurantName, settings, categories, items, deals, variants = [], addons = [], itemAddons = [] }) {
  const lines = [];
  lines.push(`# ${restaurantName} — Menu, Sizes, and Customization Options`);
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

  const availableItems = items.filter(
    (i) => i.is_available !== false && !(i.track_inventory && Number(i.stock_quantity || 0) <= 0)
  );
  const outOfStockItems = items.filter(
    (i) => i.is_available === false || (i.track_inventory && Number(i.stock_quantity || 0) <= 0)
  );

  const itemVariantMap = new Map();
  for (const v of variants) {
    if (!itemVariantMap.has(v.menu_item_id)) itemVariantMap.set(v.menu_item_id, []);
    itemVariantMap.get(v.menu_item_id).push(v);
  }

  const itemAddonMap = new Map();
  const addonById = new Map(addons.map((a) => [a.id, a]));
  for (const link of itemAddons) {
    if (!itemAddonMap.has(link.menu_item_id)) itemAddonMap.set(link.menu_item_id, []);
    const ad = addonById.get(link.menu_addon_id);
    if (ad) itemAddonMap.get(link.menu_item_id).push(ad);
  }

  lines.push("## Available Menu Items & Sizes (Ready to Order)");
  const byCategory = new Map();
  for (const it of availableItems) {
    const k = it.category_id || "uncategorized";
    if (!byCategory.has(k)) byCategory.set(k, []);
    byCategory.get(k).push(it);
  }

  const formatItem = (it) => {
    const tags = (it.dietary_tags || []).join(", ");
    const desc = it.description ? ` (${it.description})` : "";
    const vars = itemVariantMap.get(it.id) || [];
    const ads = itemAddonMap.get(it.id) || [];

    let line = `- ${it.name}: Base price ${Number(it.price).toFixed(2)}${desc}${tags ? ` [${tags}]` : ""}`;
    if (vars.length > 0) {
      const varStr = vars.map((v) => `${v.name} ($${Number(v.price).toFixed(2)})`).join(", ");
      line += ` | Sizes/Variants: ${varStr}`;
    }
    if (ads.length > 0) {
      const adStr = ads.map((a) => `${a.name} (+$${Number(a.price).toFixed(2)})`).join(", ");
      line += ` | Sauces/Add-ons: ${adStr}`;
    }
    return line;
  };

  for (const cat of categories) {
    const list = byCategory.get(cat.id) || [];
    if (!list.length) continue;
    lines.push("");
    lines.push(`### ${cat.name}`);
    if (cat.description) lines.push(cat.description);
    for (const it of list) {
      lines.push(formatItem(it));
    }
  }

  const uncategorized = byCategory.get("uncategorized") || [];
  if (uncategorized.length) {
    lines.push("");
    lines.push("### Other items");
    for (const it of uncategorized) {
      lines.push(formatItem(it));
    }
  }

  if (addons.length > 0) {
    lines.push("");
    lines.push("## General Sauces & Add-ons Available");
    for (const ad of addons) {
      lines.push(`- ${ad.name}: +${Number(ad.price).toFixed(2)}${ad.description ? ` (${ad.description})` : ""}`);
    }
  }

  if (outOfStockItems.length > 0) {
    lines.push("");
    lines.push("## OUT OF ORDER / OUT OF STOCK ITEMS (DO NOT ACCEPT ORDERS)");
    lines.push(
      "CRITICAL: The following items are currently OUT OF ORDER / OUT OF STOCK. If a customer asks to order any of these items, you MUST politely inform them: 'I apologize, but [Item Name] is currently out of order today. Would you like to choose something else from our available menu instead?' NEVER place an order for out of order items."
    );
    for (const it of outOfStockItems) {
      lines.push(`- ${it.name}: [OUT OF ORDER / OUT OF STOCK]`);
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
    "When a customer asks for Pizza, Burgers, or other items with sizes or sauces, ask for their preferred Size (e.g. Small, Medium, Large, Extra Large) and if they would like any extra Sauces or Toppings. Collect the customer's name, phone, delivery address, and full item specifications. Confirm the total before submitting.",
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

    const [settings, categories, items, deals, variants, addons, itemAddons] = await Promise.all([
      knex("restaurant_settings").where({ restaurant_id }).first(),
      knex("menu_categories").where({ restaurant_id }).orderBy("sort_order", "asc"),
      knex("menu_items").where({ restaurant_id }).orderBy("sort_order", "asc"),
      knex("deals").where({ restaurant_id, is_active: true }),
      knex("menu_item_variants").where({ is_active: true }).orderBy("sort_order", "asc"),
      knex("menu_addons").where({ restaurant_id, is_active: true }).orderBy("sort_order", "asc"),
      knex("menu_item_addons").select("menu_item_id", "menu_addon_id"),
    ]);

    const doc = buildMenuDoc({
      restaurantName: r.name,
      settings,
      categories,
      items,
      deals,
      variants,
      addons,
      itemAddons,
    });

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
      let errMsg = err;
      try {
        const parsed = JSON.parse(err);
        if (parsed?.detail?.status === "missing_permissions" || parsed?.detail?.code === "unauthorized") {
          errMsg = parsed.detail.message || "ElevenLabs API key is missing 'convai_write' permission.";
          console.warn("⚠️ ElevenLabs permission warning:", errMsg);
          return res.status(200).json({ success: false, warning: errMsg, error: errMsg });
        }
      } catch {}
      throw new Error(`ElevenLabs KB Upload Failed: ${errMsg}`);
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

    if (!patch.ok) {
      const patchErr = await patch.text();
      console.warn("⚠️ ElevenLabs Agent Patch warning:", patchErr);
      return res.status(200).json({ success: false, warning: patchErr, error: patchErr });
    }

    await knex("restaurants")
      .where({ id: r.id })
      .update({ agent_knowledge_doc_id: docId, agent_menu_synced_at: new Date().toISOString() });

    console.log("✅ Sync complete for", r.name);
    return res.json({ success: true, doc_id: docId });
  } catch (e) {
    console.error("❌ Sync Error:", e.message);
    return res.status(200).json({ success: false, error: e.message });
  }
}
