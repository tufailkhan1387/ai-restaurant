import { useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { UtensilsCrossed, Loader2, DollarSign, ShoppingCart } from "lucide-react";
import { getApiBase } from "@/lib/apiBase";
import { getToken } from "@/lib/authStorage";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/restaurant";

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
  const { t } = useTranslation(["reports", "common"]);
  const { role } = useAuth();
  const isSuperAdmin = role === "super_admin";
  const [restaurantId, setRestaurantId] = useState("");

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

  const restaurants = earningsMeta?.restaurants || [];

  useEffect(() => {
    if (restaurants.length > 0 && (!restaurantId || !restaurants.some((r) => r.restaurant_id === restaurantId))) {
      setRestaurantId(restaurants[0].restaurant_id);
    }
  }, [restaurants, restaurantId]);

  const {
    data: itemData,
    isLoading: itemsLoading,
    error: itemsError,
  } = useQuery<ItemReportResponse>({
    queryKey: ["item-reports", restaurantId],
    queryFn: async () => {
      const token = getToken();
      const params = new URLSearchParams();
      if (restaurantId) {
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
    enabled: Boolean(restaurantId),
    refetchInterval: 30000,
  });

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

  const showRestaurantCol = false;
  const itemTableColSpan = 4;

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
        <p className="font-bold">{t("common:error", "Error loading item report")}</p>
        <p className="text-sm">{(metaError as Error).message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-10 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <UtensilsCrossed className="h-8 w-8 text-primary" />
            {t("reports:itemReport", "Item report")}
          </h1>
          <p className="text-muted-foreground mt-1">{t("reports:itemReportDesc", "Menu item sales from completed deliveries")}</p>
        </div>
        {isSuperAdmin && restaurants.length > 1 && (
          <Select value={restaurantId} onValueChange={setRestaurantId}>
            <SelectTrigger className="w-full md:w-[280px]">
              <SelectValue placeholder={t("reports:filterByRestaurant", "Filter by restaurant")} />
            </SelectTrigger>
            <SelectContent>
              {restaurants.map((r) => (
                <SelectItem key={r.restaurant_id} value={r.restaurant_id}>
                  {r.restaurant_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {itemsError ? (
        <div className="p-6 text-center bg-destructive/10 text-destructive rounded-xl border border-destructive/20">
          <p className="font-bold">{t("common:error", "Error loading item data")}</p>
          <p className="text-sm">{(itemsError as Error).message}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-card/50 backdrop-blur-sm border-none shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{t("reports:itemRevenue", "Item revenue")}</p>
                    <p className="text-2xl font-bold">
                      {itemsLoading ? "…" : formatCurrency(itemTotals.revenue)}
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
                    <p className="text-sm text-muted-foreground">{t("reports:unitsSold", "Units sold")}</p>
                    <p className="text-2xl font-bold">{itemsLoading ? "…" : itemTotals.units}</p>
                  </div>
                  <ShoppingCart className="h-6 w-6 text-emerald-600" />
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card/50 backdrop-blur-sm border-none shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{t("reports:skuRows", "SKU rows")}</p>
                    <p className="text-2xl font-bold">{itemsLoading ? "…" : itemRows.length}</p>
                  </div>
                  <UtensilsCrossed className="h-6 w-6 text-primary" />
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-none bg-card/50 backdrop-blur-sm shadow-xl overflow-hidden">
            <CardHeader>
              <CardTitle>{t("reports:menuItemReport", "Menu item report")}</CardTitle>
              <p className="text-sm text-muted-foreground font-normal">
                {t("reports:deliveredAndCompletedOrdersDesc", "Line items from delivered and completed orders only.")}
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/50 text-muted-foreground font-medium border-y">
                    <tr>
                      {showRestaurantCol && <th className="px-6 py-4">{t("reports:colRestaurant", "Restaurant")}</th>}
                      <th className="px-6 py-4">{t("reports:colProduct", "Item")}</th>
                      <th className="px-6 py-4 text-right">{t("reports:colQuantity", "Quantity")}</th>
                      <th className="px-6 py-4 text-right">{t("reports:colOrders", "Orders")}</th>
                      <th className="px-6 py-4 text-right">{t("reports:colRevenue", "Revenue")}</th>
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
                          <td className="px-6 py-4 text-right font-medium">{formatCurrency(row.revenue)}</td>
                        </tr>
                      ))}
                    {!itemsLoading && itemRows.length === 0 && (
                      <tr>
                        <td colSpan={itemTableColSpan} className="px-6 py-8 text-center text-muted-foreground">
                          {t("reports:noItemSales", "No item sales for the selected restaurant.")}
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

