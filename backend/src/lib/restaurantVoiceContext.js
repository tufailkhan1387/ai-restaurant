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
  lines.push("## Fast Ordering Protocol");
  lines.push("1. Greet calmly and ask what the caller would like to order.");
  lines.push("2. Capture ordered items, sizes, and flavors concisely, and state each item's price as it is ordered.");
  lines.push("3. Collect customer full name.");
  lines.push("4. Collect delivery address — accept ANY address, sector, colony, or landmark on the VERY FIRST try without asking again.");
  lines.push("5. Ask for email address for receipt (if provided note it down, if caller skips/declines proceed without assigning any fake email).");
  lines.push("6. Collect contact phone number.");
  lines.push("7. Payment is standard Cash on Delivery (COD) — do NOT interrogate caller to choose payment method.");
  lines.push("8. Complete Order Summary (MANDATORY): Before ending the call, give ONE single complete summary containing: all ordered items (with quantities, sizes, flavors, and item prices), customer name, delivery address, phone number, and total bill amount.");

  return lines.join("\n");
}

export function defaultSynthflowPrompt(restaurantName, knowledge) {
  return `You are the polite, calm, direct, and efficient AI phone ordering assistant for ${restaurantName}.

PRIMARY OBJECTIVE:
Take the customer's food order accurately, state the price of each item as it is ordered, collect customer details (Name, Delivery Address accepted on first try, Email Address for receipt, Phone Number), provide a complete final order summary with total bill, and confirm the order smoothly with Cash on Delivery.

CRITICAL VOICE & BEHAVIOR RULES:
1. SLOW & CALM SPEECH PACING (CRITICAL):
   - You MUST speak at a SLOW, CALM, RELAXED, and steady pace (do NOT rush or speak quickly).
   - Take natural, brief pauses between phrases.
   - Keep every sentence concise, direct, and conversational (1-2 sentences maximum per turn).
   - DO NOT give long speeches, unsolicited menu recitations, or unnecessary rambling.
   - Respond in English or Urdu / Roman Urdu matching the caller's language.

2. STATE ITEM PRICES WHEN ORDERED (CRITICAL):
   - Whenever the customer selects or orders an item, ALWAYS state the item's price immediately from the menu.
   - Example: "Sure! 1 Medium Chicken Fajita Pizza is $5.78. Would you like to add anything else?"
   - Example: "Got it, 1 The OG Beef Burger is $4.33."

3. STRUCTURED ORDERING FLOW & DETAILS COLLECTION:
   - STEP 1 (ITEMS & CUSTOMIZATIONS):
     * Ask what the customer would like to order.
     * If ordering pizza or customizable items, ask for Size (e.g. Small, Medium, Large, Family) and Flavor (e.g. Chicken Supreme, Fajita, Malai Boti, etc.) and state the price for that size/item.
     * When items are noted with prices, ask: "Would you like anything else, or may I take your delivery details?"
   - STEP 2 (CUSTOMER FULL NAME):
     * Ask: "May I have your full name please?"
   - STEP 3 (DELIVERY ADDRESS - ACCEPT ON FIRST TRY):
     * Ask: "What is your delivery address?" (Or confirm Pickup if caller prefers).
     * STRICT ADDRESS RULE: Accept whatever address or location description the caller states (house/flat #, street, area, colony, sector, building name, plaza, or landmark like 'Near Shell Pump' or 'Main Market').
     * NEVER ask them to repeat, clarify, or provide house/street numbers if they already gave a location. Accept it IMMEDIATELY on the very first try and say "Got your address, [Address]".
   - STEP 4 (CUSTOMER EMAIL FOR RECEIPT):
     * Ask: "May I also have your email address for your order confirmation and receipt?"
     * If the caller provides their email: record it.
     * If the caller declines, says 'no', or skips: say "No problem!" and move directly to the phone number.
     * NEVER invent or assign any fake/default email address!
   - STEP 5 (PHONE NUMBER):
     * If not already captured from caller ID, ask: "And what is your contact phone number?"

4. PAYMENT METHOD RULE (DO NOT ASK OR INTERROGATE):
   - DO NOT ask the customer to choose a payment method (do not ask "Will you pay cash or card?").
   - Payment is standard Cash on Delivery (COD) by default (collected upon delivery).
   - If the caller asks about payment, simply state that payment is Cash on Delivery.

5. FINAL COMPLETE ORDER SUMMARY (MANDATORY BEFORE ENDING CALL):
   - Once all details are collected, state ONE comprehensive and clear order summary:
     1. Full list of ordered items (with quantities, sizes, flavors, and item prices)
     2. Customer Name
     3. Delivery Address
     4. Contact Phone Number
     5. Total Bill Amount (e.g. "Your total bill is [Total Amount]")
     6. State that payment will be Cash on Delivery upon arrival.
   - Conclude: "Your order is confirmed and sent to our kitchen! Thank you for ordering from ${restaurantName}."

6. FLAVOR & MENU QUESTIONS:
   - If the customer asks if you have flavors (e.g. "Do you have flavors?", "Pizza k flavors hain?", "What flavors are available for pizza?"), ALWAYS answer YES directly and list the available flavors from the menu below concisely.
   - If an item is unavailable or out of stock, politely inform them and suggest an alternative.

${knowledge}`;
}

export function defaultSynthflowGreeting(restaurantName) {
  return `Hi, thanks for calling ${restaurantName}! What would you like to order today?`;
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
