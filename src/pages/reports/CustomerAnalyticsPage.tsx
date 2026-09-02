import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Users, Loader2, Repeat, UserPlus, DollarSign, ShoppingBag } from "lucide-react";
import { getApiBase } from "@/lib/apiBase";
import { getToken } from "@/lib/authStorage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportFilters } from "@/components/reports/ReportFilters";
import { useReportRestaurants } from "@/hooks/useReportRestaurants";
import { formatCurrency } from "@/lib/restaurant";
import { formatDate } from "@/i18n/formatters";

type CustomerRow = {
  restaurant_id: string;
  restaurant_name: string;
  customer_phone: string;
  customer_name: string;
  customer_email: string | null;
  order_count: number;
  total_spent: number;
  avg_order_value: number;
  last_order_at: string;
  first_order_at: string;
  is_repeat: boolean;
};

type CustomerAnalyticsResponse = {
  customers: CustomerRow[];
  summary: {
    total_orders: number;
    total_revenue: number;
    avg_order_value: number;
    unique_customers: number;
    repeat_customers: number;
    new_customers_30d: number;
    repeat_rate_pct: number;
    orders_per_customer: number;
    period_days: number | null;
  };
};

export default function CustomerAnalyticsPage() {
  const { t } = useTranslation(["reports", "common"]);
  const { data: meta, isLoading: metaLoading, error: metaError } = useReportRestaurants();
  const restaurants = meta?.restaurants ?? [];
  const [restaurantId, setRestaurantId] = useState("all");
  const [periodDays, setPeriodDays] = useState("0");
  const [limit, setLimit] = useState("25");

  useEffect(() => {
    if (restaurants.length === 1) {
      setRestaurantId(restaurants[0].restaurant_id);
    }
  }, [restaurants]);

  const { data, isLoading, error } = useQuery<CustomerAnalyticsResponse>({
    queryKey: ["customer-analytics", restaurantId, periodDays, limit],
    queryFn: async () => {
      const token = getToken();
      const params = new URLSearchParams();
      if (restaurantId !== "all") params.set("restaurant_id", restaurantId);
      if (periodDays !== "0") params.set("days", periodDays);
      params.set("limit", limit);
      const res = await fetch(`${getApiBase()}/api/stats/customer-analytics?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch customer analytics");
      return res.json();
    },
    enabled: !metaLoading && restaurants.length > 0,
    refetchInterval: 30000,
  });

  const rows = data?.customers ?? [];
  const summary = data?.summary;
  const showRestaurantCol = restaurantId === "all";
  const colSpan = showRestaurantCol ? 8 : 7;

  if (metaLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (metaError || restaurants.length === 0) {
    return (
      <div className="p-8 text-center bg-destructive/10 text-destructive rounded-xl border border-destructive/20">
        <p className="font-bold">{t("reports:noRestaurantAccess", "No restaurant access")}</p>
        <p className="text-sm">{t("reports:linkAccountPrompt", "Link your account to a restaurant to view customer analytics.")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-10 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Users className="h-8 w-8 text-primary" />
            {t("reports:customerAnalytics", "Customer analytics")}
          </h1>
          <p className="text-muted-foreground mt-1">{t("reports:customerAnalyticsDesc", "Spend, repeat orders, and top customers by phone")}</p>
        </div>
        <ReportFilters
          restaurants={restaurants}
          restaurantId={restaurantId}
          onRestaurantChange={setRestaurantId}
          periodDays={periodDays}
          onPeriodChange={setPeriodDays}
          showPeriod
          extra={
            <Select value={limit} onValueChange={setLimit}>
              <SelectTrigger className="w-full sm:w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">Top 25</SelectItem>
                <SelectItem value="50">Top 50</SelectItem>
                <SelectItem value="100">Top 100</SelectItem>
              </SelectContent>
            </Select>
          }
        />
      </div>

      {error ? (
        <div className="p-6 text-center bg-destructive/10 text-destructive rounded-xl border border-destructive/20">
          <p className="font-bold">{t("common:error", "Error loading analytics")}</p>
          <p className="text-sm">{(error as Error).message}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            <StatCard label={t("reports:uniqueCustomers", "Unique customers")} value={isLoading ? "…" : String(summary?.unique_customers ?? 0)} icon={Users} />
            <StatCard label={t("reports:repeatCustomers", "Repeat customers")} value={isLoading ? "…" : String(summary?.repeat_customers ?? 0)} icon={Repeat} />
            <StatCard label={t("reports:newCustomers30d", "New (30 days)")} value={isLoading ? "…" : String(summary?.new_customers_30d ?? 0)} icon={UserPlus} />
            <StatCard label={t("reports:repeatRate", "Repeat rate")} value={isLoading ? "…" : `${summary?.repeat_rate_pct ?? 0}%`} icon={Repeat} />
            <StatCard label={t("reports:totalRevenue", "Total revenue")} value={isLoading ? "…" : formatCurrency(summary?.total_revenue ?? 0)} icon={DollarSign} />
            <StatCard label={t("reports:avgOrderValue", "Avg order value")} value={isLoading ? "…" : formatCurrency(summary?.avg_order_value ?? 0)} icon={ShoppingBag} />
          </div>

          <Card className="border-none bg-card/50 backdrop-blur-sm shadow-xl overflow-hidden">
            <CardHeader>
              <CardTitle>{t("reports:topCustomers", "Top customers")}</CardTitle>
              <p className="text-sm text-muted-foreground font-normal">
                {t("reports:topCustomersDesc", "Grouped by phone number · excludes cancelled orders")}
                {periodDays !== "0" ? ` · ${t("reports:lastDays", { count: parseInt(periodDays) }) || `last ${periodDays} days`}` : ""}.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/50 text-muted-foreground font-medium border-y">
                    <tr>
                      {showRestaurantCol && <th className="px-6 py-4">{t("reports:colRestaurant", "Restaurant")}</th>}
                      <th className="px-6 py-4">{t("reports:colCustomer", "Customer")}</th>
                      <th className="px-6 py-4">{t("reports:colPhone", "Phone")}</th>
                      <th className="px-6 py-4 text-right">{t("reports:colOrders", "Orders")}</th>
                      <th className="px-6 py-4 text-right">{t("reports:colTotalSpent", "Total spent")}</th>
                      <th className="px-6 py-4 text-right">{t("reports:colAvgOrder", "Avg order")}</th>
                      <th className="px-6 py-4">{t("reports:colFirstOrder", "First order")}</th>
                      <th className="px-6 py-4">{t("reports:colLastOrder", "Last order")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {isLoading && (
                      <tr>
                        <td colSpan={colSpan} className="px-6 py-12 text-center">
                          <Loader2 className="h-6 w-6 animate-spin text-primary inline" />
                        </td>
                      </tr>
                    )}
                    {!isLoading &&
                      rows.map((row) => (
                        <tr key={`${row.restaurant_id}-${row.customer_phone}`} className="hover:bg-muted/30">
                          {showRestaurantCol && (
                            <td className="px-6 py-4 font-medium">{row.restaurant_name}</td>
                          )}
                          <td className="px-6 py-4">
                            <div className="font-semibold">{row.customer_name}</div>
                            {row.is_repeat && (
                              <Badge variant="outline" className="mt-1 text-[10px]">
                                {t("reports:repeat", "Repeat")}
                              </Badge>
                            )}
                          </td>
                          <td className="px-6 py-4 font-mono text-xs">{row.customer_phone}</td>
                          <td className="px-6 py-4 text-right tabular-nums">{row.order_count}</td>
                          <td className="px-6 py-4 text-right font-medium tabular-nums">
                            {formatCurrency(row.total_spent)}
                          </td>
                          <td className="px-6 py-4 text-right tabular-nums">
                            {formatCurrency(row.avg_order_value)}
                          </td>
                          <td className="px-6 py-4 text-muted-foreground">{formatDate(row.first_order_at)}</td>
                          <td className="px-6 py-4 text-muted-foreground">{formatDate(row.last_order_at)}</td>
                        </tr>
                      ))}
                    {!isLoading && rows.length === 0 && (
                      <tr>
                        <td colSpan={colSpan} className="px-6 py-8 text-center text-muted-foreground">
                          {t("reports:noDataPeriod", "No customer data for this period.")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="bg-card/50 backdrop-blur-sm border-none shadow-lg">
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{label}</p>
            <p className="text-lg font-bold mt-0.5 truncate">{value}</p>
          </div>
          <Icon className="h-5 w-5 text-primary flex-shrink-0" />
        </div>
      </CardContent>
    </Card>
  );
}

