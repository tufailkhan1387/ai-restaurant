import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Phone,
  Clock,
  User,
  Truck,
  MapPin,
  ShoppingBag,
  Search,
  Calendar,
  Layers,
  RotateCcw,
  SlidersHorizontal,
  ArrowUpDown,
  DollarSign,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  ORDER_STATUS_COLORS,
  formatCurrency,
  OrderStatus,
} from "@/lib/restaurant";
import { getOrderStatusLabel, formatDate, formatTime } from "@/i18n/formatters";

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
  menu_item_id?: string | null;
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

interface Category {
  id: string;
  name: string;
}

interface MenuItemRecord {
  id: string;
  name: string;
  category_id: string | null;
}

interface Props {
  /** Filter to a specific status, or array of statuses, or 'all' */
  status?: OrderStatus | OrderStatus[] | "all";
  title: string;
  description?: string;
  icon?: React.ReactNode;
}

export function OrdersListView({ status = "all", title, description, icon }: Props) {
  const { t } = useTranslation(["orders", "common"]);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Raw data
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItemRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter States
  const [search, setSearch] = useState("");
  const [datePreset, setDatePreset] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("all");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("all");
  const [driverFilter, setDriverFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const isAllOrdersPage = status === "all";
  const statuses: OrderStatus[] | null =
    status === "all" ? null : Array.isArray(status) ? status : [status];

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);

    if (statuses) q = q.in("status", statuses);

    const [o, i, d, c, m] = await Promise.all([
      q,
      supabase.from("order_items").select("*"),
      supabase.from("drivers").select("id, full_name, phone, status").eq("is_active", true),
      supabase.from("menu_categories").select("id, name").order("name"),
      supabase.from("menu_items").select("id, name, category_id"),
    ]);

    if (o.data) setOrders(o.data as any);
    if (i.data) setItems(i.data as any);
    if (d.data) setDrivers(d.data as any);
    if (c.data) setCategories(c.data as any);
    if (m.data) setMenuItems(m.data as any);
    setLoading(false);
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

  const itemCategoryMap = useMemo(() => {
    const map: Record<string, string> = {};
    menuItems.forEach((m) => {
      if (m.category_id) map[m.id] = m.category_id;
    });
    return map;
  }, [menuItems]);

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

  const orderItems = (id: string) => items.filter((i) => i.order_id === id);

  // Filtering & Sorting
  const filtered = useMemo(() => {
    return orders
      .filter((o) => {
        // 1. Search filter
        if (search.trim()) {
          const q = search.toLowerCase();
          const matchName = o.customer_name?.toLowerCase().includes(q);
          const matchPhone = o.customer_phone?.includes(q);
          const matchNum = o.order_number?.toLowerCase().includes(q);
          const matchAddr = o.delivery_address?.toLowerCase().includes(q);
          if (!matchName && !matchPhone && !matchNum && !matchAddr) return false;
        }

        // 2. Date filter
        if (datePreset !== "all") {
          const orderDate = new Date(o.created_at);
          const now = new Date();

          if (datePreset === "today") {
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            if (orderDate < todayStart) return false;
          } else if (datePreset === "yesterday") {
            const yestStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
            const yestEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            if (orderDate < yestStart || orderDate >= yestEnd) return false;
          } else if (datePreset === "last_7_days") {
            const past7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            if (orderDate < past7) return false;
          } else if (datePreset === "last_30_days") {
            const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            if (orderDate < past30) return false;
          } else if (datePreset === "this_month") {
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            if (orderDate < monthStart) return false;
          } else if (datePreset === "custom") {
            if (fromDate) {
              const fromD = new Date(`${fromDate}T00:00:00`);
              if (orderDate < fromD) return false;
            }
            if (toDate) {
              const toD = new Date(`${toDate}T23:59:59.999`);
              if (orderDate > toD) return false;
            }
          }
        }

        // 3. Category Filter
        if (categoryFilter !== "all") {
          const orderItemRows = items.filter((i) => i.order_id === o.id);
          const hasCategoryItem = orderItemRows.some((oi) => {
            if (oi.menu_item_id && itemCategoryMap[oi.menu_item_id] === categoryFilter) return true;
            // Name fallback
            const mi = menuItems.find((m) => m.name.toLowerCase() === oi.item_name.toLowerCase());
            return mi?.category_id === categoryFilter;
          });
          if (!hasCategoryItem) return false;
        }

        // 4. Source Filter
        if (sourceFilter !== "all") {
          const src = (o.source || "").toLowerCase();
          if (sourceFilter === "call" && !(o.call_id || src.includes("call"))) return false;
          if (sourceFilter === "online" && !(src.includes("online") || src.includes("web"))) return false;
          if (
            sourceFilter === "dashboard" &&
            !(src.includes("dashboard") || src.includes("pos") || src.includes("house") || src.includes("manual"))
          ) {
            return false;
          }
          if (sourceFilter === "takeaway" && !(src.includes("take") || src.includes("pickup"))) return false;
          if (sourceFilter === "app" && !src.includes("app")) return false;
        }

        // 5. Payment Status
        if (paymentStatusFilter !== "all") {
          const ps = (o.payment_status || "").toLowerCase();
          if (paymentStatusFilter === "paid" && ps !== "paid") return false;
          if (paymentStatusFilter === "pending" && ps === "paid") return false;
        }

        // 6. Payment Method
        if (paymentMethodFilter !== "all") {
          const pm = (o.payment_method || "").toLowerCase();
          if (paymentMethodFilter === "cod" && !(pm.includes("cash") || pm.includes("cod"))) return false;
          if (paymentMethodFilter === "card" && !(pm.includes("card") || pm.includes("stripe"))) return false;
          if (paymentMethodFilter === "wallet" && !(pm.includes("wallet") || pm.includes("online"))) return false;
        }

        // 7. Driver Filter
        if (driverFilter !== "all") {
          if (driverFilter === "unassigned" && o.driver_id) return false;
          if (driverFilter !== "unassigned" && o.driver_id !== driverFilter) return false;
        }

        // 8. Order Status Filter (when on All Orders)
        if (isAllOrdersPage && statusFilter !== "all") {
          if (o.status !== statusFilter) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "oldest") {
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        }
        if (sortBy === "highest_amount") {
          return Number(b.total_amount || 0) - Number(a.total_amount || 0);
        }
        if (sortBy === "lowest_amount") {
          return Number(a.total_amount || 0) - Number(b.total_amount || 0);
        }
        // default: newest
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [
    orders,
    items,
    menuItems,
    itemCategoryMap,
    search,
    datePreset,
    fromDate,
    toDate,
    categoryFilter,
    sourceFilter,
    paymentStatusFilter,
    paymentMethodFilter,
    driverFilter,
    statusFilter,
    sortBy,
    isAllOrdersPage,
  ]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (search.trim()) count++;
    if (datePreset !== "all") count++;
    if (categoryFilter !== "all") count++;
    if (sourceFilter !== "all") count++;
    if (paymentStatusFilter !== "all") count++;
    if (paymentMethodFilter !== "all") count++;
    if (driverFilter !== "all") count++;
    if (isAllOrdersPage && statusFilter !== "all") count++;
    if (sortBy !== "newest") count++;
    return count;
  }, [
    search,
    datePreset,
    categoryFilter,
    sourceFilter,
    paymentStatusFilter,
    paymentMethodFilter,
    driverFilter,
    statusFilter,
    sortBy,
    isAllOrdersPage,
  ]);

  const resetFilters = () => {
    setSearch("");
    setDatePreset("all");
    setFromDate("");
    setToDate("");
    setCategoryFilter("all");
    setSourceFilter("all");
    setPaymentStatusFilter("all");
    setPaymentMethodFilter("all");
    setDriverFilter("all");
    setStatusFilter("all");
    setSortBy("newest");
  };

  const filteredTotalRevenue = useMemo(() => {
    return filtered.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
  }, [filtered]);

  const selectedCategoryName = categories.find((c) => c.id === categoryFilter)?.name;
  const selectedDriverName = drivers.find((d) => d.id === driverFilter)?.full_name;

  return (
    <>
      <div className="space-y-5">
        {/* Header Title and Search Bar */}
        <div className="flex justify-between items-start sm:items-center flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              {icon}
              {title}
            </h1>
            {description && <p className="text-muted-foreground text-sm mt-0.5">{description}</p>}
          </div>

          <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("orders:searchPlaceholder", "Search name, phone, #...")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-8 h-10 rounded-lg"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <Button
              variant={showAdvancedFilters || activeFiltersCount > 0 ? "secondary" : "outline"}
              onClick={() => setShowAdvancedFilters((v) => !v)}
              className={cn(
                "h-10 rounded-lg gap-2 border-border/80",
                activeFiltersCount > 0 && "border-primary/40 text-primary font-semibold"
              )}
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span>{t("orders:filters", "Filters")}</span>
              {activeFiltersCount > 0 && (
                <Badge variant="default" className="h-5 px-1.5 text-xs font-bold rounded-full ml-0.5">
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>

            {activeFiltersCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="h-10 text-muted-foreground hover:text-foreground gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t("common:reset", "Reset")}
              </Button>
            )}
          </div>
        </div>

        {/* Primary Filter Bar */}
        <Card className="rounded-xl border-border/80 shadow-xs">
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* 1. Food Category Filter (Most Left) */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-primary" />
                  {t("orders:category", "Category")}
                </label>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="h-9.5">
                    <SelectValue placeholder={t("orders:allCategories", "All Categories")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("orders:allCategories", "All Categories")}</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 2. Date Filter */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-primary" />
                  {t("orders:dateRange", "Date Range")}
                </label>
                <Select value={datePreset} onValueChange={setDatePreset}>
                  <SelectTrigger className="h-9.5">
                    <SelectValue placeholder={t("common:selectDate", "Select date")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("orders:allTime", "All Time")}</SelectItem>
                    <SelectItem value="today">{t("orders:today", "Today")}</SelectItem>
                    <SelectItem value="yesterday">{t("orders:yesterday", "Yesterday")}</SelectItem>
                    <SelectItem value="last_7_days">{t("orders:last7Days", "Last 7 Days")}</SelectItem>
                    <SelectItem value="last_30_days">{t("orders:last30Days", "Last 30 Days")}</SelectItem>
                    <SelectItem value="this_month">{t("orders:thisMonth", "This Month")}</SelectItem>
                    <SelectItem value="custom">{t("orders:customRange", "Custom Range...")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 3. Sort By */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <ArrowUpDown className="h-3.5 w-3.5 text-primary" />
                  {t("orders:sortBy", "Sort By")}
                </label>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="h-9.5">
                    <SelectValue placeholder={t("orders:sortBy", "Sort by")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">{t("orders:newestFirst", "Newest First")}</SelectItem>
                    <SelectItem value="oldest">{t("orders:oldestFirst", "Oldest First")}</SelectItem>
                    <SelectItem value="highest_amount">{t("orders:highestAmount", "Amount: High to Low")}</SelectItem>
                    <SelectItem value="lowest_amount">{t("orders:lowestAmount", "Amount: Low to High")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Custom Date Pickers (when custom range is selected) */}
            {datePreset === "custom" && (
              <div className="pt-3 border-t border-border/60 grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-in">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">{t("common:startDate", "From Date")}</label>
                  <Input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">{t("common:endDate", "To Date")}</label>
                  <Input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>
            )}

            {/* Advanced / Secondary Filters Row */}
            {showAdvancedFilters && (
              <div className="pt-3 border-t border-border/60 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 animate-fade-in">
                {/* 5. Order Status (for all orders view) */}
                {isAllOrdersPage && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      {t("common:status", "Order Status")}
                    </label>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="h-9.5">
                        <SelectValue placeholder={t("orders:filterByStatus", "All Statuses")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t("orders:all", "All Statuses")}</SelectItem>
                        <SelectItem value="pending">{t("orders:newOrders", "New / Pending")}</SelectItem>
                        <SelectItem value="confirmed">{t("orders:confirmed", "Confirmed")}</SelectItem>
                        <SelectItem value="preparing">{t("orders:preparing", "Preparing")}</SelectItem>
                        <SelectItem value="ready">{t("orders:ready", "Ready")}</SelectItem>
                        <SelectItem value="out_for_delivery">{t("orders:outForDelivery", "Out for Delivery")}</SelectItem>
                        <SelectItem value="delivered">{t("orders:delivered", "Delivered")}</SelectItem>
                        <SelectItem value="cancelled">{t("orders:cancelled", "Cancelled")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* 6. Payment Status Filter */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <DollarSign className="h-3.5 w-3.5 text-primary" />
                    {t("orders:paymentStatus", "Payment Status")}
                  </label>
                  <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
                    <SelectTrigger className="h-9.5">
                      <SelectValue placeholder={t("orders:paymentStatus", "All Payment Statuses")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("common:all", "All Payment Statuses")}</SelectItem>
                      <SelectItem value="paid">{t("orders:paid", "Paid")}</SelectItem>
                      <SelectItem value="pending">{t("orders:unpaid", "Unpaid / Pending")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* 7. Payment Method Filter */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    {t("orders:paymentMethod", "Payment Method")}
                  </label>
                  <Select value={paymentMethodFilter} onValueChange={setPaymentMethodFilter}>
                    <SelectTrigger className="h-9.5">
                      <SelectValue placeholder={t("orders:paymentMethod", "All Payment Methods")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("common:all", "All Payment Methods")}</SelectItem>
                      <SelectItem value="cod">{t("orders:cashOnDelivery", "Cash on Delivery (COD)")}</SelectItem>
                      <SelectItem value="card">{t("orders:creditCard", "Card / Stripe")}</SelectItem>
                      <SelectItem value="wallet">Online / Wallet</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* 8. Driver Filter */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <Truck className="h-3.5 w-3.5 text-primary" />
                    {t("drivers:title", "Rider / Driver")}
                  </label>
                  <Select value={driverFilter} onValueChange={setDriverFilter}>
                    <SelectTrigger className="h-9.5">
                      <SelectValue placeholder={t("orders:selectDriver", "All Drivers")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("common:all", "All Drivers")}</SelectItem>
                      <SelectItem value="unassigned">{t("orders:noDriverAssigned", "Unassigned Only")}</SelectItem>
                      {drivers.map((drv) => (
                        <SelectItem key={drv.id} value={drv.id}>
                          {drv.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Filter Summary & Active Badges Bar */}
            <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-border/50 text-xs text-muted-foreground">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-foreground">
                  {t("orders:showingOrders", { count: filtered.length, total: orders.length })}
                </span>
                <span className="text-muted-foreground">•</span>
                <span className="font-bold text-foreground">
                  {t("orders:totalLabel", "Total")}: {formatCurrency(filteredTotalRevenue)}
                </span>

                {/* Active Filter Chips */}
                {categoryFilter !== "all" && (
                  <Badge variant="secondary" className="gap-1 font-medium">
                    {t("orders:category", "Category")}: {selectedCategoryName || categoryFilter}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => setCategoryFilter("all")} />
                  </Badge>
                )}
                {datePreset !== "all" && (
                  <Badge variant="secondary" className="gap-1 font-medium capitalize">
                    {t("orders:dateRange", "Date")}: {datePreset.replace(/_/g, " ")}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => setDatePreset("all")} />
                  </Badge>
                )}
                {sourceFilter !== "all" && (
                  <Badge variant="secondary" className="gap-1 font-medium capitalize">
                    Source: {sourceFilter}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => setSourceFilter("all")} />
                  </Badge>
                )}
                {paymentStatusFilter !== "all" && (
                  <Badge variant="secondary" className="gap-1 font-medium capitalize">
                    {t("orders:paymentStatus", "Payment")}: {paymentStatusFilter}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => setPaymentStatusFilter("all")} />
                  </Badge>
                )}
                {driverFilter !== "all" && (
                  <Badge variant="secondary" className="gap-1 font-medium">
                    {t("drivers:driver", "Driver")}: {selectedDriverName || (driverFilter === "unassigned" ? t("orders:noDriverAssigned", "Unassigned") : driverFilter)}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => setDriverFilter("all")} />
                  </Badge>
                )}
                {statusFilter !== "all" && (
                  <Badge variant="secondary" className="gap-1 font-medium capitalize">
                    {t("common:status", "Status")}: {getOrderStatusLabel(statusFilter as OrderStatus)}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => setStatusFilter("all")} />
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Orders List Cards */}
        <div className="grid gap-4">
          {filtered.map((o) => {
            const its = orderItems(o.id);
            const driver = drivers.find((d) => d.id === o.driver_id);
            return (
              <Card key={o.id} className="hover:border-primary/50 transition-all shadow-xs border-border/80">
                <CardContent className="p-5">
                  <div className="flex justify-between items-start gap-4 flex-wrap">
                    <div className="space-y-3 flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="text-lg font-bold font-mono text-foreground tracking-tight">
                          {o.order_number}
                        </span>
                        <Badge
                          className={cn("text-xs font-semibold px-2.5 py-0.5", ORDER_STATUS_COLORS[o.status])}
                          variant="outline"
                        >
                          {getOrderStatusLabel(o.status)}
                        </Badge>
                        <Badge variant="secondary" className="capitalize text-xs font-medium px-2 py-0.5">
                          {o.source}
                        </Badge>
                        {o.payment_status && (
                          <Badge
                            variant={o.payment_status.toLowerCase() === "paid" ? "default" : "outline"}
                            className="text-[11px] font-medium px-2 py-0.5"
                          >
                            {o.payment_status.toLowerCase() === "paid" ? t("orders:paid", "Paid") : t("orders:unpaid", "Unpaid")}
                          </Badge>
                        )}
                        {o.call_id && (
                          <Badge variant="outline" className="text-xs font-medium">
                            <Phone className="h-3.5 w-3.5 mr-1 text-primary" />
                            {t("orders:aiCall", "AI Call")}
                          </Badge>
                        )}
                      </div>

                      {/* Customer info + Phone in clean compact row */}
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-2 font-semibold text-base text-foreground">
                          <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                            {(o.customer_name || "G").charAt(0).toUpperCase()}
                          </div>
                          <span>{o.customer_name || t("orders:guestCustomer", "Guest Customer")}</span>
                        </div>

                        {o.customer_phone && (
                          <div className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-foreground/80 bg-muted/60 px-2.5 py-1 rounded-md border border-border/70">
                            <Phone className="h-3.5 w-3.5 text-primary shrink-0" />
                            <span>{o.customer_phone}</span>
                          </div>
                        )}
                      </div>

                      {o.delivery_address && (
                        <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground/80 shrink-0" />
                          <span className="truncate">{o.delivery_address}</span>
                        </div>
                      )}

                      {/* Prominent Order Items Details Section */}
                      <div className="pt-2 border-t border-border/50">
                        <div className="flex items-center gap-2 mb-2">
                          <ShoppingBag className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                            {t("orders:orderItems", "Order Items")} ({its.length})
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {its.length > 0 ? (
                            its.map((item) => {
                              const sizeMatch = item.item_name.match(/\(([^)]+)\)/);
                              const addMatch = item.item_name.includes("+") ? item.item_name.split("+")[1] : null;
                              let baseName = item.item_name;
                              if (sizeMatch) baseName = baseName.replace(sizeMatch[0], "").trim();
                              if (addMatch) baseName = baseName.split("+")[0].trim();

                              return (
                                <div
                                  key={item.id}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/60 border border-border/80 text-sm font-semibold text-foreground shadow-2xs hover:bg-muted transition-colors flex-wrap"
                                >
                                  <span className="inline-flex items-center justify-center bg-primary text-primary-foreground font-bold rounded px-1.5 py-0.5 text-xs">
                                    {item.quantity}×
                                  </span>
                                  <span>{baseName}</span>
                                  {sizeMatch && (
                                    <span className="bg-primary/10 text-primary border border-primary/20 text-[11px] font-bold px-1.5 py-0.2 rounded-md">
                                      {sizeMatch[1]}
                                    </span>
                                  )}
                                  {addMatch && (
                                    <span className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 text-[11px] font-medium px-1.5 py-0.2 rounded-md">
                                      +{addMatch.trim()}
                                    </span>
                                  )}
                                  {item.notes && (
                                    <span className="text-xs font-normal text-muted-foreground italic">
                                      ({item.notes})
                                    </span>
                                  )}
                                </div>
                              );
                            })
                          ) : (
                            <span className="text-xs text-muted-foreground italic bg-muted/30 px-2.5 py-1 rounded-md border border-dashed border-border">
                              {t("orders:noNotes", "No items recorded")}
                            </span>
                          )}
                        </div>
                      </div>

                      {driver && (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 text-xs font-medium">
                          <Truck className="h-3.5 w-3.5 shrink-0" />
                          <span>
                            {t("orders:driverLabel", "Driver:")} <strong className="font-semibold">{driver.full_name}</strong>
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-3 shrink-0">
                      <div className="text-right">
                        <span className="text-xl sm:text-2xl font-bold text-foreground tracking-tight block">
                          {formatCurrency(o.total_amount)}
                        </span>
                        <span className="text-xs font-medium text-muted-foreground flex items-center justify-end gap-1 mt-0.5">
                          <Clock className="h-3.5 w-3.5" />
                          {formatDate(o.created_at)} {formatTime(o.created_at)}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 justify-end">
                        <Button size="sm" variant="outline" onClick={() => navigate(`/orders/${o.id}`)}>
                          {t("orders:viewDetails", "Details")}
                        </Button>
                        {o.status === "pending" && (
                          <Button size="sm" onClick={() => confirmOrder(o)}>
                            {t("orders:confirm", "Confirm")}
                          </Button>
                        )}
                        {o.status === "confirmed" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateStatus(o.id, "preparing")}
                          >
                            {t("orders:startPrep", "Start prep")}
                          </Button>
                        )}
                        {o.status === "preparing" && (
                          <Button size="sm" variant="outline" onClick={() => updateStatus(o.id, "ready")}>
                            {t("orders:ready", "Ready")}
                          </Button>
                        )}
                        {o.status === "assigned" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateStatus(o.id, "out_for_delivery")}
                          >
                            {t("orders:outForDelivery", "Out for delivery")}
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
                            {t("orders:delivered", "Delivered")}
                          </Button>
                        )}
                        {o.status !== "cancelled" && o.status !== "delivered" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => {
                              if (confirm(t("orders:cancelOrder", "Cancel order?"))) updateStatus(o.id, "cancelled");
                            }}
                          >
                            {t("orders:cancel", "Cancel")}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {filtered.length === 0 && !loading && (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center text-muted-foreground space-y-3">
                <ShoppingBag className="h-10 w-10 mx-auto text-muted-foreground/50" />
                <div>
                  <p className="font-semibold text-foreground text-base">{t("orders:noMatchingOrders", "No matching orders found")}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {activeFiltersCount > 0
                      ? t("orders:tryChangingFilters", "Try changing your search query or resetting filters.")
                      : t("orders:noOrdersAvailable", "No orders are currently available in this view.")}
                  </p>
                </div>
                {activeFiltersCount > 0 && (
                  <Button variant="outline" size="sm" onClick={resetFilters} className="gap-1.5 mt-2">
                    <RotateCcw className="h-3.5 w-3.5" />
                    {t("orders:resetAllFilters", "Reset all filters")}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}