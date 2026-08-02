// src/pages/reports/InventoryReportPage.tsx
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, Loader2, ExternalLink } from "lucide-react";
import { getApiBase } from "@/lib/apiBase";
import { getToken } from "@/lib/authStorage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableCell } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ReportFilters } from "@/components/reports/ReportFilters";
import { useReportRestaurants } from "@/hooks/useReportRestaurants";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// Types returned from the new backend endpoint
type InventoryItem = {
  id: string;
  name: string;
  restaurant_name?: string | null;
  stock_quantity: number | null;
  sold_quantity: number;
  remaining_quantity: number | null;
  last_updated: string | null;
};

type InventoryResponse = {
  data: InventoryItem[];
  limit: number;
  offset: number;
};

export default function InventoryReportPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [savingItemId, setSavingItemId] = useState<string | null>(null);

  // Load restaurant list – used for the restaurant selector in the filters
  const { data: meta, isLoading: metaLoading, error: metaError } = useReportRestaurants();
  const restaurants = meta?.restaurants ?? [];
  const [restaurantId, setRestaurantId] = useState("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Reset selected ids when restaurant changes
  useEffect(() => {
    setSelectedIds([]);
  }, [restaurantId]);

  // Auto‑select the sole restaurant if the user only belongs to one
  useEffect(() => {
    if (restaurants.length === 1) setRestaurantId(restaurants[0].restaurant_id);
  }, [restaurants]);

  // Pull inventory data from the backend
  const { data, isLoading, error } = useQuery<InventoryResponse>({
    queryKey: ["inventory-report", restaurantId],
    queryFn: async () => {
      const token = getToken();
      const params = new URLSearchParams();
      if (restaurantId !== "all") params.set("restaurant_id", restaurantId);
      const qs = params.toString();
      const res = await fetch(`${getApiBase()}/api/inventory/report${qs ? `?${qs}` : ""}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch inventory report");
      return res.json();
    },
    enabled: !metaLoading && restaurants.length > 0,
    refetchInterval: 30_000,
  });

  const items = data?.data ?? [];
  const showRestaurantCol = restaurantId === "all";

  const handleUpdateStock = async (itemId: string, newStock: number) => {
    setSavingItemId(itemId);
    try {
      const { error } = await supabase
        .from("menu_items")
        .update({
          stock_quantity: newStock,
          is_available: newStock > 0,
        })
        .eq("id", itemId);

      if (error) throw error;

      toast({
        title: "Stock updated",
        description: `Successfully updated stock quantity to ${newStock}.`,
      });

      queryClient.invalidateQueries({ queryKey: ["inventory-report", restaurantId] });

      // Trigger AI sync if a specific restaurant is selected
      if (restaurantId && restaurantId !== "all") {
        await supabase.functions.invoke("sync-restaurant-menu-to-agent", {
          body: { restaurant_id: restaurantId },
        });
      }
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: e.message || "Failed to update stock quantity.",
      });
    } finally {
      setSavingItemId(null);
    }
  };

  const handleBulkUpdateStock = async () => {
    const value = prompt(`Enter new stock quantity for the ${selectedIds.length} selected items:`);
    if (value === null) return;
    const newStock = parseInt(value, 10);
    if (isNaN(newStock) || newStock < 0) {
      toast({
        variant: "destructive",
        title: "Invalid input",
        description: "Please enter a valid non-negative number.",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from("menu_items")
        .update({
          stock_quantity: newStock,
          is_available: newStock > 0,
        })
        .in("id", selectedIds);

      if (error) throw error;

      toast({
        title: "Bulk stock updated",
        description: `Successfully updated stock quantity to ${newStock} for ${selectedIds.length} items.`,
      });

      setSelectedIds([]);
      queryClient.invalidateQueries({ queryKey: ["inventory-report", restaurantId] });

      if (restaurantId && restaurantId !== "all") {
        await supabase.functions.invoke("sync-restaurant-menu-to-agent", {
          body: { restaurant_id: restaurantId },
        });
      }
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Bulk update failed",
        description: e.message || "Failed to update stock quantity.",
      });
    }
  };

  // UI states
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
        <p className="font-bold">No restaurant access</p>
        <p className="text-sm">
          Link your account to a restaurant to view inventory data.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* Header + Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Boxes className="h-8 w-8 text-primary" /> Inventory Report
          </h1>
          <p className="text-muted-foreground mt-1">
            Stock levels, sales, and remaining quantities for each tracked item.
          </p>
        </div>
        <ReportFilters
          restaurants={restaurants}
          restaurantId={restaurantId}
          onRestaurantChange={setRestaurantId}
          extra={
            <>
              {/* Simple limit selector – the backend already returns a paginated list */}
              <select
                value="100"
                onChange={(e) => {
                  // In a real app we would store this limit; for now we keep the default.
                }}
                className="rounded border px-2 py-1 text-sm bg-background"
              >
                <option value="50">Top 50</option>
                <option value="100">Top 100</option>
                <option value="200">Top 200</option>
              </select>
            </>
          }
        />
      </div>

      {restaurantId === "all" && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-600 dark:text-yellow-500 p-4 rounded-xl text-sm font-medium flex items-center gap-2">
          <span>⚠️</span>
          <span>To update stock levels, please select a specific restaurant using the filter dropdown above.</span>
        </div>
      )}

      {/* Error handling */}
      {error ? (
        <div className="p-6 text-center bg-destructive/10 text-destructive rounded-xl border border-destructive/20">
          <p className="font-bold">Error loading report</p>
          <p className="text-sm">{(error as Error).message}</p>
        </div>
      ) : (
        <Card className="border-none bg-card/50 backdrop-blur-sm shadow-xl overflow-hidden">
          <CardHeader>
            <CardTitle>Inventory Details</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table className="w-full text-sm text-left">
                <TableHeader>
                  <TableRow>
                    {restaurantId !== "all" && (
                      <TableCell className="px-6 py-4 w-14">
                        {/* checkbox header */}
                      </TableCell>
                    )}
                    <TableCell className="px-6 py-4 w-14">#</TableCell>
                    {showRestaurantCol && (
                      <TableCell className="px-6 py-4">Restaurant</TableCell>
                    )}
                    <TableCell className="px-6 py-4">Item</TableCell>
                    <TableCell className="px-6 py-4 text-right">Stock</TableCell>
                    <TableCell className="px-6 py-4 text-right">Sold</TableCell>
                    <TableCell className="px-6 py-4 text-right">Remaining</TableCell>
                    <TableCell className="px-6 py-4 text-right">Last Updated</TableCell>
                  </TableRow>
                </TableHeader>
                <tbody className="divide-y">
                  {/* Loading state */}
                  {isLoading && (
                    <TableRow>
                      <TableCell colSpan={7} className="px-6 py-12 text-center">
                        <Loader2 className="h-6 w-6 animate-spin text-primary inline" />
                      </TableCell>
                    </TableRow>
                  )}
                  {/* Data rows */}
                  {!isLoading &&
                    items.map((item, idx) => (
                      <TableRow key={item.id} className="hover:bg-muted/30">
                        {restaurantId !== "all" && (
                          <TableCell className="px-6 py-4">
                            <Checkbox
                              checked={selectedIds.includes(item.id)}
                              onCheckedChange={(checked) => {
                                setSelectedIds((prev) =>
                                  checked
                                    ? [...prev, item.id]
                                    : prev.filter((id) => id !== item.id)
                                );
                              }}
                            />
                          </TableCell>
                        )}
                        <TableCell className="px-6 py-4">
                          <Badge
                            variant={item.remaining_quantity === 0 ? "destructive" : "secondary"}
                            className="tabular-nums"
                          >
                            {idx + 1}
                          </Badge>
                        </TableCell>
                        {showRestaurantCol && (
                          <TableCell className="px-6 py-4 font-medium text-muted-foreground">
                            {item.restaurant_name || "—"}
                          </TableCell>
                        )}
                        <TableCell className="px-6 py-4 font-semibold">{item.name}</TableCell>
                        <TableCell className="px-6 py-4 text-right tabular-nums">
                          {restaurantId !== "all" ? (
                            <div className="flex items-center justify-end gap-2">
                              <Input
                                key={`${item.id}-stock-${item.stock_quantity ?? 0}`}
                                type="number"
                                min={0}
                                className="w-24 text-right h-8"
                                defaultValue={item.stock_quantity ?? 0}
                                disabled={savingItemId === item.id}
                                onBlur={async (e) => {
                                  const val = parseInt(e.target.value, 10);
                                  const newStock = Math.max(0, isNaN(val) ? 0 : val);
                                  if (newStock !== item.stock_quantity) {
                                    await handleUpdateStock(item.id, newStock);
                                  }
                                }}
                              />
                              {savingItemId === item.id && (
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                              )}
                            </div>
                          ) : (
                            item.stock_quantity != null ? item.stock_quantity : "—"
                          )}
                        </TableCell>
                        <TableCell className="px-6 py-4 text-right tabular-nums">{item.sold_quantity}</TableCell>
                        <TableCell className="px-6 py-4 text-right tabular-nums">
                          {item.remaining_quantity != null ? item.remaining_quantity : "—"}
                        </TableCell>
                        <TableCell className="px-6 py-4 text-right tabular-nums">
                          {item.last_updated ? new Date(item.last_updated).toLocaleDateString() : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  {/* Empty state */}
                  {!isLoading && items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="px-6 py-8 text-center text-muted-foreground">
                        No inventory data for this period.
                      </TableCell>
                    </TableRow>
                  )}
                </tbody>
              </Table>
            </div>
            {/* Bulk update button */}
            {selectedIds.length > 0 && (
              <div className="p-4 flex justify-end">
                <button
                  className="rounded bg-primary px-4 py-2 text-white hover:bg-primary/90 font-medium transition-colors"
                  onClick={handleBulkUpdateStock}
                >
                  Update Selected
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
