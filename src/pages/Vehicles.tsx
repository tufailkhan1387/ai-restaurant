import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Car, Pencil, Plus, Trash2, Truck, Bike, Info, Search, Upload, X, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useActiveRestaurant } from "@/hooks/useActiveRestaurant";
import { getApiBase, resolveMediaUrl } from "@/lib/apiBase";
import { getToken } from "@/lib/authStorage";
import { cn } from "@/lib/utils";

interface Vehicle {
  id: string;
  plate_number: string;
  model: string | null;
  vehicle_type: string;
  capacity_kg: number | null;
  status: string;
  notes: string | null;
  image_url: string | null;
}

export default function Vehicles() {
  const { toast } = useToast();
  const { restaurantId } = useActiveRestaurant();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Vehicle | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const load = async () => {
    if (!restaurantId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("vehicles")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      setVehicles(data as any || []);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [restaurantId]);

  const save = async (form: Partial<Vehicle>) => {
    if (!restaurantId) return;
    const payload = {
      plate_number: form.plate_number || "",
      model: form.model || null,
      vehicle_type: form.vehicle_type || "bike",
      capacity_kg: form.capacity_kg ? Number(form.capacity_kg) : null,
      status: form.status || "available",
      notes: form.notes || null,
      image_url: form.image_url || null,
      restaurant_id: restaurantId,
    };

    const res = edit 
      ? await supabase.from("vehicles").update(payload).eq("id", edit.id) 
      : await supabase.from("vehicles").insert(payload);

    if (res.error) {
      toast({ variant: "destructive", title: "Failed", description: (res.error as any).message });
    } else {
      toast({ title: "Vehicle saved successfully" });
      setOpen(false);
      setEdit(null);
      load();
    }
  };

  const getVehicleIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'van': return <Truck className="h-4 w-4" />;
      case 'car': return <Car className="h-4 w-4" />;
      default: return <Bike className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'available': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'in_use': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'maintenance': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      default: return 'bg-slate-500/10 text-slate-500 border-slate-500/20';
    }
  };

  const filteredVehicles = vehicles.filter(v => 
    v.plate_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.model?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vehicles Management</h1>
          <p className="text-muted-foreground mt-1">Manage your delivery fleet and vehicle status.</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEdit(null); }}>
          <DialogTrigger asChild>
            <Button className="gap-2 shadow-lg hover:shadow-primary/20">
              <Plus className="h-4 w-4" /> Add Vehicle
            </Button>
          </DialogTrigger>
          <Form initial={edit} onSubmit={save} />
        </Dialog>
      </div>

      <div className="flex items-center gap-4 bg-card/50 p-4 rounded-xl border border-border/50">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search by plate number or model..." 
            className="pl-10 bg-background/50 border-none shadow-none focus-visible:ring-1"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="text-left bg-muted/50">
              <tr>
                <th className="p-3 w-16">Image</th>
                <th className="p-3">Plate</th>
                <th className="p-3">Model</th>
                <th className="p-3">Type</th>
                <th className="p-3 whitespace-nowrap">Capacity (kg)</th>
                <th className="p-3">Status</th>
                <th className="p-3 max-w-[200px]">Notes</th>
                <th className="p-3 w-[100px]" />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading &&
                filteredVehicles.map((v) => (
                  <tr key={v.id} className="border-t">
                    <td className="p-3 align-middle">
                      {v.image_url ? (
                        <img 
                          src={resolveMediaUrl(v.image_url)} 
                          alt={v.plate_number} 
                          className="w-12 h-10 object-cover rounded border bg-muted"
                        />
                      ) : (
                        <div className="w-12 h-10 rounded border bg-muted/50 flex items-center justify-center text-muted-foreground">
                          <Car className="h-5 w-5 opacity-20" />
                        </div>
                      )}
                    </td>
                    <td className="p-3 align-middle font-mono font-medium">{v.plate_number}</td>
                    <td className="p-3 align-middle text-muted-foreground">{v.model || "—"}</td>
                    <td className="p-3 align-middle">
                      <span className="inline-flex items-center gap-1.5 capitalize">
                        <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        {v.vehicle_type}
                      </span>
                    </td>
                    <td className="p-3 align-middle tabular-nums">{v.capacity_kg != null ? v.capacity_kg : "—"}</td>
                    <td className="p-3 align-middle">
                      <Badge variant="outline" className={getStatusColor(v.status)}>
                        {v.status.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="p-3 align-middle text-muted-foreground max-w-[220px] truncate" title={v.notes || undefined}>
                      {v.notes || "—"}
                    </td>
                    <td className="p-2 align-middle">
                      <Button size="sm" variant="ghost" onClick={() => { setEdit(v); setOpen(true); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={async () => {
                          if (confirm("Are you sure you want to delete this vehicle?")) {
                            await supabase.from("vehicles").delete().eq("id", v.id);
                            load();
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              {!loading && filteredVehicles.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-muted-foreground">
                    <Car className="h-8 w-8 mx-auto mb-3 opacity-50" />
                    <p className="font-medium text-foreground">No vehicles found</p>
                    <p className="text-sm mt-1">Add your first delivery vehicle to get started.</p>
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

function Form({ initial, onSubmit }: { initial: Vehicle | null; onSubmit: (f: Partial<Vehicle>) => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState<Partial<Vehicle>>(initial || { plate_number: "", vehicle_type: "bike", status: "available" });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { 
    setForm(initial || { plate_number: "", vehicle_type: "bike", status: "available" }); 
    setImageFile(null);
    setPreview(null);
  }, [initial]);

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
      await onSubmit({ ...form, image_url });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setUploading(false);
    }
  };

  const displayImage = preview || resolveMediaUrl(form.image_url) || null;

  return (
    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{initial ? "Edit Vehicle" : "Add New Vehicle"}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-1 custom-scrollbar">
        <div className="grid gap-2">
          <Label>Vehicle Image</Label>
          <div className="flex items-center gap-4">
            <div className="relative group w-24 h-20 bg-muted rounded-lg border-2 border-dashed border-border flex items-center justify-center overflow-hidden shrink-0">
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
                  <span className="text-[10px]">Add photo</span>
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
              <p>Upload a clear photo of the vehicle.</p>
              <p className="mt-1">Max 5MB. JPEG/PNG/WebP.</p>
            </div>
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="plate">Plate Number</Label>
          <Input 
            id="plate" 
            placeholder="e.g. ABC-1234" 
            className="font-mono uppercase"
            value={form.plate_number || ""} 
            onChange={(e) => setForm({ ...form, plate_number: e.target.value })} 
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="model">Model Name</Label>
          <Input 
            id="model" 
            placeholder="e.g. Honda CD-70" 
            value={form.model || ""} 
            onChange={(e) => setForm({ ...form, model: e.target.value })} 
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label>Vehicle Type</Label>
            <Select value={form.vehicle_type || "bike"} onValueChange={(v) => setForm({ ...form, vehicle_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bike">Bike</SelectItem>
                <SelectItem value="scooter">Scooter</SelectItem>
                <SelectItem value="car">Car</SelectItem>
                <SelectItem value="van">Van</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Status</Label>
            <Select value={form.status || "available"} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="available">Available</SelectItem>
                <SelectItem value="in_use">In Use</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="capacity">Load Capacity (kg)</Label>
          <Input 
            id="capacity" 
            type="number" 
            step="0.1" 
            value={form.capacity_kg || ""} 
            onChange={(e) => setForm({ ...form, capacity_kg: parseFloat(e.target.value) || null })} 
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="notes">Notes</Label>
          <Input 
            id="notes" 
            placeholder="Any additional info..."
            value={form.notes || ""} 
            onChange={(e) => setForm({ ...form, notes: e.target.value })} 
          />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={handleSave} className="w-full" disabled={uploading}>
          {uploading ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
          ) : (
            initial ? "Save Changes" : "Register Vehicle"
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}