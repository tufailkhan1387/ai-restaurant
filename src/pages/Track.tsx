import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getApiBase } from "@/lib/apiBase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, Loader2, Package, Plus, Printer, Receipt } from "lucide-react";
import { ORDER_STATUS_COLORS, OrderStatus, formatCurrency } from "@/lib/restaurant";
import { getOrderStatusLabel, formatDate } from "@/i18n/formatters";
import { LanguageSwitcher } from "@/components/common/LanguageSwitcher";
import { OrderReceipt } from "@/components/orders/OrderReceipt";

const TIMELINE: OrderStatus[] = ["pending", "confirmed", "preparing", "ready", "out_for_delivery", "delivered"];

export default function Track() {
  const { t } = useTranslation(["track", "orders", "common"]);
  const { code } = useParams();
  const [order, setOrder] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [tableSession, setTableSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [restaurant, setRestaurant] = useState<any>(null);
  const [showInvoice, setShowInvoice] = useState(false);
  const [menuPath, setMenuPath] = useState<string | null>(null);

  const load = async () => {
    if (!code) return;
    const res = await fetch(`${getApiBase()}/api/public/track/${encodeURIComponent(code.toUpperCase())}`);
    const j = await res.json().catch(() => ({}));
    if (res.ok && j.order) {
      setOrder(j.order);
      setItems(j.items || []);
      setHistory(j.history || []);
      setRestaurant(j.settings || null);
      setTableSession(j.table_session || null);
      setMenuPath(j.menu_path || null);
    } else {
      setOrder(null);
      setItems([]);
      setHistory([]);
      setRestaurant(null);
      setTableSession(null);
      setMenuPath(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    load();
  }, [code]);

  useEffect(() => {
    if (!order?.id) return;
    const timer = setInterval(load, 8000);
    return () => clearInterval(timer);
  }, [order?.id, code]);

  const sessionOrders = tableSession?.orders?.length ? tableSession.orders : null;
  const displayOrders = useMemo(() => {
    if (sessionOrders) return sessionOrders;
    if (!order) return [];
    return [{ ...order, items }];
  }, [sessionOrders, order, items]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!order) return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-md w-full"><CardContent className="py-10 text-center space-y-2">
        <Package className="h-10 w-10 mx-auto text-muted-foreground" />
        <h2 className="text-lg font-semibold">{t("track:orderNotFound", "Order not found")}</h2>
        <p className="text-sm text-muted-foreground">{t("track:orderNotFound", "Check the tracking code and try again.")}</p>
      </CardContent></Card>
    </div>
  );

  const isDineIn = order.fulfillment_type === "dine_in" || Boolean(order.table_number) || Boolean(tableSession?.session);
  const cleanTableDisplay = order.table_number || tableSession?.session?.table_number
    ? (/^table\b/i.test(String(order.table_number || tableSession?.session?.table_number || "").trim())
      ? String(order.table_number || tableSession?.session?.table_number).trim()
      : `Table ${String(order.table_number || tableSession?.session?.table_number).trim()}`)
    : "Assigned Table";
  const currentIdx = TIMELINE.indexOf(order.status);
  const cancelled = order.status === "cancelled";
  const paid = String(order.payment_status || "").toLowerCase() === "paid" || order.status === "delivered"
    || String(tableSession?.session?.status || "") === "closed";
  const billTotal = tableSession?.totals?.total_amount ?? order.total_amount;
  const orderMorePath = (() => {
    if (!menuPath) return null;
    const [path, qs] = menuPath.split("?");
    const q = new URLSearchParams(qs || "");
    const name = order.customer_name || tableSession?.session?.customer_name;
    const phone = order.customer_phone || tableSession?.session?.customer_phone;
    const email = order.customer_email;
    if (name && !q.get("name")) q.set("name", String(name));
    if (phone && !q.get("phone")) q.set("phone", String(phone));
    if (email && !q.get("email")) q.set("email", String(email));
    const query = q.toString();
    return query ? `${path}?${query}` : path;
  })();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {restaurant?.logo_url && <img src={restaurant.logo_url} alt="" className="h-8 w-8 rounded" />}
            <div>
              <h1 className="font-semibold">{restaurant?.name || t("track:title", "Order tracking")}</h1>
              {restaurant?.phone && <a href={`tel:${restaurant.phone}`} className="text-xs text-primary">{restaurant.phone}</a>}
            </div>
          </div>
          <LanguageSwitcher />
        </div>
      </header>
      <main className="max-w-2xl mx-auto p-4 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="font-mono">{order.order_number}</span>
              <Badge className={ORDER_STATUS_COLORS[order.status as OrderStatus]} variant="outline">
                {isDineIn && order.status === "out_for_delivery"
                  ? "🍽️ Served to Table"
                  : isDineIn && order.status === "delivered"
                  ? "✓ Complete / Paid"
                  : getOrderStatusLabel(order.status, t)}
              </Badge>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {order.customer_name} • {isDineIn ? `Dine-In (${cleanTableDisplay})` : order.delivery_address}
            </p>
            {isDineIn && sessionOrders && sessionOrders.length > 1 && (
              <p className="text-xs text-muted-foreground">
                All orders for this table appear here, including items added by staff.
              </p>
            )}
          </CardHeader>
          <CardContent>
            {cancelled ? (
              <p className="text-sm text-red-600 text-center py-6">{t("orders:orderCancelledAt", "This order was cancelled.")}</p>
            ) : (
              <ol className="space-y-3">
                {TIMELINE.map((s, idx) => {
                  const ev = history.find((h) => h.status === s);
                  const done = idx <= currentIdx;
                  const active = idx === currentIdx;
                  const stepLabel = isDineIn && s === "out_for_delivery"
                    ? "Served to Table"
                    : isDineIn && s === "delivered"
                    ? "Complete / Paid"
                    : getOrderStatusLabel(s, t);
                  return (
                    <li key={s} className="flex items-start gap-3">
                      {done ? <CheckCircle2 className={`h-5 w-5 mt-0.5 ${active ? "text-primary animate-pulse" : "text-green-600"}`} /> : <Circle className="h-5 w-5 mt-0.5 text-muted-foreground" />}
                      <div className="flex-1">
                        <p className={`text-sm ${done ? "font-medium" : "text-muted-foreground"}`}>{stepLabel}</p>
                        {ev && <p className="text-xs text-muted-foreground">{formatDate(ev.created_at, { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" })}</p>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>

        {displayOrders.map((sessOrder: any, index: number) => (
          <Card key={sessOrder.id || index}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                {displayOrders.length > 1 ? `Order ${index + 1} · ${sessOrder.order_number || ""}` : t("orders:items", "Items")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              {(sessOrder.items || (sessOrder.id === order.id ? items : [])).map((it: any) => (
                <div key={it.id} className="flex justify-between">
                  <span>{it.quantity}× {it.item_name}</span>
                  <span>{formatCurrency(it.line_total)}</span>
                </div>
              ))}
              {displayOrders.length > 1 && (
                <div className="flex justify-between text-xs font-semibold pt-2 border-t">
                  <span>Section total</span>
                  <span>{formatCurrency(sessOrder.total_amount)}</span>
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        <Card>
          <CardContent className="pt-4 space-y-1.5 text-sm">
            <div className="flex justify-between text-muted-foreground"><span>{t("orders:subtotal", "Subtotal")}</span><span>{formatCurrency(tableSession?.totals?.subtotal ?? order.subtotal)}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>{t("orders:tax", "Tax")}</span><span>{formatCurrency(tableSession?.totals?.tax_amount ?? order.tax_amount)}</span></div>
            {!isDineIn && <div className="flex justify-between text-muted-foreground"><span>{t("orders:deliveryFee", "Delivery")}</span><span>{formatCurrency(order.delivery_fee)}</span></div>}
            {order.discount_amount > 0 && <div className="flex justify-between text-green-600"><span>{t("orders:discount", "Discount")}</span><span>-{formatCurrency(order.discount_amount)}</span></div>}
            <div className="flex justify-between font-semibold pt-1"><span>{t("orders:total", "Total")}</span><span>{formatCurrency(billTotal)}</span></div>
          </CardContent>
        </Card>

        {isDineIn && !cancelled && orderMorePath && !paid && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold">Want something else?</p>
                <p className="text-xs text-muted-foreground">Place another order for this table. It will be added to the same bill.</p>
              </div>
              <Button asChild className="font-bold gap-1.5">
                <Link to={orderMorePath}>
                  <Plus className="h-4 w-4" /> Order more
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold flex items-center gap-1.5">
                <Receipt className="h-4 w-4" /> {paid ? "Invoice ready" : "Invoice"}
              </p>
              <p className="text-xs text-muted-foreground">
                {paid
                  ? "Your table bill is complete. View or print your invoice."
                  : "Invoice will be ready when the table bill is paid."}
              </p>
            </div>
            <Button
              variant={paid ? "default" : "outline"}
              className="gap-1.5 font-bold"
              onClick={() => {
                setShowInvoice(true);
                setTimeout(() => window.print(), 150);
              }}
            >
              <Printer className="h-4 w-4" /> {paid ? "View / Print Invoice" : "Preview invoice"}
            </Button>
          </CardContent>
        </Card>

        {(showInvoice || paid) && (
          <div className="no-print">
            <OrderReceipt
              order={order}
              items={items}
              restaurantName={restaurant?.name}
              tableSession={tableSession}
            />
          </div>
        )}
        <OrderReceipt
          order={order}
          items={items}
          restaurantName={restaurant?.name}
          tableSession={tableSession}
          isPrintOnly
        />
      </main>
    </div>
  );
}
