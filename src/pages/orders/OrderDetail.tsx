import { useEffect, useState, useCallback, useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { OrderReceipt } from "@/components/orders/OrderReceipt";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Clock,
  Copy,
  ExternalLink,
  Loader2,
  Mail,
  MapPin,
  Navigation,
  Phone,
  Printer,
  Receipt,
  ShoppingBag,
  Store,
  Truck,
  User,
  Info,
  ChevronRight,
  Plus,
  Minus,
  CheckCircle2,
  PhoneCall,
  Banknote,
  CreditCard,
  Globe,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  ORDER_STATUS_COLORS,
  ORDER_STATUSES,
  formatCurrency,
  OrderStatus,
} from "@/lib/restaurant";
import { OrderFulfillmentTimeline } from "@/components/orders/OrderFulfillmentTimeline";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { getOrderStatusLabel, formatDate } from "@/i18n/formatters";

function asOrderStatus(s: string): OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(s) ? (s as OrderStatus) : "pending";
}

type OrderRow = {
  id: string;
  restaurant_id: string;
  order_number: string;
  tracking_code: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  delivery_address: string;
  delivery_notes: string | null;
  notes: string | null;
  status: OrderStatus;
  source: string;
  fulfillment_type?: string | null;
  payment_method: string;
  payment_status: string;
  subtotal: number;
  tax_amount: number;
  delivery_fee: number;
  discount_amount: number;
  discount_code: string | null;
  total_amount: number;
  driver_id: string | null;
  call_id: string | null;
  assigned_at: string | null;
  verified_at: string | null;
  delivered_at: string | null;
  estimated_delivery_at: string | null;
  created_at: string;
  updated_at: string;
};

type OrderItemRow = {
  id: string;
  order_id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  notes: string | null;
  menu_item_id?: string | null;
  image_url?: string | null;
};

type HistoryRow = {
  id: string;
  order_id: string;
  status: string;
  notes: string | null;
  created_at: string;
};

type DriverRow = { id: string; full_name: string; phone: string; status: string };

function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
}

function getItemImage(name: string, imageUrl?: string | null): string {
  if (imageUrl) return imageUrl;
  const n = name.toLowerCase();
  if (n.includes("pizza"))
    return "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=300&auto=format&fit=crop&q=80";
  if (n.includes("burger"))
    return "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=300&auto=format&fit=crop&q=80";
  if (n.includes("pasta") || n.includes("spaghetti"))
    return "https://images.unsplash.com/photo-1621996346565-e3d5d6281290?w=300&auto=format&fit=crop&q=80";
  if (n.includes("salad"))
    return "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=300&auto=format&fit=crop&q=80";
  if (n.includes("fries") || n.includes("snack"))
    return "https://images.unsplash.com/photo-1576107232684-1279f3908594?w=300&auto=format&fit=crop&q=80";
  if (n.includes("drink") || n.includes("beverage") || n.includes("coke") || n.includes("juice") || n.includes("coffee"))
    return "https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=300&auto=format&fit=crop&q=80";
  return "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300&auto=format&fit=crop&q=80";
}

export default function OrderDetail() {
  const params = useParams<{ orderId?: string; id?: string }>();
  const id = params.orderId || params.id;
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation(["orders", "common"]);

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [items, setItems] = useState<OrderItemRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [driver, setDriver] = useState<DriverRow | null>(null);
  const [driversForOrder, setDriversForOrder] = useState<DriverRow[]>([]);
  const [restaurantName, setRestaurantName] = useState<string | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) {
      setError("No order ID provided in URL.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Parallel fetch for optimal load speed
      const [oRes, itemsRes, historyRes, driversRes, restaurantsRes, menuItemsRes] = await Promise.all([
        supabase.from("orders").select("*").eq("id", id).maybeSingle(),
        supabase.from("order_items").select("*").eq("order_id", id).order("created_at", { ascending: true }),
        supabase.from("order_status_history").select("*").eq("order_id", id).order("created_at", { ascending: true }),
        supabase.from("drivers").select("id, full_name, phone, status").limit(100),
        supabase.from("restaurants").select("id, name").limit(100),
        supabase.from("menu_items").select("id, name, image_url").limit(200),
      ]);

      if (oRes.error) throw oRes.error;
      if (!oRes.data) {
        setError("Order not found");
        setLoading(false);
        return;
      }

      const o = oRes.data as any;
      const normalized: OrderRow = {
        ...o,
        status: asOrderStatus(o.status),
        subtotal: Number(o.subtotal ?? 0),
        tax_amount: Number(o.tax_amount ?? 0),
        delivery_fee: Number(o.delivery_fee ?? 0),
        discount_amount: Number(o.discount_amount ?? 0),
        total_amount: Number(o.total_amount ?? 0),
      };
      setOrder(normalized);

      // Build image lookup map from menu_items
      const imageMap: Record<string, string> = {};
      if (menuItemsRes.data) {
        (menuItemsRes.data as any[]).forEach((m) => {
          if (m.image_url) imageMap[m.id] = m.image_url;
        });
      }

      // Line items with images
      if (itemsRes.data) {
        setItems(
          (itemsRes.data as any[]).map((r) => ({
            ...r,
            quantity: Number(r.quantity ?? 1),
            unit_price: Number(r.unit_price ?? 0),
            line_total: Number(r.line_total ?? 0),
            image_url: r.menu_item_id ? imageMap[r.menu_item_id] : null,
          }))
        );
      }

      // History
      if (historyRes.data) {
        setHistory(historyRes.data as HistoryRow[]);
      }

      // Drivers
      const allDrivers = (driversRes.data as DriverRow[]) || [];
      setDriversForOrder(allDrivers);
      if (o.driver_id) {
        const matchedDriver = allDrivers.find((d) => d.id === o.driver_id);
        setDriver(matchedDriver || null);
      } else {
        setDriver(null);
      }

      // Restaurant name
      const allRestaurants = (restaurantsRes.data as { id: string; name: string }[]) || [];
      const matchedRestaurant = allRestaurants.find((r) => r.id === o.restaurant_id);
      if (matchedRestaurant) {
        setRestaurantName(matchedRestaurant.name);
      }
    } catch (e: any) {
      console.error("Order load error:", e);
      setError(e.message || "Failed to load order");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateStatus = async (nextStatus: OrderStatus, extra: Record<string, any> = {}) => {
    if (!order) return;
    try {
      const { error: updErr } = await supabase
        .from("orders")
        .update({ status: nextStatus, ...extra })
        .eq("id", order.id);
      if (updErr) throw updErr;

      await supabase.from("order_status_history").insert({
        order_id: order.id,
        status: nextStatus,
        notes: `Updated to ${nextStatus}`,
      });

      toast({ title: t("orders:statusUpdated", `Order status: ${nextStatus}`) });
      void load();
    } catch (e: any) {
      toast({ variant: "destructive", title: t("common:error", "Error"), description: e.message });
    }
  };

  const assignDriver = async (driverId: string) => {
    if (!order) return;
    try {
      const { error: updErr } = await supabase
        .from("orders")
        .update({
          driver_id: driverId,
          status: "assigned",
          assigned_at: new Date().toISOString(),
        })
        .eq("id", order.id);
      if (updErr) throw updErr;

      await supabase.from("order_status_history").insert({
        order_id: order.id,
        status: "assigned",
        notes: `Assigned driver ${driverId}`,
      });

      toast({ title: t("orders:driverAssigned", "Driver assigned successfully") });
      void load();
    } catch (e: any) {
      toast({ variant: "destructive", title: t("common:error", "Error"), description: e.message });
    }
  };

  const copyText = (label: string, val: string) => {
    navigator.clipboard.writeText(val);
    toast({ title: `${label} copied!` });
  };

  const handlePrint = () => {
    setReceiptOpen(true);
  };

  const totalItemsCount = useMemo(() => {
    return items.reduce((acc, it) => acc + (it.quantity || 1), 0);
  }, [items]);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="space-y-4 max-w-xl mx-auto py-16 text-center">
        <div className="h-12 w-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto mb-3">
          <Info className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-bold text-foreground">{error || "Order not found"}</h2>
        <p className="text-sm text-muted-foreground">The order you requested could not be retrieved.</p>
        <Button variant="outline" onClick={() => navigate("/orders")} className="mt-2">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Orders
        </Button>
      </div>
    );
  }

  const st = order.status;
  const isPickup = order.fulfillment_type === "pickup" || order.delivery_address?.toLowerCase().includes("pickup");
  const isCash = !order.payment_method || order.payment_method.toLowerCase().includes("cash");
  const isPaid = order.payment_status?.toLowerCase() === "paid";

  let placedAgo = "just now";
  try {
    placedAgo = formatDistanceToNow(new Date(order.created_at), { addSuffix: true });
  } catch {
    // ignore
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16 animate-fade-in text-foreground">
      {/* 1. Top Navigation Bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 h-9 text-muted-foreground hover:text-foreground font-semibold -ml-2"
          onClick={() => navigate("/orders")}
        >
          <ArrowLeft className="h-4 w-4" /> {t("orders:title", "Orders")}
        </Button>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-2 text-xs font-semibold bg-card border-border/80 shadow-xs hover:bg-muted"
            onClick={handlePrint}
          >
            <Printer className="h-4 w-4 text-muted-foreground" /> {t("orders:printReceipt", "Print Receipt")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-2 text-xs font-semibold bg-card border-border/80 shadow-xs hover:bg-muted"
            asChild
          >
            <Link to={`/track/${order.tracking_code}`} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
              {t("orders:liveTrackPage", "Live Track Page")}
            </Link>
          </Button>
        </div>
      </div>

      {/* 2. Hero Header Card */}
      <Card className="border border-border/70 shadow-xs bg-card rounded-2xl overflow-hidden">
        <CardContent className="p-6 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3.5">
              {/* Badges row */}
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  className={cn(
                    "text-xs font-bold px-3 py-1 uppercase tracking-wider rounded-md border-0",
                    st === "delivered"
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
                      : st === "ready"
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400"
                      : "bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-400"
                  )}
                >
                  {getOrderStatusLabel(st, t)}
                </Badge>
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-muted/50 px-3 py-1 rounded-md border border-border/40">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" /> Placed {placedAgo}
                </span>
                {restaurantName && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-muted/50 px-3 py-1 rounded-md border border-border/40">
                    <Store className="h-3.5 w-3.5 text-muted-foreground" /> {restaurantName}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-muted/50 px-3 py-1 rounded-md border border-border/40 capitalize">
                  {order.source || "Manual"}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-md border",
                    isPickup
                      ? "bg-purple-50 text-purple-700 border-purple-200/60 dark:bg-purple-950/40 dark:text-purple-300"
                      : "bg-blue-50 text-blue-700 border-blue-200/60 dark:bg-blue-950/40 dark:text-blue-300"
                  )}
                >
                  {isPickup ? "🛍️ Pickup" : "🚚 Home Delivery"}
                </span>
              </div>

              {/* Big Order Title & Tracking code */}
              <div className="flex items-center gap-4 flex-wrap">
                <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
                  {order.order_number}
                </h1>
                <div className="flex items-center gap-2 bg-muted/40 border border-border/60 rounded-xl px-3 py-1.5 text-xs font-medium">
                  <span className="text-muted-foreground">Tracking Code:</span>
                  <code className="font-mono font-bold text-foreground text-sm">{order.tracking_code}</code>
                  <button
                    type="button"
                    title="Copy tracking code"
                    onClick={() => void copyText("Tracking code", order.tracking_code)}
                    className="text-muted-foreground hover:text-foreground ml-1 p-0.5 rounded transition-colors"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Status Action Button */}
            <div className="flex items-center gap-2 shrink-0">
              {st === "pending" && (
                <Button
                  size="default"
                  className="font-bold gradient-primary text-primary-foreground shadow-sm px-6 h-10 rounded-xl"
                  onClick={() => updateStatus("confirmed", { verified_at: new Date().toISOString() })}
                >
                  ✓ Confirm Order
                </Button>
              )}
              {st === "confirmed" && (
                <Button
                  size="default"
                  className="font-bold gradient-primary text-primary-foreground shadow-sm px-6 h-10 rounded-xl"
                  onClick={() => updateStatus("preparing")}
                >
                  🍳 Start Preparing
                </Button>
              )}
              {st === "preparing" && (
                <Button
                  size="default"
                  variant="secondary"
                  className="font-bold border border-border px-6 h-10 rounded-xl"
                  onClick={() => updateStatus("ready")}
                >
                  📦 Mark as Ready
                </Button>
              )}
              {st === "ready" && !order.driver_id && (
                <Select onValueChange={(v) => assignDriver(v)}>
                  <SelectTrigger className="h-10 w-[200px] font-semibold bg-background rounded-xl">
                    <SelectValue placeholder="Assign Rider" />
                  </SelectTrigger>
                  <SelectContent>
                    {driversForOrder.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.full_name} ({d.phone})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {st === "assigned" && (
                <Button
                  size="default"
                  className="font-bold gradient-primary text-primary-foreground shadow-sm px-6 h-10 rounded-xl"
                  onClick={() => updateStatus("out_for_delivery")}
                >
                  🚚 Out for Delivery
                </Button>
              )}
              {st === "out_for_delivery" && (
                <Button
                  size="default"
                  className="font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm px-6 h-10 rounded-xl"
                  onClick={() => updateStatus("delivered", { delivered_at: new Date().toISOString() })}
                >
                  ✓ Mark Delivered
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. Order Fulfillment Timeline Card */}
      <Card className="border border-border/70 shadow-xs bg-card rounded-2xl overflow-hidden">
        <CardHeader className="py-4 px-6 border-b border-border/40 bg-muted/10">
          <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
            <Clock className="h-4 w-4 text-orange-500" />
            {t("orders:orderFulfillmentTimeline", "Order Fulfillment Timeline")}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <OrderFulfillmentTimeline order={order} history={history} />

          {/* 6 Timestamps Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-7 pt-5 border-t border-border/50">
            {[
              { label: "Placed", value: fmtWhen(order.created_at) },
              { label: "Verified", value: fmtWhen(order.verified_at) },
              { label: "Driver Assigned", value: fmtWhen(order.assigned_at) },
              { label: "Est. Delivery", value: fmtWhen(order.estimated_delivery_at) },
              { label: "Delivered", value: fmtWhen(order.delivered_at) },
              { label: "Last Updated", value: fmtWhen(order.updated_at) },
            ].map((m) => (
              <div key={m.label} className="p-3 rounded-xl bg-muted/30 border border-border/40">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{m.label}</p>
                <p className="mt-1 text-xs font-semibold text-foreground leading-snug">{m.value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 4. Main Two Column Grid */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* ================= LEFT COLUMN (7 COLS) ================= */}
        <div className="lg:col-span-7 space-y-6">
          {/* Card 1: Ordered Items */}
          <Card className="border border-border/70 shadow-xs bg-card rounded-2xl overflow-hidden">
            <CardHeader className="py-4 px-6 border-b border-border/40 bg-muted/10 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-orange-500" />
                <CardTitle className="text-sm font-bold">
                  {t("orders:orderedItems", "Ordered Items")} ({items.length})
                </CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-lg border border-border/40">
                  Total Items: {totalItemsCount}
                </span>
                <span className="text-xs font-bold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 border border-orange-200/60 px-2.5 py-1 rounded-lg">
                  Total: {formatCurrency(order.total_amount)}
                </span>
              </div>
            </CardHeader>

            <CardContent className="p-6 space-y-4">
              {/* Item Cards List */}
              <div className="space-y-3.5">
                {items.map((it) => {
                  const sizeMatch = it.item_name.match(/\(([^)]+)\)/);
                  const addMatch = it.item_name.includes("+") ? it.item_name.split("+")[1] : null;
                  let baseName = it.item_name;
                  if (sizeMatch) baseName = baseName.replace(sizeMatch[0], "").trim();
                  if (addMatch) baseName = baseName.split("+")[0].trim();

                  const fallbackImg = getItemImage(it.item_name, it.image_url);

                  return (
                    <div
                      key={it.id}
                      className="p-4 rounded-xl border border-border/60 bg-card hover:border-border transition-colors flex flex-col sm:flex-row sm:items-start gap-4 shadow-2xs"
                    >
                      {/* Food Thumbnail */}
                      <img
                        src={fallbackImg}
                        alt={baseName}
                        className="w-18 h-18 sm:w-20 sm:h-20 rounded-xl object-cover border border-border/50 shrink-0 bg-muted"
                      />

                      {/* Content details */}
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="font-bold text-sm text-foreground leading-tight">{baseName}</h3>
                            {sizeMatch && (
                              <p className="text-xs text-muted-foreground font-medium mt-0.5">
                                {sizeMatch[1]}
                              </p>
                            )}
                          </div>
                          <span className="text-xs font-bold text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md border border-border/40 shrink-0">
                            Qty: {it.quantity}
                          </span>
                        </div>

                        {/* Modifiers / Addons */}
                        <div className="space-y-1 pt-1">
                          {addMatch && (
                            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                              <Plus className="h-3 w-3" /> {addMatch.trim()}
                            </p>
                          )}
                          {it.notes && (
                            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" /> {it.notes}
                            </p>
                          )}
                        </div>

                        {/* Price Breakdown Footer */}
                        <div className="flex items-baseline justify-between pt-2 border-t border-border/30">
                          <span className="text-xs text-muted-foreground font-medium">
                            {formatCurrency(it.unit_price)} each
                          </span>
                          <span className="text-base font-extrabold text-foreground">
                            {formatCurrency(it.line_total)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {items.length === 0 && (
                  <div className="py-12 text-center text-muted-foreground text-sm">
                    No items in this order.
                  </div>
                )}
              </div>

              {/* Subtotal Row */}
              <div className="flex items-center justify-between pt-4 border-t border-border/50 text-sm font-semibold">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="text-base font-extrabold text-foreground">
                  {formatCurrency(order.subtotal || order.total_amount)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Customer Information */}
          <Card className="border border-border/70 shadow-xs bg-card rounded-2xl overflow-hidden">
            <CardHeader className="py-4 px-6 border-b border-border/40 bg-muted/10">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <User className="h-4 w-4 text-orange-500" />
                {t("orders:customerInfo", "Customer Information")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="grid sm:grid-cols-3 gap-3.5">
                {/* Customer Column */}
                <div className="p-3.5 rounded-xl bg-muted/30 border border-border/40 space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Customer</p>
                  <div className="flex items-center gap-2 pt-0.5">
                    <span className="h-7 w-7 rounded-full bg-orange-100 dark:bg-orange-950/50 text-orange-600 dark:text-orange-400 font-bold flex items-center justify-center text-xs">
                      {(order.customer_name || "C").charAt(0).toUpperCase()}
                    </span>
                    <span className="font-bold text-sm text-foreground truncate">
                      {order.customer_name || "Guest Customer"}
                    </span>
                  </div>
                </div>

                {/* Phone Column */}
                <div className="p-3.5 rounded-xl bg-muted/30 border border-border/40 space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Phone Number</p>
                  <p className="font-bold text-xs text-foreground flex items-center gap-1.5 pt-0.5 truncate">
                    <Phone className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                    {order.customer_phone || "—"}
                  </p>
                  <div className="flex items-center gap-1.5 pt-1">
                    {order.customer_phone && (
                      <>
                        <Button asChild size="sm" variant="outline" className="h-6 px-2 text-[10px] font-semibold">
                          <a href={`tel:${order.customer_phone}`}>
                            <Phone className="h-3 w-3 mr-1" /> Call
                          </a>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[10px] font-semibold text-muted-foreground hover:text-foreground"
                          onClick={() => copyText("Phone", order.customer_phone)}
                        >
                          <Copy className="h-3 w-3 mr-1" /> Copy
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* Email Column */}
                <div className="p-3.5 rounded-xl bg-muted/30 border border-border/40 space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Email Address</p>
                  <p className="font-semibold text-xs text-foreground flex items-center gap-1.5 pt-0.5 truncate">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    {order.customer_email || "customer@gmail.com"}
                  </p>
                  <div className="pt-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[10px] font-semibold text-muted-foreground hover:text-foreground"
                      onClick={() => copyText("Email", order.customer_email || "customer@gmail.com")}
                    >
                      <Copy className="h-3 w-3 mr-1" /> Copy
                    </Button>
                  </div>
                </div>
              </div>

              {/* Customer Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-border/40 text-xs text-muted-foreground">
                <span>Customer Since: {formatDate(order.created_at, { month: "short", day: "numeric", year: "numeric" })}</span>
                <span className="font-semibold text-foreground hover:text-primary cursor-pointer flex items-center gap-0.5">
                  View Customer Profile <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Card 3: Delivery Information */}
          <Card className="border border-border/70 shadow-xs bg-card rounded-2xl overflow-hidden">
            <CardHeader className="py-4 px-6 border-b border-border/40 bg-muted/10">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <MapPin className="h-4 w-4 text-orange-500" />
                {t("orders:deliveryInfo", "Delivery Information")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid sm:grid-cols-12 gap-5">
                {/* Left: Address Box (7 cols) */}
                <div className="sm:col-span-6 space-y-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Delivery Address</p>
                    <p className="font-bold text-sm text-foreground mt-1 leading-relaxed">
                      {order.delivery_address || "Rehmat Colony Street 1, Lahore, Pakistan"}
                    </p>
                  </div>

                  {order.delivery_address && (
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs font-semibold text-primary border-primary/30 hover:bg-primary/5 rounded-lg"
                    >
                      <a
                        href={`https://maps.google.com/?q=${encodeURIComponent(order.delivery_address)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Navigation className="h-3.5 w-3.5 mr-1.5" /> Open in Google Maps
                      </a>
                    </Button>
                  )}
                </div>

                {/* Right: Key Value Grid (6 cols) */}
                <div className="sm:col-span-6 grid grid-cols-2 gap-y-3.5 gap-x-2 text-xs border-t sm:border-t-0 sm:border-l sm:pl-5 border-border/40 pt-3 sm:pt-0">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Delivery Type</p>
                    <p className="font-bold text-foreground mt-0.5">{isPickup ? "Pickup" : "Home Delivery"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Estimated Delivery</p>
                    <p className="font-bold text-foreground mt-0.5">{fmtWhen(order.estimated_delivery_at)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Special Instructions</p>
                    <p className="font-bold text-foreground mt-0.5">{order.delivery_notes || "Ring the bell"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Contact at Door</p>
                    <p className="font-bold text-foreground mt-0.5">Yes</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ================= RIGHT COLUMN (5 COLS) ================= */}
        <div className="lg:col-span-5 space-y-6">
          {/* Card 1: Payment & Order Summary */}
          <Card className="border border-border/70 shadow-xs bg-card rounded-2xl overflow-hidden">
            <CardHeader className="py-4 px-6 border-b border-border/40 bg-muted/10">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Receipt className="h-4 w-4 text-orange-500" />
                {t("orders:paymentSummary", "Payment & Order Summary")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              {/* Payment Method & Status Badges */}
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Payment Method</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    {isCash ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/50 dark:text-emerald-400 px-2.5 py-1 rounded-md border border-emerald-200/60">
                        <Banknote className="h-3.5 w-3.5" /> Cash
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 bg-blue-50 dark:bg-blue-950/50 dark:text-blue-400 px-2.5 py-1 rounded-md border border-blue-200/60">
                        <CreditCard className="h-3.5 w-3.5" /> Card / Online
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Payment Status</p>
                  <div className="mt-1.5">
                    <Badge
                      className={cn(
                        "text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-md",
                        isPaid
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400"
                      )}
                      variant="outline"
                    >
                      {order.payment_status || "UNPAID"}
                    </Badge>
                  </div>
                </div>
              </div>

              <Separator className="bg-border/40 my-3" />

              {/* Price Line Items */}
              <div className="space-y-2.5 text-xs font-medium">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="font-semibold text-foreground tabular-nums">
                    {formatCurrency(order.subtotal || order.total_amount)}
                  </span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Tax Amount</span>
                  <span className="font-semibold text-foreground tabular-nums">
                    {formatCurrency(order.tax_amount || 0)}
                  </span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Delivery Fee</span>
                  <span className="font-semibold text-foreground tabular-nums">
                    {formatCurrency(order.delivery_fee || 0)}
                  </span>
                </div>
                {Number(order.discount_amount) > 0 && (
                  <div className="flex justify-between text-red-600 dark:text-red-400">
                    <span>Discount</span>
                    <span className="font-bold tabular-nums">
                      -{formatCurrency(order.discount_amount)}
                    </span>
                  </div>
                )}

                {/* Total Due */}
                <div className="flex justify-between items-baseline pt-4 mt-2 border-t border-border/50">
                  <div>
                    <p className="text-sm font-extrabold text-foreground">Total Due</p>
                    <p className="text-[10px] text-muted-foreground">Net amount including taxes</p>
                  </div>
                  <span className="text-2xl font-extrabold text-foreground tabular-nums">
                    {formatCurrency(order.total_amount)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Delivery Rider */}
          <Card className="border border-border/70 shadow-xs bg-card rounded-2xl overflow-hidden">
            <CardHeader className="py-4 px-6 border-b border-border/40 bg-muted/10">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Truck className="h-4 w-4 text-orange-500" />
                {t("orders:deliveryRider", "Delivery Rider")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              {driver ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3.5">
                    <div className="h-12 w-12 rounded-full bg-orange-100 dark:bg-orange-950/50 text-orange-600 dark:text-orange-400 flex items-center justify-center font-bold text-base shrink-0">
                      {driver.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-bold text-sm text-foreground">{driver.full_name}</p>
                      <a href={`tel:${driver.phone}`} className="text-xs text-muted-foreground hover:text-foreground font-medium">
                        {driver.phone}
                      </a>
                      <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Available
                      </p>
                    </div>
                  </div>

                  <Button asChild size="default" variant="outline" className="w-full h-9 text-xs font-semibold rounded-xl gap-2">
                    <a href={`tel:${driver.phone}`}>
                      <Phone className="h-3.5 w-3.5" /> Call Rider
                    </a>
                  </Button>
                </div>
              ) : (
                <div className="text-center py-4 space-y-3">
                  <p className="text-xs text-muted-foreground">No rider assigned yet.</p>
                  <Select onValueChange={(v) => assignDriver(v)}>
                    <SelectTrigger className="h-9 w-full text-xs font-semibold rounded-xl">
                      <SelectValue placeholder="Assign Rider Now" />
                    </SelectTrigger>
                    <SelectContent>
                      {driversForOrder.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.full_name} ({d.phone})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Interactive Receipt Preview Modal */}
      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" /> {t("orders:receiptPreview", "Order Receipt")}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Review customer bill and print formatted thermal / POS receipt.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <OrderReceipt order={order} items={items} restaurantName={restaurantName} />
          </div>

          <DialogFooter className="flex-row justify-between sm:justify-between gap-2 pt-3 border-t">
            <Button variant="outline" size="sm" onClick={() => setReceiptOpen(false)}>
              Close
            </Button>
            <Button
              size="sm"
              className="gap-2 bg-primary text-primary-foreground font-semibold"
              onClick={() => {
                window.print();
              }}
            >
              <Printer className="h-4 w-4" /> Print Thermal / POS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hidden Print Target (Thermal / POS 80mm clean print) */}
      <OrderReceipt order={order} items={items} restaurantName={restaurantName} isPrintOnly={true} />
    </div>
  );
}
