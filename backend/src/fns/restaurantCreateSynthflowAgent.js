import { getKnex } from "../db.js";
import {
  createInboundAgent,
  updateAgent,
  createInformationExtractor,
  attachActions,
  toSynthflowLanguage,
  postCallWebhookUrl,
  listWorkspaceNumbers,
} from "../lib/synthflowClient.js";
import {
  buildRestaurantVoiceKnowledge,
  defaultSynthflowGreeting,
  defaultSynthflowPrompt,
  loadRestaurantVoiceCatalog,
} from "../lib/restaurantVoiceContext.js";
import { normalizeE164 } from "../lib/voiceWebhookUtils.js";

const ORDER_EXTRACTORS = [
  {
    kind: "YES_NO",
    identifier: "order_placed",
    description: "Did the caller successfully place a food order during this call?",
  },
  {
    kind: "OPEN_QUESTION",
    identifier: "customer_name",
    description: "What is the customer's full name for the order?",
    examples: ["Jane Smith", "Carlos Rivera"],
  },
  {
    kind: "OPEN_QUESTION",
    identifier: "customer_phone",
    description: "What phone number should we use to contact the customer about this order?",
    examples: ["+15551234567", "555-123-4567"],
  },
  {
    kind: "SINGLE_CHOICE",
    identifier: "fulfillment_type",
    description: "Did the customer choose delivery or pickup?",
    choices: ["delivery", "pickup"],
  },
  {
    kind: "OPEN_QUESTION",
    identifier: "delivery_address",
    description: "What is the delivery address? If pickup, answer Pickup.",
    examples: ["123 Main Street Apt 4", "Pickup"],
  },
  {
    kind: "OPEN_QUESTION",
    identifier: "order_items",
    description:
      "List every ordered menu item with quantity as plain text, for example: 2 Margherita Pizza, 1 Coke",
    examples: ["2 Burgers, 1 Fries", "1 Chicken Biryani"],
  },
  {
    kind: "OPEN_QUESTION",
    identifier: "coupon_code",
    description: "What coupon or promo code did the customer provide? Answer none if none.",
    examples: ["SAVE10", "none"],
  },
  {
    kind: "OPEN_QUESTION",
    identifier: "special_notes",
    description: "Any special instructions for the kitchen or delivery? Answer none if none.",
    examples: ["No onions", "Ring doorbell", "none"],
  },
  {
    kind: "SINGLE_CHOICE",
    identifier: "payment_method",
    description: "How does the customer plan to pay?",
    choices: ["cash", "card"],
  },
];

function normalizeActionIds(raw) {
  if (Array.isArray(raw)) return raw.filter(Boolean).map(String);
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function ensureOrderExtractors(existingIds = []) {
  if (Array.isArray(existingIds) && existingIds.length >= 3) {
    return existingIds.filter(Boolean);
  }
  const ids = [];
  const errors = [];
  for (const spec of ORDER_EXTRACTORS) {
    try {
      const created = await createInformationExtractor(spec);
      if (created.action_id) ids.push(created.action_id);
      else errors.push(`${spec.identifier}: no action_id`);
    } catch (e) {
      errors.push(`${spec.identifier}: ${e.message}`);
      console.warn("Extractor create failed:", spec.identifier, e.message);
    }
  }
  if (!ids.length) {
    throw new Error(
      `Failed to create Synthflow information extractors. ${errors.slice(0, 3).join("; ")}`,
    );
  }
  return ids;
}

/**
 * Resolve which number Synthflow can actually attach to an inbound agent.
 * Telnyx custom SIP import is Enterprise-only — fall back to a workspace Synthflow number.
 */
async function resolveAttachablePhone(preferredE164) {
  const preferred = normalizeE164(preferredE164 || "");
  let numbers = [];
  try {
    numbers = await listWorkspaceNumbers();
  } catch (e) {
    console.warn("List Synthflow numbers failed:", e.message);
  }

  const normalized = numbers.map((n) => ({
    raw: n,
    number: normalizeE164(n.number || n.phone_number || n.phone || ""),
    available: n.is_available !== false,
  })).filter((n) => n.number);

  if (preferred && normalized.some((n) => n.number === preferred)) {
    return { phone: preferred, source: "preferred_in_workspace", warning: null };
  }

  const free = normalized.find((n) => n.available);
  if (free) {
    return {
      phone: free.number,
      source: "synthflow_available",
      warning: preferred
        ? `Telnyx number ${preferred} is not in Synthflow (custom SIP import requires Enterprise). Attached available Synthflow number ${free.number} instead. Forward your Telnyx line to this number, or buy/import a Synthflow number.`
        : null,
    };
  }

  // Create agent without a phone — user must attach one in Synthflow dashboard
  return {
    phone: null,
    source: "none",
    warning: preferred
      ? `Telnyx number ${preferred} cannot be imported without Synthflow Enterprise SIP. Create/buy a number in Synthflow Phone Numbers, then update this agent.`
      : "No Synthflow phone numbers available. Buy one in the Synthflow dashboard and update the agent.",
  };
}

export async function restaurantCreateSynthflowAgent(req, res) {
  res.set("Access-Control-Allow-Origin", "*");
  try {
    const knex = getKnex();
    const body = req.body || {};
    const restaurant_id = body.restaurant_id;
    if (!restaurant_id) throw new Error("restaurant_id is required");

    const r = await knex("restaurants").where({ id: restaurant_id }).first();
    if (!r) throw new Error("Restaurant not found");

    const preferredPhone =
      body.phone_number || r.telnyx_phone_number || r.twilio_phone_number || null;

    const webhookUrl = postCallWebhookUrl();
    const webhookWarning = webhookUrl
      ? null
      : "PUBLIC_API_URL is not set. Agent will be created, but post-call orders will not work until you set a public HTTPS API URL (e.g. ngrok) and update the agent.";

    const catalog = await loadRestaurantVoiceCatalog(knex, restaurant_id);
    const knowledge = buildRestaurantVoiceKnowledge({
      restaurantName: r.name,
      ...catalog,
    });

    const lang = toSynthflowLanguage(body.language || r.agent_language || "en");
    const greeting =
      (body.first_message ?? r.agent_first_message)?.trim() || defaultSynthflowGreeting(r.name);
    // Prefer our ordering prompt + knowledge over legacy ElevenLabs tool prompts
    const customPrompt = (body.system_prompt ?? "").trim();
    const looksLikeLegacyEl =
      /place_order tool|get_order_status tool|knowledge base/i.test(customPrompt);
    const prompt =
      customPrompt && !looksLikeLegacyEl
        ? customPrompt
        : defaultSynthflowPrompt(r.name, knowledge);
    const fullPrompt =
      prompt.includes("## Menu") || prompt.includes("# ")
        ? prompt
        : `${prompt}\n\n${knowledge}`;

    const voiceId = body.voice_id || r.agent_voice_id || undefined;
    const agentName = body.name || `${r.name} Order Agent`;

    const phoneInfo = await resolveAttachablePhone(
      body.synthflow_phone_number || preferredPhone,
    );

    const agentConfig = {
      prompt: fullPrompt,
      greeting_message: greeting,
      llm: body.llm || "gpt-4.1-Mini",
      language: lang,
      ...(voiceId ? { voice_id: voiceId } : {}),
    };

    let modelId = r.synthflow_agent_id || null;
    let action = "created";

    // Create/update agent FIRST (extractors used to run first and often timed out)
    const agentPayload = {
      name: agentName,
      ...(phoneInfo.phone ? { phone_number: phoneInfo.phone } : {}),
      ...(webhookUrl ? { external_webhook_url: webhookUrl } : {}),
      agent: agentConfig,
    };

    if (modelId) {
      await updateAgent(modelId, agentPayload);
      action = "updated";
    } else {
      const created = await createInboundAgent(agentPayload);
      modelId =
        created?.response?.model_id ||
        created?.model_id ||
        created?.response?.id ||
        null;
      if (!modelId) {
        throw new Error(`Synthflow did not return model_id: ${JSON.stringify(created)}`);
      }
    }

    let actionIds = normalizeActionIds(r.synthflow_action_ids);
    let extractorWarning = null;
    try {
      actionIds = await ensureOrderExtractors(actionIds);
      try {
        await attachActions(modelId, actionIds);
      } catch (e) {
        extractorWarning = `Agent created but attaching extractors failed: ${e.message}`;
        console.warn(extractorWarning);
      }
    } catch (e) {
      extractorWarning = `Agent created but order extractors failed: ${e.message}. You can retry create/update.`;
      console.warn(extractorWarning);
    }

    await knex("restaurants").where({ id: restaurant_id }).update({
      synthflow_agent_id: modelId,
      // pg + knex can mis-bind JS arrays as PG arrays; store explicit JSON text for jsonb
      synthflow_action_ids: knex.raw("?::jsonb", [JSON.stringify(actionIds || [])]),
      agent_language: body.language || r.agent_language || "en",
      agent_voice_id: voiceId || r.agent_voice_id,
      agent_first_message: greeting,
      agent_system_prompt: fullPrompt,
      voice_provider: "synthflow_telnyx",
      synthflow_synced_at: knex.fn.now(),
      agent_menu_synced_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    });

    const warnings = [phoneInfo.warning, webhookWarning, extractorWarning].filter(Boolean);

    return res.json({
      success: true,
      action,
      synthflow_agent_id: modelId,
      attached_phone_number: phoneInfo.phone,
      phone_source: phoneInfo.source,
      telnyx_phone_number: r.telnyx_phone_number,
      external_webhook_url: webhookUrl,
      action_ids: actionIds,
      warning: warnings.length ? warnings.join(" ") : null,
      warnings,
    });
  } catch (e) {
    console.error("Create Synthflow agent error:", e);
    return res.status(500).json({
      success: false,
      error: e.message || "failed",
      cause: e.cause?.code || e.cause?.message || undefined,
    });
  }
}
