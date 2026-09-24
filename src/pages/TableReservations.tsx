import { useState, useEffect, useCallback } from "react";
import { useActiveRestaurant } from "@/hooks/useActiveRestaurant";
import { getApiBase } from "@/lib/apiBase";
import { getToken } from "@/lib/authStorage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  CalendarDays, Clock, Users, TableProperties, Plus, Pencil, Trash2,
  CheckCircle2, XCircle, UtensilsCrossed, RefreshCw, Search, ChevronLeft, ChevronRight,
  Phone, PhoneCall, AlertCircle, MessageSquare,
  Eye, Mail, Volume2
} from "lucide-react";
import { format, addDays, subDays, isToday } from "date-fns";

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (name.slice(0, 2) || "R").toUpperCase();
};

const getDisplayNotes = (notes: string | null) => {
  if (!notes) return null;
  if (/reserved via synthflow/i.test(notes) || /phone ai/i.test(notes) || /authflow/i.test(notes) || /synthflow/i.test(notes)) {
    return null;
  }
  return notes.trim();
};

const STATUS_COLORS: Record<string, string> = {
  pending:   "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  confirmed: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  seated:    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  completed: "bg-slate-500/15 text-slate-700 dark:text-slate-400 border-slate-500/30",
  cancelled: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
  no_show:   "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/30",
};

const STATUS_LABELS: Record<string, string> = {
  pending:   "Pending",
  confirmed: "Confirmed",
  seated:    "Seated",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show:   "No Show",
};

const SLOTS = ["1", "1.5", "2", "2.5", "3"];

interface RestaurantTable {
  id: string;
  table_number: string;
  capacity: number;
  location: string | null;
  is_active: boolean;
  notes: string | null;
}

interface Reservation {
  id: string;
  table_id: string | null;
  table_number: string | null;
  table_capacity: number | null;
  table_location: string | null;
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
  call_id?: string | null;
  ai_extracted_data?: any;
  created_at: string;
}

export default function TableReservations() {
  const { restaurantId } = useActiveRestaurant();

  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Reservation Details Modal
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [detailReservation, setDetailReservation] = useState<Reservation | null>(null);

  const openDetailReservation = (r: Reservation) => {
    setDetailReservation(r);
    setDetailDialogOpen(true);
  };

  // Table form
  const [tableDialogOpen, setTableDialogOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<RestaurantTable | null>(null);
  const [tableForm, setTableForm] = useState({ table_number: "", capacity: "4", location: "", notes: "" });

  // Reservation form
  const [reservationDialogOpen, setReservationDialogOpen] = useState(false);
  const [editingReservation, setEditingReservation] = useState<Reservation | null>(null);
  const [reservationForm, setReservationForm] = useState({
    table_id: "", customer_name: "", customer_phone: "", customer_email: "",
    party_size: "2", reservation_date: format(new Date(), "yyyy-MM-dd"),
    start_time: "19:00", slot_duration_hours: "1", notes: "", status: "confirmed",
  });

  // Delete
  const [deleteReservationId, setDeleteReservationId] = useState<string | null>(null);
  const [deleteTableId, setDeleteTableId] = useState<string | null>(null);

  const authHeader = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` });
  const API = getApiBase() + "/api";

  // ── Data Fetching ──────────────────────────────────────
  const loadTables = useCallback(async () => {
    if (!restaurantId) return;
    const r = await fetch(`${API}/restaurants/${restaurantId}/tables`, { headers: authHeader() });
    if (r.ok) setTables((await r.json()).tables || []);
  }, [restaurantId]);

  const loadReservations = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const r = await fetch(`${API}/restaurants/${restaurantId}/reservations?date=${dateStr}`, { headers: authHeader() });
    if (r.ok) setReservations((await r.json()).reservations || []);
    setLoading(false);
  }, [restaurantId, selectedDate]);

  useEffect(() => { loadTables(); }, [loadTables]);
  useEffect(() => { loadReservations(); }, [loadReservations]);

  // ── Table CRUD ─────────────────────────────────────────
  const openAddTable = () => {
    setEditingTable(null);
    setTableForm({ table_number: "", capacity: "4", location: "", notes: "" });
    setTableDialogOpen(true);
  };

  const openEditTable = (t: RestaurantTable) => {
    setEditingTable(t);
    setTableForm({ table_number: t.table_number, capacity: String(t.capacity), location: t.location || "", notes: t.notes || "" });
    setTableDialogOpen(true);
  };

  const saveTable = async () => {
    if (!tableForm.table_number.trim()) { toast.error("Table number is required"); return; }
    if (Number(tableForm.capacity) < 1) { toast.error("Capacity must be at least 1"); return; }
    try {
      let r;
      if (editingTable) {
        r = await fetch(`${API}/tables/${editingTable.id}`, {
          method: "PATCH", headers: authHeader(),
          body: JSON.stringify({ ...tableForm, capacity: Number(tableForm.capacity) }),
        });
      } else {
        r = await fetch(`${API}/restaurants/${restaurantId}/tables`, {
          method: "POST", headers: authHeader(),
          body: JSON.stringify({ ...tableForm, capacity: Number(tableForm.capacity) }),
        });
      }
      if (!r.ok) { const d = await r.json(); toast.error(d.error || "Failed to save table"); return; }
      toast.success(editingTable ? "Table updated" : "Table added");
      setTableDialogOpen(false);
      loadTables();
    } catch { toast.error("Network error"); }
  };

  const confirmDeleteTable = async () => {
    if (!deleteTableId) return;
    const r = await fetch(`${API}/tables/${deleteTableId}`, { method: "DELETE", headers: authHeader() });
    if (r.ok) { toast.success("Table deactivated"); loadTables(); } else toast.error("Failed to deactivate table");
    setDeleteTableId(null);
  };

  // ── Reservation CRUD ───────────────────────────────────
  const openAddReservation = () => {
    setEditingReservation(null);
    setReservationForm({
      table_id: "", customer_name: "", customer_phone: "", customer_email: "",
      party_size: "2", reservation_date: format(selectedDate, "yyyy-MM-dd"),
      start_time: "19:00", slot_duration_hours: "1", notes: "", status: "confirmed",
    });
    setReservationDialogOpen(true);
  };

  const openEditReservation = (r: Reservation) => {
    setEditingReservation(r);
    setReservationForm({
      table_id: r.table_id || "",
      customer_name: r.customer_name,
      customer_phone: r.customer_phone || "",
      customer_email: r.customer_email || "",
      party_size: String(r.party_size),
      reservation_date: r.reservation_date,
      start_time: r.start_time.slice(0, 5),
      slot_duration_hours: String(r.slot_duration_hours),
      notes: r.notes || "",
      status: r.status,
    });
    setReservationDialogOpen(true);
  };

  const saveReservation = async () => {
    if (!reservationForm.customer_name.trim()) { toast.error("Customer name is required"); return; }
    if (!reservationForm.reservation_date) { toast.error("Date is required"); return; }
    if (!reservationForm.start_time) { toast.error("Time is required"); return; }
    try {
      let r;
      const payload = {
        ...reservationForm,
        party_size: Number(reservationForm.party_size),
        slot_duration_hours: Number(reservationForm.slot_duration_hours),
        table_id: reservationForm.table_id || undefined,
      };
      if (editingReservation) {
        r = await fetch(`${API}/reservations/${editingReservation.id}`, {
          method: "PATCH", headers: authHeader(), body: JSON.stringify(payload),
        });
      } else {
        r = await fetch(`${API}/restaurants/${restaurantId}/reservations`, {
          method: "POST", headers: authHeader(), body: JSON.stringify(payload),
        });
      }
      if (!r.ok) { const d = await r.json(); toast.error(d.error || "Failed to save reservation"); return; }
      toast.success(editingReservation ? "Reservation updated" : "Reservation created");
      setReservationDialogOpen(false);
      loadReservations();
    } catch { toast.error("Network error"); }
  };

  const quickStatus = async (id: string, status: string) => {
    const r = await fetch(`${API}/reservations/${id}`, {
      method: "PATCH", headers: authHeader(), body: JSON.stringify({ status }),
    });
    if (r.ok) { loadReservations(); toast.success(`Marked as ${STATUS_LABELS[status]}`); }
    else toast.error("Update failed");
  };

  const confirmDeleteReservation = async () => {
    if (!deleteReservationId) return;
    const r = await fetch(`${API}/reservations/${deleteReservationId}`, { method: "DELETE", headers: authHeader() });
    if (r.ok) { toast.success("Reservation cancelled"); loadReservations(); } else toast.error("Failed to cancel");
    setDeleteReservationId(null);
  };

  // ── Filtered list ──────────────────────────────────────
  const filtered = reservations.filter((r) =>
    !searchTerm || r.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.customer_phone || "").includes(searchTerm) ||
    (r.table_number || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activeTables = tables.filter((t) => t.is_active);
  const totalCapacity = activeTables.reduce((s, t) => s + t.capacity, 0);
  const todayRes = reservations.filter((r) => ["confirmed", "pending", "seated"].includes(r.status)).length;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-primary" />
            Table Reservations
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage tables and bookings for your restaurant</p>
        </div>
        <Button id="btn-add-reservation" onClick={openAddReservation} className="gradient-primary shadow-lg gap-2">
          <Plus className="h-4 w-4" /> New Reservation
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Active Tables", value: activeTables.length, icon: TableProperties, color: "text-blue-500" },
          { label: "Total Capacity", value: totalCapacity, icon: Users, color: "text-violet-500" },
          { label: "Today's Bookings", value: todayRes, icon: CalendarDays, color: "text-emerald-500" },
          { label: "Total Tonight", value: reservations.filter((r) => r.status !== "cancelled").length, icon: Clock, color: "text-orange-500" },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <s.icon className={`h-4 w-4 ${s.color}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-xl font-bold text-foreground">{s.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="reservations">
        <TabsList className="mb-4">
          <TabsTrigger value="reservations" id="tab-reservations">
            <CalendarDays className="h-4 w-4 mr-2" /> Reservations
          </TabsTrigger>
          <TabsTrigger value="tables" id="tab-tables">
            <TableProperties className="h-4 w-4 mr-2" /> Tables
          </TabsTrigger>
        </TabsList>

        {/* ─── RESERVATIONS TAB ─────────────────────── */}
        <TabsContent value="reservations" className="space-y-4">
          {/* Date Navigator */}
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="outline" size="icon" onClick={() => setSelectedDate((d) => subDays(d, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-4 py-2 shadow-sm">
              <CalendarDays className="h-4 w-4 text-primary" />
              <span className="font-semibold text-sm">
                {isToday(selectedDate) ? "Today — " : ""}{format(selectedDate, "EEEE, MMMM d, yyyy")}
              </span>
            </div>
            <Button variant="outline" size="icon" onClick={() => setSelectedDate((d) => addDays(d, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            {!isToday(selectedDate) && (
              <Button variant="ghost" size="sm" onClick={() => setSelectedDate(new Date())}>Today</Button>
            )}
            <Button variant="ghost" size="icon" onClick={loadReservations} title="Refresh">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <div className="ml-auto relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search guest, table…"
                className="pl-8 h-9 w-52 text-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* Reservation Cards */}
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
              <RefreshCw className="h-5 w-5 animate-spin" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <CalendarDays className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground font-medium">No reservations found</p>
              <p className="text-sm text-muted-foreground/60 mt-1">Try a different date or add a new reservation</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((res) => (
                <div
                  key={res.id}
                  className="bg-card border border-border/80 hover:border-primary/40 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between gap-4 group"
                >
                  {/* Top: Customer Avatar, Name, Phone & Status Badge */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 border border-primary/20 flex items-center justify-center font-bold text-sm text-primary shadow-sm shrink-0">
                        {getInitials(res.customer_name)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground text-[15px] truncate leading-tight">
                          {res.customer_name}
                        </p>
                        {res.customer_phone ? (
                          <a
                            href={`tel:${res.customer_phone}`}
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors mt-0.5"
                          >
                            <Phone className="h-3 w-3 shrink-0" />
                            <span className="truncate">{res.customer_phone}</span>
                          </a>
                        ) : (
                          <p className="text-xs text-muted-foreground/60 italic mt-0.5">No phone</p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge className={`text-[11px] px-2.5 py-0.5 font-medium border ${STATUS_COLORS[res.status] || ""}`}>
                        {STATUS_LABELS[res.status] || res.status}
                      </Badge>
                      {res.source === "phone" && (
                        <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0 h-4 font-normal text-violet-600 dark:text-violet-400 border-violet-500/20 bg-violet-500/5">
                          <PhoneCall className="h-2.5 w-2.5" /> Voice AI
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Middle: Details & Table info */}
                  <div className="space-y-2.5">
                    {/* Time & Guests pills */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-secondary/60 text-secondary-foreground text-xs font-medium border border-border/40">
                        <Clock className="h-3.5 w-3.5 text-primary" />
                        <span>{res.start_time.slice(0, 5)}</span>
                        <span className="text-muted-foreground font-normal">({res.slot_duration_hours}h slot)</span>
                      </div>
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-secondary/60 text-secondary-foreground text-xs font-medium border border-border/40">
                        <Users className="h-3.5 w-3.5 text-primary" />
                        <span>{res.party_size} {res.party_size > 1 ? "Guests" : "Guest"}</span>
                      </div>
                    </div>

                    {/* Table Assignment Status */}
                    {res.table_number ? (
                      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs">
                        <div className="flex items-center gap-2">
                          <TableProperties className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <div>
                            <span className="font-semibold text-emerald-950 dark:text-emerald-100">
                              Table {res.table_number}
                            </span>
                            {res.table_location && (
                              <span className="text-emerald-700 dark:text-emerald-300 ml-1">({res.table_location})</span>
                            )}
                          </div>
                        </div>
                        {res.table_capacity && (
                          <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                            Max {res.table_capacity} guests
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/25 text-xs">
                        <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                          <span className="font-medium">No table assigned</span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-[11px] px-2.5 text-amber-800 dark:text-amber-200 border-amber-500/40 hover:bg-amber-500/20 font-semibold"
                          onClick={() => openEditReservation(res)}
                        >
                          Assign Table →
                        </Button>
                      </div>
                    )}

                    {/* Customer special requests if any */}
                    {(() => {
                      const note = getDisplayNotes(res.notes);
                      if (!note) return null;
                      return (
                        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-muted/40 border border-border/50 text-xs text-muted-foreground">
                          <MessageSquare className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                          <span className="italic leading-relaxed">{note}</span>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Actions Footer */}
                  <div className="flex items-center gap-2 pt-2 border-t border-border/40">
                    {res.status === "pending" && (
                      <Button
                        size="sm"
                        className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm"
                        onClick={() => quickStatus(res.id, "confirmed")}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Confirm
                      </Button>
                    )}
                    {res.status === "confirmed" && (
                      <Button
                        size="sm"
                        className="h-8 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm"
                        onClick={() => quickStatus(res.id, "seated")}
                      >
                        <UtensilsCrossed className="h-3.5 w-3.5" /> Seat Guests
                      </Button>
                    )}
                    {res.status === "seated" && (
                      <Button
                        size="sm"
                        className="h-8 text-xs gap-1.5 bg-slate-800 hover:bg-slate-900 dark:bg-slate-200 dark:hover:bg-white dark:text-slate-900 text-white font-medium shadow-sm"
                        onClick={() => quickStatus(res.id, "completed")}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Complete
                      </Button>
                    )}
                    {["pending", "confirmed"].includes(res.status) && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs text-muted-foreground hover:text-destructive hover:border-destructive/30"
                        onClick={() => quickStatus(res.id, "no_show")}
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1" /> No-show
                      </Button>
                    )}

                    <div className="ml-auto flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2.5 text-xs gap-1 text-muted-foreground hover:text-foreground font-medium"
                        onClick={() => openDetailReservation(res)}
                        title="View full booking details"
                      >
                        <Eye className="h-3.5 w-3.5" /> Details
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => openEditReservation(res)}
                        title="Edit reservation"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteReservationId(res.id)}
                        title="Delete reservation"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ─── TABLES TAB ───────────────────────────── */}
        <TabsContent value="tables" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{activeTables.length} active tables · {totalCapacity} total seats</p>
            <Button id="btn-add-table" onClick={openAddTable} size="sm" className="gradient-primary gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Add Table
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {tables.map((t) => (
              <div
                key={t.id}
                className={`border rounded-xl p-4 shadow-sm transition-all ${
                  t.is_active ? "bg-card border-border" : "bg-muted/40 border-border/50 opacity-60"
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <TableProperties className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-bold text-foreground">{t.table_number}</p>
                      <p className="text-xs text-muted-foreground">{t.location || "No location"}</p>
                    </div>
                  </div>
                  <Badge variant={t.is_active ? "default" : "secondary"} className="text-xs">
                    {t.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>

                <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-3">
                  <Users className="h-3.5 w-3.5 text-primary/70" />
                  Up to {t.capacity} guests
                </div>

                {t.notes && (
                  <p className="text-xs text-muted-foreground italic mb-3">"{t.notes}"</p>
                )}

                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1 h-8 text-xs gap-1" onClick={() => openEditTable(t)}>
                    <Pencil className="h-3 w-3" /> Edit
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs gap-1 text-destructive hover:text-destructive"
                    onClick={() => setDeleteTableId(t.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}

            {tables.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
                <TableProperties className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground font-medium">No tables configured</p>
                <p className="text-sm text-muted-foreground/60 mt-1">Add tables so AI can auto-assign reservations</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ─── TABLE DIALOG ─────────────────────────── */}
      <Dialog open={tableDialogOpen} onOpenChange={setTableDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTable ? "Edit Table" : "Add New Table"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="tbl-number">Table Number / Name *</Label>
              <Input id="tbl-number" placeholder="e.g. T1, Table 5, Rooftop A"
                value={tableForm.table_number}
                onChange={(e) => setTableForm((f) => ({ ...f, table_number: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="tbl-capacity">Capacity (persons) *</Label>
              <Input id="tbl-capacity" type="number" min={1} max={50}
                value={tableForm.capacity}
                onChange={(e) => setTableForm((f) => ({ ...f, capacity: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="tbl-location">Location / Zone</Label>
              <Input id="tbl-location" placeholder="e.g. Indoor, Outdoor, Rooftop"
                value={tableForm.location}
                onChange={(e) => setTableForm((f) => ({ ...f, location: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="tbl-notes">Notes</Label>
              <Textarea id="tbl-notes" placeholder="Any special info about this table"
                rows={2} value={tableForm.notes}
                onChange={(e) => setTableForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTableDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveTable} className="gradient-primary">{editingTable ? "Update" : "Add Table"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── RESERVATION DIALOG ───────────────────── */}
      <Dialog open={reservationDialogOpen} onOpenChange={setReservationDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingReservation ? "Edit Reservation" : "New Reservation"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2">
              <Label htmlFor="res-customer">Customer Name *</Label>
              <Input id="res-customer" placeholder="Full name"
                value={reservationForm.customer_name}
                onChange={(e) => setReservationForm((f) => ({ ...f, customer_name: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="res-phone">Phone</Label>
              <Input id="res-phone" placeholder="+1 555 000 0000"
                value={reservationForm.customer_phone}
                onChange={(e) => setReservationForm((f) => ({ ...f, customer_phone: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="res-email">Email</Label>
              <Input id="res-email" type="email" placeholder="guest@email.com"
                value={reservationForm.customer_email}
                onChange={(e) => setReservationForm((f) => ({ ...f, customer_email: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="res-date">Date *</Label>
              <Input id="res-date" type="date" value={reservationForm.reservation_date}
                onChange={(e) => setReservationForm((f) => ({ ...f, reservation_date: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="res-time">Start Time *</Label>
              <Input id="res-time" type="time" value={reservationForm.start_time}
                onChange={(e) => setReservationForm((f) => ({ ...f, start_time: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="res-party">Guests *</Label>
              <Input id="res-party" type="number" min={1} max={50} value={reservationForm.party_size}
                onChange={(e) => setReservationForm((f) => ({ ...f, party_size: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="res-slot">Slot Duration</Label>
              <Select value={reservationForm.slot_duration_hours}
                onValueChange={(v) => setReservationForm((f) => ({ ...f, slot_duration_hours: v }))}>
                <SelectTrigger id="res-slot"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SLOTS.map((s) => <SelectItem key={s} value={s}>{s} hour{s !== "1" ? "s" : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="res-table">Assign Table</Label>
              <Select value={reservationForm.table_id || "__none"}
                onValueChange={(v) => setReservationForm((f) => ({ ...f, table_id: v === "__none" ? "" : v }))}>
                <SelectTrigger id="res-table"><SelectValue placeholder="Auto-assign" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Auto-assign</SelectItem>
                  {activeTables.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.table_number} (seats {t.capacity}){t.location ? ` · ${t.location}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="res-status">Status</Label>
              <Select value={reservationForm.status}
                onValueChange={(v) => setReservationForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger id="res-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label htmlFor="res-notes">Notes</Label>
              <Textarea id="res-notes" placeholder="Special requests, dietary notes…" rows={2}
                value={reservationForm.notes}
                onChange={(e) => setReservationForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReservationDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveReservation} className="gradient-primary">
              {editingReservation ? "Update Reservation" : "Create Reservation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── RESERVATION DETAILS DIALOG ───────────── */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          {detailReservation && (
            <div className="space-y-5">
              <DialogHeader>
                <div className="flex items-start justify-between gap-3 pt-1">
                  <div>
                    <DialogTitle className="text-xl flex items-center gap-2">
                      <span>Booking Details</span>
                    </DialogTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      ID: <span className="font-mono text-[11px]">{detailReservation.id}</span>
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge className={`text-xs px-2.5 py-0.5 font-medium border ${STATUS_COLORS[detailReservation.status] || ""}`}>
                      {STATUS_LABELS[detailReservation.status] || detailReservation.status}
                    </Badge>
                    {detailReservation.source === "phone" ? (
                      <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0 font-normal text-violet-600 dark:text-violet-400 border-violet-500/20 bg-violet-500/5">
                        <PhoneCall className="h-2.5 w-2.5" /> Voice AI Booking
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0 font-normal text-sky-600 dark:text-sky-400 border-sky-500/20 bg-sky-500/5">
                        Online Booking
                      </Badge>
                    )}
                  </div>
                </div>
              </DialogHeader>

              {/* Customer Info Card */}
              <div className="bg-muted/40 rounded-xl p-4 border border-border/60 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 border border-primary/20 flex items-center justify-center font-bold text-base text-primary shadow-sm shrink-0">
                    {getInitials(detailReservation.customer_name)}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-base text-foreground truncate">{detailReservation.customer_name}</h4>
                    <p className="text-xs text-muted-foreground">Guest Contact Information</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border/40 text-sm">
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-primary shrink-0" />
                    {detailReservation.customer_phone ? (
                      <a href={`tel:${detailReservation.customer_phone}`} className="text-foreground hover:text-primary transition-colors font-medium">
                        {detailReservation.customer_phone}
                      </a>
                    ) : (
                      <span className="text-muted-foreground italic">No phone provided</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-primary shrink-0" />
                    {detailReservation.customer_email ? (
                      <a href={`mailto:${detailReservation.customer_email}`} className="text-foreground hover:text-primary transition-colors truncate">
                        {detailReservation.customer_email}
                      </a>
                    ) : (
                      <span className="text-muted-foreground italic">No email</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Booking Schedule & Party Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-card border border-border/70 rounded-xl p-3 shadow-xs">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                    <CalendarDays className="h-3.5 w-3.5 text-primary" /> Date
                  </div>
                  <p className="font-semibold text-sm text-foreground">
                    {format(new Date(detailReservation.reservation_date + "T00:00:00"), "EEE, MMM d, yyyy")}
                  </p>
                </div>

                <div className="bg-card border border-border/70 rounded-xl p-3 shadow-xs">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                    <Clock className="h-3.5 w-3.5 text-primary" /> Time & Duration
                  </div>
                  <p className="font-semibold text-sm text-foreground">
                    {detailReservation.start_time.slice(0, 5)} ({detailReservation.slot_duration_hours}h slot)
                  </p>
                </div>

                <div className="bg-card border border-border/70 rounded-xl p-3 shadow-xs">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                    <Users className="h-3.5 w-3.5 text-primary" /> Party Size
                  </div>
                  <p className="font-semibold text-sm text-foreground">
                    {detailReservation.party_size} {detailReservation.party_size > 1 ? "Guests" : "Guest"}
                  </p>
                </div>
              </div>

              {/* Table Assignment */}
              <div className="bg-card border border-border/70 rounded-xl p-4 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <TableProperties className="h-4 w-4 text-primary" /> Table Assignment
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => {
                      setDetailDialogOpen(false);
                      openEditReservation(detailReservation);
                    }}
                  >
                    <Pencil className="h-3 w-3" /> Change Table
                  </Button>
                </div>

                {detailReservation.table_number ? (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-sm">
                    <div>
                      <p className="font-bold text-emerald-950 dark:text-emerald-100">
                        Table {detailReservation.table_number}
                      </p>
                      <p className="text-xs text-emerald-700 dark:text-emerald-300">
                        {detailReservation.table_location || "Standard Area"} · Capacity {detailReservation.table_capacity || 4} guests
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs border-emerald-500/30 text-emerald-700 dark:text-emerald-300 bg-emerald-500/10">
                      Assigned
                    </Badge>
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-amber-500/10 border border-amber-500/25 text-sm text-amber-800 dark:text-amber-200">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                      <span>No table currently assigned to this reservation</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Notes / Special Requests */}
              {(() => {
                const note = getDisplayNotes(detailReservation.notes);
                if (!note) return null;
                return (
                  <div className="bg-card border border-border/70 rounded-xl p-4 shadow-xs space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <MessageSquare className="h-3.5 w-3.5 text-primary" /> Special Requests & Notes
                    </p>
                    <p className="text-sm text-foreground italic bg-muted/40 p-3 rounded-lg border border-border/40">
                      "{note}"
                    </p>
                  </div>
                );
              })()}

              {/* AI Call Insights (if available) */}
              {detailReservation.ai_extracted_data && (
                <div className="bg-card border border-border/70 rounded-xl p-4 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Volume2 className="h-3.5 w-3.5 text-primary" /> Voice Call Insights
                    </p>
                    {detailReservation.ai_extracted_data.synthflow_call_id && (
                      <span className="text-[11px] font-mono text-muted-foreground">
                        Call ID: {String(detailReservation.ai_extracted_data.synthflow_call_id).slice(0, 10)}...
                      </span>
                    )}
                  </div>

                  {detailReservation.ai_extracted_data.call_summary && (
                    <div className="bg-violet-500/5 border border-violet-500/20 rounded-lg p-3 text-xs text-foreground/90 space-y-1">
                      <p className="font-semibold text-violet-700 dark:text-violet-400">AI Call Summary</p>
                      <p className="text-muted-foreground leading-relaxed">
                        {typeof detailReservation.ai_extracted_data.call_summary === "string"
                          ? detailReservation.ai_extracted_data.call_summary
                          : JSON.stringify(detailReservation.ai_extracted_data.call_summary)}
                      </p>
                    </div>
                  )}

                  {detailReservation.ai_extracted_data.recording_url && (
                    <div className="space-y-1 pt-1">
                      <p className="text-xs font-medium text-muted-foreground">Call Audio Recording</p>
                      <audio controls src={detailReservation.ai_extracted_data.recording_url} className="w-full h-8" />
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons in Modal */}
              <div className="pt-3 border-t border-border/60 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  {detailReservation.status === "pending" && (
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium gap-1.5 shadow-sm"
                      onClick={() => {
                        quickStatus(detailReservation.id, "confirmed");
                        setDetailReservation((r) => r ? { ...r, status: "confirmed" } : null);
                      }}
                    >
                      <CheckCircle2 className="h-4 w-4" /> Confirm Booking
                    </Button>
                  )}
                  {detailReservation.status === "confirmed" && (
                    <Button
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 text-white font-medium gap-1.5 shadow-sm"
                      onClick={() => {
                        quickStatus(detailReservation.id, "seated");
                        setDetailReservation((r) => r ? { ...r, status: "seated" } : null);
                      }}
                    >
                      <UtensilsCrossed className="h-4 w-4" /> Seat Guests
                    </Button>
                  )}
                  {detailReservation.status === "seated" && (
                    <Button
                      size="sm"
                      className="bg-slate-800 hover:bg-slate-900 text-white font-medium gap-1.5 shadow-sm"
                      onClick={() => {
                        quickStatus(detailReservation.id, "completed");
                        setDetailReservation((r) => r ? { ...r, status: "completed" } : null);
                      }}
                    >
                      <CheckCircle2 className="h-4 w-4" /> Mark Completed
                    </Button>
                  )}
                  {["pending", "confirmed"].includes(detailReservation.status) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-muted-foreground hover:text-destructive gap-1"
                      onClick={() => {
                        quickStatus(detailReservation.id, "no_show");
                        setDetailReservation((r) => r ? { ...r, status: "no_show" } : null);
                      }}
                    >
                      <XCircle className="h-3.5 w-3.5" /> No-Show
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => {
                      setDetailDialogOpen(false);
                      openEditReservation(detailReservation);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:bg-destructive/10 hover:border-destructive/30 gap-1.5"
                    onClick={() => {
                      setDetailDialogOpen(false);
                      setDeleteReservationId(detailReservation.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDetailDialogOpen(false)}>
                    Close
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── CONFIRM DELETE RESERVATION ───────────── */}
      <AlertDialog open={!!deleteReservationId} onOpenChange={(o) => !o && setDeleteReservationId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Reservation?</AlertDialogTitle>
            <AlertDialogDescription>This will mark the reservation as cancelled.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteReservation} className="bg-destructive text-destructive-foreground">
              Cancel Reservation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── CONFIRM DEACTIVATE TABLE ─────────────── */}
      <AlertDialog open={!!deleteTableId} onOpenChange={(o) => !o && setDeleteTableId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Table?</AlertDialogTitle>
            <AlertDialogDescription>The table will be hidden from availability checks but existing reservations are kept.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteTable} className="bg-destructive text-destructive-foreground">
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
