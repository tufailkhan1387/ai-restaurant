import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, MapPin, Clock, User, Truck, GitBranch } from "lucide-react";
import { OrderTimelineDialog } from "@/components/orders/OrderTimelineDialog";
import { useToast } from "@/hooks/use-toast";
import {
  ORDER_STATUS_COLORS,
  ORDER_STATUS_LABELS,
  formatCurrency,
  OrderStatus,
} from "@/lib/restaurant";

interface Order {
  id: string;
  restaurant_id?: string;
  order_number: string;
  tracking_code: string;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  delivery_notes: string | null;
  status: OrderStatus;
  source: string;
  payment_method: string;
  payment_status: string;
  subtotal: number;
  tax_amount: number;
  delivery_fee: number;
  discount_amount: number;
  total_amount: number;
  driver_id: string | null;
  call_id: string | null;
  created_at: string;
  ai_extracted_data: any;
}
interface OrderItem {
  id: string;
  order_id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  notes: string | null;
}
interface Driver {
  id: string;
  full_name: string;
  phone: string;
  status: string;
}
interface Props {
  /** Filter to a specific status, or array of statuses, or 'all' */
  status?: OrderStatus | OrderStatus[] | "all";
  title: string;
  description?: string;
  icon?: React.ReactNode;
}

export function OrdersListView({ status = "all", title, description, icon }: Props) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [driverRestaurantLinks, setDriverRestaurantLinks] = useState<{ driver_id: string; restaurant_id: string }[]>([]);
  const [search, setSearch] = useState("");
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [timelineOrderId, setTimelineOrderId] = useState<string | null>(null);

  const statuses: OrderStatus[] | null =
    status === "all" ? null : Array.isArray(status) ? status : [status];

  const load = async () => {
    let q = supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (statuses) q = q.in("status", statuses);
    const [o, i, d, drLinks] = await Promise.all([
      q,
      supabase.from("order_items").select("*"),
      supabase.from("drivers").select("id, full_name, phone, status").eq("is_active", true),
      supabase.from("driver_restaurants").select("driver_id, restaurant_id"),
    ]);
    if (o.data) setOrders(o.data as any);
    if (i.data) setItems(i.data as any);
    if (d.data) setDrivers(d.data as any);
    if (drLinks.data) setDriverRestaurantLinks(drLinks.data as any);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(statuses)]);

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel("orders-rt-" + (statuses?.join(",") ?? "all"))
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(statuses)]);

  const filtered = orders.filter(
    (o) =>
      search === "" ||
      o.customer_name.toLowerCase().includes(search.toLowerCase()) ||
      o.customer_phone.includes(search) ||
      o.order_number.toLowerCase().includes(search.toLowerCase())
  );

  const updateStatus = async (id: string, next: OrderStatus, extra: Record<string, any> = {}) => {
    const { error } = await supabase.from("orders").update({ status: next, ...extra }).eq("id", id);
    if (error) toast({ variant: "destructive", title: "Failed", description: (error as any).message });
    else {
      toast({ title: `Order ${next.replace(/_/g, " ")}` });
      if (next === "confirmed" || next === "out_for_delivery") {
        supabase.functions.invoke("send-order-notification", { body: { order_id: id } }).catch(() => {});
      }
      load();
    }
  };

  const confirmOrder = (o: Order) =>
    updateStatus(o.id, "confirmed", { verified_at: new Date().toISOString() });
  const assignDriver = async (o: Order, driverId: string) => {
    await updateStatus(o.id, "assigned", {
      driver_id: driverId,
      assigned_at: new Date().toISOString(),
    });
  };

  const orderItems = (id: string) => items.filter((i) => i.order_id === id);

  const driversForRestaurant = (restaurantId: string | undefined) => {
    if (!restaurantId) return drivers;
    return drivers.filter((d) =>
      driverRestaurantLinks.some((l) => l.driver_id === d.id && l.restaurant_id === restaurantId),
    );
  };

  return (
    <>
      <OrderTimelineDialog
        orderId={timelineOrderId}
        open={timelineOpen}
        onOpenChange={(o) => {
          setTimelineOpen(o);
          if (!o) setTimelineOrderId(null);
        }}
      />
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            {icon}
            {title}
          </h1>
          {description && <p className="text-muted-foreground text-sm">{description}</p>}
        </div>
        <Input
          placeholder="Search name, phone, #"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-56"
        />
      </div>

      <div className="grid gap-3">
        {filtered.map((o) => {
          const its = orderItems(o.id);
          const driver = drivers.find((d) => d.id === o.driver_id);
          return (
            <Card key={o.id} className="hover:border-primary/50 transition-colors">
              <CardContent className="p-4">
                <div className="flex justify-between items-start gap-4 flex-wrap">
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-semibold">{o.order_number}</span>
                      <Badge className={ORDER_STATUS_COLORS[o.status]} variant="outline">
                        {ORDER_STATUS_LABELS[o.status]}
                      </Badge>
                      <Badge variant="secondary" className="capitalize">
                        {o.source}
                      </Badge>
                      {o.call_id && (
                        <Badge variant="outline">
                          <Phone className="h-3 w-3 mr-1" />
                          Call
                        </Badge>
                      )}
                    </div>
                    <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                      <div className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                        {o.customer_name}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                        {o.customer_phone}
                      </div>
                      <div className="flex items-start gap-1.5 sm:col-span-2">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
                        <span className="line-clamp-2">{o.delivery_address}</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {its.length} item{its.length !== 1 ? "s" : ""} •{" "}
                      {its
                        .slice(0, 3)
                        .map((i) => `${i.quantity}× ${i.item_name}`)
                        .join(", ")}
                      {its.length > 3 ? "…" : ""}
                    </p>
                    {driver && (
                      <p className="text-xs">
                        <Truck className="h-3 w-3 inline mr-1" />
                        Driver: <span className="font-medium">{driver.full_name}</span>
                      </p>
                    )}
                    {o.status === "confirmed" && (
                      <p className="text-xs text-muted-foreground">Assign a driver after you start prep.</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="text-lg font-bold">{formatCurrency(o.total_amount)}</span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(o.created_at).toLocaleString()}
                    </span>
                    <div className="flex flex-wrap gap-2 justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={() => {
                          setTimelineOrderId(o.id);
                          setTimelineOpen(true);
                        }}
                      >
                        <GitBranch className="h-3.5 w-3.5" />
                        Timeline
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => navigate(`/orders/${o.id}`)}>
                        Details
                      </Button>
                      {o.status === "pending" && (
                        <Button size="sm" onClick={() => confirmOrder(o)}>
                          Confirm
                        </Button>
                      )}
                      {(o.status === "preparing" || o.status === "ready") && (
                        <Select onValueChange={(v) => assignDriver(o, v)}>
                          <SelectTrigger className="h-8 w-40">
                            <SelectValue placeholder="Assign driver" />
                          </SelectTrigger>
                          <SelectContent>
                            {driversForRestaurant(o.restaurant_id).map((d) => (
                              <SelectItem key={d.id} value={d.id}>
                                {d.full_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {o.status === "confirmed" && (
                        <Button size="sm" variant="outline" onClick={() => updateStatus(o.id, "preparing")}>
                          Start prep
                        </Button>
                      )}
                      {o.status === "preparing" && (
                        <Button size="sm" variant="outline" onClick={() => updateStatus(o.id, "ready")}>
                          Ready
                        </Button>
                      )}
                      {o.status === "assigned" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateStatus(o.id, "out_for_delivery")}
                        >
                          Out for delivery
                        </Button>
                      )}
                      {o.status === "out_for_delivery" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            updateStatus(o.id, "delivered", {
                              delivered_at: new Date().toISOString(),
                            })
                          }
                        >
                          Delivered
                        </Button>
                      )}
                      {o.status !== "cancelled" && o.status !== "delivered" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => {
                            if (confirm("Cancel order?")) updateStatus(o.id, "cancelled");
                          }}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              No orders here
            </CardContent>
          </Card>
        )}
      </div>

    </div>
    </>
  );
}