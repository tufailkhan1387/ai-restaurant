/** Keep amounts in sync with backend/src/billing/plans.js */

export type BillingPlanId = "starter" | "growth" | "pilot";
export type BillingInterval = "month" | "year";

export type PlanFeatures = {
  branches: boolean;
  staff_management: boolean;
  max_locations: number;
};

export const PLAN_FEATURES: Record<BillingPlanId, PlanFeatures> = {
  starter: { branches: false, staff_management: false, max_locations: 1 },
  growth: { branches: true, staff_management: true, max_locations: 5 },
  pilot: { branches: true, staff_management: true, max_locations: 5 },
};

export const BILLING_PLANS: Record<
  BillingPlanId,
  { name: string; monthly: number; yearly: number; yearlyNote: string; includedMinutes: number }
> = {
  starter: { name: "Starter", monthly: 299, yearly: 2990, yearlyNote: "2 months free", includedMinutes: 1000 },
  growth: { name: "Growth", monthly: 599, yearly: 5990, yearlyNote: "2 months free", includedMinutes: 2500 },
  pilot: { name: "Pilot", monthly: 400, yearly: 4800, yearlyNote: "Same $400/mo rate, billed yearly", includedMinutes: 2500 },
};

/** One-time top-up packs (keep in sync with backend/src/billing/minutePacks.js). */
export type MinutePackId = "m300" | "m500" | "m1000" | "m2000";

export const MINUTE_PACKS: Record<
  MinutePackId,
  { id: MinutePackId; minutes: number; dollars: number; label: string }
> = {
  m300: { id: "m300", minutes: 300, dollars: 60, label: "300 minutes" },
  m500: { id: "m500", minutes: 500, dollars: 100, label: "500 minutes" },
  m1000: { id: "m1000", minutes: 1000, dollars: 170, label: "1,000 minutes" },
  m2000: { id: "m2000", minutes: 2000, dollars: 300, label: "2,000 minutes" },
};

export function includedMinutesForPlan(plan: string | null | undefined) {
  const key = String(plan || "").toLowerCase() as BillingPlanId;
  if (!key) return BILLING_PLANS.growth.includedMinutes;
  return BILLING_PLANS[key]?.includedMinutes ?? BILLING_PLANS.growth.includedMinutes;
}

export function planAmount(plan: BillingPlanId, interval: BillingInterval) {
  const row = BILLING_PLANS[plan];
  return interval === "year" ? row.yearly : row.monthly;
}

export function formatPlanPrice(dollars: number) {
  return `$${dollars.toLocaleString("en-US")}`;
}

/** Null/unknown plan = legacy restaurant → full features. Only explicit `starter` is limited. */
export function featuresForPlan(plan: string | null | undefined): PlanFeatures {
  const key = String(plan || "").toLowerCase() as BillingPlanId;
  if (!key) return PLAN_FEATURES.growth;
  return PLAN_FEATURES[key] || PLAN_FEATURES.growth;
}
