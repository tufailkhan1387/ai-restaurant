import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Store, Loader2, DollarSign, ShoppingCart } from "lucide-react";
import { getApiBase } from "@/lib/apiBase";
import { getToken } from "@/lib/authStorage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface EarningStats {
  restaurants: {
    restaurant_id: string;
    restaurant_name: string;
    commission_rate: number;
    total_sales: number;
    order_count: number;
    admin_earning: number;
    restaurant_earning: number;
  }[];
}

export default function RestaurantReportPage() {
  const [restaurantId, setRestaurantId] = useState("all");

  const { data, isLoading, error } = useQuery<EarningStats>({
    queryKey: ["restaurant-reports"],
    queryFn: async () => {
      const token = getToken();
      const res = await fetch(`${getApiBase()}/api/stats/earnings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch restaurant reports");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const restaurants = data?.restaurants || [];
  const filtered = useMemo(
    () =>
      restaurantId === "all"
        ? restaurants
        : restaurants.filter((r) => r.restaurant_id === restaurantId),
    [restaurants, restaurantId]
  );

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, curr) => {
          acc.sales += curr.total_sales;
          acc.orders += curr.order_count;
          return acc;
        },
        { sales: 0, orders: 0 }
      ),
    [filtered]
  );

  const fmtCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center bg-destructive/10 text-destructive rounded-xl border border-destructive/20">
        <p className="font-bold">Error loading restaurant report</p>
        <p className="text-sm">{(error as Error).message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <Store className="h-8 w-8 text-primary" />
            Restaurant report
          </h1>
          <p className="text-muted-foreground mt-1">Sales and commission by restaurant</p>
        </div>
        <Select value={restaurantId} onValueChange={setRestaurantId}>
          <SelectTrigger className="w-full md:w-[280px]">
            <SelectValue placeholder="Filter by restaurant" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Restaurants</SelectItem>
            {restaurants.map((r) => (
              <SelectItem key={r.restaurant_id} value={r.restaurant_id}>
                {r.restaurant_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card/50 backdrop-blur-sm border-none shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Sales</p>
                <p className="text-2xl font-bold">{fmtCurrency(totals.sales)}</p>
              </div>
              <DollarSign className="h-6 w-6 text-primary" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur-sm border-none shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Orders</p>
                <p className="text-2xl font-bold">{totals.orders}</p>
              </div>
              <ShoppingCart className="h-6 w-6 text-status-available" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 backdrop-blur-sm border-none shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Restaurants Included</p>
                <p className="text-2xl font-bold">{filtered.length}</p>
              </div>
              <Store className="h-6 w-6 text-status-on-call" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-none bg-card/50 backdrop-blur-sm shadow-xl overflow-hidden">
        <CardHeader>
          <CardTitle>Restaurant report details</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground font-medium border-y">
                <tr>
                  <th className="px-6 py-4">Restaurant</th>
                  <th className="px-6 py-4 text-right">Orders</th>
                  <th className="px-6 py-4 text-right">Sales</th>
                  <th className="px-6 py-4 text-right">Commission %</th>
                  <th className="px-6 py-4 text-right">Admin Earnings</th>
                  <th className="px-6 py-4 text-right">Restaurant Earnings</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((row) => (
                  <tr key={row.restaurant_id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 font-semibold text-foreground">{row.restaurant_name}</td>
                    <td className="px-6 py-4 text-right">{row.order_count}</td>
                    <td className="px-6 py-4 text-right">{fmtCurrency(row.total_sales)}</td>
                    <td className="px-6 py-4 text-right">{row.commission_rate}%</td>
                    <td className="px-6 py-4 text-right text-primary font-medium">{fmtCurrency(row.admin_earning)}</td>
                    <td className="px-6 py-4 text-right text-status-available font-medium">
                      {fmtCurrency(row.restaurant_earning)}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                      No report data available for this restaurant.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
