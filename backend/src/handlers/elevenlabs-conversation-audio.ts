// @generated from supabase/functions/elevenlabs-conversation-audio — run: node backend/scripts/generate-handlers.mjs

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    let conversationId = url.searchParams.get("conversation_id");
    let recordingUrl: string | null = null;

    // Also accept JSON body { conversation_id } or { recording_url } (POST via supabase.functions.invoke)
    if (!conversationId && (req.method === "POST" || req.method === "PUT")) {
      try {
        const body = await req.json();
        conversationId = body?.conversation_id ?? null;
        recordingUrl = body?.recording_url ?? null;
      } catch (_) {
        // no body
      }
    }

    if (!conversationId && recordingUrl) {
      if (recordingUrl.includes("api.elevenlabs.io")) {
        const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
        if (!ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY is not configured");

        const audioResponse = await fetch(recordingUrl, {
          headers: { "xi-api-key": ELEVENLABS_API_KEY },
        });
        if (!audioResponse.ok) throw new Error(`Failed to fetch audio: ${audioResponse.status}`);
        const audioData = await audioResponse.arrayBuffer();
        return new Response(audioData, {
          headers: { ...corsHeaders, "Content-Type": "audio/mpeg" },
        });
      }
      return Response.redirect(recordingUrl, 302);
    }

    if (!conversationId) {
      throw new Error("No conversation_id or recording_url provided");
    }

    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
    if (!ELEVENLABS_API_KEY) {
      throw new Error("ELEVENLABS_API_KEY is not configured");
    }

    console.log(`Fetching audio for conversation ${conversationId}`);

    const audioResponse = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}/audio`,
      {
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
        },
      }
    );

    if (!audioResponse.ok) {
      const errorText = await audioResponse.text();
      console.error("ElevenLabs audio error:", audioResponse.status, errorText);
      // Return 200 with fallback signal so the supabase client SDK can read the body
      // (it throws on non-2xx and discards the response). 404 typically means the
      // recording isn't available yet (call still processing, or no audio stored).
      const isNotReady = audioResponse.status === 404 || audioResponse.status >= 500;
      return new Response(
        JSON.stringify({
          error: isNotReady ? "RECORDING_NOT_AVAILABLE" : `ElevenLabs error: ${audioResponse.status}`,
          fallback: true,
          status: audioResponse.status,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const audioData = await audioResponse.arrayBuffer();

    return new Response(audioData, {
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/mpeg",
      },
    });

  } catch (error) {
    console.error("Audio fetch error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error", fallback: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}
