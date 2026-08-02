import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getApiBase } from "@/lib/apiBase";
import { getToken } from "@/lib/authStorage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Wallet, 
  TrendingUp, 
  Store, 
  DollarSign, 
  ArrowUpRight, 
  ArrowDownRight,
  PieChart as PieChartIcon,
  BarChart as BarChartIcon,
  Loader2
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReChartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { cn } from "@/lib/utils";

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
  summary: {
    total_sales: number;
    total_orders: number;
    total_admin_earning: number;
    total_restaurant_earning: number;
  };
}

function formatCurrency(val: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);
}

export default function Earnings() {
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string>("all");

  const { data, isLoading, error } = useQuery<EarningStats>({
    queryKey: ["super-admin-earnings"],
    queryFn: async () => {
      const token = getToken();
      const res = await fetch(`${getApiBase()}/api/stats/earnings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch earnings");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const restaurants = data?.restaurants ?? [];
  const displayedRestaurants = useMemo(
    () =>
      selectedRestaurantId === "all"
        ? restaurants
        : restaurants.filter((r) => r.restaurant_id === selectedRestaurantId),
    [restaurants, selectedRestaurantId]
  );

  const selectedRestaurantName = useMemo(() => {
    if (selectedRestaurantId === "all") return "All Restaurants";
    return restaurants.find((r) => r.restaurant_id === selectedRestaurantId)?.restaurant_name || "Selected Restaurant";
  }, [restaurants, selectedRestaurantId]);

  const displayedSummary = useMemo(
    () =>
      displayedRestaurants.reduce(
        (acc, row) => {
          acc.total_sales += row.total_sales;
          acc.total_orders += row.order_count;
          acc.total_admin_earning += row.admin_earning;
          acc.total_restaurant_earning += row.restaurant_earning;
          return acc;
        },
        {
          total_sales: 0,
          total_orders: 0,
          total_admin_earning: 0,
          total_restaurant_earning: 0,
        }
      ),
    [displayedRestaurants]
  );

  const pieData = useMemo(
    () => [
      { name: "Admin (Commission)", value: displayedSummary.total_admin_earning, color: "hsl(var(--primary))" },
      {
        name: "Restaurants Share",
        value: displayedSummary.total_restaurant_earning,
        color: "hsl(var(--status-available))",
      },
    ],
    [displayedSummary.total_admin_earning, displayedSummary.total_restaurant_earning]
  );

  const chartData = useMemo(
    () =>
      displayedRestaurants.map((r) => ({
        name: r.restaurant_name,
        Sales: r.total_sales,
        Admin: r.admin_earning,
        Restaurant: r.restaurant_earning,
      })),
    [displayedRestaurants]
  );

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
        <p className="font-bold">Error loading earnings</p>
        <p className="text-sm">{(error as Error).message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <Wallet className="h-8 w-8 text-primary" />
            Platform Earnings
          </h1>
          <p className="text-muted-foreground mt-1">Global revenue and commission analytics</p>
        </div>
        <Select value={selectedRestaurantId} onValueChange={setSelectedRestaurantId}>
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

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Total Platform Sales" 
          value={formatCurrency(displayedSummary.total_sales)} 
          icon={TrendingUp} 
          trend="+12.5%" 
          isPositive={true}
          description="Gross sales across all locations"
        />
        <StatCard 
          title="Admin Earnings" 
          value={formatCurrency(displayedSummary.total_admin_earning)} 
          icon={DollarSign} 
          trend="+8.2%" 
          isPositive={true}
          description="Total commissions collected"
          highlight
        />
        <StatCard 
          title="Restaurant Earnings" 
          value={formatCurrency(displayedSummary.total_restaurant_earning)} 
          icon={Store} 
          trend="+14.1%" 
          isPositive={true}
          description="Net revenue for restaurant partners"
        />
        <StatCard 
          title="Total Orders" 
          value={displayedSummary.total_orders.toString()} 
          icon={BarChartIcon} 
          trend="+20.4%" 
          isPositive={true}
          description="Completed deliveries"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Distribution Chart */}
        <Card className="lg:col-span-2 overflow-hidden border-none bg-card/50 backdrop-blur-sm shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChartIcon className="h-5 w-5 text-primary" />
              {selectedRestaurantId === "all" ? "Restaurant-wise Revenue" : `${selectedRestaurantName} Revenue`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} tickFormatter={(value) => `$${value}`} />
                  <ReChartsTooltip 
                    cursor={{ fill: 'hsl(var(--muted)/0.5)' }}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '12px', border: '1px solid hsl(var(--border))', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: any) => formatCurrency(value)}
                  />
                  <Legend iconType="circle" />
                  <Bar dataKey="Admin" name="Admin Profit" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} barSize={20} />
                  <Bar dataKey="Restaurant" name="Restaurant Share" fill="hsl(var(--status-available))" radius={[4, 4, 0, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Share Breakdown Pie */}
        <Card className="overflow-hidden border-none bg-card/50 backdrop-blur-sm shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChartIcon className="h-5 w-5 text-primary" />
              {selectedRestaurantId === "all" ? "Profit Split" : `${selectedRestaurantName} Profit Split`}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={100}
                    paddingAngle={8}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <ReChartsTooltip 
                     contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '12px', border: '1px solid hsl(var(--border))' }}
                     formatter={(value: any) => formatCurrency(value)}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full space-y-3 mt-4">
              {pieData.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-sm font-medium">{item.name}</span>
                  </div>
                  <span className="text-sm font-bold">{formatCurrency(item.value)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Table */}
      <Card className="border-none bg-card/50 backdrop-blur-sm shadow-xl overflow-hidden">
        <CardHeader>
          <CardTitle>Detailed Restaurant Earnings</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground font-medium border-y">
                <tr>
                  <th className="px-6 py-4">Restaurant</th>
                  <th className="px-6 py-4">Commission</th>
                  <th className="px-6 py-4 text-right">Orders</th>
                  <th className="px-6 py-4 text-right">Total Sales</th>
                  <th className="px-6 py-4 text-right">Admin Profit</th>
                  <th className="px-6 py-4 text-right">Net Payout</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {displayedRestaurants.map((r) => (
                  <tr key={r.restaurant_id} className="hover:bg-muted/30 transition-colors group">
                    <td className="px-6 py-4 font-semibold text-foreground">{r.restaurant_name}</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 rounded bg-primary/10 text-primary text-xs font-bold">
                        {r.commission_rate}%
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-muted-foreground">{r.order_count}</td>
                    <td className="px-6 py-4 text-right font-medium">{formatCurrency(r.total_sales)}</td>
                    <td className="px-6 py-4 text-right text-primary font-bold">{formatCurrency(r.admin_earning)}</td>
                    <td className="px-6 py-4 text-right text-status-available font-bold">{formatCurrency(r.restaurant_earning)}</td>
                  </tr>
                ))}
                {displayedRestaurants.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">
                      No earnings data found for the selected restaurant.
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

function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  trend, 
  isPositive, 
  description,
  highlight = false
}: { 
  title: string; 
  value: string; 
  icon: any; 
  trend: string; 
  isPositive: boolean; 
  description: string;
  highlight?: boolean;
}) {
  return (
    <Card className={cn(
      "border-none shadow-lg overflow-hidden transition-all duration-300 hover:-translate-y-1",
      highlight ? "bg-primary text-primary-foreground" : "bg-card/50 backdrop-blur-sm"
    )}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className={cn("text-xs font-bold uppercase tracking-wider", highlight ? "text-primary-foreground/80" : "text-muted-foreground")}>
              {title}
            </p>
            <p className="text-3xl font-black">{value}</p>
            <div className="flex items-center gap-2">
              <span className={cn(
                "flex items-center gap-0.5 text-xs font-bold px-1.5 py-0.5 rounded-full",
                highlight 
                  ? "bg-white/20 text-white" 
                  : isPositive ? "bg-status-available/20 text-status-available" : "bg-destructive/20 text-destructive"
              )}>
                {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {trend}
              </span>
              <span className={cn("text-[10px]", highlight ? "text-primary-foreground/60" : "text-muted-foreground")}>
                vs last month
              </span>
            </div>
          </div>
          <div className={cn(
            "p-3 rounded-2xl shadow-inner",
            highlight ? "bg-white/20" : "bg-muted"
          )}>
            <Icon className={cn("h-6 w-6", highlight ? "text-white" : "text-primary")} />
          </div>
        </div>
        <p className={cn("mt-4 text-[10px] italic", highlight ? "text-primary-foreground/70" : "text-muted-foreground/80")}>
          {description}
        </p>
      </CardContent>
    </Card>
  );
}
