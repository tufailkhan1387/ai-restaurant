import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Bike, Pencil, Plus, Trash2, UserCircle2, Phone, Mail, IdCard, Search, Upload, X, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useActiveRestaurant } from "@/hooks/useActiveRestaurant";
import { useAuth } from "@/hooks/useAuth";
import { getApiBase, resolveMediaUrl } from "@/lib/apiBase";
import { getToken } from "@/lib/authStorage";

interface Driver {
  id: string;
  user_id: string | null;
  full_name: string;
  phone: string;
  email: string | null;
  license_number: string | null;
  vehicle_id: string | null;
  status: string;
  is_active: boolean;
  image_url: string | null;
}

interface Vehicle {
  id: string;
  plate_number: string;
  vehicle_type: string;
  restaurant_id: string;
}

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
}

interface MyRestaurant {
  id: string;
  name: string;
}

async function fetchMyRestaurants(userId: string): Promise<MyRestaurant[]> {
  const rolesRes = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const isSuperAdmin = (rolesRes.data as { role: string }[] | null)?.some((r) => r.role === "super_admin");
  if (isSuperAdmin) {
    const r = await supabase.from("restaurants").select("id, name").eq("is_active", true).order("name");
    return (r.data as MyRestaurant[]) ?? [];
  }
  const mem = await supabase.from("restaurant_members").select("restaurant_id").eq("user_id", userId);
  const ids = [...new Set((mem.data as { restaurant_id: string }[] | null)?.map((m) => m.restaurant_id) ?? [])];
  if (!ids.length) return [];
  const r = await supabase.from("restaurants").select("id, name").in("id", ids).order("name");
  return (r.data as MyRestaurant[]) ?? [];
}

async function syncDriverRestaurants(driverId: string, restaurantIds: string[]) {
  await supabase.from("driver_restaurants").delete().eq("driver_id", driverId);
  if (!restaurantIds.length) return;
  const rows = restaurantIds.map((restaurant_id) => ({ driver_id: driverId, restaurant_id }));
  await supabase.from("driver_restaurants").insert(rows);
}

export default function Drivers() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { restaurantId } = useActiveRestaurant();
  const [myRestaurants, setMyRestaurants] = useState<MyRestaurant[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [assignmentsByDriver, setAssignmentsByDriver] = useState<Record<string, string[]>>({});
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Driver | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (!user?.id) return;
    void (async () => {
      const list = await fetchMyRestaurants(user.id);
      setMyRestaurants(list);
    })();
  }, [user?.id]);

  const load = useCallback(async () => {
    if (!restaurantId || !user?.id) return;
    setLoading(true);
    try {
      const linkRes = await supabase
        .from("driver_restaurants")
        .select("driver_id, restaurant_id")
        .eq("restaurant_id", restaurantId);
      const ids = [...new Set((linkRes.data as { driver_id: string }[] | null)?.map((x) => x.driver_id) ?? [])];

      let driverRows: Driver[] = [];
      if (ids.length) {
        const dRes = await supabase.from("drivers").select("*").in("id", ids).order("created_at", { ascending: false });
        driverRows = (dRes.data as Driver[]) ?? [];
      }

      const assignMap: Record<string, string[]> = {};
      if (ids.length) {
        const allRes = await supabase.from("driver_restaurants").select("driver_id, restaurant_id").in("driver_id", ids);
        for (const row of (allRes.data as { driver_id: string; restaurant_id: string }[] | null) ?? []) {
          if (!assignMap[row.driver_id]) assignMap[row.driver_id] = [];
          assignMap[row.driver_id].push(row.restaurant_id);
        }
      }

      const ridList = myRestaurants.length ? myRestaurants.map((r) => r.id) : [restaurantId];
      const vRes = await supabase
        .from("vehicles")
        .select("id, plate_number, vehicle_type, restaurant_id")
        .in("restaurant_id", ridList);

      const pRes = await supabase.from("profiles").select("id, email, full_name");

      setDrivers(driverRows);
      setAssignmentsByDriver(assignMap);
      setVehicles((vRes.data as Vehicle[]) ?? []);
      setProfiles((pRes.data as Profile[]) ?? []);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Load failed";
      toast({ variant: "destructive", title: "Error", description: msg });
    } finally {
      setLoading(false);
    }
  }, [restaurantId, user?.id, myRestaurants, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (
    form: Partial<Driver>,
    restaurantIds: string[],
    cred?: { password: string; confirmPassword: string },
  ) => {
    if (!user?.id) return;
    if (!restaurantIds.length) {
      toast({ variant: "destructive", title: "Restaurants required", description: "Select at least one restaurant." });
      return;
    }

    const vRow = form.vehicle_id ? vehicles.find((v) => v.id === form.vehicle_id) : null;
    const allowedVehicle = !form.vehicle_id || !!(vRow && restaurantIds.includes(vRow.restaurant_id));
    if (!allowedVehicle) {
      toast({
        variant: "destructive",
        title: "Invalid vehicle",
        description: "Choose a vehicle that belongs to one of the selected restaurants, or clear the vehicle.",
      });
      return;
    }

    let userId: string | null = edit?.user_id ?? null;

    if (!edit) {
      const email = (form.email || "").trim().toLowerCase();
      if (!email) {
        toast({ variant: "destructive", title: "Email required", description: "Enter a login email for the new driver." });
        return;
      }
      if (!cred?.password || cred.password.length < 8) {
        toast({ variant: "destructive", title: "Password", description: "Password must be at least 8 characters." });
        return;
      }
      if (cred.password !== cred.confirmPassword) {
        toast({ variant: "destructive", title: "Password", description: "Passwords do not match." });
        return;
      }
      const token = getToken();
      if (!token) {
        toast({ variant: "destructive", title: "Not signed in", description: "Sign in again and retry." });
        return;
      }
      const acRes = await fetch(`${getApiBase()}/api/auth/create-driver-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          email,
          password: cred.password,
          full_name: form.full_name || email.split("@")[0],
        }),
      });
      const acJson = await acRes.json().catch(() => ({}));
      if (!acRes.ok) {
        toast({
          variant: "destructive",
          title: "Account not created",
          description: typeof acJson.error === "string" ? acJson.error : acRes.statusText,
        });
        return;
      }
      userId = acJson.user_id as string;
      if (!userId) {
        toast({ variant: "destructive", title: "Failed", description: "Missing user id from server." });
        return;
      }
    }

    const payload = {
      user_id: userId,
      full_name: form.full_name || "",
      phone: form.phone || "",
      email: (form.email || "").trim() || null,
      license_number: form.license_number || null,
      vehicle_id: form.vehicle_id || null,
      status: form.status || "offline",
      is_active: form.is_active ?? true,
      image_url: form.image_url || null,
    };

    if (edit) {
      const res = await supabase.from("drivers").update(payload).eq("id", edit.id);
      if (res.error) {
        toast({ variant: "destructive", title: "Failed", description: (res.error as { message?: string }).message });
        return;
      }
      await syncDriverRestaurants(edit.id, restaurantIds);
    } else {
      const res = await supabase.from("drivers").insert(payload).select().maybeSingle();
      if (res.error) {
        toast({ variant: "destructive", title: "Failed", description: (res.error as { message?: string }).message });
        return;
      }
      const row = res.data as { id: string } | null;
      if (!row?.id) {
        toast({ variant: "destructive", title: "Failed", description: "Could not read new driver id." });
        return;
      }
      await syncDriverRestaurants(row.id, restaurantIds);
    }

    toast({ title: "Driver saved successfully" });
    setOpen(false);
    setEdit(null);
    void load();
  };

  const vMap = Object.fromEntries(vehicles.map((v) => [v.id, v]));
  const nameByRestaurantId = Object.fromEntries(myRestaurants.map((r) => [r.id, r.name]));

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "available":
        return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
      case "on_delivery":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "busy":
        return "bg-amber-500/10 text-amber-500 border-amber-500/20";
      default:
        return "bg-slate-500/10 text-slate-500 border-slate-500/20";
    }
  };

  const filteredDrivers = drivers.filter(
    (d) =>
      searchTerm === "" ||
      d.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.phone.includes(searchTerm),
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Drivers Management</h1>
          <p className="text-muted-foreground mt-1">Drivers can be assigned to multiple restaurants. List shows drivers linked to the active restaurant.</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEdit(null); }}>
          <DialogTrigger asChild>
            <Button className="gap-2 shadow-lg hover:shadow-primary/20">
              <Plus className="h-4 w-4" /> Add Driver
            </Button>
          </DialogTrigger>
          <Form
            initial={edit}
            vehicles={vehicles}
            accountEmail={edit?.user_id ? profiles.find((p) => p.id === edit.user_id)?.email : undefined}
            myRestaurants={myRestaurants}
            activeRestaurantId={restaurantId}
            onSubmit={save}
          />
        </Dialog>
      </div>

      <div className="flex items-center gap-4 bg-card/50 p-4 rounded-xl border border-border/50">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search drivers by name or phone..."
            className="pl-10 bg-background/50 border-none shadow-none focus-visible:ring-1"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[980px]">
            <thead className="text-left bg-muted/50">
              <tr>
                <th className="p-3 w-12">Photo</th>
                <th className="p-3">Name</th>
                <th className="p-3 whitespace-nowrap">Phone</th>
                <th className="p-3">Email</th>
                <th className="p-3 whitespace-nowrap">License</th>
                <th className="p-3">Vehicle</th>
                <th className="p-3">Restaurants</th>
                <th className="p-3">Status</th>
                <th className="p-3">Active</th>
                <th className="p-3">Login email</th>
                <th className="p-3 w-[100px]" />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={10} className="p-10 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading &&
                filteredDrivers.map((d) => {
                  const veh = d.vehicle_id ? vMap[d.vehicle_id] : null;
                  const linked = d.user_id ? profiles.find((p) => p.id === d.user_id) : null;
                  const rids = assignmentsByDriver[d.id] ?? [];
                  return (
                    <tr key={d.id} className="border-t">
                      <td className="p-3 align-middle">
                        {d.image_url ? (
                          <img 
                            src={resolveMediaUrl(d.image_url)} 
                            alt={d.full_name} 
                            className="w-10 h-10 object-cover rounded-full border bg-muted"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full border bg-muted/50 flex items-center justify-center text-muted-foreground">
                            <UserCircle2 className="h-6 w-6 opacity-20" />
                          </div>
                        )}
                      </td>
                      <td className="p-3 align-middle font-medium">
                        <span className="inline-flex items-center gap-2">
                          {d.full_name}
                        </span>
                      </td>
                      <td className="p-3 align-middle whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          {d.phone}
                        </span>
                      </td>
                      <td className="p-3 align-middle text-muted-foreground max-w-[140px] truncate" title={d.email || undefined}>
                        {d.email || "—"}
                      </td>
                      <td className="p-3 align-middle whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 font-mono text-xs">
                          <IdCard className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          {d.license_number || "—"}
                        </span>
                      </td>
                      <td className="p-3 align-middle">
                        {veh ? (
                          <span className="inline-flex items-center gap-1">
                            <Bike className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="font-mono">{veh.plate_number}</span>
                            <span className="text-muted-foreground capitalize text-xs">({veh.vehicle_type})</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3 align-middle">
                        <div className="flex flex-wrap gap-1 max-w-[220px]">
                          {rids.length ? (
                            rids.map((rid) => (
                              <Badge key={rid} variant="secondary" className="text-xs font-normal truncate max-w-[140px]">
                                {nameByRestaurantId[rid] || rid.slice(0, 8)}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 align-middle">
                        <Badge variant="outline" className={getStatusColor(d.status)}>
                          {d.status.replace(/_/g, " ")}
                        </Badge>
                      </td>
                      <td className="p-3 align-middle">
                        {d.is_active ? (
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20">
                            Yes
                          </Badge>
                        ) : (
                          <Badge variant="secondary">No</Badge>
                        )}
                      </td>
                      <td className="p-3 align-middle text-muted-foreground max-w-[160px]">
                        {linked ? (
                          <span className="inline-flex items-center gap-1 truncate" title={linked.email}>
                            <Mail className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{linked.email}</span>
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="p-2 align-middle">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEdit(d);
                            setOpen(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={async () => {
                            if (confirm("Are you sure you want to delete this driver?")) {
                              await supabase.from("drivers").delete().eq("id", d.id);
                              void load();
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              {!loading && filteredDrivers.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-12 text-center text-muted-foreground">
                    <UserCircle2 className="h-8 w-8 mx-auto mb-3 opacity-50" />
                    <p className="font-medium text-foreground">No drivers found</p>
                    <p className="text-sm mt-1">Add a driver and assign this restaurant (or switch restaurant).</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function Form({
  initial,
  vehicles,
  accountEmail,
  myRestaurants,
  activeRestaurantId,
  onSubmit,
}: {
  initial: Driver | null;
  vehicles: Vehicle[];
  accountEmail?: string;
  myRestaurants: MyRestaurant[];
  activeRestaurantId: string | null;
  onSubmit: (
    f: Partial<Driver>,
    restaurantIds: string[],
    cred?: { password: string; confirmPassword: string },
  ) => void | Promise<void>;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<Partial<Driver>>(
    initial || { full_name: "", phone: "", status: "offline", is_active: true },
  );
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [selectedRestaurantIds, setSelectedRestaurantIds] = useState<string[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setForm(initial || { full_name: "", phone: "", status: "offline", is_active: true });
    setPassword("");
    setConfirmPassword("");
    setImageFile(null);
    setPreview(null);
  }, [initial]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!initial?.id) {
        const defaultIds =
          activeRestaurantId && myRestaurants.some((r) => r.id === activeRestaurantId)
            ? [activeRestaurantId]
            : myRestaurants[0]
              ? [myRestaurants[0].id]
              : [];
        if (!cancelled) setSelectedRestaurantIds(defaultIds);
        return;
      }
      const { data } = await supabase.from("driver_restaurants").select("restaurant_id").eq("driver_id", initial.id);
      if (!cancelled) {
        setSelectedRestaurantIds((data as { restaurant_id: string }[] | null)?.map((x) => x.restaurant_id) ?? []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initial?.id, activeRestaurantId, myRestaurants]);

  const toggleRestaurant = (rid: string, checked: boolean) => {
    setSelectedRestaurantIds((prev) => {
      if (checked) return prev.includes(rid) ? prev : [...prev, rid];
      return prev.filter((id) => id !== rid);
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({ variant: "destructive", title: "File too large", description: "Maximum size is 5MB." });
        return;
      }
      setImageFile(file);
      setPreview(URL.createObjectURL(file));
    }
  };

  const handleSave = async () => {
    setUploading(true);
    try {
      let image_url = form.image_url || null;
      if (imageFile) {
        const token = getToken();
        const fd = new FormData();
        fd.append("file", imageFile);
        const res = await fetch(`${getApiBase()}/api/uploads/fleet-image`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");
        image_url = data.url;
      }
      await onSubmit(
        { ...form, image_url },
        selectedRestaurantIds,
        initial ? undefined : { password, confirmPassword }
      );
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setUploading(false);
    }
  };

  const availableVehicles = vehicles.filter((v) => selectedRestaurantIds.includes(v.restaurant_id));
  const displayImage = preview || resolveMediaUrl(form.image_url) || null;

  return (
    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto custom-scrollbar">
      <DialogHeader>
        <DialogTitle>{initial ? "Edit Driver" : "Register New Driver"}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-4 py-4 text-sm">
        <div className="grid gap-2">
          <Label>Driver Photo</Label>
          <div className="flex items-center gap-4">
            <div className="relative group w-20 h-20 bg-muted rounded-full border-2 border-dashed border-border flex items-center justify-center overflow-hidden shrink-0">
              {displayImage ? (
                <>
                  <img src={displayImage} alt="Preview" className="w-full h-full object-cover" />
                  <button 
                    onClick={() => { setImageFile(null); setPreview(null); setForm({ ...form, image_url: null }); }}
                    className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </>
              ) : (
                <div className="text-muted-foreground flex flex-col items-center gap-1">
                  <Upload className="h-5 w-5" />
                  <span className="text-[10px]">Photo</span>
                </div>
              )}
              <input 
                type="file" 
                accept="image/*" 
                className="absolute inset-0 opacity-0 cursor-pointer" 
                onChange={handleFileChange}
                disabled={uploading}
              />
            </div>
            <div className="text-xs text-muted-foreground">
              <p>Upload a clear photo of the driver.</p>
              <p className="mt-1">Max 5MB. JPEG/PNG/WebP.</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
          <Label className="text-sm font-medium">Restaurants</Label>
          <p className="text-xs text-muted-foreground">This driver will appear in orders and assignment for each selected location.</p>
          <div className="grid gap-2 max-h-40 overflow-y-auto pr-1">
            {myRestaurants.length === 0 ? (
              <p className="text-xs text-muted-foreground">No restaurants available for your account.</p>
            ) : (
              myRestaurants.map((r) => (
                <label key={r.id} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={selectedRestaurantIds.includes(r.id)}
                    onCheckedChange={(c) => toggleRestaurant(r.id, c === true)}
                  />
                  <span className="truncate">{r.name}</span>
                </label>
              ))
            )}
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="name">Full Name</Label>
          <Input id="name" value={form.full_name || ""} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input id="phone" value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">{initial ? "Contact email" : "Login email"}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="off"
              value={form.email || ""}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            {!initial && (
              <p className="text-[10px] text-muted-foreground">Used for sign-in and notifications. Must be unique.</p>
            )}
          </div>
        </div>
        {!initial && (
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="pw">Password</Label>
              <Input
                id="pw"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pw2">Confirm password</Label>
              <Input
                id="pw2"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>
        )}
        {initial && accountEmail && (
          <p className="text-xs text-muted-foreground rounded-md border bg-muted/30 px-3 py-2">
            Driver portal login: <span className="font-mono text-foreground">{accountEmail}</span>
          </p>
        )}
        <div className="grid gap-2">
          <Label htmlFor="license">License Number</Label>
          <Input id="license" value={form.license_number || ""} onChange={(e) => setForm({ ...form, license_number: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label>Assigned Vehicle</Label>
            <Select
              value={form.vehicle_id || "_none"}
              onValueChange={(v) => setForm({ ...form, vehicle_id: v === "_none" ? null : v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— No Vehicle —</SelectItem>
                {availableVehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.plate_number} ({v.vehicle_type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedRestaurantIds.length === 0 && (
              <p className="text-[10px] text-muted-foreground">Select at least one restaurant to pick a vehicle.</p>
            )}
          </div>
          <div className="grid gap-2">
            <Label>Work Status</Label>
            <Select value={form.status || "offline"} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="offline">Offline</SelectItem>
                <SelectItem value="available">Available</SelectItem>
                <SelectItem value="busy">Busy</SelectItem>
                <SelectItem value="on_delivery">On Delivery</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button
          onClick={handleSave}
          className="w-full"
          disabled={uploading}
        >
          {uploading ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
          ) : (
            initial ? "Save Changes" : "Register Driver"
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
