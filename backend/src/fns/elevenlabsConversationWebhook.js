import { getKnex } from "../db.js";
import { resolveRestaurantIdFromElConversation } from "../lib/voiceWebhookUtils.js";

export async function elevenlabsConversationWebhook(req, res) {
  try {
    const payload = req.body;
    console.log("ElevenLabs webhook received:", JSON.stringify(payload, null, 2));

    const knex = getKnex();
    const metadata = payload.metadata ?? {};
    const resolvedRestaurantId = await resolveRestaurantIdFromElConversation(knex, metadata, payload);

    const phoneNumber =
      payload.metadata?.phone_number ||
      metadata.phoneNumber ||
      metadata.from ||
      "Unknown";

    const callSid =
      payload.metadata?.call_sid ||
      metadata.callSid ||
      metadata.twilio_call_sid ||
      metadata.twilioCallSid;

    const autoDialerLeadId = metadata.leadId || metadata.lead_id;
    const isAutoDialer = metadata.source === "auto_dialer" || !!autoDialerLeadId;

    const durationSeconds =
      payload.metadata?.duration_seconds ||
      metadata.durationSeconds ||
      0;

    const recordingUrl =
      payload.metadata?.recording_url ||
      metadata.recordingUrl ||
      metadata.recording_url ||
      null;

    const isRelevant = payload.analysis?.call_relevant !== false;

    const transcriptText = payload.transcript
      ?.map((t) => `${t.role === "agent" ? "Agent" : "Customer"}: ${t.message}`)
      .join("\n") || "";

    const serviceInterestMap = {
      consulting: "consulting",
      support: "support",
      sales: "sales",
      technical: "technical",
      billing: "billing",
      partnership: "partnership",
      "it services": "technical",
      "ai development": "technical",
      chatbot: "technical",
      "customer support": "support",
      "web development": "technical",
    };

    const servicesInterested = [];
    if (payload.analysis?.services_interested) {
      for (const service of payload.analysis.services_interested) {
        const normalized = service.toLowerCase().trim();
        const mapped = serviceInterestMap[normalized] || "other";
        if (!servicesInterested.includes(mapped)) servicesInterested.push(mapped);
      }
    }

    let callId = null;

    if (callSid) {
      const existingCall = await knex("calls")
        .select("id")
        .where("twilio_call_sid", callSid)
        .first();
      if (existingCall) callId = existingCall.id;
    }

    if (!callId && autoDialerLeadId) {
      const adLead = await knex("auto_dialer_leads")
        .select("call_id")
        .where("id", autoDialerLeadId)
        .first();
      if (adLead?.call_id) callId = adLead.call_id;
    }

    const callPatch = {
      status:
        payload.status === "done"
          ? "completed"
          : payload.status === "failed"
            ? "missed"
            : "in_progress",
      duration_seconds: durationSeconds,
      transcript: transcriptText,
      recording_url: recordingUrl,
      notes: payload.analysis?.summary || null,
      elevenlabs_conversation_id: payload.conversation_id,
      ended_at:
        payload.status === "done" || payload.status === "failed"
          ? new Date().toISOString()
          : null,
    };

    if (callId) {
      await knex("calls").update(callPatch).where("id", callId);
    } else if (payload.status === "done" || payload.status === "failed") {
      const [newCall] = await knex("calls")
        .insert({
          phone_number: phoneNumber,
          direction: isAutoDialer ? "outbound" : "inbound",
          ...callPatch,
          started_at: new Date().toISOString(),
          ...(callSid ? { twilio_call_sid: callSid } : {}),
          metadata: isAutoDialer
            ? JSON.stringify({ source: "auto_dialer", auto_dialer_lead_id: autoDialerLeadId })
            : JSON.stringify({
                source: "elevenlabs",
                restaurant_id: resolvedRestaurantId || undefined,
              }),
        })
        .returning("*");

      callId = newCall?.id || null;

      if (callId && autoDialerLeadId) {
        await knex("auto_dialer_leads")
          .update({ call_id: callId })
          .where("id", autoDialerLeadId);
      }
    }

    // ============= RESTAURANT ORDER EXTRACTION =============
    if (!isAutoDialer && payload.status === "done" && transcriptText && resolvedRestaurantId) {
      try {
        const menuItems = await knex("menu_items")
          .select("id", "name", "price")
          .where({ restaurant_id: resolvedRestaurantId, is_available: true });
        const deals = await knex("deals")
          .select("id", "name", "price")
          .where({ restaurant_id: resolvedRestaurantId, is_active: true });
        const settings = await knex("restaurant_settings")
          .select("tax_rate", "delivery_fee")
          .where({ restaurant_id: resolvedRestaurantId })
          .first();

        const menuContext = [
          ...(menuItems || []).map((m) => `- ${m.name} ($${m.price})`),
          ...(deals || []).map((d) => `- [DEAL] ${d.name} ($${d.price})`),
        ].join("\n");

        const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
        if (LOVABLE_API_KEY && menuContext) {
          const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                {
                  role: "system",
                  content:
                    "You extract restaurant phone orders from call transcripts. Return strict JSON only. If the call is not a food order, return {\"is_order\": false}.",
                },
                {
                  role: "user",
                  content: `MENU:\n${menuContext}\n\nTRANSCRIPT:\n${transcriptText}\n\nReturn JSON: {"is_order": boolean, "customer_name": string, "customer_phone": string, "delivery_address": string, "items": [{"name": string, "quantity": number}], "notes": string}. Match item names to the menu exactly when possible.`,
                },
              ],
              response_format: { type: "json_object" },
            }),
          });

          if (aiResp.ok) {
            const aiJson = await aiResp.json();
            const content = aiJson.choices?.[0]?.message?.content || "{}";
            const extracted = JSON.parse(content);

            if (extracted.is_order && Array.isArray(extracted.items) && extracted.items.length > 0) {
              const items = extracted.items;
              const itemRows = [];
              let subtotal = 0;

              for (const it of items) {
                const lower = (it.name || "").toLowerCase().trim();
                const menuMatch = (menuItems || []).find(
                  (m) => m.name.toLowerCase() === lower || lower.includes(m.name.toLowerCase()),
                );
                const dealMatch = (deals || []).find(
                  (d) => d.name.toLowerCase() === lower || lower.includes(d.name.toLowerCase()),
                );
                const matched = menuMatch || dealMatch;
                const price = matched ? Number(matched.price) : 0;
                const qty = Number(it.quantity) || 1;
                const lineTotal = price * qty;
                subtotal += lineTotal;
                itemRows.push({
                  menu_item_id: menuMatch?.id || null,
                  deal_id: dealMatch?.id || null,
                  item_name: matched?.name || it.name,
                  quantity: qty,
                  unit_price: price,
                  line_total: lineTotal,
                });
              }

              const taxRate = Number(settings?.tax_rate || 0);
              const deliveryFee = Number(settings?.delivery_fee || 0);
              const taxAmount = subtotal * (taxRate / 100);
              const total = subtotal + taxAmount + deliveryFee;

              const [order] = await knex("orders")
                .insert({
                  restaurant_id: resolvedRestaurantId,
                  customer_name: extracted.customer_name || "Phone Customer",
                  customer_phone: extracted.customer_phone || phoneNumber,
                  delivery_address: extracted.delivery_address || "TBD",
                  notes: extracted.notes || null,
                  source: "phone",
                  status: "pending_verification",
                  call_id: callId,
                  subtotal,
                  tax_amount: taxAmount,
                  delivery_fee: deliveryFee,
                  total_amount: total,
                  ai_extracted_data: extracted,
                })
                .returning("*");

              if (order) {
                const itemsToInsert = itemRows.map((r) => ({ ...r, order_id: order.id }));
                await knex("order_items").insert(itemsToInsert);
                console.log("Created order from call:", order.id);
              }
            }
          }
        }
      } catch (e) {
        console.error("Order extraction error:", e);
      }
    }

    // Store conversation entries (idempotent)
    if (callId && payload.transcript && payload.transcript.length > 0) {
      await knex("conversations").where("call_id", callId).del();

      const conversationEntries = payload.transcript.map((t, index) => {
        const ts =
          typeof t.timestamp === "number"
            ? new Date(t.timestamp * 1000).toISOString()
            : new Date(Date.now() - (payload.transcript.length - index) * 3000).toISOString();
        return {
          call_id: callId,
          speaker: t.role === "agent" ? "ai" : "customer",
          message: t.message,
          timestamp: ts,
        };
      });

      await knex("conversations").insert(conversationEntries);
    }

    return res.json({ success: true, callId, isAutoDialer });
  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(500).json({ error: error.message || "Unknown error" });
  }
}
