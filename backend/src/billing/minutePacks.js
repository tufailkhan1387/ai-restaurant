/** One-time voice-minute top-up packs. Keep in sync with src/lib/billingPlans.ts */

export const PLAN_INCLUDED_MINUTES = {
  starter: 1000,
  growth: 2500,
  pilot: 2500,
};

export const MINUTE_PACKS = {
  m300: { id: "m300", minutes: 300, amountCents: 6000, label: "300 minutes" },
  m500: { id: "m500", minutes: 500, amountCents: 10000, label: "500 minutes" },
  m1000: { id: "m1000", minutes: 1000, amountCents: 17000, label: "1,000 minutes" },
  m2000: { id: "m2000", minutes: 2000, amountCents: 30000, label: "2,000 minutes" },
};

export function includedMinutesForPlan(planId) {
  const key = String(planId || "").toLowerCase();
  if (!key) return PLAN_INCLUDED_MINUTES.growth;
  return PLAN_INCLUDED_MINUTES[key] ?? PLAN_INCLUDED_MINUTES.growth;
}

export function getMinutePack(packId) {
  return MINUTE_PACKS[String(packId || "").toLowerCase()] || null;
}

export function listMinutePacks() {
  return Object.values(MINUTE_PACKS).map((p) => ({
    id: p.id,
    minutes: p.minutes,
    amount_cents: p.amountCents,
    label: p.label,
    currency: "usd",
  }));
}

/** Billable minutes for a call duration (ceil). Zero-length calls bill nothing. */
export function secondsToBillableMinutes(durationSeconds) {
  const secs = Math.max(0, Number(durationSeconds) || 0);
  if (secs <= 0) return 0;
  return Math.max(1, Math.ceil(secs / 60));
}

async function restaurantFamilyIds(knex, restaurantId) {
  const ids = [restaurantId];
  try {
    const restaurant = await knex("restaurants").where({ id: restaurantId }).first();
    if (!restaurant) return ids;
    const rootId = restaurant.is_branch && restaurant.parent_restaurant_id
      ? restaurant.parent_restaurant_id
      : restaurant.id;
    if (!ids.includes(rootId)) ids.push(rootId);
    const branches = await knex("restaurants").where({ parent_restaurant_id: rootId }).select("id");
    for (const b of branches || []) {
      if (b?.id && !ids.includes(b.id)) ids.push(b.id);
    }
  } catch {
    /* ignore */
  }
  return ids;
}

async function sumCallSecondsForRestaurant(knex, restaurantId) {
  try {
    const hasCol = await knex.schema.hasColumn("calls", "restaurant_id");
    if (!hasCol) return null;
    const ids = await restaurantFamilyIds(knex, restaurantId);
    const row = await knex("calls")
      .whereIn("restaurant_id", ids)
      .where(function inboundAi() {
        // Customer AI calls (order / track / reserve). Skip auto-dialer outbound campaigns.
        this.whereNull("direction").orWhere("direction", "inbound").orWhere(function providers() {
          this.whereIn("provider", ["synthflow", "elevenlabs", "telnyx"]);
        });
      })
      .sum({ total: "duration_seconds" })
      .first();
    return Math.max(0, Number(row?.total || 0));
  } catch {
    return null;
  }
}

/**
 * Deduct call talk-time from the restaurant's remaining voice minutes.
 * Uses a delta so repeated webhook updates for the same call only bill the increase.
 * Branch calls are billed to the parent restaurant.
 */
export async function applyCallDurationToMinutes(knex, {
  restaurantId,
  durationSeconds,
  previousDurationSeconds = 0,
  skip = false,
} = {}) {
  if (skip || !restaurantId) return { billedDelta: 0 };

  const prevMin = secondsToBillableMinutes(previousDurationSeconds);
  const nextMin = secondsToBillableMinutes(durationSeconds);
  const delta = nextMin - prevMin;
  if (delta === 0) return { billedDelta: 0 };

  let restaurant = await knex("restaurants").where({ id: restaurantId }).first();
  if (!restaurant) return { billedDelta: 0 };

  if (restaurant.is_branch && restaurant.parent_restaurant_id) {
    const parent = await knex("restaurants").where({ id: restaurant.parent_restaurant_id }).first();
    if (parent) restaurant = parent;
  }

  const used = Math.max(0, Number(restaurant.voice_minutes_used) || 0) + delta;
  await knex("restaurants")
    .where({ id: restaurant.id })
    .update({
      voice_minutes_used: Math.max(0, used),
      updated_at: new Date(),
    });

  return { billedDelta: delta, restaurantId: restaurant.id, used_minutes: Math.max(0, used) };
}

export async function resolveMinuteUsage(knex, restaurant) {
  const included = Number(restaurant.voice_minutes_included) > 0
    ? Number(restaurant.voice_minutes_included)
    : includedMinutesForPlan(restaurant.subscription_plan);

  const purchased = Math.max(0, Number(restaurant.voice_minutes_purchased) || 0);
  let used = Math.max(0, Number(restaurant.voice_minutes_used) || 0);

  const liveSeconds = await sumCallSecondsForRestaurant(knex, restaurant.id);
  if (liveSeconds != null) {
    const fromCalls = secondsToBillableMinutes(liveSeconds);
    used = Math.max(used, fromCalls);
    // Keep stored counter in sync with live call totals.
    if (fromCalls > Number(restaurant.voice_minutes_used || 0)) {
      try {
        await knex("restaurants")
          .where({ id: restaurant.id })
          .update({ voice_minutes_used: fromCalls, updated_at: new Date() });
      } catch {
        /* ignore */
      }
    }
  }

  const total = included + purchased;
  const remaining = Math.max(0, total - used);

  return {
    plan: restaurant.subscription_plan || null,
    included_minutes: included,
    purchased_minutes: purchased,
    used_minutes: used,
    total_minutes: total,
    remaining_minutes: remaining,
  };
}

export async function creditPurchasedMinutes(knex, { restaurantId, minutes }) {
  const add = Math.max(0, Number(minutes) || 0);
  if (!add) return;
  const row = await knex("restaurants").where({ id: restaurantId }).first();
  if (!row) return;
  await knex("restaurants")
    .where({ id: restaurantId })
    .update({
      voice_minutes_purchased: Math.max(0, Number(row.voice_minutes_purchased) || 0) + add,
      updated_at: new Date(),
    });
}

export async function ensureIncludedMinutes(knex, restaurant) {
  const expected = includedMinutesForPlan(restaurant.subscription_plan);
  if (Number(restaurant.voice_minutes_included) === expected) return restaurant;
  const [updated] = await knex("restaurants")
    .where({ id: restaurant.id })
    .update({ voice_minutes_included: expected, updated_at: new Date() })
    .returning("*");
  return updated || { ...restaurant, voice_minutes_included: expected };
}
