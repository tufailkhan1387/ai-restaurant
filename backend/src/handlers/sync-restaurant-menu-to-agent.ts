// @generated from supabase/functions/sync-restaurant-menu-to-agent — run: node backend/scripts/generate-handlers.mjs
// Builds a text document of the restaurant's menu, hours, deals and policies,
// uploads it to ElevenLabs as a knowledge base document, and attaches it to
// the restaurant's agent. Replaces the previous KB doc (if any).
//
// POST { restaurant_id }

import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EL_API = "https://api.elevenlabs.io";

function buildMenuDoc(opts: {
  restaurantName: string;
  settings: any;
  categories: any[];
  items: any[];
  deals: any[];
}) {
  const { restaurantName, settings, categories, items, deals } = opts;
  const lines: string[] = [];
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
  const byCategory = new Map<string, any[]>();
  for (const it of items.filter((i) => i.is_available)) {
    const k = it.category_id || "uncategorized";
    if (!byCategory.has(k)) byCategory.set(k, []);
    byCategory.get(k)!.push(it);
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
      lines.push(
        `- ${it.name}: ${Number(it.price).toFixed(2)}${desc}${tags ? ` [${tags}]` : ""}`,
      );
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

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
    if (!ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY not configured");

    const supabase = createClient(
      process.env.SUPABASE_URL ?? "",
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    );

    const { restaurant_id } = await req.json();
    if (!restaurant_id) throw new Error("restaurant_id is required");

    const { data: r } = await supabase
      .from("restaurants")
      .select("id, name, elevenlabs_agent_id, agent_knowledge_doc_id")
      .eq("id", restaurant_id)
      .maybeSingle();
    if (!r) throw new Error("Restaurant not found");
    if (!r.elevenlabs_agent_id) {
      throw new Error("Restaurant has no agent yet — create the agent first");
    }

    const [settingsRes, catRes, itemRes, dealRes] = await Promise.all([
      supabase.from("restaurant_settings").select("*").eq("restaurant_id", restaurant_id).maybeSingle(),
      supabase.from("menu_categories").select("*").eq("restaurant_id", restaurant_id).order("sort_order"),
      supabase.from("menu_items").select("*").eq("restaurant_id", restaurant_id).order("sort_order"),
      supabase.from("deals").select("*").eq("restaurant_id", restaurant_id).eq("is_active", true),
    ]);

    const doc = buildMenuDoc({
      restaurantName: r.name,
      settings: settingsRes.data,
      categories: catRes.data || [],
      items: itemRes.data || [],
      deals: dealRes.data || [],
    });

    // Delete old doc if any (best-effort)
    if (r.agent_knowledge_doc_id) {
      await fetch(
        `${EL_API}/v1/convai/knowledge-base/${r.agent_knowledge_doc_id}?force=true`,
        { method: "DELETE", headers: { "xi-api-key": ELEVENLABS_API_KEY } },
      ).catch(() => {});
    }

    // Upload new doc as text
    const form = new FormData();
    form.append("name", `${r.name} — Menu`);
    form.append("text", doc);
    const upload = await fetch(`${EL_API}/v1/convai/knowledge-base/text`, {
      method: "POST",
      headers: { "xi-api-key": ELEVENLABS_API_KEY },
      body: form,
    });
    const uploadText = await upload.text();
    if (!upload.ok) throw new Error(`KB upload failed [${upload.status}]: ${uploadText}`);
    const uploaded = JSON.parse(uploadText);
    const docId = uploaded.id;
    if (!docId) throw new Error("ElevenLabs did not return KB doc id");

    // Attach to agent (replace existing knowledge base list)
    const patch = await fetch(`${EL_API}/v1/convai/agents/${r.elevenlabs_agent_id}`, {
      method: "PATCH",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        conversation_config: {
          agent: {
            prompt: {
              knowledge_base: [
                { type: "text", id: docId, name: `${r.name} — Menu`, usage_mode: "auto" },
              ],
            },
          },
        },
      }),
    });
    if (!patch.ok) {
      throw new Error(`Failed to attach KB to agent [${patch.status}]: ${await patch.text()}`);
    }

    await supabase
      .from("restaurants")
      .update({ agent_knowledge_doc_id: docId, agent_menu_synced_at: new Date().toISOString() })
      .eq("id", r.id);

    return new Response(
      JSON.stringify({ success: true, doc_id: docId, doc_chars: doc.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("sync-restaurant-menu-to-agent error:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}