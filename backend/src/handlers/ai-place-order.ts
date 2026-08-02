// @generated from supabase/functions/ai-place-order — run: node backend/scripts/generate-handlers.mjs
// Webhook tool callable by the ElevenLabs agent during a phone call.
// The agent collects: customer_name, customer_phone, delivery_address,
// payment_method, items [{name, quantity, notes?}], optional notes & email.
// We resolve menu items by name (case-insensitive, fuzzy contains) for the
// given restaurant, compute totals using restaurant_settings, and create
// the order in `pending` status so staff can confirm in the dashboard.

import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface IncomingItem { name: string; quantity?: number; notes?: string }
interface Body {
  restaurant_id?: string;
  twilio_to?: string; // alternative way to identify restaurant
  call_sid?: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  delivery_address: string;
  delivery_notes?: string;
  payment_method?: "cash" | "card";
  items: IncomingItem[];
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    process.env.SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  );

  let body: Body;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }

  if (!body.customer_name || !body.customer_phone || !body.delivery_address || !Array.isArray(body.items) || body.items.length === 0) {
    return new Response(JSON.stringify({ error: "missing required fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Resolve restaurant
  let restaurantId = body.restaurant_id ?? null;
  if (!restaurantId && body.twilio_to) {
    const { data: r } = await supabase.from("restaurants").select("id").eq("twilio_phone_number", body.twilio_to).maybeSingle();
    restaurantId = r?.id ?? null;
  }
  if (!restaurantId) {
    // fallback: first active restaurant
    const { data: r } = await supabase.from("restaurants").select("id").eq("is_active", true).order("created_at").limit(1).maybeSingle();
    restaurantId = r?.id ?? null;
  }
  if (!restaurantId) {
    return new Response(JSON.stringify({ error: "no restaurant found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Load menu + settings for the restaurant
  const [menuRes, settingsRes] = await Promise.all([
    supabase.from("menu_items").select("id, name, price").eq("restaurant_id", restaurantId).eq("is_available", true),
    supabase.from("restaurant_settings").select("*").eq("restaurant_id", restaurantId).maybeSingle(),
  ]);
  const menu = menuRes.data ?? [];
  const settings = settingsRes.data;

  // Match each requested item to menu (best-effort)
  const lines: { menu_item_id: string | null; item_name: string; quantity: number; unit_price: number; line_total: number; notes: string | null; matched: boolean }[] = [];
  const unmatched: string[] = [];
  for (const it of body.items) {
    const qty = Math.max(1, Number(it.quantity ?? 1));
    const needle = (it.name || "").trim().toLowerCase();
    let m = menu.find((x: any) => x.name.toLowerCase() === needle);
    if (!m) m = menu.find((x: any) => x.name.toLowerCase().includes(needle) || needle.includes(x.name.toLowerCase()));
    if (m) {
      const price = Number((m as any).price);
      lines.push({ menu_item_id: (m as any).id, item_name: (m as any).name, quantity: qty, unit_price: price, line_total: price * qty, notes: it.notes ?? null, matched: true });
    } else {
      unmatched.push(it.name);
      lines.push({ menu_item_id: null, item_name: it.name, quantity: qty, unit_price: 0, line_total: 0, notes: it.notes ?? null, matched: false });
    }
  }

  const subtotal = lines.reduce((s, l) => s + l.line_total, 0);
  const taxRate = Number(settings?.tax_rate ?? 0) / 100;
  const deliveryFee = Number(settings?.delivery_fee ?? 0);
  const tax = subtotal * taxRate;
  const total = subtotal + tax + deliveryFee;

  // Find call_id (if any) for this call_sid
  let callId: string | null = null;
  if (body.call_sid) {
    const { data: c } = await supabase.from("calls").select("id").eq("twilio_call_sid", body.call_sid).maybeSingle();
    callId = c?.id ?? null;
  }

  const { data: order, error: orderErr } = await supabase.from("orders").insert({
    restaurant_id: restaurantId,
    customer_name: body.customer_name,
    customer_phone: body.customer_phone,
    customer_email: body.customer_email ?? null,
    delivery_address: body.delivery_address,
    delivery_notes: body.delivery_notes ?? null,
    source: "phone",
    status: "pending",
    payment_method: body.payment_method ?? "cash",
    payment_status: "pending",
    subtotal, tax_amount: tax, delivery_fee: deliveryFee, total_amount: total,
    call_id: callId,
    ai_extracted_data: { unmatched, raw: body },
  }).select().single();

  if (orderErr || !order) {
    return new Response(JSON.stringify({ error: orderErr?.message ?? "failed to create order" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  await supabase.from("order_items").insert(lines.map((l) => ({
    order_id: order.id, menu_item_id: l.menu_item_id, item_name: l.item_name,
    quantity: l.quantity, unit_price: l.unit_price, line_total: l.line_total, notes: l.notes,
  })));

  return new Response(JSON.stringify({
    success: true,
    order_number: order.order_number,
    tracking_code: order.tracking_code,
    total,
    unmatched_items: unmatched,
    message: unmatched.length
      ? `Order created as ${order.order_number}. We couldn't find these items on the menu and they were added at $0: ${unmatched.join(", ")}. Staff will confirm.`
      : `Order ${order.order_number} placed successfully. Total ${total.toFixed(2)}.`,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}