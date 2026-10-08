/**
 * Helpers for ElevenLabs ConvAI server tools and post-call webhooks.
 * ElevenLabs may send a flat JSON body, nested `body`, or `parameters`.
 */

/** Best-effort E.164-ish normalization for Twilio-style numbers. */
export function normalizeE164(phone) {
  if (phone == null || phone === "") return "";
  const s = String(phone).trim();
  if (s.startsWith("+")) return `+${s.slice(1).replace(/\D/g, "")}`;
  const digits = s.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length >= 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length > 0) return `+${digits}`;
  return s;
}

/**
 * Flatten tool / webhook JSON so our handlers always see twilio_to, elevenlabs_agent_id, etc.
 * @param {Record<string, unknown>} raw
 * @returns {Record<string, unknown>}
 */
export function normalizeElevenLabsToolBody(raw) {
  if (!raw || typeof raw !== "object") return {};
  /** @type {Record<string, unknown>} */
  const out = { ...raw };

  const nestedBody = raw.body;
  if (nestedBody && typeof nestedBody === "object" && !Array.isArray(nestedBody)) {
    Object.assign(out, nestedBody);
  }
  const params = raw.parameters;
  if (params && typeof params === "object" && !Array.isArray(params)) {
    Object.assign(out, params);
  }
  const args = raw.args;
  if (args && typeof args === "object" && !Array.isArray(args)) {
    Object.assign(out, args);
  }

  const twilioTo =
    out.twilio_to ??
    out.TwilioTo ??
    out.to_number ??
    out.toNumber ??
    out.dialed_number ??
    out.called_number ??
    out.system_number ??
    out.To ??
    out.to;
  if (twilioTo != null && twilioTo !== "" && !out.twilio_to) {
    out.twilio_to = String(twilioTo).trim();
  }

  const agentRef =
    out.elevenlabs_agent_id ?? out.agent_id ?? out.agentId ?? out.elevenlabsAgentId;
  if (agentRef != null && agentRef !== "" && !out.elevenlabs_agent_id) {
    out.elevenlabs_agent_id = String(agentRef).trim();
  }

  const callSid = out.call_sid ?? out.CallSid ?? out.twilio_call_sid;
  if (callSid != null && callSid !== "" && !out.call_sid) {
    out.call_sid = String(callSid).trim();
  }

  // Normalize items: ElevenLabs may send as a plain string like "2 Pizza, 1 Burger"
  if (out.items && !Array.isArray(out.items) && typeof out.items === "string") {
    const itemStr = out.items.trim();
    out.items = itemStr
      .split(/,\s*/)
      .map((part) => {
        const match = part.trim().match(/^(\d+)\s*[xX]?\s*(.+)$/) || part.trim().match(/^(.+?)\s+[xX]?(\d+)$/);
        if (match) {
          const [, a, b] = match;
          const qty = parseInt(a, 10);
          if (!isNaN(qty)) return { name: b.trim(), quantity: qty };
          return { name: a.trim(), quantity: parseInt(b, 10) || 1 };
        }
        return { name: part.trim(), quantity: 1 };
      })
      .filter((it) => it.name);
  }

  return out;
}

/**
 * Resolve restaurant for place_order / order_status when Twilio webhook is bypassed.
 * @param {import("knex").Knex} knex
 * @param {Record<string, unknown>} b normalized tool body
 * @returns {Promise<{ id: string | null; error?: string }>}
 */
export async function resolveRestaurantIdForVoiceTools(knex, b) {
  if (b.restaurant_id) {
    const row = await knex("restaurants").where({ id: String(b.restaurant_id) }).select("id").first();
    if (row) return { id: row.id };
  }

  if (b.elevenlabs_agent_id) {
    const row = await knex("restaurants")
      .where({ elevenlabs_agent_id: String(b.elevenlabs_agent_id) })
      .select("id")
      .first();
    if (row) return { id: row.id };
  }

  if (b.synthflow_agent_id) {
    const row = await knex("restaurants")
      .where({ synthflow_agent_id: String(b.synthflow_agent_id) })
      .select("id")
      .first();
    if (row) return { id: row.id };
  }

  if (b.twilio_to) {
    const raw = String(b.twilio_to).trim();
    const norm = normalizeE164(raw);
    let row = await knex("restaurants").where({ twilio_phone_number: raw }).select("id").first();
    if (!row && norm && norm !== raw) {
      row = await knex("restaurants").where({ twilio_phone_number: norm }).select("id").first();
    }
    if (!row) {
      row = await knex("restaurants").where({ telnyx_phone_number: raw }).select("id").first();
    }
    if (!row && norm) {
      row = await knex("restaurants").where({ telnyx_phone_number: norm }).select("id").first();
    }
    if (row) return { id: row.id };
  }

  // Synthflow sends caller_phone (= dialed number) on tool calls - match against telnyx/twilio phone
  if (b.caller_phone) {
    const raw = String(b.caller_phone).trim();
    const norm = normalizeE164(raw);
    let row = await knex("restaurants").where({ telnyx_phone_number: raw }).select("id").first();
    if (!row && norm && norm !== raw) {
      row = await knex("restaurants").where({ telnyx_phone_number: norm }).select("id").first();
    }
    if (!row) {
      row = await knex("restaurants").where({ twilio_phone_number: raw }).select("id").first();
    }
    if (!row && norm && norm !== raw) {
      row = await knex("restaurants").where({ twilio_phone_number: norm }).select("id").first();
    }
    if (row) return { id: row.id };
  }

  const active = await knex("restaurants").where({ is_active: true }).select("id").orderBy("created_at", "asc");
  if (active.length === 1) return { id: active[0].id };
  if (active.length === 0) return { id: null, error: "no active restaurant found" };

  const defaultId = String(process.env.ELEVENLABS_DEFAULT_RESTAURANT_ID || "").trim();
  if (defaultId) {
    const row = await knex("restaurants").where({ id: defaultId }).select("id").first();
    if (row) return { id: row.id };
    return { id: null, error: `ELEVENLABS_DEFAULT_RESTAURANT_ID not found: ${defaultId}` };
  }

  return {
    id: null,
    error:
      "multiple restaurants: include twilio_to (dialed E.164), restaurant_id, or elevenlabs_agent_id on every tool call (or set ELEVENLABS_DEFAULT_RESTAURANT_ID on the server)",
  };
}

/**
 * Resolve restaurant from ElevenLabs post-call metadata (native Twilio or stream).
 * @param {import("knex").Knex} knex
 * @param {Record<string, unknown>} metadata
 * @param {Record<string, unknown>} payload
 */
export async function resolveRestaurantIdFromElConversation(knex, metadata, payload) {
  const m = metadata && typeof metadata === "object" ? { ...metadata } : {};
  const dyn = payload?.dynamic_variables;
  if (dyn && typeof dyn === "object") Object.assign(m, dyn);

  const agentId =
    m.agent_id ?? m.elevenlabs_agent_id ?? payload?.agent_id ?? payload?.agentId;
  if (agentId) {
    const row = await knex("restaurants")
      .where({ elevenlabs_agent_id: String(agentId) })
      .select("id")
      .first();
    if (row) return row.id;
  }

  const to =
    m.twilio_to ??
    m.to_number ??
    m.system_number ??
    m.called_number ??
    m.To ??
    m.to ??
    m.phone_number_to;
  if (to) {
    const raw = String(to).trim();
    const norm = normalizeE164(raw);
    let row = await knex("restaurants").where({ twilio_phone_number: raw }).select("id").first();
    if (!row && norm && norm !== raw) {
      row = await knex("restaurants").where({ twilio_phone_number: norm }).select("id").first();
    }
    if (row) return row.id;
  }

  const [first] = await knex("restaurants").where({ is_active: true }).select("id").orderBy("created_at", "asc").limit(1);
  return first?.id ?? null;
}
