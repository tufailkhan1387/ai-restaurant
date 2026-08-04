import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layers, Plus, Save, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Cuisine = { id: string; name: string };
type Restaurant = { id: string; name: string };
type RestaurantCuisine = { restaurant_id: string; cuisine_id: string };

export default function Cuisines() {
  const { role } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [newCuisine, setNewCuisine] = useState("");
  const [savingCuisine, setSavingCuisine] = useState(false);
  const [editCuisineId, setEditCuisineId] = useState<string | null>(null);
  const [selectedRestaurantIds, setSelectedRestaurantIds] = useState<string[]>([]);
  const [savingLinks, setSavingLinks] = useState(false);

  const { data: cuisines = [], isLoading: cuisinesLoading, refetch: refetchCuisines } = useQuery({
    queryKey: ["cuisines"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cuisines").select("*").order("name", { ascending: true });
      if (error) throw error;
      return (data as Cuisine[]) ?? [];
    },
  });

  const { data: restaurants = [], isLoading: restaurantsLoading } = useQuery({
    queryKey: ["restaurants-basic"],
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurants").select("id,name").order("name", { ascending: true });
      if (error) throw error;
      return (data as Restaurant[]) ?? [];
    },
  });

  const { data: links = [], isLoading: linksLoading, refetch: refetchLinks } = useQuery({
    queryKey: ["restaurant-cuisines"],
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurant_cuisines").select("restaurant_id,cuisine_id");
      if (error) throw error;
      return (data as RestaurantCuisine[]) ?? [];
    },
  });

  const cuisineToRestaurantNames = useMemo(() => {
    const restaurantNameById = Object.fromEntries(restaurants.map((r) => [r.id, r.name]));
    const map: Record<string, string[]> = {};
    for (const link of links) {
      const n = restaurantNameById[link.restaurant_id];
      if (!n) continue;
      if (!map[link.cuisine_id]) map[link.cuisine_id] = [];
      map[link.cuisine_id].push(n);
    }
    return map;
  }, [links, restaurants]);

  const filteredCuisines = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cuisines;
    return cuisines.filter((c) => c.name.toLowerCase().includes(q));
  }, [cuisines, search]);

  if (role !== "super_admin") {
    return (
      <div className="p-8 text-center">
        <h1 className="text-xl font-semibold">Super admin only</h1>
        <p className="text-muted-foreground text-sm mt-2">You do not have permission to manage cuisines.</p>
      </div>
    );
  }

  const isLoading = cuisinesLoading || restaurantsLoading || linksLoading;

  async function addCuisine() {
    const name = newCuisine.trim().replace(/\s+/g, " ");
    if (!name) return;
    setSavingCuisine(true);
    try {
      const { error } = await supabase.from("cuisines").upsert({ name }, { onConflict: "name" });
      if (error) throw error;
      setNewCuisine("");
      await refetchCuisines();
      toast({ title: "Cuisine saved" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Could not save cuisine", description: e?.message ?? String(e) });
    } finally {
      setSavingCuisine(false);
    }
  }

  function openManageRestaurants(cuisineId: string) {
    const current = links.filter((l) => l.cuisine_id === cuisineId).map((l) => l.restaurant_id);
    setSelectedRestaurantIds(current);
    setEditCuisineId(cuisineId);
  }

  async function saveCuisineRestaurants() {
    if (!editCuisineId) return;
    setSavingLinks(true);
    try {
      const cuisineId = editCuisineId;
      const { error: delErr } = await supabase.from("restaurant_cuisines").delete().eq("cuisine_id", cuisineId);
      if (delErr) throw delErr;
      if (selectedRestaurantIds.length) {
        const payload = selectedRestaurantIds.map((restaurant_id) => ({ restaurant_id, cuisine_id: cuisineId }));
        const { error: insErr } = await supabase.from("restaurant_cuisines").insert(payload);
        if (insErr) throw insErr;
      }
      await refetchLinks();
      setEditCuisineId(null);
      setSelectedRestaurantIds([]);
      toast({ title: "Cuisine links updated" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Could not update links", description: e?.message ?? String(e) });
    } finally {
      setSavingLinks(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Layers className="h-6 w-6 text-primary" />
            Cuisines
          </h1>
          <p className="text-muted-foreground text-sm">Manage cuisine types and link them with restaurants.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add Cuisine</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Input
            value={newCuisine}
            onChange={(e) => setNewCuisine(e.target.value)}
            placeholder="e.g. Italian"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addCuisine();
              }
            }}
          />
          <Button onClick={() => void addCuisine()} disabled={savingCuisine}>
            <Plus className="h-4 w-4 mr-2" />
            {savingCuisine ? "Saving..." : "Add"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle>All Cuisines</CardTitle>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-10 w-[260px]"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search cuisines..."
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-sm">Loading...</p>
          ) : filteredCuisines.length === 0 ? (
            <p className="text-muted-foreground text-sm">No cuisines found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Linked Restaurants</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCuisines.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(cuisineToRestaurantNames[c.id] ?? []).slice(0, 5).map((name) => (
                          <Badge key={`${c.id}-${name}`} variant="secondary">{name}</Badge>
                        ))}
                        {(cuisineToRestaurantNames[c.id] ?? []).length > 5 && (
                          <Badge variant="outline">+{(cuisineToRestaurantNames[c.id] ?? []).length - 5} more</Badge>
                        )}
                        {(cuisineToRestaurantNames[c.id] ?? []).length === 0 && (
                          <span className="text-muted-foreground text-xs">Not linked</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => openManageRestaurants(c.id)}>
                        Manage restaurants
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editCuisineId} onOpenChange={(open) => !open && setEditCuisineId(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Link Restaurants</DialogTitle>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-y-auto space-y-2 py-4 pr-1">
            {restaurants.length > 0 && (
              <label className="flex items-center gap-2 rounded border border-primary/20 bg-background p-2 cursor-pointer sticky top-0 z-[1] shadow-sm">
                <input
                  type="checkbox"
                  checked={restaurants.length > 0 && selectedRestaurantIds.length === restaurants.length}
                  ref={(el) => {
                    if (el) {
                      el.indeterminate =
                        selectedRestaurantIds.length > 0 &&
                        selectedRestaurantIds.length < restaurants.length;
                    }
                  }}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedRestaurantIds(restaurants.map((r) => r.id));
                    } else {
                      setSelectedRestaurantIds([]);
                    }
                  }}
                />
                <span className="font-medium text-sm">Select All</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {selectedRestaurantIds.length}/{restaurants.length}
                </span>
              </label>
            )}
            {restaurants.map((r) => {
              const checked = selectedRestaurantIds.includes(r.id);
              return (
                <label key={r.id} className="flex items-center gap-2 rounded border p-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedRestaurantIds((prev) => [...prev, r.id]);
                      } else {
                        setSelectedRestaurantIds((prev) => prev.filter((id) => id !== r.id));
                      }
                    }}
                  />
                  <span>{r.name}</span>
                </label>
              );
            })}
            {restaurants.length === 0 && <p className="text-muted-foreground text-sm">No restaurants available.</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCuisineId(null)}>Cancel</Button>
            <Button onClick={() => void saveCuisineRestaurants()} disabled={savingLinks}>
              <Save className="h-4 w-4 mr-2" />
              {savingLinks ? "Saving..." : "Save links"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
