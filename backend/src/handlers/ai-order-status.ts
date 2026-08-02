// @generated from supabase/functions/ai-order-status — run: node backend/scripts/generate-handlers.mjs
// Webhook tool for the ElevenLabs agent: looks up an order by tracking_code
// and returns a friendly status summary the agent can read back to the caller.
//
// POST { tracking_code, restaurant_id?, twilio_to? }

import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function statusLabel(s: string) {
  switch (s) {
    case "pending": return "received and waiting for confirmation";
    case "confirmed": return "confirmed by the restaurant";
    case "preparing": return "being prepared in the kitchen";
    case "ready": return "ready and waiting for a driver";
    case "assigned": return "assigned to a driver";
    case "out_for_delivery": return "out for delivery";
    case "delivered": return "delivered";
    case "cancelled": return "cancelled";
    default: return s;
  }
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    process.env.SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  );

  let body: { tracking_code?: string; restaurant_id?: string; twilio_to?: string };
  try { body = await req.json(); }
  catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const code = (body.tracking_code || "").trim().toUpperCase();
  if (!code) {
    return new Response(JSON.stringify({
      found: false,
      message: "I need the tracking code from your receipt to look that up.",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Resolve restaurant for scoping (optional)
  let restaurantId = body.restaurant_id ?? null;
  if (!restaurantId && body.twilio_to) {
    const { data: r } = await supabase
      .from("restaurants")
      .select("id")
      .eq("twilio_phone_number", body.twilio_to)
      .maybeSingle();
    restaurantId = r?.id ?? null;
  }

  let q = supabase
    .from("orders")
    .select("order_number, tracking_code, status, total_amount, estimated_delivery_at, customer_name, restaurant_id")
    .eq("tracking_code", code)
    .limit(1);
  if (restaurantId) q = q.eq("restaurant_id", restaurantId);
  const { data: order } = await q.maybeSingle();

  if (!order) {
    return new Response(JSON.stringify({
      found: false,
      message: `I couldn't find an order with tracking code ${code}. Could you double-check it?`,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const eta = order.estimated_delivery_at
    ? new Date(order.estimated_delivery_at).toLocaleString("en-US", { hour: "numeric", minute: "2-digit" })
    : null;

  const message = `Order ${order.order_number} for ${order.customer_name} is ${statusLabel(order.status)}.${
    eta ? ` Estimated delivery around ${eta}.` : ""
  } Total ${Number(order.total_amount).toFixed(2)}.`;

  return new Response(JSON.stringify({
    found: true,
    order_number: order.order_number,
    status: order.status,
    status_label: statusLabel(order.status),
    estimated_delivery_at: order.estimated_delivery_at,
    total: order.total_amount,
    message,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}