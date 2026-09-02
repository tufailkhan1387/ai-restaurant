// @generated from supabase/functions/elevenlabs-sync-conversations — run: node backend/scripts/generate-handlers.mjs
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ElevenLabsConversation {
  conversation_id: string;
  agent_id: string;
  start_time_unix_secs: number;
  call_duration_secs: number;
  status: string;
  call_successful?: string;
  transcript_summary?: string;
  direction?: string;
}

interface ElevenLabsConversationDetail {
  conversation_id: string;
  agent_id: string;
  status: string;
  has_audio: boolean;
  has_user_audio: boolean;
  has_response_audio: boolean;
  transcript: Array<{
    role: "agent" | "user";
    message: string;
    time_in_call_secs?: number;
    tool_calls?: unknown[];
    tool_results?: unknown[];
    feedback?: { score?: string; text?: string };
  }>;
  metadata: {
    start_time_unix_secs: number;
    call_duration_secs: number;
    cost?: number;
    phone_number?: string;
    call_sid?: string;
    callSid?: string;
    twilio_call_sid?: string;
    from?: string;
    [key: string]: unknown;
  };
  analysis?: {
    transcript_summary?: string;
    call_successful?: boolean;
    data_collection_results?: Record<string, { value?: string; json_schema?: unknown }>;
    evaluation_results?: Record<string, { result?: string; rationale?: string }>;
  };
  conversation_initiation_client_data?: {
    dynamic_variables?: Record<string, string>;
  };
}

interface ElevenLabsAgent {
  agent_id: string;
  name: string;
  conversation_config?: {
    agent?: {
      prompt?: { prompt?: string };
      first_message?: string;
      language?: string;
    };
    tts?: {
      voice_id?: string;
    };
  };
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
    const ELEVENLABS_AGENT_ID = process.env.ELEVENLABS_AGENT_ID;
    
    if (!ELEVENLABS_API_KEY) {
      throw new Error("ELEVENLABS_API_KEY is not configured");
    }

    const supabaseUrl = process.env.SUPABASE_URL ?? "";
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("Fetching conversations from ElevenLabs...");

    // Fetch agent details for name/voice info
    const agentCache: Record<string, ElevenLabsAgent> = {};
    const voiceCache: Record<string, { name: string; labels?: Record<string, string> }> = {};

    async function getAgentInfo(agentId: string): Promise<ElevenLabsAgent | null> {
      if (agentCache[agentId]) return agentCache[agentId];
      try {
        const res = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
          headers: { "xi-api-key": ELEVENLABS_API_KEY! },
        });
        if (res.ok) {
          const agent = await res.json();
          agentCache[agentId] = agent;
          return agent;
        }
      } catch (e) {
        console.error(`Failed to fetch agent ${agentId}:`, e);
      }
      return null;
    }

    async function getVoiceInfo(voiceId: string): Promise<{ name: string; labels?: Record<string, string> } | null> {
      if (voiceCache[voiceId]) return voiceCache[voiceId];
      try {
        const res = await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, {
          headers: { "xi-api-key": ELEVENLABS_API_KEY! },
        });
        if (res.ok) {
          const voice = await res.json();
          voiceCache[voiceId] = { name: voice.name, labels: voice.labels };
          return voiceCache[voiceId];
        }
      } catch (e) {
        console.error(`Failed to fetch voice ${voiceId}:`, e);
      }
      return null;
    }

    // Fetch all conversations (paginate)
    let allConversations: ElevenLabsConversation[] = [];
    let cursor: string | null = null;
    let hasMore = true;

    while (hasMore) {
      let url = `https://api.elevenlabs.io/v1/convai/conversations?page_size=100&summary_mode=include`;
      if (ELEVENLABS_AGENT_ID) url += `&agent_id=${ELEVENLABS_AGENT_ID}`;
      if (cursor) url += `&cursor=${cursor}`;

      let listResponse = await fetch(url, {
        headers: { "xi-api-key": ELEVENLABS_API_KEY },
      });

      // If agent_id filter fails (e.g. deleted agent), retry without it
      if (!listResponse.ok && ELEVENLABS_AGENT_ID) {
        console.warn(`Agent filter failed (${listResponse.status}), retrying without agent_id filter...`);
        let fallbackUrl = `https://api.elevenlabs.io/v1/convai/conversations?page_size=100&summary_mode=include`;
        if (cursor) fallbackUrl += `&cursor=${cursor}`;
        listResponse = await fetch(fallbackUrl, {
          headers: { "xi-api-key": ELEVENLABS_API_KEY },
        });
      }

      if (!listResponse.ok) {
        const errorText = await listResponse.text();
        console.error("ElevenLabs API error:", listResponse.status, errorText);
        throw new Error(`ElevenLabs API error: ${listResponse.status}`);
      }

      const listData = await listResponse.json();
      const conversations: ElevenLabsConversation[] = listData.conversations || [];
      allConversations = [...allConversations, ...conversations];

      // Check for next page
      if (listData.next_cursor && conversations.length === 100) {
        cursor = listData.next_cursor;
      } else {
        hasMore = false;
      }
    }

    console.log(`Found ${allConversations.length} conversations in ElevenLabs`);

    const syncedCalls: string[] = [];
    const syncedLeads: string[] = [];

    // Process each conversation
    for (const conv of allConversations) {
      try {
        console.log(`Processing conversation ${conv.conversation_id}...`);

        // Get detailed conversation data
        const detailResponse = await fetch(
          `https://api.elevenlabs.io/v1/convai/conversations/${conv.conversation_id}`,
          {
            headers: { "xi-api-key": ELEVENLABS_API_KEY },
          }
        );

        if (!detailResponse.ok) {
          console.error(`Failed to fetch conversation ${conv.conversation_id}`);
          continue;
        }

        const detail: ElevenLabsConversationDetail = await detailResponse.json();

        // Fetch agent info
        const agentInfo = await getAgentInfo(conv.agent_id);
        
        // Fetch voice info
        const voiceId = agentInfo?.conversation_config?.tts?.voice_id;
        const voiceInfo = voiceId ? await getVoiceInfo(voiceId) : null;

        // Extract phone number from various sources
        const phoneNumber = 
          detail.metadata?.phone_number ||
          detail.metadata?.from ||
          detail.conversation_initiation_client_data?.dynamic_variables?.phone_number ||
          detail.conversation_initiation_client_data?.dynamic_variables?.from ||
          "Unknown";

        // Extract call SID
        const callSid = 
          detail.metadata?.call_sid ||
          detail.metadata?.callSid ||
          detail.metadata?.twilio_call_sid ||
          null;

        // Format transcript
        const transcriptText = detail.transcript
          ?.map((t) => `${t.role === "agent" ? "Agent" : "Customer"}: ${t.message}`)
          .join("\n") || "";

        // Get audio URL if available
        let recordingUrl: string | null = null;
        if (detail.has_audio) {
          recordingUrl = `https://api.elevenlabs.io/v1/convai/conversations/${conv.conversation_id}/audio`;
        }

        // Extract customer data from analysis
        const dataCollected = detail.analysis?.data_collection_results || {};
        const customerName = 
          dataCollected.name?.value ||
          dataCollected.full_name?.value ||
          dataCollected.customer_name?.value ||
          dataCollected.caller_name?.value ||
          null;
        const customerEmail = 
          dataCollected.email?.value ||
          dataCollected.customer_email?.value ||
          dataCollected.email_address?.value ||
          null;
        const customerCompany = 
          dataCollected.company?.value ||
          dataCollected.business_name?.value ||
          dataCollected.company_name?.value ||
          dataCollected.business?.value ||
          null;
        const customerPhone = 
          dataCollected.phone?.value ||
          dataCollected.phone_number?.value ||
          dataCollected.contact_number?.value ||
          null;
        const customerWhatsapp = 
          dataCollected.whatsapp?.value ||
          dataCollected.whatsapp_number?.value ||
          null;

        // Determine relevance from evaluation
        const evaluationResults = detail.analysis?.evaluation_results || {};
        const isRelevant = 
          evaluationResults.call_relevant?.result !== "failure" &&
          evaluationResults.is_relevant?.result !== "failure";

        // Build comprehensive metadata
        const metadata = {
          elevenlabs_conversation_id: conv.conversation_id,
          agent: {
            id: conv.agent_id,
            name: agentInfo?.name || null,
            language: agentInfo?.conversation_config?.agent?.language || null,
            first_message: agentInfo?.conversation_config?.agent?.first_message || null,
          },
          voice: voiceInfo ? {
            id: voiceId,
            name: voiceInfo.name,
            labels: voiceInfo.labels || null,
          } : null,
          call: {
            status: detail.status,
            has_audio: detail.has_audio,
            has_user_audio: detail.has_user_audio,
            has_response_audio: detail.has_response_audio,
            duration_secs: detail.metadata?.call_duration_secs || conv.call_duration_secs || 0,
            cost: detail.metadata?.cost || null,
            call_successful: detail.analysis?.call_successful ?? null,
          },
          customer: {
            name: customerName,
            email: customerEmail,
            phone: customerPhone || (phoneNumber !== "Unknown" ? phoneNumber : null),
            whatsapp: customerWhatsapp,
            company: customerCompany,
          },
          analysis: {
            summary: detail.analysis?.transcript_summary || conv.transcript_summary || null,
            call_successful: detail.analysis?.call_successful ?? null,
            data_collection: Object.fromEntries(
              Object.entries(dataCollected).map(([k, v]) => [k, v?.value || null])
            ),
            evaluation: Object.fromEntries(
              Object.entries(evaluationResults).map(([k, v]) => [k, { result: v?.result, rationale: v?.rationale }])
            ),
          },
          raw_metadata: detail.metadata,
          dynamic_variables: detail.conversation_initiation_client_data?.dynamic_variables || null,
        };

        // Check if call already exists
        let existingCall = null;
        
        const { data: existingByConvId } = await supabase
          .from("calls")
          .select("id")
          .eq("elevenlabs_conversation_id", conv.conversation_id)
          .maybeSingle();
        
        existingCall = existingByConvId;
        
        if (!existingCall && callSid) {
          const { data: existingBySid } = await supabase
            .from("calls")
            .select("id")
            .eq("twilio_call_sid", callSid)
            .maybeSingle();
          existingCall = existingBySid;
        }

        // Final fallback: match by phone + start-time proximity (±90s) so an EL conversation
        // started by the native Twilio bridge gets merged onto the row that twilio-status-callback
        // pre-created (which has the SID but no EL conv id).
        if (!existingCall && phoneNumber && phoneNumber !== "Unknown") {
          const startMs = conv.start_time_unix_secs * 1000;
          const lo = new Date(startMs - 90_000).toISOString();
          const hi = new Date(startMs + 90_000).toISOString();
          // Try last 4 digits to bypass formatting differences (+1..., 1..., raw)
          const last4 = phoneNumber.replace(/\D/g, "").slice(-10);
          const { data: nearby } = await supabase
            .from("calls")
            .select("id, phone_number, started_at, elevenlabs_conversation_id")
            .is("elevenlabs_conversation_id", null)
            .gte("started_at", lo)
            .lte("started_at", hi)
            .limit(10);
          const match = (nearby || []).find((c: any) =>
            (c.phone_number || "").replace(/\D/g, "").endsWith(last4)
          );
          if (match) existingCall = { id: match.id };
        }


        const callData = {
          phone_number: customerPhone || phoneNumber,
          direction: conv.direction || "inbound",
          status: detail.status === "done" ? "completed" : detail.status === "failed" ? "missed" : "in_progress",
          duration_seconds: detail.metadata?.call_duration_secs || conv.call_duration_secs || 0,
          transcript: transcriptText || null,
          recording_url: recordingUrl,
          notes: detail.analysis?.transcript_summary || conv.transcript_summary || null,
          started_at: new Date(conv.start_time_unix_secs * 1000).toISOString(),
          ended_at: detail.status === "done" || detail.status === "failed" 
            ? new Date((conv.start_time_unix_secs + (conv.call_duration_secs || 0)) * 1000).toISOString()
            : null,
          elevenlabs_conversation_id: conv.conversation_id,
          metadata,
          ...(callSid ? { twilio_call_sid: callSid } : {}),
        };

        let callId: string;

        if (existingCall) {
          await supabase
            .from("calls")
            .update(callData)
            .eq("id", existingCall.id);
          callId = existingCall.id;
          console.log(`Updated existing call ${callId} (conversation: ${conv.conversation_id})`);
        } else {
          const { data: newCall, error: callError } = await supabase
            .from("calls")
            .insert(callData)
            .select()
            .single();

          if (callError) {
            console.error(`Failed to create call:`, callError);
            continue;
          }
          callId = newCall.id;
          console.log(`Created new call ${callId} (conversation: ${conv.conversation_id})`);
        }

        syncedCalls.push(callId);

        // Store conversation entries with sentiment from transcript
        if (detail.transcript && detail.transcript.length > 0) {
          await supabase
            .from("conversations")
            .delete()
            .eq("call_id", callId);

          const conversationEntries = detail.transcript.map((t, index) => {
            const timestamp = t.time_in_call_secs 
              ? new Date((conv.start_time_unix_secs + t.time_in_call_secs) * 1000).toISOString()
              : new Date(conv.start_time_unix_secs * 1000 + index * 3000).toISOString();

            return {
              call_id: callId,
              speaker: t.role === "agent" ? "ai" : "customer",
              message: t.message,
              timestamp,
            };
          });

          await supabase.from("conversations").insert(conversationEntries);
        }

        // Create/update customer record
        if (phoneNumber !== "Unknown" || customerEmail || customerName) {
          const customerLookupPhone = customerPhone || phoneNumber;
          if (customerLookupPhone !== "Unknown") {
            const { data: existingCustomer } = await supabase
              .from("customers")
              .select("id")
              .eq("phone_number", customerLookupPhone)
              .maybeSingle();

            const customerData: Record<string, unknown> = {
              phone_number: customerLookupPhone,
            };
            if (customerName) customerData.full_name = customerName;
            if (customerEmail) customerData.email = customerEmail;
            if (customerCompany) customerData.company = customerCompany;
            if (customerWhatsapp) customerData.notes = `WhatsApp: ${customerWhatsapp}`;

            if (existingCustomer) {
              await supabase.from("customers").update(customerData).eq("id", existingCustomer.id);
              await supabase.from("calls").update({ customer_id: existingCustomer.id }).eq("id", callId);
            } else {
              const { data: newCustomer } = await supabase
                .from("customers")
                .insert(customerData)
                .select()
                .single();
              if (newCustomer) {
                await supabase.from("calls").update({ customer_id: newCustomer.id }).eq("id", callId);
              }
            }
          }
        }

        // Create/update lead for relevant calls with customer data
        if (isRelevant && detail.status === "done" && phoneNumber !== "Unknown") {
          const servicesInterested: string[] = [];
          const serviceMapping: Record<string, string> = {
            "consulting": "consulting",
            "support": "support",
            "sales": "sales",
            "technical": "technical",
            "billing": "billing",
            "partnership": "partnership",
            "it services": "technical",
            "ai development": "technical",
            "chatbot": "technical",
            "customer support": "support",
            "web development": "technical",
            "website": "technical",
          };

          const servicesData = 
            dataCollected.services_interested?.value ||
            dataCollected.service_interest?.value ||
            "";
          
          if (servicesData) {
            const servicesList = servicesData.split(/[,;]/).map((s: string) => s.trim().toLowerCase());
            for (const service of servicesList) {
              const mapped = serviceMapping[service] || "other";
              if (!servicesInterested.includes(mapped)) {
                servicesInterested.push(mapped);
              }
            }
          }

          const leadData: Record<string, unknown> = {
            phone_number: customerPhone || phoneNumber,
            status: "new",
            source: "inbound_call",
            notes: detail.analysis?.transcript_summary || "",
          };

          if (customerName) leadData.full_name = customerName;
          if (customerEmail) leadData.email = customerEmail;
          if (customerCompany) leadData.company = customerCompany;
          if (servicesInterested.length > 0) leadData.services_interested = servicesInterested;

          const { data: existingLead } = await supabase
            .from("leads")
            .select("id, services_interested")
            .eq("phone_number", customerPhone || phoneNumber)
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

            await supabase
              .from("calls")
              .update({ lead_id: existingLead.id })
              .eq("id", callId);

            syncedLeads.push(existingLead.id);
          } else {
            const { data: newLead } = await supabase
              .from("leads")
              .insert(leadData)
              .select()
              .single();

            if (newLead) {
              await supabase
                .from("calls")
                .update({ lead_id: newLead.id })
                .eq("id", callId);
              syncedLeads.push(newLead.id);
            }
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 200));

      } catch (convError) {
        console.error(`Error processing conversation ${conv.conversation_id}:`, convError);
      }
    }

    console.log(`Sync complete: ${syncedCalls.length} calls, ${syncedLeads.length} leads`);

    return new Response(
      JSON.stringify({
        success: true,
        synced_calls: syncedCalls.length,
        synced_leads: syncedLeads.length,
        total_conversations: allConversations.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Sync error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}
