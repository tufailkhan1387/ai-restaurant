import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import {
  ClipboardList,
  DollarSign,
  ShoppingBag,
  UtensilsCrossed,
  RefreshCw,
  ArrowRight,
  Phone,
  Sparkles,
} from "lucide-react";
import { useActiveRestaurant } from "@/hooks/useActiveRestaurant";
import { getApiBase } from "@/lib/apiBase";
import { getToken } from "@/lib/authStorage";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/restaurant";
import { getOrderStatusLabel } from "@/i18n/formatters";
import { cn } from "@/lib/utils";

type StaffOrder = {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  table_number?: string | null;
  fulfillment_type?: string | null;
  total_amount: number;
  status: string;
  created_at: string;
};

type DashboardData = {
  today_orders: number;
  today_revenue: number;
  total_orders: number;
  total_revenue: number;
  open_tables: number;
  recent_orders: StaffOrder[];
};

export function StaffDashboard({ firstName }: { firstName: string }) {
  const { restaurantId, activeRestaurant } = useActiveRestaurant();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const q = restaurantId ? `?restaurant_id=${encodeURIComponent(restaurantId)}` : "";
      const res = await fetch(`${getApiBase()}/api/staff/dashboard${q}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        setData(await res.json());
      }
    } catch (err) {
      console.error("Failed to load staff dashboard:", err);
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const cards = [
    {
      label: "Orders taken today",
      value: data?.today_orders ?? 0,
      desc: "Orders you placed today",
      icon: ShoppingBag,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-500/10 border-amber-500/20",
    },
    {
      label: "Today's sales",
      value: formatCurrency(data?.today_revenue || 0),
      desc: "From orders you took",
      icon: DollarSign,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-500/10 border-emerald-500/20",
    },
    {
      label: "All-time taken",
      value: data?.total_orders ?? 0,
      desc: "Total orders you have taken",
      icon: ClipboardList,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-500/10 border-blue-500/20",
    },
    {
      label: "Open tables",
      value: data?.open_tables ?? 0,
      desc: "Tables still dining",
      icon: UtensilsCrossed,
      color: "text-violet-600 dark:text-violet-400",
      bg: "bg-violet-500/10 border-violet-500/20",
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-8">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-600 via-orange-600 to-rose-600 p-6 sm:p-8 text-white shadow-lg">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge className="bg-white/20 text-white hover:bg-white/30 border-white/20 text-xs px-2.5 py-0.5 backdrop-blur-md">
                <Sparkles className="h-3 w-3 mr-1 text-amber-200" /> Floor Staff
              </Badge>
              <span className="text-white/80 text-xs font-medium">
                {format(new Date(), "EEEE, MMMM d, yyyy")}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Welcome back, {firstName}
            </h1>
            <p className="text-white/80 text-sm max-w-xl">
              Take table orders, review what each guest already ordered, and close the bill when they are ready to pay
              at {activeRestaurant?.name || "your restaurant"}.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="bg-white/15 text-white hover:bg-white/25 border-white/20"
            onClick={loadData}
          >
            <RefreshCw className={cn("h-4 w-4 mr-1.5", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((card) => (
          <Card key={card.label} className="border border-border/70 rounded-2xl shadow-2xs overflow-hidden">
            <CardContent className="p-4 sm:p-5">
              {loading && !data ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{card.label}</p>
                    <p className="text-2xl font-black text-foreground mt-1 tracking-tight">{card.value}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{card.desc}</p>
                  </div>
                  <div className={cn("w-11 h-11 rounded-2xl flex items-center justify-center border shrink-0", card.bg)}>
                    <card.icon className={cn("h-5 w-5", card.color)} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border border-border/70 rounded-2xl shadow-2xs">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base font-bold">Orders you took</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild className="text-xs">
              <Link to="/tables">Tables</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild className="text-xs">
              <Link to="/orders">
                View all <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading && !data ? (
            <Skeleton className="h-32 w-full" />
          ) : !data?.recent_orders?.length ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              You have not taken any orders yet. Open Orders and place a table order.
            </p>
          ) : (
            <div className="divide-y divide-border/60">
              {data.recent_orders.map((o) => (
                <Link
                  key={o.id}
                  to={`/orders/${o.id}`}
                  className="flex items-center justify-between gap-3 py-3 hover:bg-muted/40 px-1 rounded-lg"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">
                      {o.order_number} · {o.customer_name}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                      {o.table_number && <span>Table {o.table_number}</span>}
                      {o.customer_phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {o.customer_phone}
                        </span>
                      )}
                      <span>{getOrderStatusLabel(o.status)}</span>
                    </p>
                  </div>
                  <span className="text-sm font-black shrink-0">{formatCurrency(o.total_amount)}</span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
