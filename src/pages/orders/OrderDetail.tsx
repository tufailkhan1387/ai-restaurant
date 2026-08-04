import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  Mic,
  Package,
  Phone,
  Store,
  Truck,
  User,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  ORDER_STATUS_COLORS,
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  formatCurrency,
  OrderStatus,
} from "@/lib/restaurant";
import { OrderFulfillmentTimeline } from "@/components/orders/OrderFulfillmentTimeline";
import { cn } from "@/lib/utils";

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
  ai_extracted_data: unknown;
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
  deal_id?: string | null;
};

type HistoryRow = {
  id: string;
  order_id: string;
  status: string;
  notes: string | null;
  created_at: string;
};

type DriverRow = { id: string; full_name: string; phone: string; status: string };
type CallRow = { id: string; recording_url: string | null; transcript: string | null; duration_seconds: number | null };

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">{label}</p>
      <div className="text-sm text-zinc-900 leading-relaxed">{children}</div>
    </div>
  );
}

function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

function getUnmatchedFromAi(ai: unknown): string[] {
  if (!ai || typeof ai !== "object") return [];
  const u = (ai as { unmatched?: unknown }).unmatched;
  if (!Array.isArray(u)) return [];
  return u.filter((x): x is string => typeof x === "string");
}

export default function OrderDetail() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [items, setItems] = useState<OrderItemRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [driverRestaurantLinks, setDriverRestaurantLinks] = useState<{ driver_id: string; restaurant_id: string }[]>(
    [],
  );
  const [driver, setDriver] = useState<DriverRow | null>(null);
  const [restaurantName, setRestaurantName] = useState<string | null>(null);
  const [call, setCall] = useState<CallRow | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    const oRes = await supabase.from("orders").select("*").eq("id", orderId).maybeSingle();
    const row = oRes.data as OrderRow | null;
    if (!row || oRes.error) {
      setOrder(null);
      setItems([]);
      setHistory([]);
      setDriver(null);
      setCall(null);
      setRestaurantName(null);
      setDriverRestaurantLinks([]);
      setLoading(false);
      return;
    }
    setOrder(row);

    const [itemsRes, histRes, drvList, drLinks, restRes] = await Promise.all([
      supabase.from("order_items").select("*").eq("order_id", orderId).order("created_at", { ascending: true }),
      supabase.from("order_status_history").select("*").eq("order_id", orderId).order("created_at", { ascending: true }),
      supabase.from("drivers").select("id, full_name, phone, status").eq("is_active", true),
      supabase.from("driver_restaurants").select("driver_id, restaurant_id"),
      supabase.from("restaurants").select("name").eq("id", row.restaurant_id).maybeSingle(),
    ]);

    setItems((itemsRes.data as OrderItemRow[]) || []);
    setHistory((histRes.data as HistoryRow[]) || []);
    setDrivers((drvList.data as DriverRow[]) || []);
    setDriverRestaurantLinks((drLinks.data as { driver_id: string; restaurant_id: string }[]) || []);
    if (restRes.data) setRestaurantName((restRes.data as { name: string }).name);
    else setRestaurantName(null);

    if (row.driver_id) {
      const dRes = await supabase.from("drivers").select("id, full_name, phone, status").eq("id", row.driver_id).maybeSingle();
      setDriver((dRes.data as DriverRow) || null);
    } else setDriver(null);

    if (row.call_id) {
      const cRes = await supabase
        .from("calls")
        .select("id, recording_url, transcript, duration_seconds")
        .eq("id", row.call_id)
        .maybeSingle();
      setCall((cRes.data as CallRow) || null);
    } else setCall(null);

    setLoading(false);
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateStatus = async (next: OrderStatus, extra: Record<string, unknown> = {}) => {
    if (!order) return;
    const { error } = await supabase.from("orders").update({ status: next, ...extra }).eq("id", order.id);
    if (error) toast({ variant: "destructive", title: "Failed", description: (error as { message?: string }).message });
    else {
      toast({ title: `Order ${next.replace(/_/g, " ")}` });
      if (next === "confirmed" || next === "out_for_delivery") {
        supabase.functions.invoke("send-order-notification", { body: { order_id: order.id } }).catch(() => {});
      }
      void load();
    }
  };

  const confirmOrder = () => order && updateStatus("confirmed", { verified_at: new Date().toISOString() });
  const assignDriver = (driverId: string) =>
    order && updateStatus("assigned", { driver_id: driverId, assigned_at: new Date().toISOString() });

  const copyText = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: `${label} copied` });
    } catch {
      toast({ variant: "destructive", title: "Copy failed" });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-zinc-500 gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        Loading order…
      </div>
    );
  }

  if (!order) {
    return (
      <div className="space-y-4 max-w-lg">
        <Button variant="ghost" size="sm" className="gap-1" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <Package className="h-10 w-10 mx-auto text-zinc-400" />
            <h2 className="text-lg font-semibold">Order not found</h2>
            <p className="text-sm text-zinc-500">This order does not exist or you do not have access.</p>
            <Button asChild variant="outline" className="mt-2">
              <Link to="/orders">View all orders</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const st = asOrderStatus(order.status);
  const rid = order.restaurant_id;
  const driversForOrder = !rid
    ? drivers
    : drivers.filter((d) =>
        driverRestaurantLinks.some((l) => l.driver_id === d.id && l.restaurant_id === rid),
      );

  const unmatchedAi = getUnmatchedFromAi(order.ai_extracted_data);
  const unmatchedLineItems = items.filter((it) => it.menu_item_id == null);
  const showUnmatchedWarning = unmatchedAi.length > 0 || unmatchedLineItems.length > 0;
  const placedAgo = formatDistanceToNow(new Date(order.created_at), { addSuffix: true });

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-16 animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Button variant="ghost" size="sm" className="gap-1 h-8 -ml-2" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <span className="text-zinc-300">/</span>
        <Link to="/orders" className="text-zinc-500 hover:text-primary transition-colors">
          Orders
        </Link>
        <span className="text-zinc-300">/</span>
        <span className="font-mono text-zinc-800 font-medium truncate">{order.order_number}</span>
      </div>

      {/* Header */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="p-5 sm:p-6 border-b border-zinc-200 bg-white">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1">
                    <Clock className="h-3.5 w-3.5" />
                    Placed {placedAgo}
                  </span>
                  {restaurantName && (
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1">
                      <Store className="h-3.5 w-3.5" />
                      {restaurantName}
                    </span>
                  )}
                  <span className="inline-flex items-center rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 capitalize">
                    Source · {order.source}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-zinc-900 break-all">
                    {order.order_number}
                  </h1>
                  <Badge className={cn("text-sm px-2.5 py-1 font-semibold", ORDER_STATUS_COLORS[st])} variant="outline">
                    {ORDER_STATUS_LABELS[st]}
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-zinc-500">Tracking</span>
                  <code className="rounded-md bg-zinc-100 border border-zinc-200 px-2 py-0.5 font-mono text-xs text-zinc-800">
                    {order.tracking_code}
                  </code>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-zinc-500"
                    onClick={() => void copyText("Tracking code", order.tracking_code)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5" asChild>
                    <Link to={`/track/${order.tracking_code}`} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" />
                      Customer track page
                    </Link>
                  </Button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 shrink-0 lg:justify-end lg:max-w-md">
                {st === "pending" && (
                  <Button size="sm" onClick={confirmOrder}>
                    Confirm order
                  </Button>
                )}
                {st === "confirmed" && (
                  <Button size="sm" onClick={() => updateStatus("preparing")}>
                    Start preparing
                  </Button>
                )}
                {st === "preparing" && (
                  <Button size="sm" variant="outline" onClick={() => updateStatus("ready")}>
                    Mark ready
                  </Button>
                )}
                {(st === "preparing" || st === "ready") && (
                  <Select onValueChange={(v) => assignDriver(v)}>
                    <SelectTrigger className="h-9 w-[200px]">
                      <SelectValue placeholder="Assign driver" />
                    </SelectTrigger>
                    <SelectContent>
                      {driversForOrder.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {st === "assigned" && (
                  <Button size="sm" onClick={() => updateStatus("out_for_delivery")}>
                    Out for delivery
                  </Button>
                )}
                {st === "out_for_delivery" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateStatus("delivered", { delivered_at: new Date().toISOString() })}
                  >
                    Mark delivered
                  </Button>
                )}
                {st !== "cancelled" && st !== "delivered" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={() => {
                      if (confirm("Cancel order?")) void updateStatus("cancelled");
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>

            {st === "confirmed" && (
              <p className="mt-4 text-sm text-zinc-600 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                <strong className="font-medium text-blue-900">Kitchen next:</strong> start preparing before assigning a
                driver. Driver assignment unlocks during Preparing / Ready.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Timeline — always visible */}
      <Card>
        <CardHeader className="pb-3 border-b border-zinc-200">
          <CardTitle className="text-base font-semibold">Order timeline</CardTitle>
          <p className="text-sm text-zinc-500 font-normal mt-1">
            Live fulfillment progress with timestamps from status history.
          </p>
        </CardHeader>
        <CardContent className="pt-6 pb-6">
          <OrderFulfillmentTimeline order={order} history={history} />
        </CardContent>
      </Card>

      {/* Key timestamps strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Placed", value: fmtWhen(order.created_at) },
          { label: "Verified", value: fmtWhen(order.verified_at) },
          { label: "Driver assigned", value: fmtWhen(order.assigned_at) },
          { label: "Est. delivery", value: fmtWhen(order.estimated_delivery_at) },
          { label: "Delivered", value: fmtWhen(order.delivered_at) },
          { label: "Last update", value: fmtWhen(order.updated_at) },
        ].map((m) => (
          <div key={m.label} className="rounded-lg border border-zinc-200 bg-white px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{m.label}</p>
            <p className="mt-1.5 text-sm font-medium text-zinc-900 leading-snug">{m.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        {/* Left column */}
        <div className="lg:col-span-7 space-y-5">
          <Card>
            <CardHeader className="pb-3 border-b border-zinc-200">
              <CardTitle className="text-base font-semibold">Customer & delivery</CardTitle>
            </CardHeader>
            <CardContent className="pt-5 space-y-5">
              <div className="grid sm:grid-cols-2 gap-5">
                <Field label="Customer">
                  <p className="flex items-center gap-2 font-medium">
                    <User className="h-4 w-4 text-zinc-400 shrink-0" />
                    {order.customer_name}
                  </p>
                </Field>
                <Field label="Phone">
                  <a className="flex items-center gap-2 font-medium text-primary hover:underline" href={`tel:${order.customer_phone}`}>
                    <Phone className="h-4 w-4 shrink-0" />
                    {order.customer_phone}
                  </a>
                </Field>
                {order.customer_email && (
                  <Field label="Email" className="sm:col-span-2">
                    <a className="flex items-center gap-2 text-primary hover:underline break-all" href={`mailto:${order.customer_email}`}>
                      <Mail className="h-4 w-4 shrink-0" />
                      {order.customer_email}
                    </a>
                  </Field>
                )}
              </div>
              <Separator />
              {order.delivery_notes && (
                <Field label="Delivery notes">
                  <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5">{order.delivery_notes}</p>
                </Field>
              )}
              {order.notes && (
                <Field label="Internal notes">
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-amber-950">{order.notes}</p>
                </Field>
              )}
            </CardContent>
          </Card>

          {/* Line items */}
          <Card className="overflow-hidden">
            <CardHeader className="pb-3 border-b border-zinc-200">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-semibold">Line items</CardTitle>
                  <p className="text-sm text-zinc-500 font-normal mt-1">
                    {items.length} item{items.length === 1 ? "" : "s"} on this order
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {showUnmatchedWarning && (
                <Alert className="m-4 mb-0 border-amber-300 bg-amber-50">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertTitle className="text-amber-900">Menu matching</AlertTitle>
                  <AlertDescription className="text-amber-900/90">
                    {unmatchedAi.length > 0 && (
                      <p>
                        AI could not match: <strong>{unmatchedAi.join(", ")}</strong>
                      </p>
                    )}
                    {!unmatchedAi.length && unmatchedLineItems.length > 0 && (
                      <p>
                        Some rows are not linked to the menu (
                        {unmatchedLineItems.map((x) => x.item_name).join(", ")}) — totals may be incomplete.
                      </p>
                    )}
                  </AlertDescription>
                </Alert>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[520px]">
                  <thead>
                    <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-[11px] uppercase tracking-wide text-zinc-500">
                      <th className="px-4 py-3 font-semibold">Item</th>
                      <th className="px-4 py-3 font-semibold text-right w-20">Qty</th>
                      <th className="px-4 py-3 font-semibold text-right w-28">Unit</th>
                      <th className="px-4 py-3 font-semibold text-right w-28">Line total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => {
                      const unlinked = it.menu_item_id == null;
                      return (
                        <tr
                          key={it.id}
                          className={cn("border-b border-zinc-100 last:border-0", unlinked && "bg-amber-50/60")}
                        >
                          <td className="px-4 py-3.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-zinc-900">{it.item_name}</span>
                              {unlinked && (
                                <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-800">
                                  No menu link
                                </Badge>
                              )}
                            </div>
                            {it.notes && <p className="text-xs text-zinc-500 mt-1">{it.notes}</p>}
                          </td>
                          <td className="px-4 py-3.5 text-right tabular-nums font-medium">{it.quantity}</td>
                          <td className="px-4 py-3.5 text-right tabular-nums text-zinc-600">{formatCurrency(it.unit_price)}</td>
                          <td className="px-4 py-3.5 text-right tabular-nums font-semibold text-zinc-900">
                            {formatCurrency(it.line_total)}
                          </td>
                        </tr>
                      );
                    })}
                    {items.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-12 text-center text-zinc-500">
                          No line items
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="lg:col-span-5 space-y-5">
          <Card>
            <CardHeader className="pb-3 border-b border-zinc-200">
              <CardTitle className="text-base font-semibold">Payment summary</CardTitle>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Method">
                  <p className="capitalize font-medium">{order.payment_method}</p>
                </Field>
                <Field label="Status">
                  <p className="capitalize font-medium">{order.payment_status}</p>
                </Field>
              </div>
              {order.discount_code && (
                <Field label="Discount code">
                  <code className="font-mono text-xs bg-zinc-100 border border-zinc-200 rounded px-1.5 py-0.5">
                    {order.discount_code}
                  </code>
                </Field>
              )}
              <Separator />
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between text-zinc-600">
                  <span>Subtotal</span>
                  <span className="tabular-nums font-medium text-zinc-900">{formatCurrency(order.subtotal)}</span>
                </div>
                <div className="flex justify-between text-zinc-600">
                  <span>Tax</span>
                  <span className="tabular-nums font-medium text-zinc-900">{formatCurrency(order.tax_amount)}</span>
                </div>
                <div className="flex justify-between text-zinc-600">
                  <span>Delivery fee</span>
                  <span className="tabular-nums font-medium text-zinc-900">{formatCurrency(order.delivery_fee)}</span>
                </div>
                {Number(order.discount_amount) > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Discount</span>
                    <span className="tabular-nums font-medium">-{formatCurrency(order.discount_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between items-baseline pt-3 mt-1 border-t border-zinc-200">
                  <span className="font-semibold text-zinc-900">Total due</span>
                  <span className="text-xl font-bold tabular-nums text-zinc-900">{formatCurrency(order.total_amount)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {driver ? (
            <Card>
              <CardHeader className="pb-3 border-b border-zinc-200">
                <CardTitle className="text-base font-semibold">Assigned driver</CardTitle>
              </CardHeader>
              <CardContent className="pt-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Truck className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-900">{driver.full_name}</p>
                    <a href={`tel:${driver.phone}`} className="text-sm text-primary hover:underline">
                      {driver.phone}
                    </a>
                    <p className="text-xs text-zinc-500 mt-0.5 capitalize">Status · {driver.status}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-6 flex items-center gap-3 text-sm text-zinc-500">
                <Truck className="h-5 w-5 text-zinc-400" />
                No driver assigned yet
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3 border-b border-zinc-200">
              <CardTitle className="text-base font-semibold">Order references</CardTitle>
            </CardHeader>
            <CardContent className="pt-5 space-y-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Order ID</p>
                  <p className="font-mono text-xs text-zinc-700 break-all mt-1">{order.id}</p>
                </div>
                <Button type="button" size="sm" variant="ghost" className="shrink-0 h-8" onClick={() => void copyText("Order ID", order.id)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              {order.call_id && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Call ID</p>
                  <p className="font-mono text-xs text-zinc-700 break-all mt-1">{order.call_id}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Status history */}
      {history.length > 0 && (
        <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between px-5 sm:px-6 py-4 text-left hover:bg-zinc-50 transition-colors"
              >
                <div>
                  <CardTitle className="text-base font-semibold">Status history log</CardTitle>
                  <p className="text-sm text-zinc-500 font-normal mt-0.5">{history.length} recorded events</p>
                </div>
                <ChevronDown className={cn("h-5 w-5 text-zinc-400 transition-transform shrink-0", historyOpen && "rotate-180")} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="border-t border-zinc-200 overflow-x-auto">
                <table className="w-full text-sm min-w-[520px]">
                  <thead>
                    <tr className="bg-zinc-50 text-left text-[11px] uppercase tracking-wide text-zinc-500">
                      <th className="px-5 py-3 font-semibold">When</th>
                      <th className="px-5 py-3 font-semibold">Status</th>
                      <th className="px-5 py-3 font-semibold">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...history].reverse().map((h) => (
                      <tr key={h.id} className="border-t border-zinc-100">
                        <td className="px-5 py-3 whitespace-nowrap text-zinc-600">{fmtWhen(h.created_at)}</td>
                        <td className="px-5 py-3">
                          <Badge variant="outline" className="capitalize">
                            {(h.status || "").replace(/_/g, " ")}
                          </Badge>
                        </td>
                        <td className="px-5 py-3 text-zinc-600">{h.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {call && (
        <Card>
          <CardHeader className="pb-3 border-b border-zinc-200">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Mic className="h-4 w-4 text-zinc-500" />
              Call recording
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-5 space-y-3 text-sm">
            {call.duration_seconds != null && (
              <p className="text-zinc-500 text-xs">Duration: {call.duration_seconds}s</p>
            )}
            {call.recording_url && <audio controls src={call.recording_url} className="w-full" />}
            {call.transcript && (
              <div className="bg-zinc-50 border border-zinc-200 p-4 rounded-lg text-xs whitespace-pre-wrap max-h-72 overflow-y-auto leading-relaxed text-zinc-700">
                {call.transcript}
              </div>
            )}
            {!call.recording_url && !call.transcript && (
              <p className="text-xs text-zinc-500">No recording or transcript available</p>
            )}
          </CardContent>
        </Card>
      )}

      {order.ai_extracted_data != null && (
        <Collapsible open={aiOpen} onOpenChange={setAiOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between px-5 sm:px-6 py-4 text-left hover:bg-zinc-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-zinc-500" />
                  <div>
                    <CardTitle className="text-base font-semibold">AI raw payload</CardTitle>
                    <p className="text-sm text-zinc-500 font-normal mt-0.5">Technical JSON from voice / chat ordering</p>
                  </div>
                </div>
                <ChevronDown className={cn("h-5 w-5 text-zinc-400 shrink-0 transition-transform", aiOpen && "rotate-180")} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 pb-5">
                <pre className="text-xs bg-zinc-50 border border-zinc-200 p-4 rounded-lg overflow-x-auto max-h-[min(70vh,480px)] overflow-y-auto">
                  {JSON.stringify(order.ai_extracted_data, null, 2)}
                </pre>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}
    </div>
  );
}
