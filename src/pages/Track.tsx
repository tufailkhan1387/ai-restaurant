import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getApiBase } from "@/lib/apiBase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, Loader2, Package } from "lucide-react";
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS, OrderStatus, formatCurrency } from "@/lib/restaurant";

const TIMELINE: OrderStatus[] = ["pending", "confirmed", "preparing", "ready", "out_for_delivery", "delivered"];

export default function Track() {
  const { code } = useParams();
  const [order, setOrder] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [restaurant, setRestaurant] = useState<any>(null);

  const load = async () => {
    if (!code) return;
    const res = await fetch(`${getApiBase()}/api/public/track/${encodeURIComponent(code.toUpperCase())}`);
    const j = await res.json().catch(() => ({}));
    if (res.ok && j.order) {
      setOrder(j.order);
      setItems(j.items || []);
      setHistory(j.history || []);
      setRestaurant(j.settings || null);
    } else {
      setOrder(null);
      setItems([]);
      setHistory([]);
      setRestaurant(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    load();
  }, [code]);

  useEffect(() => {
    if (!order?.id) return;
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [order?.id, code]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!order) return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-md w-full"><CardContent className="py-10 text-center space-y-2">
        <Package className="h-10 w-10 mx-auto text-muted-foreground" />
        <h2 className="text-lg font-semibold">Order not found</h2>
        <p className="text-sm text-muted-foreground">Check the tracking code and try again.</p>
      </CardContent></Card>
    </div>
  );

  const currentIdx = TIMELINE.indexOf(order.status);
  const cancelled = order.status === "cancelled";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          {restaurant?.logo_url && <img src={restaurant.logo_url} alt="" className="h-8 w-8 rounded" />}
          <div>
            <h1 className="font-semibold">{restaurant?.name || "Order tracking"}</h1>
            {restaurant?.phone && <a href={`tel:${restaurant.phone}`} className="text-xs text-primary">{restaurant.phone}</a>}
          </div>
        </div>
      </header>
      <main className="max-w-2xl mx-auto p-4 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="font-mono">{order.order_number}</span>
              <Badge className={ORDER_STATUS_COLORS[order.status as OrderStatus]} variant="outline">{ORDER_STATUS_LABELS[order.status as OrderStatus]}</Badge>
            </CardTitle>
            <p className="text-sm text-muted-foreground">{order.customer_name} • {order.delivery_address}</p>
          </CardHeader>
          <CardContent>
            {cancelled ? (
              <p className="text-sm text-red-600 text-center py-6">This order was cancelled.</p>
            ) : (
              <ol className="space-y-3">
                {TIMELINE.map((s, idx) => {
                  const ev = history.find((h) => h.status === s);
                  const done = idx <= currentIdx;
                  const active = idx === currentIdx;
                  return (
                    <li key={s} className="flex items-start gap-3">
                      {done ? <CheckCircle2 className={`h-5 w-5 mt-0.5 ${active ? "text-primary animate-pulse" : "text-green-600"}`} /> : <Circle className="h-5 w-5 mt-0.5 text-muted-foreground" />}
                      <div className="flex-1">
                        <p className={`text-sm ${done ? "font-medium" : "text-muted-foreground"}`}>{ORDER_STATUS_LABELS[s]}</p>
                        {ev && <p className="text-xs text-muted-foreground">{new Date(ev.created_at).toLocaleString()}</p>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Items</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {items.map((it) => (<div key={it.id} className="flex justify-between"><span>{it.quantity}× {it.item_name}</span><span>{formatCurrency(it.line_total)}</span></div>))}
            <div className="border-t pt-2 mt-2 space-y-0.5">
              <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{formatCurrency(order.subtotal)}</span></div>
              <div className="flex justify-between text-muted-foreground"><span>Tax</span><span>{formatCurrency(order.tax_amount)}</span></div>
              <div className="flex justify-between text-muted-foreground"><span>Delivery</span><span>{formatCurrency(order.delivery_fee)}</span></div>
              {order.discount_amount > 0 && <div className="flex justify-between text-green-600"><span>Discount</span><span>-{formatCurrency(order.discount_amount)}</span></div>}
              <div className="flex justify-between font-semibold pt-1"><span>Total</span><span>{formatCurrency(order.total_amount)}</span></div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}