import { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format, isToday } from "date-fns";
import {
  CalendarDays,
  CalendarCheck,
  Clock,
  Users,
  TableProperties,
  Plus,
  CheckCircle2,
  UtensilsCrossed,
  RefreshCw,
  Search,
  Phone,
  ArrowRight,
  UserCheck,
  AlertCircle,
  Sparkles,
  PhoneCall,
  Check,
} from "lucide-react";
import { useActiveRestaurant } from "@/hooks/useActiveRestaurant";
import { getApiBase } from "@/lib/apiBase";
import { getToken } from "@/lib/authStorage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Reservation {
  id: string;
  table_id: string | null;
  table_number?: string | null;
  table_capacity?: number | null;
  table_location?: string | null;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  party_size: number;
  reservation_date: string;
  start_time: string;
  slot_duration_hours: number;
  status: string;
  notes: string | null;
  source: string;
}

interface RestaurantTable {
  id: string;
  table_number: string;
  capacity: number;
  location?: string | null;
  is_active: boolean;
}

const displayTableNumber = (tableNum?: string | null) => {
  if (!tableNum) return "";
  const trimmed = tableNum.trim();
  if (/^table\b/i.test(trimmed)) return trimmed;
  return `Table ${trimmed}`;
};

export function ReceptionistDashboard({ firstName }: { firstName: string }) {
  const { restaurantId, activeRestaurant } = useActiveRestaurant();
  const navigate = useNavigate();

  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const authHeader = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` });
  const API = getApiBase() + "/api";

  const loadData = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    try {
      const todayStr = format(new Date(), "yyyy-MM-dd");
      const [tblRes, resRes] = await Promise.all([
        fetch(`${API}/restaurants/${restaurantId}/tables`, { headers: authHeader() }),
        fetch(`${API}/restaurants/${restaurantId}/reservations?date=${todayStr}`, { headers: authHeader() }),
      ]);

      if (tblRes.ok) {
        const d = await tblRes.json();
        setTables(d.tables || []);
      }
      if (resRes.ok) {
        const d = await resRes.json();
        setReservations(d.reservations || []);
      }
    } catch (err) {
      console.error("Failed to load receptionist dashboard data:", err);
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Quick Arrival Check-in
  const handleCustomerArrived = async (res: Reservation) => {
    if (!res.table_id && !res.table_number) {
      toast.warning("Table assignment required", {
        description: `Please assign a table for ${res.customer_name} in Reservations page.`,
      });
      navigate("/reservations");
      return;
    }

    try {
      const r = await fetch(`${API}/reservations/${res.id}`, {
        method: "PATCH",
        headers: authHeader(),
        body: JSON.stringify({ status: "seated" }),
      });
      if (r.ok) {
        await loadData();
        const tblName = displayTableNumber(res.table_number) || "their assigned table";
        toast.success(`🎉 Customer Arrived: ${res.customer_name}`, {
          description: `Booking confirmed! Guest is checked in and proceeding to ${tblName}.`,
          duration: 6000,
        });
      } else {
        toast.error("Failed to confirm arrival");
      }
    } catch {
      toast.error("Network error while confirming arrival");
    }
  };

  const handleCompleteDining = async (id: string) => {
    try {
      const r = await fetch(`${API}/reservations/${id}`, {
        method: "PATCH",
        headers: authHeader(),
        body: JSON.stringify({ status: "completed" }),
      });
      if (r.ok) {
        await loadData();
        toast.success("Dining completed! Table is now free.");
      }
    } catch {
      toast.error("Failed to update status");
    }
  };

  // Metrics
  const totalBookings = reservations.length;
  const awaitingArrival = reservations.filter((r) => r.status === "confirmed").length;
  const currentlySeated = reservations.filter((r) => r.status === "seated").length;
  const pendingRequests = reservations.filter((r) => r.status === "pending").length;
  const activeTablesCount = tables.filter((t) => t.is_active).length;
  const totalSeats = tables.filter((t) => t.is_active).reduce((sum, t) => sum + (t.capacity || 0), 0);

  // Table Occupancy Map (tableId -> reservation currently seated)
  const seatedByTable = useMemo(() => {
    const map = new Map<string, Reservation>();
    for (const r of reservations) {
      if (r.status === "seated" && r.table_id) {
        map.set(r.table_id, r);
      }
    }
    return map;
  }, [reservations]);

  // Filtered upcoming / today's arrivals
  const arrivalsList = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return reservations
      .filter((r) => ["confirmed", "pending", "seated"].includes(r.status))
      .filter((r) => {
        if (!q) return true;
        return (
          r.customer_name.toLowerCase().includes(q) ||
          (r.customer_phone || "").includes(q) ||
          (r.table_number || "").toLowerCase().includes(q)
        );
      });
  }, [reservations, searchTerm]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-8">
      {/* ─── Reception Welcome Header Banner ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 p-6 sm:p-8 text-white shadow-lg">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge className="bg-white/20 text-white hover:bg-white/30 border-white/20 text-xs px-2.5 py-0.5 backdrop-blur-md">
                <Sparkles className="h-3 w-3 mr-1 text-amber-300" /> Reception & Front Desk
              </Badge>
              <span className="text-white/80 text-xs font-medium">
                {format(new Date(), "EEEE, MMMM d, yyyy")}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Welcome back, {firstName} 👋
            </h1>
            <p className="text-white/80 text-sm max-w-xl">
              Manage live guest arrivals, check-in seated parties, and monitor table availability for {activeRestaurant?.name || "your restaurant"}.
            </p>
          </div>
        </div>
      </div>

      {/* ─── KPI Metrics Cards ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: "Today's Bookings",
            value: totalBookings,
            desc: "Total scheduled for today",
            icon: CalendarDays,
            color: "text-emerald-600 dark:text-emerald-400",
            bg: "bg-emerald-500/10 border-emerald-500/20",
          },
          {
            label: "Awaiting Arrival",
            value: awaitingArrival,
            desc: "Confirmed guests arriving",
            icon: Clock,
            color: "text-amber-600 dark:text-amber-400",
            bg: "bg-amber-500/10 border-amber-500/20",
          },
          {
            label: "Currently Seated",
            value: currentlySeated,
            desc: "Parties dining right now",
            icon: UtensilsCrossed,
            color: "text-blue-600 dark:text-blue-400",
            bg: "bg-blue-500/10 border-blue-500/20",
          },
          {
            label: "Floor Capacity",
            value: `${activeTablesCount} Tables`,
            desc: `${totalSeats} total guest seats`,
            icon: TableProperties,
            color: "text-violet-600 dark:text-violet-400",
            bg: "bg-violet-500/10 border-violet-500/20",
          },
        ].map((card) => (
          <Card key={card.label} className="border border-border/70 rounded-2xl shadow-2xs overflow-hidden">
            <CardContent className="p-4 sm:p-5">
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
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ─── Main Operations Split: Arrivals & Floor Plan ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left (2 Cols): Live Guest Arrival Desk */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="border border-border/70 rounded-2xl shadow-xs overflow-hidden">
            <CardHeader className="p-4 sm:p-5 border-b border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/20">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-primary" />
                  Live Guest Arrival Desk (Today)
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Confirm customer arrivals with one click to guide them to their assigned table
                </p>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-56">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search guest, table..."
                    className="pl-8 h-8.5 text-xs rounded-xl"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <Button variant="outline" size="icon" className="h-8.5 w-8.5 rounded-xl shrink-0" onClick={loadData} title="Refresh">
                  <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                </Button>
              </div>
            </CardHeader>

            <CardContent className="p-4 sm:p-5 space-y-3">
              {loading ? (
                <div className="space-y-3 py-4">
                  <Skeleton className="h-20 w-full rounded-xl" />
                  <Skeleton className="h-20 w-full rounded-xl" />
                </div>
              ) : arrivalsList.length === 0 ? (
                <div className="text-center py-12 space-y-2">
                  <CalendarDays className="h-10 w-10 text-muted-foreground/30 mx-auto" />
                  <p className="text-sm font-semibold text-foreground">No active arrivals in queue</p>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    {searchTerm ? "No reservations matching your search query." : "All guests have arrived or no further bookings are scheduled for today."}
                  </p>
                </div>
              ) : (
                arrivalsList.map((res) => (
                  <div
                    key={res.id}
                    className="p-4 rounded-2xl border border-border/70 bg-card hover:border-primary/40 transition-all shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-xs text-primary shrink-0">
                        {res.customer_name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-sm text-foreground truncate">{res.customer_name}</p>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] font-semibold px-2 py-0",
                              res.status === "seated"
                                ? "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30"
                                : res.status === "confirmed"
                                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                                : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30"
                            )}
                          >
                            {res.status === "seated" ? "Seated" : res.status === "confirmed" ? "Confirmed" : "Pending"}
                          </Badge>
                          {res.source === "phone" && (
                            <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0 text-violet-600 border-violet-500/20 bg-violet-500/5">
                              <PhoneCall className="h-2.5 w-2.5" /> Voice AI
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                          <span className="flex items-center gap-1 font-medium text-foreground">
                            <Clock className="h-3 w-3 text-primary" /> {res.start_time.slice(0, 5)} ({res.slot_duration_hours}h)
                          </span>
                          <span className="flex items-center gap-1 font-medium">
                            <Users className="h-3 w-3 text-primary" /> {res.party_size} {res.party_size > 1 ? "Guests" : "Guest"}
                          </span>
                          {res.customer_phone && (
                            <a href={`tel:${res.customer_phone}`} className="flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors">
                              <Phone className="h-3 w-3" /> {res.customer_phone}
                            </a>
                          )}
                        </div>

                        {/* Assigned Table Highlight */}
                        <div className="mt-2 flex items-center gap-2">
                          {res.table_number ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 border border-emerald-500/20">
                              <TableProperties className="h-3.5 w-3.5 text-emerald-600" />
                              {displayTableNumber(res.table_number)}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300 font-medium">
                              <AlertCircle className="h-3.5 w-3.5" /> No table assigned
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Operational Action Button */}
                    <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end">
                      {res.status === "confirmed" && (
                        <Button
                          size="sm"
                          className="w-full sm:w-auto h-9 text-xs font-semibold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs"
                          onClick={() => handleCustomerArrived(res)}
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                          {res.table_number
                            ? `Customer Arrived · Seat at ${displayTableNumber(res.table_number)}`
                            : "Customer Arrived (Assign)"}
                        </Button>
                      )}

                      {res.status === "pending" && (
                        <Button
                          size="sm"
                          className="w-full sm:w-auto h-9 text-xs font-semibold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs"
                          onClick={() => handleCustomerArrived(res)}
                        >
                          <UserCheck className="h-3.5 w-3.5" /> Confirm & Arrived
                        </Button>
                      )}

                      {res.status === "seated" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full sm:w-auto h-9 text-xs font-semibold gap-1.5 text-slate-800 dark:text-slate-200 border-border/80 hover:bg-muted rounded-xl"
                          onClick={() => handleCompleteDining(res.id)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Complete Dining
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right (1 Col): Floor Tables Availability */}
        <div className="space-y-4">
          <Card className="border border-border/70 rounded-2xl shadow-xs overflow-hidden">
            <CardHeader className="p-4 sm:p-5 border-b border-border/50 flex flex-row items-center justify-between bg-muted/20">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <TableProperties className="h-4 w-4 text-primary" />
                  Table Floor Status
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Live occupancy overview
                </p>
              </div>
              <Link to="/reservations?tab=tables" className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
                View Tables <ArrowRight className="h-3 w-3" />
              </Link>
            </CardHeader>

            <CardContent className="p-4 space-y-2.5 max-h-[520px] overflow-y-auto custom-scrollbar">
              {tables.filter((t) => t.is_active).length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">No active tables configured.</p>
              ) : (
                tables
                  .filter((t) => t.is_active)
                  .map((t) => {
                    const seatedRes = seatedByTable.get(t.id);
                    const isOccupied = Boolean(seatedRes);

                    return (
                      <div
                        key={t.id}
                        className={cn(
                          "p-3 rounded-xl border transition-all text-xs flex items-center justify-between gap-2",
                          isOccupied
                            ? "bg-blue-500/10 border-blue-500/30 text-blue-950 dark:text-blue-100"
                            : "bg-card border-border/70 hover:border-emerald-500/40 text-foreground"
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={cn(
                              "w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0",
                              isOccupied
                                ? "bg-blue-500/20 text-blue-700 dark:text-blue-300"
                                : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            )}
                          >
                            <TableProperties className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-xs truncate">
                              {displayTableNumber(t.table_number)}
                            </p>
                            <p className="text-[11px] text-muted-foreground truncate">
                              Max {t.capacity} seats {t.location ? `· ${t.location}` : ""}
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          {isOccupied ? (
                            <div>
                              <Badge className="bg-blue-600 text-white text-[10px] px-2 py-0 font-bold">
                                Seated
                              </Badge>
                              <p className="text-[10px] text-blue-700 dark:text-blue-300 font-medium truncate max-w-[100px] mt-0.5">
                                {seatedRes?.customer_name}
                              </p>
                            </div>
                          ) : (
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[10px] px-2 py-0 font-bold">
                              Available
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
