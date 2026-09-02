// @generated from supabase/functions/agent-test-call-twiml — run: node backend/scripts/generate-handlers.mjs
// TwiML webhook for agent test calls. Bridges Twilio call to a specific
// ElevenLabs agent via <Connect><Stream>.


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fallback(message: string) {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${escapeXml(message)}</Say>
  <Hangup/>
</Response>`;
  return new Response(twiml, {
    headers: { ...corsHeaders, "Content-Type": "application/xml" },
  });
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const agentId = url.searchParams.get("agentId");
    const firstMessage = url.searchParams.get("firstMessage") || "";

    if (!agentId) return fallback("Missing agent. Goodbye.");

    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
    if (!ELEVENLABS_API_KEY) return fallback("AI assistant unavailable.");

    const signedResp = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`,
      { headers: { "xi-api-key": ELEVENLABS_API_KEY } },
    );

    if (!signedResp.ok) {
      console.error("ElevenLabs signed URL error:", await signedResp.text());
      return fallback("AI assistant temporarily unavailable.");
    }

    const { signed_url } = await signedResp.json();

    const params = [
      { name: "source", value: "agent_test_call" },
      ...(firstMessage ? [{ name: "first_message", value: firstMessage }] : []),
    ]
      .map((p) => `    <Parameter name="${escapeXml(p.name)}" value="${escapeXml(p.value)}"/>`)
      .join("\n");

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${escapeXml(signed_url)}">
${params}
    </Stream>
  </Connect>
</Response>`;

    console.log(`agent-test-call-twiml: bridging to agent ${agentId}`);

    return new Response(twiml, {
      headers: { ...corsHeaders, "Content-Type": "application/xml" },
    });
  } catch (e) {
    console.error("agent-test-call-twiml error:", e);
    return fallback("An error occurred.");
  }
}
