// @generated from supabase/functions/send-order-notification — run: node backend/scripts/generate-handlers.mjs
// Processes pending notification_queue rows.
// Triggered by the app after status updates, or callable manually.
// - email channel → sends order confirmation via Resend
// - sms channel → sends "out for delivery" SMS via Twilio

import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function fmt(n: number, currency = "USD") {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n); }
  catch { return `$${n.toFixed(2)}`; }
}

async function sendEmail(to: string, subject: string, html: string) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({ from: "Orders <onboarding@resend.dev>", to: [to], subject, html }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Resend ${resp.status}: ${JSON.stringify(data)}`);
  return data;
}

async function sendSms(to: string, body: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from) throw new Error("Twilio not configured");
  const auth = btoa(`${sid}:${token}`);
  const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Twilio ${resp.status}: ${JSON.stringify(data)}`);
  return data;
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    process.env.SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  );

  // Allow caller to pass a specific order_id, otherwise drain pending queue (max 25)
  let orderId: string | null = null;
  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      orderId = body?.order_id ?? null;
    }
  } catch (_) {}

  let q = supabase.from("notification_queue").select("*").eq("status", "pending").limit(25);
  if (orderId) q = supabase.from("notification_queue").select("*").eq("status", "pending").eq("order_id", orderId);
  const { data: queue, error } = await q;
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const results: any[] = [];
  for (const row of queue ?? []) {
    try {
      // Load order + items + restaurant settings
      const { data: order } = await supabase.from("orders").select("*").eq("id", row.order_id).maybeSingle();
      if (!order) throw new Error("order not found");
      const { data: items } = await supabase.from("order_items").select("*").eq("order_id", row.order_id);
      const { data: settings } = await supabase.from("restaurant_settings").select("*").eq("restaurant_id", order.restaurant_id).maybeSingle();
      const restaurantName = settings?.name || "Restaurant";
      const currency = settings?.currency || "USD";
      const trackUrl = `${process.env.SUPABASE_URL?.replace(/\/$/, "")}/track/${order.tracking_code}`;

      if (row.channel === "email" && row.event === "confirmed") {
        const itemsHtml = (items ?? []).map((i: any) =>
          `<tr><td>${i.quantity}× ${i.item_name}</td><td style="text-align:right">${fmt(Number(i.line_total), currency)}</td></tr>`).join("");
        const html = `
          <div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto">
            <h2>Your order is confirmed 🎉</h2>
            <p>Hi ${order.customer_name}, ${restaurantName} has confirmed your order <b>${order.order_number}</b>.</p>
            <table style="width:100%;border-collapse:collapse" cellpadding="6">
              ${itemsHtml}
              <tr><td>Subtotal</td><td style="text-align:right">${fmt(Number(order.subtotal), currency)}</td></tr>
              <tr><td>Tax</td><td style="text-align:right">${fmt(Number(order.tax_amount), currency)}</td></tr>
              <tr><td>Delivery</td><td style="text-align:right">${fmt(Number(order.delivery_fee), currency)}</td></tr>
              <tr><td><b>Total</b></td><td style="text-align:right"><b>${fmt(Number(order.total_amount), currency)}</b></td></tr>
            </table>
            <p>Tracking code: <code>${order.tracking_code}</code></p>
            <p>We'll text you when the driver is on the way.</p>
          </div>`;
        const r = await sendEmail(row.recipient!, `Order ${order.order_number} confirmed`, html);
        await supabase.from("notification_queue").update({ status: "sent", sent_at: new Date().toISOString(), payload: r, attempts: row.attempts + 1 }).eq("id", row.id);
        results.push({ id: row.id, ok: true });
      } else if (row.channel === "sms" && row.event === "out_for_delivery") {
        const body = `${restaurantName}: Your order ${order.order_number} is out for delivery! Track: ${trackUrl}`;
        const r = await sendSms(row.recipient!, body);
        await supabase.from("notification_queue").update({ status: "sent", sent_at: new Date().toISOString(), payload: r, attempts: row.attempts + 1 }).eq("id", row.id);
        results.push({ id: row.id, ok: true });
      } else {
        await supabase.from("notification_queue").update({ status: "skipped", attempts: row.attempts + 1 }).eq("id", row.id);
        results.push({ id: row.id, ok: true, skipped: true });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("notif error", row.id, msg);
      await supabase.from("notification_queue").update({ status: "failed", error: msg, attempts: row.attempts + 1 }).eq("id", row.id);
      results.push({ id: row.id, ok: false, error: msg });
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}