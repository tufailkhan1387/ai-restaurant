import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  type LucideIcon,
  ShoppingBag,
  ChefHat,
  Store,
  Tag,
  Calendar,
  ArrowUpRight,
  BarChart2,
  DollarSign,
  Filter,
  Building2,
  Globe,
  Package,
  Smartphone,
  Ticket,
  Users,
  Settings,
} from "lucide-react";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { getToken } from "@/lib/authStorage";
import { useActiveRestaurant } from "@/hooks/useActiveRestaurant";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ORDER_STATUS_LABELS, OrderStatus, formatCurrency } from "@/lib/restaurant";
import { getApiBase } from "@/lib/apiBase";
import { Skeleton } from "@/components/ui/skeleton";

type GlobalStats = {
  totalRestaurants: number;
  totalMenuItems: number;
  totalDeals: number;
  totalDrivers: number;
  totalVehicles: number;
};

type RecentOrderRow = {
  id: string;
  order_number: string;
  tracking_code: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  delivery_address: string;
  total_amount: number;
  subtotal: number;
  tax_amount: number;
  delivery_fee: number;
  status: string;
  created_at: string;
  payment_method: string;
  payment_status: string;
  source: string;
  estimated_delivery_at: string | null;
};

const AVATAR_TONES = [
  "bg-orange-100 text-orange-800",
  "bg-amber-100 text-amber-800",
  "bg-stone-200 text-stone-700",
  "bg-slate-200 text-slate-700",
  "bg-rose-100 text-rose-800",
  "bg-yellow-100 text-yellow-800",
];

function StatCardSkeleton() {
  return (
    <Card className="rounded-xl border-border/80 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2 flex-1">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-16" />
          </div>
          <Skeleton className="h-10 w-10 rounded-lg shrink-0" />
        </div>
      </CardContent>
    </Card>
  );
}

function avatarTone(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash + name.charCodeAt(i) * (i + 1)) % AVATAR_TONES.length;
  return AVATAR_TONES[hash];
}

export default function Dashboard() {
  const { profile, role } = useAuth();
  const { restaurantId } = useActiveRestaurant();
  const isSuperAdmin = role === "super_admin";
  const firstName = profile?.full_name?.split(" ")[0] || "Admin";

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    []
  );

  /** Exactly 6 shortcut cards — drivers / vehicles not included */
  const quickActions = useMemo((): { href: string; label: string; icon: LucideIcon }[] => {
    if (isSuperAdmin) {
      return [
        { href: "/orders", label: "Orders", icon: ShoppingBag },
        { href: "/menu", label: "Menu", icon: ChefHat },
        { href: "/deals", label: "Deals & offers", icon: Tag },
        { href: "/restaurants", label: "Restaurants", icon: Store },
        { href: "/earnings", label: "Earnings", icon: DollarSign },
        { href: "/reports/restaurant", label: "Reports", icon: BarChart2 },
      ];
    }
    return [
      { href: "/orders", label: "Orders", icon: ShoppingBag },
      { href: "/menu", label: "Menu", icon: ChefHat },
      { href: "/deals", label: "Deals & offers", icon: Tag },
      { href: "/coupons", label: "Coupons", icon: Ticket },
      { href: "/users/customers", label: "Customers", icon: Users },
      { href: "/settings", label: "Settings", icon: Settings },
    ];
  }, [isSuperAdmin]);

  const { data: globalStats, isPending: statsLoading } = useQuery({
    queryKey: ["global-stats"],
    queryFn: async () => {
      const resp = await fetch(`${getApiBase()}/api/stats/global`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!resp.ok) return null;
      return (await resp.json()) as GlobalStats;
    },
  });

  const { data: recentOrders, isPending: ordersLoading } = useQuery({
    queryKey: ["dashboard-recent-orders", restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select(
          "id,order_number,tracking_code,customer_name,customer_phone,customer_email,delivery_address,total_amount,subtotal,tax_amount,delivery_fee,status,created_at,payment_method,payment_status,source,estimated_delivery_at"
        )
        .eq("restaurant_id", restaurantId!)
        .order("created_at", { ascending: false })
        .limit(10);
      return (data || []) as RecentOrderRow[];
    },
    refetchInterval: 15000,
  });

  const { data: restaurantInfo } = useQuery({
    queryKey: ["dashboard-restaurant-info", restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data } = await supabase.from("restaurants").select("name,is_active").eq("id", restaurantId!).maybeSingle();
      return data;
    },
  });

  const statusActivity = useMemo(() => {
    const orders = recentOrders || [];
    if (!orders.length) return [];
    const counts: Record<string, number> = {};
    for (const o of orders) {
      counts[o.status] = (counts[o.status] || 0) + 1;
    }
    const total = orders.length;
    const palette = [
      { bar: "bg-orange-500", track: "bg-orange-100" },
      { bar: "bg-amber-500", track: "bg-amber-100" },
      { bar: "bg-slate-500", track: "bg-slate-200" },
      { bar: "bg-emerald-500", track: "bg-emerald-100" },
    ];
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([status, count], i) => ({
        label: ORDER_STATUS_LABELS[status as OrderStatus] ?? status,
        pct: Math.round((count / total) * 100),
        ...palette[i % palette.length],
      }));
  }, [recentOrders]);

  const sourceBreakdown = useMemo(() => {
    const orders = recentOrders || [];
    const sources = {
      in_house: { label: "In house", icon: Building2, tone: "bg-rose-50 text-rose-600" },
      online: { label: "Online", icon: Globe, tone: "bg-slate-100 text-slate-700" },
      takeaway: { label: "Take away", icon: Package, tone: "bg-orange-50 text-orange-700" },
      app: { label: "App", icon: Smartphone, tone: "bg-emerald-50 text-emerald-700" },
    };
    const counts = { in_house: 0, online: 0, takeaway: 0, app: 0 };
    for (const o of orders) {
      const s = (o.source || "").toLowerCase();
      if (s.includes("app")) counts.app += 1;
      else if (s.includes("take") || s.includes("pickup")) counts.takeaway += 1;
      else if (s.includes("online") || s.includes("web")) counts.online += 1;
      else counts.in_house += 1;
    }
    const hasAny = Object.values(counts).some((n) => n > 0);
    if (!hasAny && globalStats) {
      return [
        { ...sources.in_house, value: globalStats.totalRestaurants, label: "Restaurants" },
        { ...sources.online, value: globalStats.totalMenuItems, label: "Menu items" },
        { ...sources.takeaway, value: globalStats.totalDeals, label: "Active offers" },
        { ...sources.app, value: recentOrders?.length ?? 0, label: "Recent orders" },
      ];
    }
    return (Object.keys(counts) as (keyof typeof counts)[]).map((key) => ({
      ...sources[key],
      value: counts[key],
    }));
  }, [recentOrders, globalStats]);

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 animate-fade-in pb-4">
      {/* Welcome band */}
      <section className="relative overflow-hidden rounded-2xl gradient-hero text-primary-foreground shadow-[0_20px_48px_-18px_rgba(249,115,22,0.45),0_8px_20px_-10px_rgba(31,41,55,0.5)] animate-rise">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle at 18% 18%, rgba(249,115,22,0.35) 0, transparent 42%), radial-gradient(circle at 88% 12%, rgba(251,191,36,0.22) 0, transparent 38%), linear-gradient(135deg, transparent 38%, rgba(0,0,0,0.28) 100%)",
          }}
        />
        <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-7">
          <div className="space-y-3 min-w-0">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                Welcome back, {firstName}
              </h1>
              <p className="mt-1.5 max-w-xl text-sm text-white/75">
                {isSuperAdmin
                  ? "Snapshot of restaurants, catalog, and orders."
                  : `What’s happening at ${restaurantInfo?.name || "your restaurant"} today.`}
              </p>
            </div>
            <p className="flex items-center gap-2 text-sm text-white/65">
              <Calendar className="h-4 w-4 shrink-0" aria-hidden />
              {todayLabel}
            </p>
          </div>
        </div>
      </section>

      {/* Exactly 6 shortcut cards */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {quickActions.map(({ href, label, icon: Icon }, index) => (
          <Link
            key={href}
            to={href}
            style={{ animationDelay: `${index * 40}ms` }}
            className={cn(
              "group flex flex-col justify-between rounded-xl border border-border/80 bg-card p-4",
              "shadow-[0_1px_2px_rgba(15,40,35,0.04),0_8px_24px_-12px_rgba(15,40,35,0.08)]",
              "transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md animate-rise"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="rounded-lg bg-primary/10 p-2 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon className="h-5 w-5" aria-hidden />
              </div>
              <ArrowUpRight
                className="h-4 w-4 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                aria-hidden
              />
            </div>
            <span className="mt-3 text-sm font-semibold leading-snug text-foreground">{label}</span>
          </Link>
        ))}
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="xl:col-span-8 space-y-5">
          {!isSuperAdmin && (
            <Card className="rounded-xl border-border/80 shadow-[0_1px_2px_rgba(15,40,35,0.04),0_8px_24px_-12px_rgba(15,40,35,0.08)] overflow-hidden">
              <CardContent className="p-0">
                <div className="flex flex-wrap items-center justify-between gap-4 border-l-4 border-l-status-available bg-card px-5 py-4">
                  <div className="min-w-0 space-y-1">
                    <h3 className="text-lg font-bold tracking-tight">{restaurantInfo?.name || "Restaurant"}</h3>
                    <p className="text-sm text-muted-foreground">
                      {restaurantInfo?.is_active ? "Accepting orders" : "Currently closed"}
                    </p>
                  </div>
                  <Badge className="shrink-0 rounded-md bg-status-available/12 text-status-available border border-status-available/25 hover:bg-status-available/12">
                    ● Live
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {/* At a glance — no Drivers / Vehicles */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {statsLoading ? (
              <>
                <StatCardSkeleton />
                <StatCardSkeleton />
                <StatCardSkeleton />
              </>
            ) : (
              <>
                <StatsCard
                  title="Total restaurants"
                  value={globalStats?.totalRestaurants ?? 0}
                  icon={Store}
                  iconClassName="bg-slate-100 text-slate-700"
                />
                <StatsCard
                  title="Menu items"
                  value={globalStats?.totalMenuItems ?? 0}
                  icon={ChefHat}
                  iconClassName="bg-orange-50 text-orange-700"
                />
                <StatsCard
                  title="Active offers"
                  value={globalStats?.totalDeals ?? 0}
                  icon={Tag}
                  iconClassName="bg-amber-50 text-amber-800"
                />
              </>
            )}
          </div>

          {/* Total overview */}
          <Card className="rounded-xl border-border/80 shadow-[0_1px_2px_rgba(15,40,35,0.04),0_8px_24px_-12px_rgba(15,40,35,0.08)]">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base font-bold tracking-tight">Total overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {sourceBreakdown.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.label}
                      className="flex items-center gap-4 rounded-xl border border-border/70 bg-gradient-to-br from-muted/40 to-card p-4 transition-colors hover:border-primary/25"
                    >
                      <div className={cn("rounded-lg p-2.5", item.tone)}>
                        <Icon className="h-5 w-5" aria-hidden />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                          {item.label}
                        </p>
                        <p className="text-xl font-extrabold tabular-nums tracking-tight">
                          {Number(item.value).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Activity */}
          <Card className="rounded-xl border-border/80 shadow-[0_1px_2px_rgba(15,40,35,0.04),0_8px_24px_-12px_rgba(15,40,35,0.08)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-bold tracking-tight">Activity</CardTitle>
              <p className="text-sm text-muted-foreground">Status mix from recent orders</p>
            </CardHeader>
            <CardContent className="space-y-5">
              {statusActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  {restaurantId ? "No recent orders to summarize yet." : "Select a restaurant to see activity."}
                </p>
              ) : (
                statusActivity.map((row) => (
                  <div key={row.label} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold text-foreground">{row.label}</span>
                      <span className="tabular-nums text-muted-foreground font-medium">{row.pct}%</span>
                    </div>
                    <div className={cn("h-2 rounded-full overflow-hidden", row.track)}>
                      <div
                        className={cn("h-full rounded-full transition-all duration-500", row.bar)}
                        style={{ width: `${row.pct}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Order History — right column */}
        <div className="xl:col-span-4">
          <Card className="rounded-xl border-border/80 shadow-[0_1px_2px_rgba(15,40,35,0.04),0_8px_24px_-12px_rgba(15,40,35,0.08)] h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 border-b border-border/60">
              <CardTitle className="text-base font-bold tracking-tight">Order History</CardTitle>
              <Button asChild variant="outline" size="sm" className="h-8 rounded-lg gap-1.5 border-border/80">
                <Link to="/orders">
                  <Filter className="h-3.5 w-3.5" aria-hidden />
                  Filter
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="pt-4">
              {ordersLoading && restaurantId ? (
                <div className="space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-xl" />
                  ))}
                </div>
              ) : recentOrders && recentOrders.length > 0 ? (
                <ul className="space-y-1 max-h-[640px] overflow-y-auto custom-scrollbar -mx-1 px-1">
                  {recentOrders.map((o) => (
                    <li key={o.id}>
                      <Link
                        to={`/orders/${o.id}`}
                        className="flex items-center gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-muted/70"
                      >
                        <div
                          className={cn(
                            "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-sm font-bold",
                            avatarTone(o.customer_name || o.order_number)
                          )}
                        >
                          {(o.customer_name || "?").charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-foreground truncate">{o.customer_name}</p>
                          <p className="text-xs text-muted-foreground truncate">{o.order_number}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold tabular-nums text-foreground">
                            {formatCurrency(Number(o.total_amount))}
                          </p>
                          <p className="text-[11px] text-muted-foreground whitespace-nowrap">
                            {new Date(o.created_at).toLocaleString(undefined, {
                              hour: "2-digit",
                              minute: "2-digit",
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-4 py-12 text-center">
                  <ShoppingBag className="h-8 w-8 text-muted-foreground mb-3" aria-hidden />
                  <p className="font-medium text-foreground text-sm">
                    {restaurantId ? "No recent orders yet" : "Pick a restaurant context"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground max-w-[220px]">
                    {restaurantId
                      ? "New orders will show up here as customers check out."
                      : "Resolve an active restaurant to load order history."}
                  </p>
                  {restaurantId ? (
                    <Button asChild className="mt-4 rounded-lg" size="sm">
                      <Link to="/orders">Go to orders</Link>
                    </Button>
                  ) : isSuperAdmin ? (
                    <Button asChild className="mt-4 rounded-lg" size="sm" variant="outline">
                      <Link to="/restaurants">Manage restaurants</Link>
                    </Button>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
