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
  ExternalLink,
  FileText,
  GitBranch,
  Loader2,
  MapPin,
  Mic,
  Package,
  Phone,
  Truck,
  User,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  ORDER_STATUSES,
  ORDER_STATUS_COLORS,
  ORDER_STATUS_LABELS,
  formatCurrency,
  OrderStatus,
} from "@/lib/restaurant";
import { OrderTimelineDialog } from "@/components/orders/OrderTimelineDialog";
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

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] uppercase text-muted-foreground tracking-wide font-medium mb-1">{children}</p>;
}

function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function getUnmatchedFromAi(ai: unknown): string[] {
  if (!ai || typeof ai !== "object") return [];
  const u = (ai as { unmatched?: unknown }).unmatched;
  if (!Array.isArray(u)) return [];
  return u.filter((x): x is string => typeof x === "string");
}

function Milestone({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/40 border border-border/60 px-3 py-2.5 min-h-[72px]">
      <FieldLabel>{label}</FieldLabel>
      <p className="text-sm font-medium text-foreground leading-snug">{value}</p>
    </div>
  );
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
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
        <Loader2 className="h-6 w-6 animate-spin" />
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
            <Package className="h-10 w-10 mx-auto text-muted-foreground" />
            <h2 className="text-lg font-semibold">Order not found</h2>
            <p className="text-sm text-muted-foreground">This order does not exist or you do not have access.</p>
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

  const actionButtons = (
    <>
      <Button size="sm" variant="secondary" className="gap-1.5 shadow-sm" onClick={() => setTimelineOpen(true)}>
        <GitBranch className="h-4 w-4" />
        Status timeline
      </Button>
      {st === "pending" && (
        <Button size="sm" onClick={confirmOrder}>
          Confirm order
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
    </>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">
      <OrderTimelineDialog orderId={order.id} open={timelineOpen} onOpenChange={setTimelineOpen} />

      {/* Wayfinding */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Button variant="ghost" size="sm" className="gap-1 h-8 -ml-2" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <span className="text-muted-foreground">/</span>
        <Button variant="link" className="h-auto p-0 text-muted-foreground" asChild>
          <Link to="/orders">Orders</Link>
        </Button>
      </div>

      {/* Summary hero */}
      <Card className="overflow-hidden border-2 shadow-sm">
        <CardContent className="p-0">
          <div className="bg-gradient-to-br from-muted/80 via-background to-background p-6 sm:p-8">
            <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-6">
              <div className="space-y-4 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1 rounded-full bg-background/80 border px-2 py-0.5">
                    <Clock className="h-3 w-3" />
                    Placed {placedAgo}
                  </span>
                  {restaurantName && (
                    <span className="inline-flex items-center rounded-full bg-background/80 border px-2 py-0.5">
                      {restaurantName}
                    </span>
                  )}
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-foreground break-all">
                    {order.order_number}
                  </h1>
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    <Badge className={cn("text-sm px-2.5 py-0.5 font-semibold", ORDER_STATUS_COLORS[st])} variant="outline">
                      {ORDER_STATUS_LABELS[st]}
                    </Badge>
                    <Badge variant="secondary" className="capitalize text-sm">
                      {order.source}
                    </Badge>
                    {order.call_id && (
                      <Badge variant="outline" className="text-sm">
                        <Phone className="h-3 w-3 mr-1" />
                        Phone order
                      </Badge>
                    )}
                  </div>
                </div>
                <Button variant="outline" size="sm" className="gap-1.5" asChild>
                  <Link to={`/track/${order.tracking_code}`} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Customer tracking page
                  </Link>
                </Button>
              </div>

              <div className="flex flex-col gap-3 xl:items-end shrink-0">
                <div className="flex flex-wrap gap-2 justify-start xl:justify-end">{actionButtons}</div>
                <p className="text-xs text-muted-foreground max-w-sm xl:text-right">
                  Use the timeline for a step-by-step view. Advance the order with the buttons above when each stage is
                  complete.
                </p>
              </div>
            </div>
          </div>

          {st === "confirmed" && (
            <div className="border-t px-6 sm:px-8 py-3 bg-muted/30 text-sm text-muted-foreground">
              <strong className="text-foreground font-medium">Kitchen next:</strong> start preparing before assigning a
              driver (driver assignment unlocks during Preparing / Ready).
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader className="pb-3 border-b bg-muted/20">
            <CardTitle className="text-lg font-semibold tracking-tight">Customer & delivery</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm pt-6">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel>Name</FieldLabel>
                <p className="flex items-center gap-2 text-foreground">
                  <User className="h-4 w-4 text-muted-foreground shrink-0" />
                  {order.customer_name}
                </p>
              </div>
              <div>
                <FieldLabel>Phone</FieldLabel>
                <p className="flex items-center gap-2 text-foreground">
                  <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                  <a className="text-primary hover:underline" href={`tel:${order.customer_phone}`}>
                    {order.customer_phone}
                  </a>
                </p>
              </div>
              {order.customer_email && (
                <div className="sm:col-span-2">
                  <FieldLabel>Email</FieldLabel>
                  <p>{order.customer_email}</p>
                </div>
              )}
            </div>
            <Separator />
            <div>
              <FieldLabel>Delivery address</FieldLabel>
              <p className="flex items-start gap-2 text-foreground mt-1">
                <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                {order.delivery_address}
              </p>
            </div>
            {order.delivery_notes && (
              <div>
                <FieldLabel>Delivery notes</FieldLabel>
                <p className="text-foreground">{order.delivery_notes}</p>
              </div>
            )}
            {order.notes && (
              <div>
                <FieldLabel>Internal notes</FieldLabel>
                <p className="text-foreground">{order.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-3 border-b bg-muted/20">
            <CardTitle className="text-lg font-semibold tracking-tight">Payment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm pt-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel>Method</FieldLabel>
                <p className="capitalize font-medium text-foreground">{order.payment_method}</p>
              </div>
              <div>
                <FieldLabel>Status</FieldLabel>
                <p className="capitalize font-medium text-foreground">{order.payment_status}</p>
              </div>
            </div>
            {order.discount_code && (
              <div>
                <FieldLabel>Discount code</FieldLabel>
                <p className="font-mono">{order.discount_code}</p>
              </div>
            )}
            <Separator />
            <div className="space-y-2">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatCurrency(order.subtotal)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Tax</span>
                <span className="tabular-nums">{formatCurrency(order.tax_amount)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Delivery</span>
                <span className="tabular-nums">{formatCurrency(order.delivery_fee)}</span>
              </div>
              {Number(order.discount_amount) > 0 && (
                <div className="flex justify-between text-primary">
                  <span>Discount</span>
                  <span className="tabular-nums">-{formatCurrency(order.discount_amount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-lg pt-3 border-t">
                <span>Total due</span>
                <span className="tabular-nums">{formatCurrency(order.total_amount)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-3 border-b bg-muted/20">
          <CardTitle className="text-lg font-semibold tracking-tight">Tracking & milestones</CardTitle>
          <p className="text-sm text-muted-foreground font-normal mt-1">
            Tracking code <span className="font-mono font-medium text-foreground">{order.tracking_code}</span>
          </p>
        </CardHeader>
        <CardContent className="space-y-5 pt-6">
          <div className="rounded-lg border bg-muted/20 px-4 py-2 text-xs font-mono text-muted-foreground break-all">
            Order ID · {order.id}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Milestone label="Placed" value={fmtWhen(order.created_at)} />
            <Milestone label="Verified" value={fmtWhen(order.verified_at)} />
            <Milestone label="Assigned driver" value={fmtWhen(order.assigned_at)} />
            <Milestone label="Last update" value={fmtWhen(order.updated_at)} />
            <Milestone label="Est. delivery" value={fmtWhen(order.estimated_delivery_at)} />
            <Milestone label="Delivered" value={fmtWhen(order.delivered_at)} />
          </div>
          {driver && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15">
                <Truck className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Assigned driver</p>
                <p className="font-semibold text-foreground">{driver.full_name}</p>
                <a href={`tel:${driver.phone}`} className="text-sm text-primary hover:underline">
                  {driver.phone}
                </a>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {history.length > 0 && (
        <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
          <Card className="shadow-sm">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between px-6 py-4 text-left hover:bg-muted/30 transition-colors rounded-t-xl"
              >
                <div>
                  <CardTitle className="text-base font-semibold">Status history</CardTitle>
                  <p className="text-sm text-muted-foreground font-normal mt-0.5">{history.length} events recorded</p>
                </div>
                <ChevronDown className={cn("h-5 w-5 text-muted-foreground transition-transform shrink-0", historyOpen && "rotate-180")} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="p-0 pt-0 border-t overflow-x-auto">
                <table className="w-full text-sm min-w-[480px]">
                  <thead className="text-left bg-muted/40">
                    <tr>
                      <th className="p-3 font-medium">When</th>
                      <th className="p-3 font-medium">Status</th>
                      <th className="p-3 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id} className="border-t border-border/80">
                        <td className="p-3 whitespace-nowrap text-muted-foreground">{fmtWhen(h.created_at)}</td>
                        <td className="p-3">
                          <Badge variant="outline" className="capitalize">
                            {(h.status || "").replace(/_/g, " ")}
                          </Badge>
                        </td>
                        <td className="p-3 text-muted-foreground">{h.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      <Card className="shadow-sm overflow-hidden">
        <CardHeader className="pb-3 border-b bg-muted/20">
          <CardTitle className="text-lg font-semibold tracking-tight">Line items</CardTitle>
          <p className="text-sm text-muted-foreground font-normal mt-1">Kitchen ticket — unmatched menu names show pricing warnings.</p>
        </CardHeader>
        <CardContent className="p-0">
          {showUnmatchedWarning && (
            <Alert className="m-4 mb-0 border-amber-500/40 bg-amber-500/5">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-900 dark:text-amber-200">Menu matching</AlertTitle>
              <AlertDescription className="text-amber-900/90 dark:text-amber-100/90">
                {unmatchedAi.length > 0 && (
                  <p>
                    AI could not match: <strong>{unmatchedAi.join(", ")}</strong>. Add or rename a menu item to align,
                    or edit line prices manually elsewhere.
                  </p>
                )}
                {!unmatchedAi.length && unmatchedLineItems.length > 0 && (
                  <p>Some rows are not linked to the menu ({unmatchedLineItems.map((x) => x.item_name).join(", ")}
                    ) — totals may be incomplete.</p>
                )}
              </AlertDescription>
            </Alert>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead className="text-left bg-muted/40">
                <tr>
                  <th className="p-4 font-medium">Item</th>
                  <th className="p-4 text-right font-medium w-24">Qty</th>
                  <th className="p-4 text-right font-medium w-28">Unit</th>
                  <th className="p-4 text-right font-medium w-28">Line</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const unlinked = it.menu_item_id == null;
                  return (
                    <tr
                      key={it.id}
                      className={cn("border-t border-border/80", unlinked && "bg-amber-500/[0.04]")}
                    >
                      <td className="p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{it.item_name}</span>
                          {unlinked && (
                            <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-800 dark:text-amber-400">
                              No menu price
                            </Badge>
                          )}
                        </div>
                        {it.notes && <span className="text-xs text-muted-foreground block mt-1">{it.notes}</span>}
                      </td>
                      <td className="p-4 text-right tabular-nums">{it.quantity}</td>
                      <td className="p-4 text-right tabular-nums">{formatCurrency(it.unit_price)}</td>
                      <td className="p-4 text-right tabular-nums font-medium">{formatCurrency(it.line_total)}</td>
                    </tr>
                  );
                })}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-12 text-center text-muted-foreground">
                      No line items
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {call && (
        <Card className="shadow-sm">
          <CardHeader className="pb-3 border-b bg-muted/20">
            <CardTitle className="text-lg font-semibold tracking-tight flex items-center gap-2">
              <Mic className="h-5 w-5 text-muted-foreground" />
              Call recording
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm pt-6">
            {call.duration_seconds != null && (
              <p className="text-muted-foreground text-xs">Duration: {call.duration_seconds}s</p>
            )}
            {call.recording_url && <audio controls src={call.recording_url} className="w-full" />}
            {call.transcript && (
              <div className="bg-muted/50 p-4 rounded-lg text-xs whitespace-pre-wrap max-h-72 overflow-y-auto leading-relaxed">
                {call.transcript}
              </div>
            )}
            {!call.recording_url && !call.transcript && (
              <p className="text-xs text-muted-foreground">No recording or transcript available</p>
            )}
          </CardContent>
        </Card>
      )}

      {order.ai_extracted_data != null && (
        <Collapsible open={aiOpen} onOpenChange={setAiOpen}>
          <Card className="shadow-sm">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between px-6 py-4 text-left hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <CardTitle className="text-base font-semibold">AI raw payload</CardTitle>
                    <p className="text-sm text-muted-foreground font-normal mt-0.5">Technical JSON from voice / chat ordering</p>
                  </div>
                </div>
                <ChevronDown className={cn("h-5 w-5 text-muted-foreground shrink-0 transition-transform", aiOpen && "rotate-180")} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 pb-6">
                <pre className="text-xs bg-muted/60 p-4 rounded-lg overflow-x-auto max-h-[min(70vh,480px)] overflow-y-auto border">
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
