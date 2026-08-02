// @generated from supabase/functions/discover-prospects — run: node backend/scripts/generate-handlers.mjs
// Discover cold-outreach prospects from a niche/location query.
// Uses Lovable AI to generate a candidate list of businesses (name, website, phone, city)
// the user can review/edit before launching the campaign.
//
// POST { query: string, limit?: number }
//   → { prospects: [{ company, website_url, phone_number, city, notes }] }


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM = `You are a B2B prospect researcher for QubeTech, a digital agency offering web design,
app development, SaaS, AI integration, and related services. Given a niche + location query,
return a JSON list of REAL, plausible small/mid-size business prospects that would benefit from
those services (e.g. dental clinics, law firms, gyms, restaurants, real-estate offices, etc.).

For each prospect provide:
- company: the business name
- website_url: best-guess primary website (https://...) — required
- phone_number: a plausible business phone in E.164 (e.g. +12025551234) — required
- city: city/region
- notes: 1 sentence on why they're a good fit

IMPORTANT:
- Only return businesses you are reasonably confident exist or are typical for that niche+area.
- The user will REVIEW and EDIT before calling — accuracy matters but not perfection.
- Never fabricate suspiciously specific data (no fake addresses, no fake people).
- If you cannot find good candidates, return an empty list.`;

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { query, limit = 15, excludePhones = [], excludeCompanies = [] } = await req.json();
    if (!query || typeof query !== "string") {
      return new Response(JSON.stringify({ error: "query required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

    // Cap per-call request to keep AI within token budget; client can call again for more.
    const requested = Math.max(1, Math.min(Number(limit) || 15, 50));

    const exclusionsBlock = (excludePhones.length || excludeCompanies.length)
      ? `\n\nDO NOT return any prospect whose phone number is in this list: ${JSON.stringify(excludePhones).slice(0, 4000)}\nDO NOT return any business whose name matches (case-insensitive) any of: ${JSON.stringify(excludeCompanies).slice(0, 2000)}\nReturn only NEW prospects we have not contacted before.`
      : "";

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Find exactly ${requested} prospects matching: "${query}"${exclusionsBlock}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "return_prospects",
            description: "Return the prospect list",
            parameters: {
              type: "object",
              properties: {
                prospects: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      company: { type: "string" },
                      website_url: { type: "string" },
                      phone_number: { type: "string" },
                      city: { type: "string" },
                      notes: { type: "string" },
                    },
                    required: ["company", "website_url", "phone_number"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["prospects"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_prospects" } },
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      if (resp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit reached, try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (resp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted, top up in Settings → Workspace → Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway ${resp.status}: ${t.slice(0, 200)}`);
    }

    const data = await resp.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const parsed = args ? JSON.parse(args) : { prospects: [] };

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("discover-prospects error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}
