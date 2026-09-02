// @generated from supabase/functions/analyze-website — run: node backend/scripts/generate-handlers.mjs
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function analyzeWebsite(url: string, leadId?: string): Promise<any> {
  // Create analysis record
  const { data: analysis, error: insertError } = await supabase
    .from("website_analysis")
    .insert({
      website_url: url,
      lead_id: leadId || null,
      analysis_status: "processing",
    })
    .select()
    .single();

  if (insertError) throw insertError;

  try {
    // Use Lovable AI to analyze the website
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a web development expert analyzing websites for a digital agency. 
Analyze the given website URL and provide insights on:
1. Missing services the agency could offer (from: website redesign, mobile optimization, SEO, AI chatbot, CRM integration, e-commerce, custom software, digital marketing, app development)
2. Current tech stack if identifiable
3. Design score (0-100)
4. SEO issues
5. Mobile friendliness
6. Brief recommendations

Respond in JSON format only:
{
  "missing_services": ["service1", "service2"],
  "tech_stack": ["tech1", "tech2"],
  "design_score": 75,
  "seo_issues": ["issue1", "issue2"],
  "mobile_friendly": true,
  "recommendations": "Brief analysis and what improvements could be made"
}`
          },
          {
            role: "user",
            content: `Analyze this website: ${url}`
          }
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;

    // Parse the AI response
    let analysisData;
    try {
      // Extract JSON from the response (handle markdown code blocks)
      const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || [null, content];
      analysisData = JSON.parse(jsonMatch[1] || content);
    } catch {
      console.error("Failed to parse AI response:", content);
      analysisData = {
        missing_services: [],
        recommendations: content,
        design_score: null,
        tech_stack: [],
        seo_issues: [],
        mobile_friendly: null,
      };
    }

    // Update the analysis record
    await supabase
      .from("website_analysis")
      .update({
        analysis_status: "completed",
        missing_services: analysisData.missing_services || [],
        recommendations: analysisData.recommendations || null,
        tech_stack: analysisData.tech_stack || [],
        design_score: analysisData.design_score || null,
        seo_issues: analysisData.seo_issues || [],
        mobile_friendly: analysisData.mobile_friendly ?? null,
        raw_analysis: analysisData,
        analyzed_at: new Date().toISOString(),
      })
      .eq("id", analysis.id);

    // If there's a lead and missing services found, update lead status
    if (leadId && analysisData.missing_services?.length > 0) {
      await supabase
        .from("outbound_leads")
        .update({
          status: "contacted",
          notes: `Website analyzed. Missing services: ${analysisData.missing_services.join(", ")}`,
        })
        .eq("id", leadId);
    }

    return { ...analysis, ...analysisData };
  } catch (error) {
    console.error("Analysis error:", error);
    await supabase
      .from("website_analysis")
      .update({
        analysis_status: "failed",
      })
      .eq("id", analysis.id);
    throw error;
  }
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, campaignId, mode } = await req.json();

    if (mode === "single" && url) {
      const result = await analyzeWebsite(url);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (mode === "batch" && campaignId) {
      // Get all leads with website URLs from the campaign
      const { data: leads, error } = await supabase
        .from("outbound_leads")
        .select("id, website_url")
        .eq("campaign_id", campaignId)
        .not("website_url", "is", null);

      if (error) throw error;

      // Queue analysis for each lead (process in background)
      const validLeads = leads?.filter(l => l.website_url) || [];
      
      // Start batch processing in background using Promise.all
      // Process leads without blocking the response
      Promise.all(
        validLeads.map(lead => 
          analyzeWebsite(lead.website_url!, lead.id).catch(e => 
            console.error(`Failed to analyze ${lead.website_url}:`, e)
          )
        )
      ).catch(e => console.error("Batch processing error:", e));

      return new Response(
        JSON.stringify({ 
          success: true, 
          count: validLeads.length,
          message: `Started analysis for ${validLeads.length} websites` 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid request. Provide url or campaignId" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}
