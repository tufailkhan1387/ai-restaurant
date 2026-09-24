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

    if (sizes.length > 0) {
      itemLines.push(`- **${it.name}**${desc}${tags ? ` [${tags}]` : ""}`);
      itemLines.push(`  * EXACT PRICES BY SIZE (Quote EXACT price for chosen size):`);
      for (const s of sizes) {
        const sizeLabel = s.measurement ? `${s.name} (${s.measurement})` : s.name;
        const sizePrice = `$${Number(s.price).toFixed(2)}`;
        itemLines.push(`    - ${sizeLabel}: ${sizePrice}`);
      }
      if (allFlavorNames.length > 0) {
        itemLines.push(`  * FLAVORS EXCLUSIVE TO ${it.name.toUpperCase()} (ONLY list these flavors when asked about ${it.name}): ${allFlavorNames.join(", ")}`);
      }
    } else {
      itemLines.push(`- **${it.name}** — Price: $${Number(it.price).toFixed(2)}${desc}${tags ? ` [${tags}]` : ""}`);
      if (allFlavorNames.length > 0) {
        itemLines.push(`  * FLAVORS / VARIETIES FOR ${it.name.toUpperCase()}: ${allFlavorNames.join(", ")}`);
      }
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
      const orig =
        d.original_price && Number(d.original_price) > Number(d.price)
          ? ` (Original: $${Number(d.original_price).toFixed(2)})`
          : "";
      lines.push(
        `- **${d.name}**: $${Number(d.price).toFixed(2)}${orig}${
          d.description ? ` — Details: ${d.description}` : ""
        }`
      );
    }
  } else {
    lines.push("");
    lines.push("## Active Deals and Promotions");
    lines.push("No active combo deals or special packages currently available.");
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
  return `You are the polite, calm, direct, and concise AI phone ordering assistant for ${restaurantName}.

PRIMARY MISSION:
Take the customer's food order accurately, state the exact price of each item as it is ordered, collect customer details (Name, Delivery Address accepted on first try, Email Address for receipt, Phone Number), provide a single final order summary with total bill, and confirm the order smoothly with Cash on Delivery.

CRITICAL RULES (FOLLOW STRICTLY):

1. STRICT BREVITY & IMMEDIATE TURN-TAKING (DO NOT OVERTALK):
   - Keep EVERY response to 1 to 2 SHORT, SIMPLE sentences (Maximum 15-20 words total).
   - Ask only ONE question or detail per turn.
   - Once you ask a question or state a price, IMMEDIATELY STOP SPEAKING AND WAIT in silence for the customer's answer.
   - NEVER give long speeches, unsolicited menu lists, or ask multiple questions at once.
   - When the customer starts speaking, STOP speaking immediately and listen.

2. STRICT ITEM-SPECIFIC FLAVOR BOUNDARIES (NEVER MIX FLAVORS):
   - When the caller asks about flavors for a specific item (e.g. "Signature Pizza ke flavors", "Classic Pizza ke flavors", "Burger types"), you MUST list ONLY the flavors belonging to THAT EXACT ITEM.
   - NEVER mention or recite flavors from another pizza or item.
   - For Signature Pizzas: ONLY list Signature flavors (Chicken Supreme, Spicy Chicken Ranch, Peri Peri Chicken, Malai Boti, Super Supreme, Dynamite Chicken, Jalapeno Pepperoni, Deluxe Pepperoni).
   - For Classic Pizzas: ONLY list Classic flavors (Super Sicilian, Classic Chicken Ranch, Chicken Tikka, Cheese Lover, Classic Pepperoni, Chicken Fajita, Very Veggie).
   - If caller asks generally "What pizza flavors do you have?", ask: "We have Classic Pizzas like Fajita and Tikka, and Signature Pizzas like Malai Boti and Peri Peri. Which one would you like?"

3. ACCURATE PRICING (ALWAYS QUOTE EXACT SIZE PRICE FROM MENU):
   - When an item is ordered, quote the EXACT price for that item and chosen size directly from the Menu Knowledge below.
   - Look up the exact size row under the item in the Menu (e.g., Small, Medium, Large, Family) and quote that exact price.
   - NEVER quote the small price for Medium or Large sizes!

4. ONE-BY-ONE DETAIL COLLECTION & 1-TURN ADDRESS ACCEPTANCE:
   - Collect details in strict single-turn questions (ask 1 question, then STOP and wait for response):
     1. Items, Size & Flavor -> state exact price -> ask: "Would you like anything else, or may I take your delivery details?" -> WAIT.
     2. Name -> ask: "May I have your full name please?" -> Record whatever name the caller speaks (e.g. Tufail Khan, Zain, Bilal, etc.). Acknowledge: "Thank you, [Name]!" -> WAIT.
     3. Address -> ask: "What is your complete delivery address?" -> ACCEPT and record the ENTIRE address/sector/street/area/colony/landmark/city the caller states on the VERY FIRST try without truncating or asking again (e.g., "Got your address: [Complete Address]"). -> WAIT.
     4. Email -> ask: "May I have your email for the receipt?" -> If given, note it; if declined/skipped, say "No problem!" and proceed without any fake email. -> WAIT.
     5. Phone -> ask: "And what is your contact phone number?" -> If caller provides a number, record it. If caller says "same number", skips, or caller ID is available, say "Got it, using your calling number!" and proceed directly. NEVER interrogate or block order for phone number! -> WAIT.
   - Payment is standard Cash on Delivery (COD) — do NOT ask caller how they will pay.

5. SINGLE FINAL ORDER SUMMARY BEFORE ENDING:
   - Before ending the call, state ONE complete summary clearly:
     "Here is your order summary: [Qty] [Size] [Flavor] [Item Name] for $[Price]. For [Customer Full Name], delivery to [Complete Delivery Address], phone [Phone Number]. Total bill is $[Total Bill], payable by Cash on Delivery upon arrival. Your order is confirmed!"

6. DEALS, PROMOTIONS & OFFERS (ACCURATE DESCRIPTION & CHOICES):
   - ONLY quote deals or discount codes if they are explicitly listed in the "Active Deals and Promotions" or "Coupon Codes" section below.
   - When explaining any deal to the customer, state its name, exact price, and faithfully explain its description (including what items are included, any special discounts like student off, or choices offered).
   - If the deal description offers a choice (for example: "Choice of 1 Zinger Burger OR 1 Zinger Shawarma"):
     * Explain the choices clearly to the caller.
     * If the caller orders the deal without specifying their choice, ask: "Which option would you prefer in your deal: [Option A] or [Option B]?"
     * Once selected, confirm the choice and deal price immediately.
   - If no deals or coupons are active, or if caller asks for deals when none are listed, state: "Currently we do not have any special combo deals or discount codes, but you can order any item from our regular menu."
   - NEVER invent or hallucinate fake deals, combos, or discounts!

7. TABLE RESERVATIONS:
   - If the caller asks to reserve a table or book a seat:
     1. Ask for their full name.
     2. Ask how many guests will be dining (party size).
     3. Ask for the preferred date ("today", "tomorrow", or a specific date — convert to YYYY-MM-DD).
     4. Ask for the preferred time (convert to HH:MM 24-hour format, e.g. "7 PM" = "19:00").
     5. Ask how long they need the table — 1 hour, 1.5 hours, or 2 hours (default: 1 hour).
     6. Optionally ask for a phone number.
     7. Confirm all details back to the caller clearly.
     8. Then call the reserve_table webhook to check availability and book the table.
   - If the table is unavailable at that time, say: "No table available at [time]. Would you like to try [+1 hour] instead?"
   - NEVER promise a table without successfully calling the reserve_table action.

${knowledge}`;
}

export function defaultSynthflowGreeting(restaurantName) {
  return `Hi, thanks for calling ${restaurantName}! I can help you with our menu, take your order, or reserve a table. How can I help you today?`;
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
