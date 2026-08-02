import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  type LucideIcon,
  ShoppingBag,
  ChefHat,
  Store,
  Tag,
  Bike,
  Car,
  Phone,
  MapPin,
  Hash,
  CreditCard,
  Mail,
  LayoutDashboard,
  Calendar,
  ArrowUpRight,
  BarChart2,
  DollarSign,
} from "lucide-react";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { getToken } from "@/lib/authStorage";
import { useActiveRestaurant } from "@/hooks/useActiveRestaurant";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS, OrderStatus, formatCurrency } from "@/lib/restaurant";
import { getApiBase } from "@/lib/apiBase";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

function StatCardSkeleton() {
  return (
    <Card className="border-border/80">
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-16" />
          </div>
          <Skeleton className="h-12 w-12 rounded-xl shrink-0" />
        </div>
      </CardContent>
    </Card>
  );
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

  const quickActions = useMemo(() => {
    const base: { href: string; label: string; icon: LucideIcon }[] = [
      { href: "/orders", label: "Orders", icon: ShoppingBag },
      { href: "/menu", label: "Menu", icon: ChefHat },
      { href: "/deals", label: "Deals & offers", icon: Tag },
    ];
    if (isSuperAdmin) {
      return [
        ...base,
        { href: "/restaurants", label: "Restaurants", icon: Store },
        { href: "/earnings", label: "Earnings", icon: DollarSign },
        { href: "/reports/restaurant", label: "Reports", icon: BarChart2 },
      ];
    }
    return base;
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
        .limit(8);
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

  const { data: fleetCounts } = useQuery({
    queryKey: ["dashboard-fleet-counts", restaurantId],
    enabled: !!restaurantId && !isSuperAdmin,
    queryFn: async () => {
      const rid = restaurantId!;
      const [{ data: drLinks }, { data: legacyDrivers }, vehRes] = await Promise.all([
        supabase.from("driver_restaurants").select("driver_id").eq("restaurant_id", rid),
        supabase.from("drivers").select("id").eq("restaurant_id", rid),
        supabase.from("vehicles").select("id", { count: "exact", head: true }).eq("restaurant_id", rid),
      ]);
      const driverIds = new Set<string>();
      for (const r of (drLinks as { driver_id: string }[] | null) ?? []) driverIds.add(r.driver_id);
      for (const r of (legacyDrivers as { id: string }[] | null) ?? []) driverIds.add(r.id);
      return {
        drivers: driverIds.size,
        vehicles: typeof vehRes.count === "number" ? vehRes.count : 0,
      };
    },
    refetchInterval: 60000,
  });

  const statGridClass = cn(
    "grid grid-cols-1 gap-4",
    isSuperAdmin ? "sm:grid-cols-2 xl:grid-cols-5" : "md:grid-cols-3"
  );

  return (
    <div className="mx-auto max-w-7xl space-y-8 animate-fade-in pb-4">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/[0.08] blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-accent/[0.06] blur-3xl"
          aria-hidden
        />
        <div className="relative flex flex-col gap-6 p-6 sm:p-8 md:flex-row md:items-end md:justify-between">
          <div className="space-y-4 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="rounded-full px-3 font-normal text-muted-foreground">
                <LayoutDashboard className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Dashboard
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  "rounded-full border font-normal",
                  isSuperAdmin
                    ? "border-primary/25 bg-primary/5 text-primary"
                    : "border-status-available/30 bg-status-available/5 text-status-available"
                )}
              >
                {isSuperAdmin ? "Platform admin" : "Restaurant"}
              </Badge>
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Welcome back, {firstName}
              </h1>
              <p className="mt-2 max-w-2xl text-muted-foreground leading-relaxed">
                {isSuperAdmin
                  ? "Snapshot of restaurants, catalog, promos, and fleet. Jump into orders or reports anytime."
                  : `Here’s what’s happening at ${restaurantInfo?.name || "your restaurant"} today.`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <Calendar className="h-4 w-4 shrink-0 text-primary/80" aria-hidden />
                {todayLabel}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Quick actions */}
      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Shortcuts</h2>
            <p className="text-sm text-muted-foreground">Open the tools you use most</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {quickActions.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              to={href}
              className={cn(
                "group flex flex-col justify-between rounded-xl border border-border/80 bg-card p-4 shadow-sm",
                "transition-all duration-200 hover:border-primary/25 hover:shadow-md hover:bg-primary/[0.02]"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
              </div>
              <span className="mt-3 text-sm font-medium leading-snug text-foreground">{label}</span>
            </Link>
          ))}
        </div>
      </section>

      {!isSuperAdmin && (
        <Card className="overflow-hidden border-primary/15 bg-gradient-to-br from-primary/[0.07] via-card to-card shadow-sm">
          <CardContent className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 space-y-3">
                <div>
                  <h3 className="text-lg font-semibold tracking-tight">{restaurantInfo?.name || "Restaurant"}</h3>
                  <p className="text-sm text-muted-foreground">
                    {restaurantInfo?.is_active ? "Accepting orders" : "Currently closed"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Bike className="h-4 w-4 shrink-0 text-foreground/70" aria-hidden />
                    <span>
                      <span className="font-semibold tabular-nums text-foreground">{fleetCounts?.drivers ?? "—"}</span>{" "}
                      drivers
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Car className="h-4 w-4 shrink-0 text-foreground/70" aria-hidden />
                    <span>
                      <span className="font-semibold tabular-nums text-foreground">{fleetCounts?.vehicles ?? "—"}</span>{" "}
                      vehicles
                    </span>
                  </div>
                </div>
              </div>
              <Badge
                variant="default"
                className="shrink-0 bg-status-available/12 text-status-available border border-status-available/25"
              >
                ● Live
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPIs */}
      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold tracking-tight">At a glance</h2>
          <p className="text-sm text-muted-foreground">Counts across the platform</p>
        </div>
        <div className={statGridClass}>
          {statsLoading ? (
            <>
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
              {isSuperAdmin && (
                <>
                  <StatCardSkeleton />
                  <StatCardSkeleton />
                </>
              )}
            </>
          ) : (
            <>
              <StatsCard
                title="Total restaurants"
                value={globalStats?.totalRestaurants ?? 0}
                icon={Store}
                iconClassName="bg-blue-500/10 text-blue-600 dark:text-blue-400"
              />
              <StatsCard
                title="Menu items"
                value={globalStats?.totalMenuItems ?? 0}
                icon={ChefHat}
                iconClassName="bg-violet-500/10 text-violet-600 dark:text-violet-400"
              />
              <StatsCard
                title="Active offers"
                value={globalStats?.totalDeals ?? 0}
                icon={Tag}
                iconClassName="bg-pink-500/10 text-pink-600 dark:text-pink-400"
              />
              {isSuperAdmin && (
                <>
                  <StatsCard
                    title="Drivers"
                    value={globalStats?.totalDrivers ?? 0}
                    icon={Bike}
                    iconClassName="bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  />
                  <StatsCard
                    title="Vehicles"
                    value={globalStats?.totalVehicles ?? 0}
                    icon={Car}
                    iconClassName="bg-slate-500/10 text-slate-600 dark:text-slate-400"
                  />
                </>
              )}
            </>
          )}
        </div>
      </section>

      {/* Recent orders */}
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-2">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ShoppingBag className="h-5 w-5" aria-hidden />
              </span>
              Recent orders
            </CardTitle>
            <CardDescription>Latest activity for the active restaurant — refreshes every 15 seconds</CardDescription>
          </div>
          {restaurantId ? (
            <Button asChild variant="outline" size="sm" className="shrink-0 gap-1">
              <Link to="/orders">
                View all
                <ArrowUpRight className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
          ) : null}
        </CardHeader>
        <Separator />
        <CardContent className="pt-6">
          {ordersLoading && restaurantId ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : recentOrders && recentOrders.length > 0 ? (
            <>
              <div className="hidden md:block rounded-lg border border-border/60">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Order</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Placed</TableHead>
                      <TableHead className="w-[100px] text-right"> </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentOrders.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="font-medium">{o.order_number}</TableCell>
                        <TableCell>
                          <div className="max-w-[200px] truncate font-medium">{o.customer_name}</div>
                          <div className="truncate text-xs text-muted-foreground">{o.customer_phone}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={ORDER_STATUS_COLORS[o.status as OrderStatus] ?? ""}>
                            {ORDER_STATUS_LABELS[o.status as OrderStatus] ?? o.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatCurrency(Number(o.total_amount))}
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap text-sm">
                          {new Date(o.created_at).toLocaleString(undefined, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild size="sm" variant="ghost" className="gap-1">
                            <Link to={`/orders/${o.id}`}>
                              Details
                              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-3 md:hidden">
                {recentOrders.map((o) => (
                  <div
                    key={o.id}
                    className="rounded-xl border border-border/80 bg-card text-card-foreground shadow-sm overflow-hidden"
                  >
                    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-2 flex-1">
                        <div className="flex flex-wrap items-center gap-2 gap-y-1">
                          <span className="font-semibold">{o.order_number}</span>
                          <span className="text-muted-foreground">·</span>
                          <span className="font-medium truncate">{o.customer_name}</span>
                          <Badge variant="outline" className={ORDER_STATUS_COLORS[o.status as OrderStatus] ?? ""}>
                            {ORDER_STATUS_LABELS[o.status as OrderStatus] ?? o.status}
                          </Badge>
                        </div>
                        <div className="grid gap-x-6 gap-y-1 text-sm text-muted-foreground sm:grid-cols-2">
                          <p className="flex items-start gap-2 min-w-0">
                            <Phone className="h-4 w-4 shrink-0 mt-0.5 text-foreground/60" aria-hidden />
                            <span className="truncate">{o.customer_phone}</span>
                          </p>
                          {o.customer_email && (
                            <p className="flex items-start gap-2 min-w-0 truncate" title={o.customer_email}>
                              <Mail className="h-4 w-4 shrink-0 mt-0.5 text-foreground/60" aria-hidden />
                              <span className="truncate">{o.customer_email}</span>
                            </p>
                          )}
                          <p className="flex items-start gap-2 min-w-0 sm:col-span-2">
                            <MapPin className="h-4 w-4 shrink-0 mt-0.5 text-foreground/60" aria-hidden />
                            <span className="line-clamp-2">{o.delivery_address}</span>
                          </p>
                          <p className="flex items-center gap-2">
                            <Hash className="h-4 w-4 shrink-0 text-foreground/60" aria-hidden />
                            <span className="font-mono text-xs">{o.tracking_code}</span>
                          </p>
                          <p className="flex items-center gap-2">
                            <CreditCard className="h-4 w-4 shrink-0 text-foreground/60" aria-hidden />
                            <span className="capitalize">
                              {o.payment_method}
                              {o.payment_status ? (
                                <span className="text-muted-foreground normal-case"> · {o.payment_status}</span>
                              ) : null}
                            </span>
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground border-t border-border/60 pt-2 mt-1">
                          <span>
                            Placed{" "}
                            <span className="text-foreground font-medium">
                              {new Date(o.created_at).toLocaleString(undefined, {
                                dateStyle: "medium",
                                timeStyle: "short",
                              })}
                            </span>
                          </span>
                          <span>
                            Source: <span className="text-foreground capitalize">{o.source || "—"}</span>
                          </span>
                          {o.estimated_delivery_at && (
                            <span>
                              Est. delivery:{" "}
                              <span className="text-foreground">
                                {new Date(o.estimated_delivery_at).toLocaleString(undefined, {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                })}
                              </span>
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
                          <span>
                            Subtotal{" "}
                            <span className="text-foreground tabular-nums">{formatCurrency(Number(o.subtotal))}</span>
                          </span>
                          <span>
                            Tax <span className="text-foreground tabular-nums">{formatCurrency(Number(o.tax_amount))}</span>
                          </span>
                          <span>
                            Delivery{" "}
                            <span className="text-foreground tabular-nums">{formatCurrency(Number(o.delivery_fee))}</span>
                          </span>
                          <span className="font-medium text-foreground">
                            Total <span className="tabular-nums">{formatCurrency(Number(o.total_amount))}</span>
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-row sm:flex-col gap-2 sm:items-end">
                        <Button asChild size="sm" variant="outline">
                          <Link to={`/orders/${o.id}`}>Details</Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-6 py-14 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <ShoppingBag className="h-6 w-6 text-muted-foreground" aria-hidden />
              </div>
              <p className="font-medium text-foreground">
                {restaurantId ? "No recent orders yet" : "Pick a restaurant context"}
              </p>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                {restaurantId
                  ? "New orders will appear here as customers check out. You can monitor everything from the orders page."
                  : "We could not resolve an active restaurant. Check memberships or add a restaurant to get started."}
              </p>
              {restaurantId ? (
                <Button asChild className="mt-6" variant="default">
                  <Link to="/orders">Go to orders</Link>
                </Button>
              ) : isSuperAdmin ? (
                <Button asChild className="mt-6" variant="outline">
                  <Link to="/restaurants">Manage restaurants</Link>
                </Button>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
