// @generated from supabase/functions/elevenlabs-conversation-webhook — run: node backend/scripts/generate-handlers.mjs
import { functionsPublicUrl } from "../runtime/functionsPublicUrl.js";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ConversationData {
  conversation_id: string;
  agent_id: string;
  status: "processing" | "done" | "failed";
  transcript?: Array<{
    role: "agent" | "user";
    message: string;
    timestamp?: number;
  }>;
  metadata?: {
    phone_number?: string;
    call_sid?: string;
    duration_seconds?: number;
    recording_url?: string;
  } & Record<string, unknown>;
  analysis?: {
    summary?: string;
    call_successful?: boolean;
    call_relevant?: boolean;
    data_collected?: Record<string, string>;
    services_interested?: string[];
  };
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload: ConversationData = await req.json();
    console.log("ElevenLabs webhook received:", JSON.stringify(payload, null, 2));

    const supabaseUrl = process.env.SUPABASE_URL ?? "";
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    const metadata = (payload.metadata ?? {}) as Record<string, unknown>;

    const phoneNumber =
      (payload.metadata?.phone_number as string | undefined) ||
      (metadata.phoneNumber as string | undefined) ||
      (metadata.from as string | undefined) ||
      "Unknown";

    const callSid =
      (payload.metadata?.call_sid as string | undefined) ||
      (metadata.callSid as string | undefined) ||
      (metadata.twilio_call_sid as string | undefined) ||
      (metadata.twilioCallSid as string | undefined);

    // Auto-dialer linkage parameters (passed via TwiML <Parameter>)
    const autoDialerLeadId = (metadata.leadId as string | undefined) || (metadata.lead_id as string | undefined);
    const isAutoDialer = (metadata.source as string | undefined) === "auto_dialer" || !!autoDialerLeadId;

    const durationSeconds =
      (payload.metadata?.duration_seconds as number | undefined) ||
      (metadata.durationSeconds as number | undefined) ||
      0;

    const recordingUrl =
      (payload.metadata?.recording_url as string | undefined) ||
      (metadata.recordingUrl as string | undefined) ||
      (metadata.recording_url as string | undefined) ||
      null;

    const isRelevant = payload.analysis?.call_relevant !== false;

    const transcriptText = payload.transcript
      ?.map((t) => `${t.role === "agent" ? "Agent" : "Customer"}: ${t.message}`)
      .join("\n") || "";

    const serviceInterestMap: Record<string, string> = {
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

    const servicesInterested: string[] = [];
    if (payload.analysis?.services_interested) {
      for (const service of payload.analysis.services_interested) {
        const normalized = service.toLowerCase().trim();
        const mapped = serviceInterestMap[normalized] || "other";
        if (!servicesInterested.includes(mapped)) servicesInterested.push(mapped);
      }
    }

    let callId: string | null = null;

    // Try matching call by SID first, then by auto-dialer lead linkage
    if (callSid) {
      const { data: existingCall } = await supabase
        .from("calls")
        .select("id")
        .eq("twilio_call_sid", callSid)
        .maybeSingle();

      if (existingCall) callId = existingCall.id;
    }

    if (!callId && autoDialerLeadId) {
      const { data: adLead } = await supabase
        .from("auto_dialer_leads")
        .select("call_id")
        .eq("id", autoDialerLeadId)
        .maybeSingle();
      if (adLead?.call_id) callId = adLead.call_id;
    }

    const callPatch: Record<string, unknown> = {
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
      await supabase.from("calls").update(callPatch).eq("id", callId);
    } else if (payload.status === "done" || payload.status === "failed") {
      const { data: newCall } = await supabase
        .from("calls")
        .insert({
          phone_number: phoneNumber,
          direction: isAutoDialer ? "outbound" : "inbound",
          ...callPatch,
          started_at: new Date().toISOString(),
          ...(callSid ? { twilio_call_sid: callSid } : {}),
          metadata: isAutoDialer ? { source: "auto_dialer", auto_dialer_lead_id: autoDialerLeadId } : {},
        })
        .select()
        .maybeSingle();

      callId = newCall?.id || null;

      if (callId && autoDialerLeadId) {
        await supabase
          .from("auto_dialer_leads")
          .update({ call_id: callId })
          .eq("id", autoDialerLeadId);
      }
    }

    // ============= AUTO-DIALER OUTCOME HANDLING =============
    if (isAutoDialer && autoDialerLeadId && payload.status === "done") {
      const summary = payload.analysis?.summary || "";
      const dataCollected = payload.analysis?.data_collected || {};
      const transcriptText = (payload.transcript || [])
        .map((t: any) => `${t.role === "agent" ? "Agent" : "Customer"}: ${t.message}`)
        .join("\n");
      const callDuration = payload.metadata?.call_duration_secs || 0;

      // Use AI classifier — never trust EL "call_successful" alone
      let interestLevel: "interested" | "not_interested" | "callback" | "unclear" = "unclear";
      let qualifyAsLead = false;
      let outcome = "engaged_no_commit";
      let verdictReason = "";
      try {
        const cr = await fetch(`${functionsPublicUrl()}/functions/v1/classify-call-outcome`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            transcript: transcriptText,
            summary,
            durationSeconds: callDuration,
          }),
        });
        if (cr.ok) {
          const v = await cr.json();
          interestLevel = v.interest_level;
          qualifyAsLead = v.qualify_as_lead === true;
          outcome = v.outcome;
          verdictReason = v.reason || "";
        }
      } catch (e) {
        console.error("classify-call-outcome failed in webhook:", e);
      }

      // Map verdict outcome → call_status bucket so the UI shows the real
      // reason (voicemail / gatekeeper / not_interested / callback) instead
      // of always saying "completed".
      const outcomeToStatus: Record<string, string> = {
        interested: "completed",
        engaged_no_commit: "completed",
        callback_requested: "callback",
        not_interested: "not_interested",
        voicemail: "voicemail",
        gatekeeper: "gatekeeper",
        no_answer: "no_answer",
      };
      const adUpdate: Record<string, unknown> = {
        call_status: outcomeToStatus[outcome] ?? "completed",
        ai_summary: summary,
        elevenlabs_conversation_id: payload.conversation_id,
        interest_level: interestLevel,
        callback_requested: outcome === "callback_requested",
        gatekeeper_encountered: outcome === "gatekeeper",
        callback_reason: ["callback_requested", "voicemail"].includes(outcome) ? verdictReason : null,
      };

      // Only create / merge a `leads` row when AI explicitly qualifies the lead
      if (qualifyAsLead && interestLevel === "interested") {
        const { data: adLead } = await supabase
          .from("auto_dialer_leads")
          .select("client_name, email, company, phone_number, pitched_for")
          .eq("id", autoDialerLeadId)
          .maybeSingle();

        if (adLead) {
          const leadData: Record<string, unknown> = {
            phone_number: adLead.phone_number,
            full_name: dataCollected.name || adLead.client_name || null,
            email: dataCollected.email || adLead.email || null,
            company: dataCollected.company || adLead.company || null,
            status: "qualified",
            source: "auto_dialer",
            notes: `Auto-dialer interested. ${summary}`,
            services_interested: servicesInterested.length > 0 ? servicesInterested : undefined,
          };

          const { data: existingLead } = await supabase
            .from("leads")
            .select("id")
            .eq("phone_number", adLead.phone_number)
            .maybeSingle();

          let convertedLeadId: string | null = null;
          if (existingLead) {
            await supabase
              .from("leads")
              .update({ ...leadData, status: "qualified", updated_at: new Date().toISOString() })
              .eq("id", existingLead.id);
            convertedLeadId = existingLead.id;
          } else {
            const { data: newLead } = await supabase
              .from("leads")
              .insert(leadData)
              .select()
              .maybeSingle();
            convertedLeadId = newLead?.id || null;
          }

          if (convertedLeadId) {
            adUpdate.converted_lead_id = convertedLeadId;
            if (callId) {
              await supabase.from("calls").update({ lead_id: convertedLeadId }).eq("id", callId);
            }
          }
        }
      }

      await supabase.from("auto_dialer_leads").update(adUpdate).eq("id", autoDialerLeadId);

      // Increment session.completed_leads
      const { data: adLeadRow } = await supabase
        .from("auto_dialer_leads")
        .select("session_id")
        .eq("id", autoDialerLeadId)
        .maybeSingle();

      if (adLeadRow?.session_id) {
        const { count: completedCount } = await supabase
          .from("auto_dialer_leads")
          .select("id", { count: "exact", head: true })
          .eq("session_id", adLeadRow.session_id)
          .in("call_status", ["completed", "failed", "no_answer", "skipped"]);

        await supabase
          .from("auto_dialer_sessions")
          .update({ completed_leads: completedCount ?? 0 })
          .eq("id", adLeadRow.session_id);
      }
    }

    // ============= INBOUND LEAD CREATION (existing flow) =============
    if (!isAutoDialer && payload.status === "done" && isRelevant) {
      const collected = payload.analysis?.data_collected || {};
      const leadData: Record<string, unknown> = {
        phone_number: phoneNumber,
        status: "new",
        source: "inbound_call",
        notes: payload.analysis?.summary || "",
      };

      if (collected.name || collected.full_name) leadData.full_name = collected.name || collected.full_name;
      if (collected.email) leadData.email = collected.email;
      if (collected.company || collected.business_name) leadData.company = collected.company || collected.business_name;
      if (servicesInterested.length > 0) leadData.services_interested = servicesInterested;

      const { data: existingLead } = await supabase
        .from("leads")
        .select("id, services_interested")
        .eq("phone_number", phoneNumber)
        .maybeSingle();

      if (existingLead) {
        const existingServices = (existingLead.services_interested as string[]) || [];
        const mergedServices = [...new Set([...existingServices, ...servicesInterested])];
        await supabase
          .from("leads")
          .update({
            ...leadData,
            services_interested: mergedServices,
            status: "contacted",
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingLead.id);

        if (callId) {
          await supabase.from("calls").update({ lead_id: existingLead.id }).eq("id", callId);
        }
        console.log("Updated inbound lead:", existingLead.id);
      } else {
        const { data: newLead } = await supabase.from("leads").insert(leadData).select().single();
        if (callId && newLead) {
          await supabase.from("calls").update({ lead_id: newLead.id }).eq("id", callId);
        }
        console.log("Created inbound lead:", newLead?.id);
      }
    }

    // ============= RESTAURANT ORDER EXTRACTION =============
    if (!isAutoDialer && payload.status === "done" && transcriptText) {
      try {
        const { data: menuItems } = await supabase
          .from("menu_items")
          .select("id, name, price")
          .eq("is_available", true);
        const { data: deals } = await supabase
          .from("deals")
          .select("id, name, price")
          .eq("is_active", true);
        const { data: settings } = await supabase
          .from("restaurant_settings")
          .select("tax_rate, delivery_fee")
          .maybeSingle();

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
              const items: { name: string; quantity: number }[] = extracted.items;
              const itemRows: any[] = [];
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

              const { data: order } = await supabase
                .from("orders")
                .insert({
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
                .select()
                .maybeSingle();

              if (order) {
                const itemsToInsert = itemRows.map((r) => ({ ...r, order_id: order.id }));
                await supabase.from("order_items").insert(itemsToInsert);
                console.log("Created order from call:", order.id);
              }
            }
          } else {
            console.error("AI extract failed:", aiResp.status, await aiResp.text());
          }
        }
      } catch (e) {
        console.error("Order extraction error:", e);
      }
    }

    // Store conversation entries (idempotent)
    if (callId && payload.transcript && payload.transcript.length > 0) {
      await supabase.from("conversations").delete().eq("call_id", callId);

      const conversationEntries = payload.transcript.map((t, index) => {
        const ts =
          typeof t.timestamp === "number"
            ? new Date(t.timestamp * 1000).toISOString()
            : new Date(Date.now() - (payload.transcript!.length - index) * 3000).toISOString();
        return {
          call_id: callId,
          speaker: t.role === "agent" ? "ai" : "customer",
          message: t.message,
          timestamp: ts,
        };
      });

      await supabase.from("conversations").insert(conversationEntries);
    }

    return new Response(JSON.stringify({ success: true, callId, isAutoDialer }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
}
