const AGENT_SOURCES = new Set(["phone", "call", "voice", "ai", "synthflow", "elevenlabs"]);

/** Who placed the order: restaurant staff, or the phone agent. */
export function orderTaker(
  source?: string | null,
  callId?: string | null,
): "staff" | "agent" | null {
  const value = String(source || "").trim().toLowerCase();
  if (value === "staff" || value === "manual" || value === "dashboard") return "staff";
  if (AGENT_SOURCES.has(value) || callId) return "agent";
  return null;
}

export function orderTakerLabel(source?: string | null, callId?: string | null): string | null {
  const taker = orderTaker(source, callId);
  if (taker === "staff") return "Staff";
  if (taker === "agent") return "Agent";
  return null;
}
