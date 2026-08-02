// @generated from supabase/functions/check-integration-status — run: node backend/scripts/generate-handlers.mjs

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const integrations: Record<string, { configured: boolean; details?: string }> = {};

    // Check Twilio
    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
    integrations.twilio = {
      configured: !!(twilioSid && twilioToken && twilioPhone),
      details: twilioPhone ? `Phone: ${twilioPhone.slice(0, 6)}...` : undefined,
    };

    // Check ElevenLabs
    const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
    const elevenLabsAgent = process.env.ELEVENLABS_AGENT_ID;
    integrations.elevenlabs = {
      configured: !!(elevenLabsKey && elevenLabsAgent),
      details: elevenLabsAgent ? `Agent: ${elevenLabsAgent.slice(0, 8)}...` : undefined,
    };

    // Check Resend
    const resendKey = process.env.RESEND_API_KEY;
    integrations.resend = {
      configured: !!resendKey,
    };

    return new Response(
      JSON.stringify({ integrations }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Integration check error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}
