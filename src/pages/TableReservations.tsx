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
  CheckCircle2, XCircle, UtensilsCrossed, RefreshCw, Search, ChevronLeft, ChevronRight
} from "lucide-react";
import { format, addDays, subDays, isToday } from "date-fns";


const STATUS_COLORS: Record<string, string> = {
  pending:   "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
  confirmed: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  seated:    "bg-green-500/15 text-green-600 border-green-500/30",
  completed: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  cancelled: "bg-red-500/15 text-red-600 border-red-500/30",
  no_show:   "bg-gray-500/15 text-gray-500 border-gray-500/30",
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
  created_at: string;
}

export default function TableReservations() {
  const { restaurantId } = useActiveRestaurant();

  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

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
                  className="bg-card border border-border rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold text-foreground leading-tight">{res.customer_name}</p>
                      {res.customer_phone && (
                        <p className="text-xs text-muted-foreground mt-0.5">{res.customer_phone}</p>
                      )}
                    </div>
                    <Badge className={`text-xs border ${STATUS_COLORS[res.status] || ""}`}>
                      {STATUS_LABELS[res.status] || res.status}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Clock className="h-3.5 w-3.5 text-primary/70" />
                      {res.start_time.slice(0, 5)} ({res.slot_duration_hours}h)
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Users className="h-3.5 w-3.5 text-primary/70" />
                      {res.party_size} guest{res.party_size > 1 ? "s" : ""}
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground col-span-2">
                      <TableProperties className="h-3.5 w-3.5 text-primary/70" />
                      {res.table_number ? `Table ${res.table_number}` : "No table assigned"}
                      {res.table_location && ` — ${res.table_location}`}
                    </div>
                  </div>

                  {res.notes && (
                    <p className="text-xs text-muted-foreground bg-muted/60 rounded-lg px-3 py-1.5 mb-3 italic">
                      "{res.notes}"
                    </p>
                  )}

                  <div className="flex items-center gap-2 flex-wrap">
                    {res.status === "confirmed" && (
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-green-600 border-green-500/30"
                        onClick={() => quickStatus(res.id, "seated")}>
                        <CheckCircle2 className="h-3 w-3" /> Seat
                      </Button>
                    )}
                    {res.status === "seated" && (
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-emerald-600 border-emerald-500/30"
                        onClick={() => quickStatus(res.id, "completed")}>
                        <UtensilsCrossed className="h-3 w-3" /> Complete
                      </Button>
                    )}
                    {["pending", "confirmed"].includes(res.status) && (
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-red-500 border-red-500/30"
                        onClick={() => quickStatus(res.id, "no_show")}>
                        <XCircle className="h-3 w-3" /> No-show
                      </Button>
                    )}
                    <div className="ml-auto flex gap-1.5">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditReservation(res)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDeleteReservationId(res.id)}>
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
        <DialogContent className="max-w-md">
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
        <DialogContent className="max-w-lg">
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
