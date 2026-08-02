function publicApiBase() {
  const raw = process.env.PUBLIC_API_URL || process.env.PUBLIC_APP_URL || "";
  return String(raw).replace(/\/$/, "");
}

export async function checkIntegrationStatus(req, res) {
  try {
    const integrations = {
      twilio: {
        configured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
        details: process.env.TWILIO_ACCOUNT_SID
          ? `Connected to SID: ${process.env.TWILIO_ACCOUNT_SID.slice(0, 6)}...`
          : "Missing credentials",
      },
      elevenlabs: {
        configured: !!process.env.ELEVENLABS_API_KEY,
        details: process.env.ELEVENLABS_API_KEY ? "API Key configured" : "Missing API Key",
      },
      telnyx: {
        configured: !!process.env.TELNYX_API_KEY,
        details: process.env.TELNYX_API_KEY
          ? `API key set${process.env.TELNYX_CONNECTION_ID ? ", SIP connection configured" : " (set TELNYX_CONNECTION_ID for Synthflow SIP)"}`
          : "Missing TELNYX_API_KEY",
      },
      synthflow: {
        configured: !!process.env.SYNTHFLOW_API_KEY,
        details: process.env.SYNTHFLOW_API_KEY
          ? `API key set${process.env.SYNTHFLOW_WORKSPACE_ID ? ", workspace set" : " (set SYNTHFLOW_WORKSPACE_ID)"}`
          : "Missing SYNTHFLOW_API_KEY",
      },
      resend: {
        configured: !!process.env.RESEND_API_KEY,
        details: process.env.RESEND_API_KEY ? "API Key configured" : "Missing API Key",
      },
    };

    const base = publicApiBase();
    const routingRaw = (process.env.VOICE_ROUTING || "twilio_webhook").toLowerCase();
    const routing =
      routingRaw === "elevenlabs_native"
        ? "elevenlabs_native"
        : routingRaw === "synthflow_telnyx"
          ? "synthflow_telnyx"
          : "twilio_webhook";

    const voice = {
      routing,
      public_api_base: base || null,
      urls: base
        ? {
            twilio_inbound_webhook: `${base}/api/functions/twilio-inbound-webhook`,
            ai_place_order: `${base}/api/functions/ai-place-order`,
            ai_order_status: `${base}/api/functions/ai-order-status`,
            elevenlabs_post_call_webhook: `${base}/api/functions/elevenlabs-conversation-webhook`,
            synthflow_post_call_webhook: `${base}/api/functions/synthflow-post-call-webhook`,
          }
        : null,
      hints: {
        twilio_webhook:
          "Twilio Voice URL (POST) should point to twilio_inbound_webhook. Our server returns TwiML that streams audio to ElevenLabs.",
        elevenlabs_native:
          "Import the Twilio number in ElevenLabs and assign this agent. Leave Twilio's Voice webhook empty (or EL-managed). Configure agent tools + optional post-call webhook using the URLs above. Set PUBLIC_API_URL so these links are correct.",
        synthflow_telnyx:
          "Each restaurant gets a dedicated Telnyx number imported into Synthflow over SIP. Create a Synthflow inbound agent per restaurant with external_webhook_url = synthflow_post_call_webhook. After each call, Synthflow posts transcript + extractors and we auto-create the order (with coupons).",
      },
    };

    return res.json({ integrations, voice });
  } catch (error) {
    console.error("Check integration status failed:", error);
    return res.status(500).json({ error: error.message });
  }
}
