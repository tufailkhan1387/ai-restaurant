import { getKnex } from "../db.js";
import {
  createInboundAgent,
  updateAgent,
  createInformationExtractor,
  createCustomAction,
  attachActions,
  toSynthflowLanguage,
  postCallWebhookUrl,
  listWorkspaceNumbers,
  findAssistantByPhone,
} from "../lib/synthflowClient.js";
import {
  buildRestaurantVoiceKnowledge,
  defaultSynthflowGreeting,
  defaultSynthflowPrompt,
  loadRestaurantVoiceCatalog,
} from "../lib/restaurantVoiceContext.js";
import { normalizeE164 } from "../lib/voiceWebhookUtils.js";

function isPhoneAlreadyAttachedError(err) {
  const msg = String(err?.message || err || "");
  return /already attached|already assigned|phone number already/i.test(msg);
}

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
    kind: "OPEN_QUESTION",
    identifier: "customer_email",
    description: "What is the customer's email address if provided? (Optional, answer none if skipped or not provided)",
    examples: ["customer@gmail.com", "none"],
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
    description: "What is the full delivery address provided by the customer? Record whatever address description is stated (house/flat, street, area, colony, or landmark). If pickup, answer Pickup.",
    examples: ["House 12, Street 4, Sector G-9, Islamabad", "Flat 302 Al-Rahim Heights", "Near Shell Pump, Main Road", "Pickup"],
  },
  {
    kind: "OPEN_QUESTION",
    identifier: "order_items",
    description:
      "List every ordered menu item with quantity, size, flavor, and add-ons as plain text, for example: 1 Large Signature Pizza (Chicken Supreme, Garlic Sauce), 1 Coke",
    examples: ["1 Large Signature Pizza (Chicken Supreme)", "2 Burgers, 1 Fries"],
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
    description: "Payment method (default is cash on delivery unless caller explicitly specifies card)",
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

function liveToolUrl(endpoint) {
  const api = String(process.env.PUBLIC_API_URL || "").trim().replace(/\/$/, "");
  if (!api) return null;
  return `${api}/api/functions/${endpoint}`;
}

function duringCallVar(name, description, example) {
  return { name, description, example, type: "string" };
}

async function ensureLiveOrderActions(restaurantId, existingIds = [], identity = {}) {
  const placeUrl = liveToolUrl("ai-place-order");
  const statusUrl = liveToolUrl("ai-order-status");
  if (!placeUrl || !statusUrl) return { ids: existingIds, warning: "PUBLIC_API_URL is not set, so the phone agent cannot place or track orders during the call." };

  const already = new Set((existingIds || []).map(String));
  const ids = [...already];
  const errors = [];
  const lookup = {};
  if (identity.synthflowAgentId) lookup.synthflow_agent_id = identity.synthflowAgentId;
  if (identity.phone) lookup.twilio_to = identity.phone;

  const specs = [
    {
      key: "place_order",
      action: {
        http_mode: "POST",
        url: placeUrl,
        run_action_before_call_start: false,
        name: "place_order",
        description:
          "Save the caller's food order and return the real order number. Call this once after the caller confirms the order. Then read order_number out loud.",
        speech_while_using_the_tool: "One moment while I save your order.",
        failure_timeout: 20,
        headers: [{ key: "Content-Type", value: "application/json" }],
        variables_during_the_call: [
          duringCallVar("customer_name", "Customer full name", "Ali Ahmed"),
          duringCallVar("customer_phone", "Contact phone number", "03238439467"),
          duringCallVar("delivery_address", "Delivery address, or Pickup", "House 12, G-9, Islamabad"),
          duringCallVar("order_items", "Items with quantity, size, and flavor", "1 Large Classic Pizza Chicken Fajita"),
          duringCallVar("fulfillment_type", "delivery or pickup", "delivery"),
          duringCallVar("customer_email", "Email or none", "none"),
          duringCallVar("coupon_code", "Coupon code or none", "none"),
        ],
        json_body_stringified: JSON.stringify({
          ...lookup,
          customer_name: "<customer_name>",
          customer_phone: "<customer_phone>",
          delivery_address: "<delivery_address>",
          items: "<order_items>",
          fulfillment_type: "<fulfillment_type>",
          customer_email: "<customer_email>",
          coupon_code: "<coupon_code>",
          payment_method: "cash",
          source: "phone",
        }),
      },
    },
    {
      key: "get_order_status",
      action: {
        http_mode: "POST",
        url: statusUrl,
        run_action_before_call_start: false,
        name: "get_order_status",
        description:
          "Look up an existing order by order number and return its current status. Use this when the caller wants to track an order.",
        speech_while_using_the_tool: "Let me check that order.",
        failure_timeout: 15,
        headers: [{ key: "Content-Type", value: "application/json" }],
        variables_during_the_call: [
          duringCallVar("order_number", "Order number such as ORD-260929-01", "ORD-260929-01"),
        ],
        json_body_stringified: JSON.stringify({
          ...lookup,
          order_number: "<order_number>",
        }),
      },
    },
  ];

  for (const spec of specs) {
    const marker = `tool:${spec.key}:v2`;
    if ([...already].some((id) => id === marker)) continue;
    try {
      const created = await createCustomAction(spec.action);
      if (created.action_id) {
        ids.push(created.action_id);
        ids.push(marker);
        if (identity.modelId) {
          try {
            await attachActions(identity.modelId, [], [
              {
                action_id: created.action_id,
                attachment_type: "during",
                trigger_condition: spec.action.description,
                input_variables_mapping: (spec.action.variables_during_the_call || []).map((v) => ({
                  variable_name: v.name,
                  source: "llm",
                  llm_config: { description: v.description, example: v.example },
                })),
              },
            ]);
          } catch (attachErr) {
            errors.push(`${spec.key} attach: ${attachErr.message}`);
          }
        }
      } else {
        errors.push(`${spec.key}: no action_id`);
      }
    } catch (e) {
      errors.push(`${spec.key}: ${e.message}`);
      console.warn("Live tool create failed:", spec.key, e.message);
    }
  }

  return {
    ids,
    warning: errors.length ? `Phone tools failed: ${errors.join("; ")}` : null,
  };
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
    const missingOrderNumber = !/your order number is/i.test(customPrompt);
    const prompt =
      customPrompt && !looksLikeLegacyEl && !missingOrderNumber
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
      voice_speed: 0.85,
      min_words_to_interrupt: 1,
      interruption_fade_out: 1,
      send_user_idle_reminders: false,
      ...(voiceId ? { voice_id: voiceId } : {}),
    };

    // Optional: link an existing Fine-tuner agent by id from the UI/body
    let modelId =
      body.synthflow_agent_id ||
      body.model_id ||
      r.synthflow_agent_id ||
      null;
    let action = "created";

    // Create/update agent FIRST (extractors used to run first and often timed out)
    const agentPayload = {
      name: agentName,
      is_recording: true,
      ...(phoneInfo.phone ? { phone_number: phoneInfo.phone } : {}),
      ...(webhookUrl ? { external_webhook_url: webhookUrl } : {}),
      agent: agentConfig,
    };

    if (modelId) {
      // When updating an existing agent, omit phone_number so Synthflow doesn't reject with "Phone number already attached"
      const { phone_number: _omitPhone, ...updatePayload } = agentPayload;
      try {
        await updateAgent(modelId, updatePayload);
      } catch (upErr) {
        if (isPhoneAlreadyAttachedError(upErr)) {
          await updateAgent(modelId, updatePayload);
        } else {
          throw upErr;
        }
      }
      action = "updated";
    } else {
      try {
        const created = await createInboundAgent(agentPayload);
        modelId =
          created?.response?.model_id ||
          created?.model_id ||
          created?.response?.id ||
          null;
        if (!modelId) {
          throw new Error(`Synthflow did not return model_id: ${JSON.stringify(created)}`);
        }
      } catch (createErr) {
        // Number already owns an inbound agent in Synthflow (common after manual Fine-tuner setup).
        // Adopt that agent, update webhook/prompt, and save id to our DB so UI shows Agent ready.
        if (!isPhoneAlreadyAttachedError(createErr) || !phoneInfo.phone) {
          throw createErr;
        }
        const existing = await findAssistantByPhone(phoneInfo.phone);
        if (!existing?.model_id) {
          throw new Error(
            `${createErr.message}. Could not find that agent in Synthflow — open Fine-tuner, copy the agent model_id, and pass synthflow_agent_id when creating.`,
          );
        }
        modelId = existing.model_id;
        // Update without re-sending phone_number (already attached)
        const { phone_number: _omitPhone, ...updatePayload } = agentPayload;
        await updateAgent(modelId, updatePayload);
        action = "linked_existing";
      }
    }

    let actionIds = normalizeActionIds(r.synthflow_action_ids);
    let extractorWarning = null;
    try {
      actionIds = await ensureOrderExtractors(actionIds);
      const liveTools = await ensureLiveOrderActions(restaurant_id, actionIds, {
        modelId,
        synthflowAgentId: modelId,
        phone: r.telnyx_phone_number || r.twilio_phone_number || null,
      });
      actionIds = liveTools.ids;
      if (liveTools.warning) extractorWarning = liveTools.warning;
      try {
        await attachActions(
          modelId,
          actionIds.filter((id) => !String(id).startsWith("tool:")),
        );
      } catch (e) {
        extractorWarning = `Agent created but attaching actions failed: ${e.message}`;
        console.warn(extractorWarning);
      }
    } catch (e) {
      extractorWarning = `Agent created but order actions failed: ${e.message}. You can retry create/update.`;
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
