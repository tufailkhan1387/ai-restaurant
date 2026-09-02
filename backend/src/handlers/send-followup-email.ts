// @generated from supabase/functions/send-followup-email — run: node backend/scripts/generate-handlers.mjs
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const followupTemplates = [
  {
    subject: "Quick follow-up: Your website mockup",
    intro: "I wanted to follow up on the website mockup we sent you. Have you had a chance to review it?",
  },
  {
    subject: "Did you see your new website design?",
    intro: "Just checking in to see if you had any questions about the mockup we created for your business.",
  },
  {
    subject: "Last chance: Your exclusive website redesign",
    intro: "This is our final follow-up regarding the custom mockup we designed for you. We'd hate for you to miss out on this opportunity.",
  },
];

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

    if (followup.email_status === "responded") {
      return new Response(
        JSON.stringify({ error: "Lead has already responded" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const lead = followup.lead as any;
    if (!lead?.email) {
      throw new Error("Lead has no email address");
    }

    const followupCount = followup.followup_count || 0;
    const template = followupTemplates[Math.min(followupCount, followupTemplates.length - 1)];
    const mockupLink = followup.mockup_url || "https://qubetech.us/mockups";

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 20px 0; }
    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Following Up On Your Mockup</h2>
    </div>
    <div class="content">
      <p>Hi ${lead.full_name || "there"},</p>
      
      <p>${template.intro}</p>
      
      <p>As a reminder, we created a custom website redesign for ${lead.company || "your business"} that includes:</p>
      
      <ul>
        <li>Modern, mobile-responsive design</li>
        <li>Improved user experience</li>
        <li>Better conversion optimization</li>
      </ul>
      
      <p><a href="${mockupLink}" class="button">View Your Mockup Again</a></p>
      
      <p>Would you be available for a quick 15-minute call this week to discuss?</p>
      
      <p>Just reply to this email with your availability, or let us know if you're not interested.</p>
      
      <p>Best regards,<br>The QubeTech Team</p>
    </div>
    <div class="footer">
      <p>QubeTech - Software Development & Digital Solutions</p>
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
          subject: template.subject,
          html: emailHtml,
        }),
      });

      if (!emailResponse.ok) {
        const errorData = await emailResponse.json();
        console.error("Resend error:", errorData);
      }
    } else {
      console.log("RESEND_API_KEY not configured. Follow-up would be sent to:", lead.email);
    }

    // Calculate next followup (increasing intervals: 3, 5, 7 days)
    const daysUntilNext = [3, 5, 7][Math.min(followupCount, 2)];
    const nextFollowupAt = followupCount >= 2 
      ? null // Stop after 3 follow-ups
      : new Date(Date.now() + daysUntilNext * 24 * 60 * 60 * 1000).toISOString();

    // Update followup record
    await supabase
      .from("mockup_followups")
      .update({
        followup_count: followupCount + 1,
        last_followup_sent_at: new Date().toISOString(),
        next_followup_at: nextFollowupAt,
        auto_followup_enabled: followupCount < 2, // Disable after 3 total follow-ups
      })
      .eq("id", followupId);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Follow-up email sent",
        followupNumber: followupCount + 1,
      }),
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
