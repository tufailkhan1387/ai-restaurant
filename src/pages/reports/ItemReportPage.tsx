import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { UtensilsCrossed, Loader2, DollarSign, ShoppingCart } from "lucide-react";
import { getApiBase } from "@/lib/apiBase";
import { getToken } from "@/lib/authStorage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface EarningStats {
  restaurants: {
    restaurant_id: string;
    restaurant_name: string;
  }[];
}

interface ItemReportRow {
  restaurant_id: string;
  restaurant_name: string;
  menu_item_id: string | null;
  item_name: string;
  quantity_sold: number;
  order_count: number;
  revenue: number;
}

interface ItemReportResponse {
  items: ItemReportRow[];
}

export default function ItemReportPage() {
  const [restaurantId, setRestaurantId] = useState("all");

  const { data: earningsMeta, isLoading: metaLoading, error: metaError } = useQuery<EarningStats>({
    queryKey: ["restaurant-reports"],
    queryFn: async () => {
      const token = getToken();
      const res = await fetch(`${getApiBase()}/api/stats/earnings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load restaurants for filter");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const {
    data: itemData,
    isLoading: itemsLoading,
    error: itemsError,
  } = useQuery<ItemReportResponse>({
    queryKey: ["item-reports", restaurantId],
    queryFn: async () => {
      const token = getToken();
      const params = new URLSearchParams();
      if (restaurantId !== "all") {
        params.set("restaurant_id", restaurantId);
      }
      const qs = params.toString();
      const url = `${getApiBase()}/api/stats/item-reports${qs ? `?${qs}` : ""}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch item reports");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const restaurants = earningsMeta?.restaurants || [];
  const itemRows = itemData?.items || [];
  const itemTotals = useMemo(
    () =>
      itemRows.reduce(
        (acc, row) => {
          acc.revenue += row.revenue;
          acc.units += row.quantity_sold;
          return acc;
        },
        { revenue: 0, units: 0 }
      ),
    [itemRows]
  );

  const showRestaurantCol = restaurantId === "all";
  const itemTableColSpan = showRestaurantCol ? 5 : 4;

  const fmtCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

  if (metaLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (metaError) {
    return (
      <div className="p-8 text-center bg-destructive/10 text-destructive rounded-xl border border-destructive/20">
        <p className="font-bold">Error loading item report</p>
        <p className="text-sm">{(metaError as Error).message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <UtensilsCrossed className="h-8 w-8 text-primary" />
            Item report
          </h1>
          <p className="text-muted-foreground mt-1">Menu item sales from completed deliveries</p>
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

      {itemsError ? (
        <div className="p-6 text-center bg-destructive/10 text-destructive rounded-xl border border-destructive/20">
          <p className="font-bold">Error loading item data</p>
          <p className="text-sm">{(itemsError as Error).message}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-card/50 backdrop-blur-sm border-none shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Item revenue</p>
                    <p className="text-2xl font-bold">
                      {itemsLoading ? "…" : fmtCurrency(itemTotals.revenue)}
                    </p>
                  </div>
                  <DollarSign className="h-6 w-6 text-primary" />
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card/50 backdrop-blur-sm border-none shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Units sold</p>
                    <p className="text-2xl font-bold">{itemsLoading ? "…" : itemTotals.units}</p>
                  </div>
                  <ShoppingCart className="h-6 w-6 text-status-available" />
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card/50 backdrop-blur-sm border-none shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">SKU rows</p>
                    <p className="text-2xl font-bold">{itemsLoading ? "…" : itemRows.length}</p>
                  </div>
                  <UtensilsCrossed className="h-6 w-6 text-status-on-call" />
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-none bg-card/50 backdrop-blur-sm shadow-xl overflow-hidden">
            <CardHeader>
              <CardTitle>Menu item report</CardTitle>
              <p className="text-sm text-muted-foreground font-normal">
                Line items from delivered and completed orders only.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/50 text-muted-foreground font-medium border-y">
                    <tr>
                      {showRestaurantCol && <th className="px-6 py-4">Restaurant</th>}
                      <th className="px-6 py-4">Item</th>
                      <th className="px-6 py-4 text-right">Quantity</th>
                      <th className="px-6 py-4 text-right">Orders</th>
                      <th className="px-6 py-4 text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {itemsLoading && (
                      <tr>
                        <td colSpan={itemTableColSpan} className="px-6 py-12 text-center text-muted-foreground">
                          <Loader2 className="h-6 w-6 animate-spin text-primary inline" />
                        </td>
                      </tr>
                    )}
                    {!itemsLoading &&
                      itemRows.map((row, idx) => (
                        <tr
                          key={`${row.restaurant_id}-${row.menu_item_id ?? "na"}-${row.item_name}-${idx}`}
                          className="hover:bg-muted/30 transition-colors"
                        >
                          {showRestaurantCol && (
                            <td className="px-6 py-4 font-medium text-foreground">{row.restaurant_name}</td>
                          )}
                          <td className="px-6 py-4">
                            <span className="font-semibold text-foreground">{row.item_name}</span>
                            {row.menu_item_id && (
                              <span className="block text-xs text-muted-foreground font-mono truncate max-w-[220px]">
                                {row.menu_item_id}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">{row.quantity_sold}</td>
                          <td className="px-6 py-4 text-right">{row.order_count}</td>
                          <td className="px-6 py-4 text-right font-medium">{fmtCurrency(row.revenue)}</td>
                        </tr>
                      ))}
                    {!itemsLoading && itemRows.length === 0 && (
                      <tr>
                        <td colSpan={itemTableColSpan} className="px-6 py-8 text-center text-muted-foreground">
                          No item sales for the selected restaurant.
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
