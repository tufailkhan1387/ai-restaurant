/**
 * Build menu + coupons knowledge text embedded into Synthflow agent prompts.
 */
export function buildRestaurantVoiceKnowledge({
  restaurantName,
  settings,
  categories,
  items,
  deals,
  discounts,
  variants = [],
}) {
  const lines = [];
  lines.push(`# ${restaurantName} — Menu, promotions, and ordering rules`);
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
  for (const v of variants) {
    if (v.is_active === false) continue;
    if (!variantMap.has(v.menu_item_id)) variantMap.set(v.menu_item_id, []);
    variantMap.get(v.menu_item_id).push(v);
  }

  lines.push("## Menu");
  const byCategory = new Map();
  for (const it of (items || []).filter((i) => i.is_available !== false)) {
    const k = it.category_id || "uncategorized";
    if (!byCategory.has(k)) byCategory.set(k, []);
    byCategory.get(k).push(it);
  }
  for (const cat of categories || []) {
    const list = byCategory.get(cat.id) || [];
    if (!list.length) continue;
    lines.push("");
    lines.push(`### ${cat.name}`);
    if (cat.description) lines.push(cat.description);
    for (const it of list) {
      const tags = (it.dietary_tags || []).join(", ");
      const desc = it.description ? ` — ${it.description}` : "";
      const itemVars = variantMap.get(it.id) || [];
      const sizes = itemVars.filter((v) => v.variant_type === "size");
      const standaloneFlavors = itemVars.filter((v) => v.variant_type !== "size" && !v.parent_id);

      const extras = [];
      if (sizes.length > 0) {
        const sizeDescs = sizes.map((s) => {
          const childFlavors = itemVars.filter((v) => v.parent_id === s.id && v.variant_type !== "size");
          const sizeLabel = s.measurement ? `${s.name} ${s.measurement}` : s.name;
          const priceStr = `$${Number(s.price).toFixed(2)}`;
          if (childFlavors.length > 0) {
            return `${sizeLabel} (${priceStr}, flavors: ${childFlavors.map((f) => f.name).join(", ")})`;
          }
          return `${sizeLabel} (${priceStr})`;
        });
        extras.push(`Sizes: ${sizeDescs.join("; ")}`);
      }
      if (standaloneFlavors.length > 0) {
        extras.push(
          `Flavors: ${standaloneFlavors
            .map((f) => (Number(f.price) > 0 ? `${f.name} (+$${Number(f.price).toFixed(2)})` : f.name))
            .join(", ")}`
        );
      }

      if (extras.length > 0) {
        lines.push(
          `- ${it.name}: [${extras.join(" | ")}]${desc}${tags ? ` [${tags}]` : ""}`,
        );
      } else {
        lines.push(
          `- ${it.name}: ${Number(it.price).toFixed(2)}${desc}${tags ? ` [${tags}]` : ""}`,
        );
      }
    }
  }
  const uncategorized = byCategory.get("uncategorized") || [];
  if (uncategorized.length) {
    lines.push("");
    lines.push("### Other items");
    for (const it of uncategorized) {
      const itemVars = variantMap.get(it.id) || [];
      const sizes = itemVars.filter((v) => v.variant_type === "size");
      const standaloneFlavors = itemVars.filter((v) => v.variant_type !== "size" && !v.parent_id);
      const extras = [];
      if (sizes.length > 0) {
        const sizeDescs = sizes.map((s) => {
          const childFlavors = itemVars.filter((v) => v.parent_id === s.id && v.variant_type !== "size");
          const sizeLabel = s.measurement ? `${s.name} ${s.measurement}` : s.name;
          const priceStr = `$${Number(s.price).toFixed(2)}`;
          if (childFlavors.length > 0) {
            return `${sizeLabel} (${priceStr}, flavors: ${childFlavors.map((f) => f.name).join(", ")})`;
          }
          return `${sizeLabel} (${priceStr})`;
        });
        extras.push(`Sizes: ${sizeDescs.join("; ")}`);
      }
      if (standaloneFlavors.length > 0) {
        extras.push(
          `Flavors: ${standaloneFlavors
            .map((f) => (Number(f.price) > 0 ? `${f.name} (+$${Number(f.price).toFixed(2)})` : f.name))
            .join(", ")}`
        );
      }
      if (extras.length > 0) {
        lines.push(`- ${it.name}: [${extras.join(" | ")}]`);
      } else {
        lines.push(`- ${it.name}: ${Number(it.price).toFixed(2)}`);
      }
    }
  }

  if (deals?.length) {
    lines.push("");
    lines.push("## Active deals and promotions");
    for (const d of deals) {
      lines.push(
        `- ${d.name}: ${Number(d.price).toFixed(2)}${d.description ? ` — ${d.description}` : ""}`,
      );
    }
  }

  if (discounts?.length) {
    lines.push("");
    lines.push("## Coupon codes");
    lines.push(
      "Explain these coupons when asked. Only apply a code if the customer provides it and the order meets any minimum.",
    );
    for (const c of discounts) {
      const type = String(c.discount_type || "percentage").toLowerCase();
      const value = Number(c.value ?? c.discount_value ?? 0);
      const offer =
        type === "fixed" ? `${value.toFixed(2)} off` : `${value}% off`;
      const min = Number(c.min_order_amount || 0);
      lines.push(
        `- Code ${c.code}: ${offer}${c.description ? ` — ${c.description}` : ""}${
          min > 0 ? ` (min order ${min})` : ""
        }`,
      );
    }
  } else {
    lines.push("");
    lines.push("## Coupon codes");
    lines.push("No active coupon codes right now.");
  }

  lines.push("");
  lines.push("## Ordering workflow");
  lines.push(
    "1. Greet the caller and offer to take a new order, explain the menu, or answer questions about coupons and promotions.",
  );
  lines.push(
    "2. Collect: full name, callback phone, delivery or pickup, delivery address when needed, items with quantities, special notes, and optional coupon code.",
  );
  lines.push(
    "3. Confirm item names and quantities against the menu above. Never invent menu items or prices.",
  );
  lines.push(
    "4. Tell the caller their order will be confirmed after the call is processed. Read back the order summary before ending.",
  );
  lines.push(
    "5. If they only have questions and do not want to order, answer helpfully and end politely without forcing an order.",
  );

  return lines.join("\n");
}

export function defaultSynthflowPrompt(restaurantName, knowledge) {
  return `You are the friendly phone ordering assistant for ${restaurantName}.
Your job on every call:
- Answer questions about the restaurant menu, prices, deals, and coupon codes.
- Take food orders for delivery or pickup.
- Apply eligible coupon codes the customer provides (do not invent codes).
- Confirm the full order details before ending the call.

Rules:
- Be concise, warm, and professional.
- Only sell items listed in the knowledge section.
- If an item is unavailable or not on the menu, say so politely and suggest alternatives.
- Ask clarifying questions when quantities, size, or address are unclear.
- Never claim payment was charged unless the customer explicitly pays; default payment is cash on delivery or pickup.

${knowledge}`;
}

export function defaultSynthflowGreeting(restaurantName) {
  return `Hi, thanks for calling ${restaurantName}! I can help with our menu, current coupons and promotions, or take your order. How can I help you today?`;
}

/** Load restaurant catalog used for Synthflow prompt sync. */
export async function loadRestaurantVoiceCatalog(knex, restaurantId) {
  const [settings, categories, items, deals, discounts, variants] = await Promise.all([
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
  ]);
  return { settings, categories, items, deals, discounts, variants };
}
