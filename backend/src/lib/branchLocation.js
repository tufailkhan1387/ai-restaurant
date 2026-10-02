function clean(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function samePlace(a, b) {
  return clean(a).toLowerCase() === clean(b).toLowerCase();
}

/** Area the caller should hear. Falls back to the branch name. */
export function branchArea(branch) {
  const explicit = clean(branch?.area);
  if (explicit) return explicit;
  let name = clean(branch?.name);
  name = name
    .replace(/\bbranch\b/gi, "")
    .replace(/^royal restaurant\s*/i, "")
    .replace(/^royal\s*[-–]\s*/i, "")
    .trim();
  return name || clean(branch?.address) || clean(branch?.name);
}

/** City when one was saved, or the last part of an address such as "DHA, Lahore". */
export function branchCity(branch) {
  const explicit = clean(branch?.city);
  if (explicit) return explicit;
  const parts = clean(branch?.address)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return "";
  const last = parts[parts.length - 1].replace(/\d+/g, "").trim();
  if (!last || last.length < 3) return "";
  if (/phase|town|sector|street|road|colony|blvd|block/i.test(last)) return "";
  return last;
}

/**
 * How the phone agent should ask for a pickup order or a table reservation.
 * Several cities: ask city, then area. One city: ask area only.
 */
export function branchQuestionPlan(branches) {
  const list = (branches || []).filter((branch) => clean(branch?.name) || branchArea(branch));
  const located = list.map((branch) => ({
    branch,
    city: branchCity(branch),
    area: branchArea(branch),
    name: clean(branch.name),
  }));
  const cities = [...new Set(located.map((row) => row.city).filter(Boolean).map((city) => city.toLowerCase()))];
  const byCity = new Map();
  for (const row of located) {
    const key = row.city || "";
    if (!byCity.has(key)) byCity.set(key, []);
    byCity.get(key).push(row);
  }
  return {
    rows: located,
    multiCity: cities.length > 1,
    cities: [...byCity.entries()].map(([cityKey, rows]) => ({
      city: rows.find((row) => row.city)?.city || cityKey,
      rows,
    })),
  };
}

export function branchOrderingSection(branches) {
  const plan = branchQuestionPlan(branches);
  if (!plan.rows.length) {
    return [
      "## Branch ordering",
      "This restaurant has no branches.",
      "Do not ask for a city or an area. Pass branch_name as none.",
    ].join("\n");
  }

  if (plan.rows.length === 1) {
    const only = plan.rows[0];
    return [
      "## Branch ordering",
      "This section overrides any older line that says not to ask which branch for a delivery order.",
      "Use this for DELIVERY orders, PICKUP orders, and TABLE RESERVATIONS.",
      "Do not ask this when the caller only wants to track an order.",
      `There is one location: ${only.area}${only.city ? `, ${only.city}` : ""}.`,
      "Do not ask for a city or an area.",
      `Pass branch_name as "${only.name}".`,
      "For a delivery order, still collect the street address. For pickup, do not ask for a street address.",
    ].join("\n");
  }

  const lines = [
    "## Branch ordering",
    "This section overrides any older line that told a delivery order to skip the area question.",
    "Use this for DELIVERY orders, PICKUP orders, and TABLE RESERVATIONS.",
    "Do not ask this when the caller only wants to track an order.",
  ];

  if (plan.multiCity) {
    const cityNames = plan.cities.map((group) => group.city).filter(Boolean);
    lines.push("These branches are in more than one city. Ask for the city first, then the area. Ask one question, then stop and wait.");
    lines.push(`Ask: "Which city would you like: ${cityNames.join(" or ")}?"`);
    for (const group of plan.cities) {
      const areas = group.rows.map((row) => row.area).filter(Boolean);
      lines.push(`After they choose ${group.city || "that city"}, ask: "Which area: ${areas.join(" or ")}?" Then stop and wait.`);
      for (const row of group.rows) {
        lines.push(`- ${group.city ? `${group.city}, ` : ""}${row.area} → branch_name "${row.name}"`);
      }
    }
  } else {
    const city = plan.cities.find((group) => group.city)?.city || "";
    const areas = plan.rows.map((row) => row.area).filter(Boolean);
    lines.push(
      city
        ? `All branches are in ${city}. Ask for the area only. Do not ask which city.`
        : "These branches are in the same city. Ask for the area only. Do not ask which city.",
    );
    lines.push(`Ask: "Which area would you like: ${areas.join(" or ")}?" Then stop and wait.`);
    for (const row of plan.rows) {
      lines.push(`- ${row.area} → branch_name "${row.name}"`);
    }
  }

  lines.push("Ask this before the street address on a delivery order. After they choose the area, ask for the complete delivery address and accept it on the first try.");
  lines.push("For a pickup order, do not ask for a street address.");
  lines.push("Pass the matching exact branch_name to place_order and reserve_table.");
  lines.push("Use only a city and area from this list.");
  lines.push("Never invent a city, area, or branch.");
  return lines.join("\n");
}

/** Parent restaurant id, or the chosen branch when the caller named a city or area. */
export async function resolveSpokenBranchId(knex, restaurantId, spoken) {
  if (!restaurantId) return restaurantId;
  const restaurant = await knex("restaurants").where({ id: restaurantId }).select("id", "parent_restaurant_id").first();
  const parentId = restaurant?.parent_restaurant_id || restaurantId;
  const branches = await knex("restaurants").where({ parent_restaurant_id: parentId, is_active: true });
  const chosen = matchBranchChoice(branches, spoken);
  return chosen?.id || restaurantId;
}

/** Match a spoken branch, area, or "city area" to one open branch. */
export function matchBranchChoice(branches, spoken) {
  const raw = clean(spoken).toLowerCase();
  if (!raw || ["none", "null", "n/a", "na", "any", "no", "no preference"].includes(raw)) return null;
  const open = (branches || []).filter((branch) => branch && branch.is_accepting_orders !== false && branch.is_active !== false);
  const scored = open
    .map((branch) => {
      const labels = [clean(branch.name), branchArea(branch), branchCity(branch)]
        .filter(Boolean)
        .map((label) => label.toLowerCase());
      const city = branchCity(branch).toLowerCase();
      const area = branchArea(branch).toLowerCase();
      if (city && area) labels.push(`${city} ${area}`, `${area} ${city}`);
      let score = 0;
      for (const label of labels) {
        if (!label) continue;
        if (label === raw) score = Math.max(score, 4);
        else if (raw.includes(label) || label.includes(raw)) score = Math.max(score, label.length > 3 ? 2 : 0);
      }
      return { branch, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || clean(b.branch.name).length - clean(a.branch.name).length);
  if (!scored.length) return null;
  if (scored.length > 1 && scored[0].score === scored[1].score && !samePlace(scored[0].branch.name, scored[1].branch.name)) {
    return null;
  }
  return scored[0].branch;
}
