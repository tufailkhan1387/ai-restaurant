// @generated from supabase/functions/send-mockup-email — run: node backend/scripts/generate-handlers.mjs
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { followupId } = await req.json();

    if (!followupId) {
      return new Response(
        JSON.stringify({ error: "followupId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get followup details with lead info
    const { data: followup, error: followupError } = await supabase
      .from("mockup_followups")
      .select(`
        *,
        lead:outbound_leads(full_name, email, company, website_url)
      `)
      .eq("id", followupId)
      .single();

    if (followupError || !followup) {
      throw new Error("Followup not found");
    }

    const lead = followup.lead as any;
    if (!lead?.email) {
      throw new Error("Lead has no email address");
    }

    // Compose email
    const emailSubject = `Your Website Redesign Mockup is Ready - ${lead.company || "Your Business"}`;
    const mockupLink = followup.mockup_url || "https://qubetech.us/mockups";
    
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 20px 0; }
    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Your Custom Website Redesign</h1>
    </div>
    <div class="content">
      <p>Hi ${lead.full_name || "there"},</p>
      
      <p>Great news! We've completed a custom website redesign mockup for <strong>${lead.company || "your business"}</strong>.</p>
      
      <p>Our team has carefully analyzed your current website and created a modern, conversion-focused design that could help you:</p>
      
      <ul>
        <li>Increase visitor engagement</li>
        <li>Improve mobile experience</li>
        <li>Boost conversions and leads</li>
        <li>Stand out from competitors</li>
      </ul>
      
      <p><a href="${mockupLink}" class="button">View Your Mockup</a></p>
      
      <p>We'd love to schedule a quick 15-minute call to walk you through the design and answer any questions.</p>
      
      <p>Best regards,<br>The QubeTech Team</p>
    </div>
    <div class="footer">
      <p>QubeTech - Software Development & Digital Solutions</p>
      <p>If you don't want to receive these emails, please let us know.</p>
    </div>
  </div>
</body>
</html>
    `;

    // Send email via Resend if configured
    if (RESEND_API_KEY) {
      const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "QubeTech <noreply@qubetech.us>",
          to: [lead.email],
          subject: emailSubject,
          html: emailHtml,
        }),
      });

      if (!emailResponse.ok) {
        const errorData = await emailResponse.json();
        console.error("Resend error:", errorData);
        // Don't throw - continue to update the record
      }
    } else {
      console.log("RESEND_API_KEY not configured. Email would be sent to:", lead.email);
    }

    // Update followup record
    await supabase
      .from("mockup_followups")
      .update({
        email_status: "delivered",
        next_followup_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days
      })
      .eq("id", followupId);

    return new Response(
      JSON.stringify({ success: true, message: "Mockup email sent" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}
