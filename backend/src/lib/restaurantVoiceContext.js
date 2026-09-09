/**
 * Build menu, sizes, flavors, addons, and coupons knowledge text embedded into Synthflow & ElevenLabs agent prompts.
 */
export function buildRestaurantVoiceKnowledge({
  restaurantName,
  settings,
  categories,
  items,
  deals,
  discounts,
  variants = [],
  addons = [],
  itemAddons = [],
}) {
  const lines = [];
  lines.push(`# ${restaurantName} — Menu, Flavors, Sizes, Add-ons, and Ordering Guide`);
  lines.push("");
  if (settings) {
    lines.push(`Currency: ${settings.currency || "USD"}`);
    if (settings.address) lines.push(`Restaurant address: ${settings.address}`);
    if (settings.phone) lines.push(`Restaurant phone: ${settings.phone}`);
    lines.push(`Tax rate: ${settings.tax_rate ?? 0}%`);
    lines.push(`Delivery fee: ${settings.delivery_fee ?? 0}`);
    lines.push(`Minimum order: ${settings.min_order_amount ?? 0}`);
    lines.push(`Currently accepting orders: ${settings.is_open === false ? "no" : "yes"}`);
    lines.push("");
  }

  const variantMap = new Map();
  for (const v of variants || []) {
    if (v.is_active === false) continue;
    if (!variantMap.has(v.menu_item_id)) variantMap.set(v.menu_item_id, []);
    variantMap.get(v.menu_item_id).push(v);
  }

  const addonMap = new Map();
  const addonById = new Map((addons || []).map((a) => [a.id, a]));
  for (const link of itemAddons || []) {
    if (!addonMap.has(link.menu_item_id)) addonMap.set(link.menu_item_id, []);
    const ad = addonById.get(link.menu_addon_id);
    if (ad && ad.is_active !== false) addonMap.get(link.menu_item_id).push(ad);
  }

  lines.push("## Menu Categories & Available Items");

  const byCategory = new Map();
  for (const it of (items || []).filter((i) => i.is_available !== false)) {
    const k = it.category_id || "uncategorized";
    if (!byCategory.has(k)) byCategory.set(k, []);
    byCategory.get(k).push(it);
  }

  function renderItem(it) {
    const itemLines = [];
    const tags = (it.dietary_tags || []).filter(Boolean).join(", ");
    const desc = it.description ? ` — ${it.description}` : "";
    const itemVars = variantMap.get(it.id) || [];
    const itemAds = addonMap.get(it.id) || [];

    const rawSizes = itemVars.filter((v) => v.variant_type === "size");
    const seenSizes = new Set();
    const sizes = [];
    for (const s of rawSizes) {
      const key = `${(s.name || "").trim().toLowerCase()}_${(s.measurement || "").trim().toLowerCase()}_${Number(s.price).toFixed(2)}`;
      if (!seenSizes.has(key)) {
        seenSizes.add(key);
        sizes.push(s);
      }
    }

    // Collect all distinct flavor names for this item
    const allFlavorNames = Array.from(
      new Set(itemVars.filter((v) => v.variant_type !== "size").map((f) => f.name.trim()))
    ).filter(Boolean);

    itemLines.push(`- **${it.name}** (Base Price: $${Number(it.price).toFixed(2)})${desc}${tags ? ` [${tags}]` : ""}`);

    if (sizes.length > 0) {
      itemLines.push(`  * Available Sizes:`);
      for (const s of sizes) {
        const sizeLabel = s.measurement ? `${s.name} (${s.measurement})` : s.name;
        const sizePrice = `$${Number(s.price).toFixed(2)}`;
        const sFlavors = itemVars.filter((v) => (v.parent_id === s.id || (!v.parent_id && rawSizes.length === 1)) && v.variant_type !== "size");
        const uniqueFlv = Array.from(
          new Set(
            sFlavors.map((f) => (Number(f.price) > 0 ? `${f.name} (+$${Number(f.price).toFixed(2)})` : f.name))
          )
        ).filter(Boolean);

        if (uniqueFlv.length > 0) {
          itemLines.push(`    - ${sizeLabel}: ${sizePrice} | Flavors available for this size: ${uniqueFlv.join(", ")}`);
        } else {
          itemLines.push(`    - ${sizeLabel}: ${sizePrice}`);
        }
      }
    }

    if (allFlavorNames.length > 0) {
      itemLines.push(`  * AVAILABLE FLAVORS (YES, this item has flavors!): ${allFlavorNames.join(", ")}`);
    }

    if (itemAds.length > 0) {
      const adList = itemAds
        .map((a) => `${a.name} (+$${Number(a.price).toFixed(2)})`)
        .join(", ");
      itemLines.push(`  * Available Sauces & Add-ons: ${adList}`);
    }

    return itemLines.join("\n");
  }

  for (const cat of categories || []) {
    const list = byCategory.get(cat.id) || [];
    if (!list.length) continue;
    lines.push("");
    lines.push(`### Category: ${cat.name}`);
    if (cat.description) lines.push(cat.description);
    for (const it of list) {
      lines.push(renderItem(it));
    }
  }

  const uncategorized = byCategory.get("uncategorized") || [];
  if (uncategorized.length) {
    lines.push("");
    lines.push("### Other items");
    for (const it of uncategorized) {
      lines.push(renderItem(it));
    }
  }

  if (addons?.length) {
    lines.push("");
    lines.push("## Sauces & Extra Add-ons");
    for (const ad of addons) {
      lines.push(`- ${ad.name}: +$${Number(ad.price).toFixed(2)}${ad.description ? ` (${ad.description})` : ""}`);
    }
  }

  if (deals?.length) {
    lines.push("");
    lines.push("## Active Deals and Promotions");
    for (const d of deals) {
      lines.push(`- ${d.name}: $${Number(d.price).toFixed(2)}${d.description ? ` — ${d.description}` : ""}`);
    }
  }

  if (discounts?.length) {
    lines.push("");
    lines.push("## Coupon Codes");
    lines.push(
      "Explain these coupons when asked. Only apply a code if the customer provides it and the order meets any minimum."
    );
    for (const c of discounts) {
      const type = String(c.discount_type || "percentage").toLowerCase();
      const value = Number(c.value ?? c.discount_value ?? 0);
      const offer = type === "fixed" ? `$${value.toFixed(2)} off` : `${value}% off`;
      const min = Number(c.min_order_amount || 0);
      lines.push(
        `- Code ${c.code}: ${offer}${c.description ? ` — ${c.description}` : ""}${
          min > 0 ? ` (min order $${min})` : ""
        }`
      );
    }
  } else {
    lines.push("");
    lines.push("## Coupon Codes");
    lines.push("No active coupon codes right now.");
  }

  lines.push("");
  lines.push("## Ordering Workflow & Rules");
  lines.push("1. Greet the caller warmly and offer to take their order or answer questions.");
  lines.push("2. FLAVORS INQUIRY: If the customer asks if you have flavors or asks what flavors are available (e.g. for Pizza), ALWAYS confirm YES and list the available flavors!");
  lines.push("3. ORDER TAKING: When taking an order for Pizza or items with sizes/flavors, always ask for: (a) Size, (b) Flavor, and (c) Sauces/Add-ons.");
  lines.push("4. Collect: customer full name, callback phone, fulfillment type (delivery or pickup), delivery address (when delivery), item names with sizes and flavors, quantities, notes, and coupon code (if any).");
  lines.push("5. Read back the order summary before ending the call.");

  return lines.join("\n");
}

export function defaultSynthflowPrompt(restaurantName, knowledge) {
  return `You are the friendly phone ordering AI assistant for ${restaurantName}.

Your core responsibilities:
- Answer questions about the menu, sizes, flavors, prices, deals, and coupons.
- Take customer food orders accurately for delivery or pickup.
- Apply eligible coupon codes provided by the customer.
- Confirm full order details before ending the call.

IMPORTANT RULES & INSTRUCTIONS:
1. SIZES & FLAVORS INQUIRIES (CRITICAL):
   - When a caller asks if you have flavors (e.g. "Do you have flavors?", "Pizza k flavors hain?", "What flavors are available for pizza?"), ALWAYS say "YES!" and enthusiastically list the available flavors from the menu knowledge below (e.g. "Yes! We have Chicken Supreme, Spicy Chicken Ranch, Peri Peri Chicken, Malai Boti, Super Supreme, Dynamite Chicken, Jalapeno Pepperoni, and Deluxe Pepperoni. Which flavor and size would you like?").
   - NEVER say "no" or deny having flavors if flavors are listed in the menu below!

2. TAKING ORDERS FOR PIZZAS & CUSTOMIZABLE ITEMS:
   - When a caller asks to order a pizza or customizable item:
     * Ask for their preferred SIZE (e.g., Small 9", Medium 12", Large 14", Family 18").
     * Ask for their preferred FLAVOR (e.g., Chicken Supreme, Spicy Chicken Ranch, Malai Boti, etc.).
     * Offer optional Sauces or Add-ons (e.g., Garlic Sauce).
   - Example response: "Sure! What size would you like (Small 9\\", Medium 12\\", Large 14\\", or Family 18\\") and which flavor (such as Chicken Supreme, Spicy Chicken Ranch, or Malai Boti)?"

3. CONVERSATION GUIDELINES:
   - Be concise, warm, polite, and professional.
   - Only sell items and options present in the knowledge base below.
   - If an item is unavailable or out of stock, apologize politely and suggest alternatives.
   - Collect customer full name, contact phone number, delivery address (if delivery) or confirm pickup, items with quantity, size, flavor, and special notes.
   - Never claim payment was already processed unless explicitly paid; default payment is cash on delivery or pickup.

${knowledge}`;
}

export function defaultSynthflowGreeting(restaurantName) {
  return `Hi, thanks for calling ${restaurantName}! I can help you with our menu, sizes, flavors, current coupons, or take your order. How can I help you today?`;
}

/** Load restaurant catalog used for voice prompt sync. */
export async function loadRestaurantVoiceCatalog(knex, restaurantId) {
  const [settings, categories, items, deals, discounts, variants, addons, itemAddons] = await Promise.all([
    knex("restaurant_settings").where({ restaurant_id: restaurantId }).first(),
    knex("menu_categories").where({ restaurant_id: restaurantId }).orderBy("sort_order", "asc"),
    knex("menu_items").where({ restaurant_id: restaurantId }).orderBy("sort_order", "asc"),
    knex("deals").where({ restaurant_id: restaurantId, is_active: true }),
    knex("discounts")
      .where({ restaurant_id: restaurantId, is_active: true })
      .andWhere((qb) => {
        qb.whereNull("valid_to").orWhere("valid_to", ">", knex.fn.now());
      })
      .andWhere((qb) => {
        qb.whereNull("ends_at").orWhere("ends_at", ">", knex.fn.now());
      }),
    knex("menu_item_variants")
      .whereIn("menu_item_id", knex("menu_items").select("id").where({ restaurant_id: restaurantId }))
      .andWhere({ is_active: true })
      .orderBy("sort_order", "asc"),
    knex("menu_addons").where({ restaurant_id: restaurantId, is_active: true }).orderBy("sort_order", "asc"),
    knex("menu_item_addons").whereIn("menu_item_id", knex("menu_items").select("id").where({ restaurant_id: restaurantId })),
  ]);
  return { settings, categories, items, deals, discounts, variants, addons, itemAddons };
}
