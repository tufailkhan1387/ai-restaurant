import { branchOrderingSection } from "./branchLocation.js";

export { branchOrderingSection };

/** Active child branches the phone agent may offer. */
export async function loadActiveChildBranches(knex, restaurantId) {
  const restaurant = await knex("restaurants").where({ id: restaurantId }).select("id", "parent_restaurant_id").first();
  const parentId = restaurant?.parent_restaurant_id || restaurantId;
  if (!parentId) return [];
  return knex("restaurants")
    .where({ parent_restaurant_id: parentId, is_branch: true, is_active: true, is_accepting_orders: true })
    .orderBy("name", "asc")
    .select("id", "name", "address", "city", "area");
}

/** Older saved prompts told delivery to skip the branch question. Rewrite those lines. */
function rewriteSavedBranchRules(text) {
  return String(text || "")
    .replace(
      /Delivery: ask "What is your complete delivery address\?" Accept and record the ENTIRE address on the first try\. Do not ask for a city or an area\. Pass branch_name as none\. -> WAIT\.\s*- Pickup: do not ask for a street address\. Follow the Branch ordering section\. If branches are in more than one city, ask the city, stop and wait, then ask the area\. If every branch is in the same city, ask the area only and do not ask the city\. Pass the matching exact branch_name to place_order\. -> WAIT\./,
      `Delivery and pickup both follow the Branch ordering section before anything else. Ask the area, or the city first when branches are in more than one city. Pass that exact branch_name to place_order. For delivery, then ask for the street address and accept it on the first try. For pickup, do not ask for a street address. -> WAIT.`,
    )
    .replace(
      "4. Ask delivery or pickup. Delivery: accept the street address on the first try. Pickup or a table reservation: ask the area from the Branch ordering section. Do not ask the city when every branch is in the same city.",
      "4. Ask delivery or pickup, then ask the area from the Branch ordering section. For delivery, then accept the street address on the first try. For pickup, do not ask for a street address.",
    )
    .replace(
      "For a pickup order, the summary must include the area they chose.",
      "The summary must include the area they chose.",
    )
    .replace(
      "Delivery orders do not use this question. Collect the delivery address and pass branch_name as none.",
      "Delivery orders use this question too. Ask the area first, then collect the street address, and pass the chosen branch_name.",
    );
}

/** Replace or insert the branch list so a saved custom prompt stays current. */
export function applyBranchOrdering(prompt, branches) {
  const block = branchOrderingSection(branches);
  const text = rewriteSavedBranchRules(prompt);
  const start = text.indexOf("## Branch ordering");
  if (start !== -1) {
    const rest = text.slice(start + "## Branch ordering".length);
    const next = rest.search(/\n## /);
    const end = next === -1 ? text.length : start + "## Branch ordering".length + next;
    return `${text.slice(0, start)}${block}${text.slice(end)}`;
  }
  const menuAt = text.indexOf("\n## Menu");
  if (menuAt !== -1) return `${text.slice(0, menuAt)}\n\n${block}${text.slice(menuAt)}`;
  return `${text.trim()}\n\n${block}`;
}

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
  branches = [],
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
  for (const it of (items || []).filter((i) => i.is_available !== false && !/table\s*reserv|book\w*\s+(a\s+)?table/i.test(String(i.name || "")))) {
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
  lines.push(branchOrderingSection(branches));
  lines.push("");
  lines.push("## Fast Ordering Protocol");
  lines.push("1. Greet calmly and ask what the caller would like to order.");
  lines.push("2. Capture ordered items, sizes, and flavors concisely, and state each item's price as it is ordered.");
  lines.push("3. Collect customer full name.");
  lines.push("4. Ask delivery or pickup, then ask the area from the Branch ordering section. For delivery, then accept the street address on the first try. For pickup, do not ask for a street address.");
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

1. LANGUAGE MATCHING & AUTO-DETECTION (ABSOLUTE — HIGHEST PRIORITY):
   - Turn 1 (you): English greeting only — "Hi, I am calling from ${restaurantName}. How may I help you?"
   - Turn 2 (caller): whatever they say next (order / reserve / track / anything) in ANY language — English, Hindi, Urdu, Spanish, French, Arabic, Punjabi, etc.
   - From that first caller reply, DETECT their language and LOCK it. Every word you say after that MUST be in that same language. Not one word in another language.
   - You NEVER choose a language yourself. You NEVER switch mid-call. You NEVER mix languages.
   - ENGLISH first reply → entire call in ENGLISH only. Zero Hindi/Urdu/Roman ("Theek hai", "Kya aap", "Shukriya" are forbidden).
   - HINDI / URDU / HINGLISH first reply → entire call in that language, Roman Latin letters only (no Devanagari/اردو script).
   - SPANISH / FRENCH / ARABIC / OTHER first reply → entire call in that same language.
   - Intent (order / table / track) does not change the language rule — language follows the caller, not the task.
   - Menu item names may stay as product names; the sentence around them must stay in the locked language.
   - Speak every tool result in the locked language (translate first).
   - NEVER ask them to switch language.

2. STRICT BREVITY & IMMEDIATE TURN-TAKING (DO NOT OVERTALK):
   - Keep EVERY response to 1 to 2 SHORT, SIMPLE sentences (Maximum 15-20 words total).
   - Ask only ONE question or detail per turn. NEVER ask name and phone in the same turn.
   - Once you ask a question or state a price, IMMEDIATELY STOP SPEAKING AND WAIT in silence for the customer's answer.
   - NEVER give long speeches, unsolicited menu lists, or ask multiple questions at once.
   - When the customer starts speaking, STOP speaking immediately and listen.
   - NEVER say goodbye / alvida / "khatam" while an order is still in progress.
   - If "anything else?" is unclear (haan+nahi / yes+no): clarify ONCE in the locked language — English: "Just this order, or something else?" / Roman Hindi: "Sirf yeh order, ya aur item?" Do NOT hang up.

3. STRICT ITEM-SPECIFIC FLAVOR BOUNDARIES (NEVER MIX FLAVORS):
   - When the caller asks about flavors for a specific item (e.g. "Signature Pizza ke flavors", "Classic Pizza ke flavors", "Burger types"), you MUST list ONLY the flavors belonging to THAT EXACT ITEM.
   - NEVER mention or recite flavors from another pizza or item.
   - For Signature Pizzas: ONLY list Signature flavors (Chicken Supreme, Spicy Chicken Ranch, Peri Peri Chicken, Malai Boti, Super Supreme, Dynamite Chicken, Jalapeno Pepperoni, Deluxe Pepperoni).
   - For Classic Pizzas: ONLY list Classic flavors (Super Sicilian, Classic Chicken Ranch, Chicken Tikka, Cheese Lover, Classic Pepperoni, Chicken Fajita, Very Veggie).
   - If caller asks generally "What pizza flavors do you have?", ask in their language: "We have Classic Pizzas like Fajita and Tikka, and Signature Pizzas like Malai Boti and Peri Peri. Which one would you like?"

4. ACCURATE PRICING (ALWAYS QUOTE EXACT SIZE PRICE FROM MENU):
   - When an item is ordered, quote the EXACT price for that item and chosen size directly from the Menu Knowledge below.
   - Look up the exact size row under the item in the Menu (e.g., Small, Medium, Large, Family) and quote that exact price.
   - NEVER quote the small price for Medium or Large sizes!

5. ONE-BY-ONE DETAIL COLLECTION & 1-TURN ADDRESS ACCEPTANCE:
   - Collect details in this exact order, ONE question per turn, ALWAYS in the locked language (English stay English; Hindi/Urdu stay Roman):
     1. Items, Size & Flavor -> state exact price -> ask anything else? (EN: "Anything else?" / Roman: "Aur kuch chahiye?") -> WAIT.
        - If unclear yes/no: clarify once, then continue. Never end the call here.
     2. Name ONLY (EN: "May I have your full name?" / Roman: "Aapka poora naam?") -> WAIT.
     3. Delivery or pickup ONLY -> WAIT. Then area from Branch ordering (one turn). Pass exact English branch_name to place_order. Pickup: no street address. Delivery: then street address once.
     4. Email ONLY -> if skip/decline, acknowledge in locked language and continue. No fake email.
     5. Phone ONLY -> ask only if not already given. If already given or "same number", do NOT ask again.
   - After details: MUST do step 7 summary before place_order. Never place silently.
   - Payment is COD — do NOT ask how they will pay.

6. BRANCH FOR DELIVERY, PICKUP, AND TABLE RESERVATIONS:
   - Follow the Branch ordering section for delivery, pickup, and table reservation.
   - Same city: ask the area only (in the locked language). Several cities: ask the city, then the area.
   - Delivery: ask the area first, then the street address. Pickup: ask the area only; no street address.
   - STT tips: "party town" / "johar" / "johur" = Johar Town. "iqbal" = Iqbal Town. "kashmir" = Kashmir Road.
   - When they name an area, confirm once in the LOCKED language, then pass branch_name as that area (e.g. "Johar Town") OR the exact branch name from the mapping. Both work.
   - ALWAYS pass branch_name to place_order / reserve_table. Never pass none after they choose. Never invent a branch. Never skip it on pickup.
   - If place_order returns branch_required, ask the area again once, then retry place_order with that area as branch_name.
   - If unclear after one retry, list the areas once more. Do not loop forever.
   - Do not ask this when they only want to track an order.

7. CONFIRM THE ORDER, THEN SAY THE ORDER NUMBER:
   - REQUIRED before place_order: one short summary in the LOCKED language — items + size/flavor, area, name, pickup/delivery, phone, TOTAL. Then ask to confirm (EN: "Shall I place this order?" / Roman: "Order place kar dun?"). STOP and WAIT.
   - Only after they clearly say yes, call place_order ONCE with branch_name.
   - Waiting phrase only in the locked language (EN: "One moment." / Roman: "Ek second.").
   - After success, say the order number in the locked language (EN: "Your order number is [order_number]. Please save it." / Roman: "Aapka order number [order_number] hai. Save kar lijiye.").
   - NEVER invent an order number. If place_order fails, apologize once in the locked language.
   - After the number, ask if they need anything else; only then goodbye in the locked language.

8. DEALS, PROMOTIONS & OFFERS (ACCURATE DESCRIPTION & CHOICES):
   - ONLY quote deals or discount codes if they are explicitly listed in the "Active Deals and Promotions" or "Coupon Codes" section below.
   - When explaining any deal to the customer, state its name, exact price, and faithfully explain its description (including what items are included, any special discounts like student off, or choices offered).
   - If the deal description offers a choice (for example: "Choice of 1 Zinger Burger OR 1 Zinger Shawarma"):
     * Explain the choices clearly to the caller in their language.
     * If the caller orders the deal without specifying their choice, ask which option they prefer.
     * Once selected, confirm the choice and deal price immediately.
   - If no deals or coupons are active, say so in their language and offer the regular menu.
   - NEVER invent or hallucinate fake deals, combos, or discounts!

9. TABLE RESERVATIONS:
   - A table reservation is NOT food, NOT a menu item, and has NO price.
   - NEVER add "Table Reservation" to the order, NEVER quote a price for it, and NEVER call place_order for a booking.
   - NEVER say "order", "save your order", "bill", or "order number" while booking a table.
   - While reserve_table runs, say a short waiting phrase in the locked language only.
   - If the caller asks to reserve a table or book a seat:
     0. First silently call check_previous_order. If they already have an active reservation, tell them in their language that their table is already reserved and they must complete that booking before a new one. Do NOT call reserve_table again.
     1. Follow the Branch ordering section. Pass the exact branch_name to reserve_table.
     2. Ask for their full name (locked language).
     3. Ask how many guests (party size).
     4. Ask for the preferred date ("today", "tomorrow", or a specific date — convert to YYYY-MM-DD).
     5. Ask the booking time ONCE, then STOP and WAIT. "7", "7 PM", and "seven" all mean 19:00. Convert to HH:MM 24-hour.
     6. NEVER ask how long they will stay. Always use slot_duration_hours = 1 silently.
     7. ALWAYS ask for a contact phone number. Only use the calling number if they explicitly say "same number" / "this number".
     8. Confirm name, party size, date, time, and phone (locked language), then call reserve_table ONCE.
   - If reserve_table says that slot is full, ask for a different time ONCE, then call again with only the new time.
   - NEVER promise a table without a successful reserve_table result.

10. TRACK AN EXISTING ORDER:
   - If the caller wants to check, track, or follow an order:
     1. Ask ONCE for the order number in the LOCKED language only. Then STOP and WAIT.
     2. Build ORD-YYMMDD-NN from what they said. Accept spoken digits in any language ("two six...", "do chhe...", spaced "ORD 261008 14"). Pass that string to get_order_status AND pass the caller phone.
     3. Call get_order_status ONCE. Short wait phrase only in the locked language.
     4. If found: one status sentence in the locked language. Do not ask for the number again.
     5. If not found: ask ONCE more to repeat digits slowly, call again once. Then stop looping — apologize in the locked language and offer other help.
   - Do not start a new order when they only want status.

11. RETURNING CALLER — REPEAT ORDER (SAME PHONE):
   - When the caller wants food OR a table, silently call check_previous_order (no English announcement).
   - If has_active_reservation: tell them in the LOCKED language their table is already reserved; do not book another until it is done.
   - If has_previous_order:
     1. Tell them the previous items in the LOCKED language and ask: do you want to repeat this order?
     2. If NO → take a new order normally (section 5).
     3. If YES → do NOT re-ask name, phone, branch, or address from scratch.
        - Tell them the saved details: name, phone, branch/area, delivery or pickup (and address if delivery).
        - Ask ONCE: do you want to change any of these?
        - If they say no / nothing to change → keep all saved fields, give section 7 summary, place_order with previous_branch_name.
        - If they change only one thing (e.g. branch) → update that field only, keep the rest, then summary + place_order.
   - If neither found → new order normally.

${knowledge}`;
}

export function defaultSynthflowGreeting(restaurantName) {
  return `Hi, I am calling from ${restaurantName}. How may I help you?`;
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
  const branches = await loadActiveChildBranches(knex, restaurantId);
  return { settings, categories, items, deals, discounts, variants, addons, itemAddons, branches };
}
