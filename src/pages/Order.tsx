import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getApiBase } from "@/lib/apiBase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/restaurant";
import { toast } from "sonner";
import { AIChatTest } from "@/components/agents/AIChatTest";

type MenuItem = { id: string; name: string; description: string | null; price: number; image_url: string | null; category_id: string | null; dietary_tags: string[] };
type Category = { id: string; name: string; sort_order: number };
type Deal = { id: string; name: string; description: string | null; price: number; original_price: number | null; image_url: string | null };
type Settings = { name: string; phone: string | null; address: string | null; tax_rate: number; delivery_fee: number; min_order_amount: number; currency: string; is_open: boolean; allows_delivery?: boolean; allows_pickup?: boolean };
type Restaurant = { id: string; elevenlabs_agent_id?: string | null };

type CartLine = { kind: "item" | "deal"; refId: string; name: string; price: number; quantity: number };
type WorkingHour = { day_of_week: number; open_time: string; close_time: string };

export default function Order() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [hours, setHours] = useState<WorkingHour[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [activeCat, setActiveCat] = useState<string>("deals");
  const [submitting, setSubmitting] = useState(false);
  const [fulfillmentType, setFulfillmentType] = useState<"delivery" | "pickup">("delivery");
  const [form, setForm] = useState({ customer_name: "", customer_phone: "", customer_email: "", delivery_address: "", notes: "" });

  useEffect(() => {
    (async () => {
      const res = await fetch(`${getApiBase()}/api/public/storefront`);
      if (!res.ok) return;
      const bundle = await res.json();
      const s = bundle.settings || {};
      const r = bundle.restaurant || {};
      setRestaurant({ id: r.id, elevenlabs_agent_id: r.elevenlabs_agent_id ?? null });
      setSettings({ ...s, allows_delivery: r.allows_delivery, allows_pickup: r.allows_pickup } as any);
      
      if (r.allows_delivery === false && r.allows_pickup !== false) {
        setFulfillmentType("pickup");
      }
      
      setCategories(bundle.categories || []);
      setItems(bundle.items || []);
      setDeals(bundle.deals || []);
      setHours(bundle.hours || []);
      if ((bundle.deals?.length ?? 0) === 0 && (bundle.categories?.length ?? 0) > 0) {
        setActiveCat(bundle.categories[0].id);
      }
    })();
  }, []);

  const addItem = (line: Omit<CartLine, "quantity">) => {
    setCart((prev) => {
      const idx = prev.findIndex((p) => p.kind === line.kind && p.refId === line.refId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, { ...line, quantity: 1 }];
    });
  };
  const updateQty = (idx: number, delta: number) => {
    setCart((prev) => prev.map((p, i) => (i === idx ? { ...p, quantity: Math.max(1, p.quantity + delta) } : p)));
  };
  const removeLine = (idx: number) => setCart((prev) => prev.filter((_, i) => i !== idx));

  const subtotal = useMemo(() => cart.reduce((s, l) => s + l.price * l.quantity, 0), [cart]);
  const tax = useMemo(() => subtotal * ((settings?.tax_rate || 0) / 100), [subtotal, settings]);
  const deliveryFee = fulfillmentType === "delivery" ? Number(settings?.delivery_fee || 0) : 0;
  const total = subtotal + tax + deliveryFee;

  const isOpenNow = useMemo(() => {
    if (!hours.length) return true; // default open if no hours set
    const now = new Date();
    const day = now.getDay();
    const currentTime = now.getHours() * 100 + now.getMinutes();

    const todaySlots = hours.filter(h => h.day_of_week === day);
    if (!todaySlots.length) return false;

    return todaySlots.some(slot => {
      const [oH, oM] = slot.open_time.split(":").map(Number);
      const [cH, cM] = slot.close_time.split(":").map(Number);
      const open = oH * 100 + oM;
      const close = cH * 100 + cM;
      return currentTime >= open && currentTime <= close;
    });
  }, [hours]);

  const submitOrder = async () => {
    if (cart.length === 0) return toast.error("Your cart is empty");
    if (!form.customer_name || !form.customer_phone || (fulfillmentType === "delivery" && !form.delivery_address)) {
      return toast.error("Name, phone and delivery details are required");
    }
    if (settings && subtotal < Number(settings.min_order_amount || 0)) {
      return toast.error(`Minimum order is ${formatCurrency(settings.min_order_amount, settings.currency)}`);
    }
    setSubmitting(true);
    try {
      const restaurantId = (settings as any)?.restaurant_id as string | undefined;
      if (!restaurantId) {
        toast.error("Restaurant configuration missing");
        setSubmitting(false);
        return;
      }
      const lines = cart.map((l) => ({
        menu_item_id: l.kind === "item" ? l.refId : null,
        deal_id: l.kind === "deal" ? l.refId : null,
        item_name: l.name,
        quantity: l.quantity,
        unit_price: l.price,
        line_total: l.price * l.quantity,
      }));
      const res = await fetch(`${getApiBase()}/api/public/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurant_id: restaurantId,
          customer_name: form.customer_name,
          customer_phone: form.customer_phone,
          customer_email: form.customer_email || null,
          delivery_address: fulfillmentType === "delivery" ? form.delivery_address : "Self Pickup",
          fulfillment_type: fulfillmentType,
          notes: form.notes || null,
          subtotal,
          tax_amount: tax,
          delivery_fee: deliveryFee,
          total_amount: total,
          lines,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Order failed");
      const order = body.order;
      toast.success("Order placed!");
      navigate(`/track/${order.tracking_code}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to place order");
    } finally {
      setSubmitting(false);
    }
  };

  const visibleItems = activeCat === "deals" ? [] : items.filter((i) => i.category_id === activeCat);

  if (settings && !settings.is_open) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardHeader><CardTitle>{settings.name} is currently closed</CardTitle></CardHeader>
          <CardContent>Please come back later. You can also call us at {settings.phone}.</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{settings?.name || "Restaurant"}</h1>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant={isOpenNow ? "default" : "destructive"} className={isOpenNow ? "bg-green-500 hover:bg-green-600" : ""}>
                {isOpenNow ? "Open Now" : "Closed Now"}
              </Badge>
              {settings?.address && <span className="text-sm text-muted-foreground">{settings.address}</span>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {restaurant?.elevenlabs_agent_id ? (
              <AIChatTest agentId={restaurant.elevenlabs_agent_id} />
            ) : null}
            <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground">Staff login</Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 grid gap-6 lg:grid-cols-[260px_1fr_360px]">
        {/* Categories */}
        <aside className="space-y-1">
          {deals.length > 0 && (
            <Button variant={activeCat === "deals" ? "default" : "ghost"} className="w-full justify-start" onClick={() => setActiveCat("deals")}>
              🔥 Deals
            </Button>
          )}
          {categories.map((c) => (
            <Button key={c.id} variant={activeCat === c.id ? "default" : "ghost"} className="w-full justify-start" onClick={() => setActiveCat(c.id)}>
              {c.name}
            </Button>
          ))}
        </aside>

        {/* Items */}
        <section className="space-y-3">
          {activeCat === "deals" &&
            deals.map((d) => (
              <Card key={d.id}>
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{d.name}</h3>
                      <Badge variant="destructive">Deal</Badge>
                    </div>
                    {d.description && <p className="text-sm text-muted-foreground mt-1">{d.description}</p>}
                    <div className="mt-2 flex items-center gap-2">
                      <span className="font-semibold">{formatCurrency(d.price, settings?.currency)}</span>
                      {d.original_price && (
                        <span className="text-sm text-muted-foreground line-through">{formatCurrency(d.original_price, settings?.currency)}</span>
                      )}
                    </div>
                  </div>
                  <Button onClick={() => addItem({ kind: "deal", refId: d.id, name: d.name, price: Number(d.price) })}>
                    <Plus className="h-4 w-4 mr-1" /> Add
                  </Button>
                </CardContent>
              </Card>
            ))}
          {visibleItems.map((it) => (
            <Card key={it.id}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex-1">
                  <h3 className="font-semibold">{it.name}</h3>
                  {it.description && <p className="text-sm text-muted-foreground mt-1">{it.description}</p>}
                  <div className="mt-2 flex items-center gap-2">
                    <span className="font-semibold">{formatCurrency(it.price, settings?.currency)}</span>
                    {it.dietary_tags?.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}
                  </div>
                </div>
                <Button onClick={() => addItem({ kind: "item", refId: it.id, name: it.name, price: Number(it.price) })}>
                  <Plus className="h-4 w-4 mr-1" /> Add
                </Button>
              </CardContent>
            </Card>
          ))}
          {activeCat !== "deals" && visibleItems.length === 0 && (
            <p className="text-muted-foreground text-sm">No items in this category.</p>
          )}
        </section>

        {/* Cart */}
        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ShoppingCart className="h-5 w-5" /> Your order</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {cart.length === 0 && <p className="text-sm text-muted-foreground">Cart is empty.</p>}
              {cart.map((l, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div className="flex-1">
                    <div className="text-sm font-medium">{l.name}</div>
                    <div className="text-xs text-muted-foreground">{formatCurrency(l.price, settings?.currency)} each</div>
                  </div>
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(idx, -1)}><Minus className="h-3 w-3" /></Button>
                  <span className="w-6 text-center text-sm">{l.quantity}</span>
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(idx, 1)}><Plus className="h-3 w-3" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeLine(idx)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              ))}
              <Separator />
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(subtotal, settings?.currency)}</span></div>
                <div className="flex justify-between"><span>Tax</span><span>{formatCurrency(tax, settings?.currency)}</span></div>
                <div className="flex justify-between"><span>Delivery</span><span>{formatCurrency(deliveryFee, settings?.currency)}</span></div>
                <div className="flex justify-between font-semibold pt-2 border-t"><span>Total</span><span>{formatCurrency(total, settings?.currency)}</span></div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Order Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {(settings?.allows_delivery !== false && settings?.allows_pickup !== false) && (
                <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-lg">
                  <Button 
                    variant={fulfillmentType === "delivery" ? "default" : "ghost"} 
                    size="sm" 
                    onClick={() => setFulfillmentType("delivery")}
                    className="text-xs"
                  >
                    Delivery
                  </Button>
                  <Button 
                    variant={fulfillmentType === "pickup" ? "default" : "ghost"} 
                    size="sm" 
                    onClick={() => setFulfillmentType("pickup")}
                    className="text-xs"
                  >
                    Pickup
                  </Button>
                </div>
              )}
              
              <div className="space-y-3">
                <div><Label>Name *</Label><Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} /></div>
                <div><Label>Phone *</Label><Input value={form.customer_phone} onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} /></div>
                <div><Label>Email</Label><Input type="email" value={form.customer_email} onChange={(e) => setForm({ ...form, customer_email: e.target.value })} /></div>
                
                {fulfillmentType === "delivery" ? (
                  <div><Label>Delivery Address *</Label><Textarea value={form.delivery_address} onChange={(e) => setForm({ ...form, delivery_address: e.target.value })} placeholder="Enter your full address" /></div>
                ) : (
                  <div className="p-3 rounded-lg border bg-primary/5 text-primary text-xs flex flex-col gap-1">
                    <p className="font-bold">Pickup from:</p>
                    <p>{settings?.name}</p>
                    <p className="opacity-80">{settings?.address}</p>
                  </div>
                )}
                
                <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Any special instructions?" /></div>
              </div>
              <Button className="w-full" onClick={submitOrder} disabled={submitting || cart.length === 0}>
                {submitting ? "Placing order…" : `Place order — ${formatCurrency(total, settings?.currency)}`}
              </Button>
            </CardContent>
          </Card>
        </aside>
      </main>
    </div>
  );
}