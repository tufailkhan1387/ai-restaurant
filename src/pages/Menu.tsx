import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogBody } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Pencil, Plus, Trash2, UtensilsCrossed, Layers, Loader2, LayoutGrid, ListTree, PlusSquare, RefreshCw, Boxes, Gauge, Search, X, FilterX } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency } from "@/lib/restaurant";
import { cn } from "@/lib/utils";
import { useActiveRestaurant } from "@/hooks/useActiveRestaurant";
import { MenuImportButton } from "@/components/menu/MenuImportButton";
import { getApiBase, resolveMediaUrl } from "@/lib/apiBase";
import { getToken } from "@/lib/authStorage";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface Category { id: string; restaurant_id?: string; name: string; description: string | null; sort_order: number; is_active: boolean }
interface SubCategory { id: string; restaurant_id: string; category_id: string; name: string; description: string | null; sort_order: number; is_active: boolean }
interface MenuItem {
  id: string;
  category_id: string | null;
  sub_category_id: string | null;
  restaurant_id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_available: boolean;
  prep_time_minutes: number;
  dietary_tags: string[];
  spice_level: number;
  track_inventory?: boolean;
  stock_quantity?: number | null;
  max_order_quantity?: number | null;
}
interface MenuItemVariant { id: string; menu_item_id: string; name: string; price: number; sort_order: number; is_active: boolean }
interface MenuAddon {
  id: string;
  restaurant_id: string;
  name: string;
  description: string | null;
  price: number;
  sort_order: number;
  is_active: boolean;
}
interface ItemAddonLink {
  menu_item_id: string;
  menu_addon_id: string;
}

type AddonFieldKey = "name" | "description" | "price" | "sort_order";

/** Matches DB: name text, price numeric(10,2), sort_order int */
function validateAddonForm(form: Partial<MenuAddon>): Partial<Record<AddonFieldKey, string>> {
  const errors: Partial<Record<AddonFieldKey, string>> = {};
  const name = (form.name ?? "").trim();
  if (!name) errors.name = "Name is required.";
  else if (name.length > 200) errors.name = "Name must be at most 200 characters.";

  const descRaw = form.description;
  if (descRaw != null && String(descRaw).length > 5000) {
    errors.description = "Description must be at most 5000 characters.";
  }

  const rawPrice = form.price;
  const price = typeof rawPrice === "number" ? rawPrice : parseFloat(String(rawPrice ?? ""));
  if (!Number.isFinite(price)) errors.price = "Enter a valid extra price.";
  else if (price < 0) errors.price = "Extra price cannot be negative.";
  else if (price > 99_999_999.99) errors.price = "Extra price is too large (max 99,999,999.99).";

  const rawSo = form.sort_order;
  const so =
    typeof rawSo === "number" && Number.isFinite(rawSo) ? Math.trunc(rawSo) : parseInt(String(rawSo ?? "0"), 10);
  if (!Number.isFinite(so) || Number.isNaN(so)) errors.sort_order = "Sort order must be a whole number.";
  else if (so < 0) errors.sort_order = "Sort order cannot be negative.";
  else if (so > 2_147_483_647) errors.sort_order = "Sort order is too large.";

  return errors;
}

type AddonClusterRow = Pick<MenuAddon, "id" | "restaurant_id" | "name" | "description" | "price" | "sort_order" | "is_active">;

/** Best-effort grouping for multi-restaurant copies (same fields, no shared DB group id). */
function addonIdentityKey(ad: Pick<MenuAddon, "name" | "description" | "price" | "sort_order" | "is_active">) {
  const desc = ad.description == null ? "" : String(ad.description);
  const price = typeof ad.price === "number" ? ad.price : parseFloat(String(ad.price ?? "0"));
  const so =
    typeof ad.sort_order === "number" && Number.isFinite(ad.sort_order)
      ? Math.trunc(ad.sort_order)
      : parseInt(String(ad.sort_order ?? "0"), 10);
  return `${(ad.name ?? "").trim()}\t${desc}\t${Number(price)}\t${so}\t${Boolean(ad.is_active)}`;
}

function buildAddonRestaurantClusters(
  rows: AddonClusterRow[],
  restaurantNameById: Map<string, string>,
): Record<string, { count: number; restaurantNames: string[] }> {
  const fpToRestaurantIds = new Map<string, Set<string>>();
  for (const row of rows) {
    const fp = addonIdentityKey(row);
    if (!fpToRestaurantIds.has(fp)) fpToRestaurantIds.set(fp, new Set());
    fpToRestaurantIds.get(fp)!.add(row.restaurant_id);
  }
  const fpToSortedNames = new Map<string, string[]>();
  for (const [fp, rids] of fpToRestaurantIds) {
    const names = [...rids]
      .map((id) => restaurantNameById.get(id) || "Unknown")
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    fpToSortedNames.set(fp, names);
  }
  const byAddonId: Record<string, { count: number; restaurantNames: string[] }> = {};
  for (const row of rows) {
    const fp = addonIdentityKey(row);
    byAddonId[row.id] = {
      count: fpToRestaurantIds.get(fp)!.size,
      restaurantNames: fpToSortedNames.get(fp)!,
    };
  }
  return byAddonId;
}

function MenuItemsTable({
  items: rows,
  categories,
  subCategories,
  itemVariants,
  onEdit,
  onDelete,
  onToggleAvailability,
  addonSummary,
  itemAddonCount,
  showRestaurant,
  restaurantMap,
  emptyMessage,
}: {
  items: MenuItem[];
  categories?: Category[];
  subCategories?: SubCategory[];
  itemVariants?: MenuItemVariant[];
  onEdit: (it: MenuItem) => void;
  onDelete: (id: string) => void;
  onToggleAvailability?: (it: MenuItem) => void;
  addonSummary?: Record<string, string>;
  itemAddonCount?: Record<string, number>;
  showRestaurant?: boolean;
  restaurantMap?: Record<string, string>;
  emptyMessage?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[980px] border-collapse">
        <thead className="text-left bg-muted/40 text-muted-foreground border-b text-xs font-semibold uppercase tracking-wider">
          <tr>
            <th className="py-3 px-4 w-12 text-center">#</th>
            <th className="py-3 px-4 w-20">ID</th>
            <th className="py-3 px-4 w-16">Image</th>
            <th className="py-3 px-4 min-w-[180px]">Product name</th>
            {showRestaurant && <th className="py-3 px-4">Business</th>}
            <th className="py-3 px-4">Menu category</th>
            <th className="py-3 px-4 whitespace-nowrap">Price</th>
            <th className="py-3 px-4">Prep / Tags</th>
            <th className="py-3 px-4">Sub-category</th>
            <th className="py-3 px-4 text-center whitespace-nowrap">Add-on groups</th>
            <th className="py-3 px-4 text-center">Status</th>
            <th className="py-3 px-4 w-24 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {rows.map((it, idx) => {
            const thumbSrc = resolveMediaUrl(it.image_url);
            const categoryName = categories?.find((c) => c.id === it.category_id)?.name || "Uncategorized";
            const subCategoryName = subCategories?.find((sc) => sc.id === it.sub_category_id)?.name || "—";
            const addOnCount = itemAddonCount?.[it.id] ?? (addonSummary?.[it.id] ? addonSummary[it.id].split(',').length : 0);
            const addOnNames = addonSummary?.[it.id];
            const shortId = it.id ? (it.id.length > 8 ? it.id.slice(0, 4) : it.id) : String(idx + 1000);

            return (
              <tr key={it.id} className="hover:bg-muted/40 transition-colors">
                <td className="py-3 px-4 align-middle text-center text-xs font-medium text-muted-foreground">
                  {idx + 1}
                </td>
                <td className="py-3 px-4 align-middle text-xs font-mono text-muted-foreground">
                  {shortId}
                </td>
                <td className="py-3 px-4 align-middle">
                  {thumbSrc ? (
                    <img src={thumbSrc} alt={it.name} className="h-10 w-10 rounded-md object-cover border bg-muted/20" />
                  ) : (
                    <div className="h-10 w-10 rounded-md border bg-muted/30 flex items-center justify-center text-muted-foreground text-xs font-medium">
                      <UtensilsCrossed className="h-4 w-4 opacity-50" />
                    </div>
                  )}
                </td>
                <td className="py-3 px-4 align-middle font-medium">
                  <div className="text-foreground font-semibold">{it.name}</div>
                  {it.description && (
                    <div className="text-xs text-muted-foreground line-clamp-1 max-w-[220px]" title={it.description}>
                      {it.description}
                    </div>
                  )}
                  {itemVariants?.filter((v) => v.menu_item_id === it.id).length ? (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {itemVariants.filter((v) => v.menu_item_id === it.id).map((v) => (
                        <Badge key={v.id} variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                          {v.name}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </td>
                {showRestaurant && (
                  <td className="py-3 px-4 align-middle text-xs text-muted-foreground font-medium">
                    {restaurantMap?.[it.restaurant_id] || "—"}
                  </td>
                )}
                <td className="py-3 px-4 align-middle">
                  <span className="text-xs font-medium text-foreground">{categoryName}</span>
                </td>
                <td className="py-3 px-4 align-middle whitespace-nowrap font-semibold text-foreground">
                  {formatCurrency(it.price)}
                </td>
                <td className="py-3 px-4 align-middle">
                  <div className="space-y-1">
                    {it.prep_time_minutes ? (
                      <div className="text-xs text-muted-foreground whitespace-nowrap">{it.prep_time_minutes} min</div>
                    ) : null}
                    {it.dietary_tags?.length ? (
                      <div className="text-[10px] text-muted-foreground">
                        {it.dietary_tags.join(", ")}
                      </div>
                    ) : null}
                  </div>
                </td>
                <td className="py-3 px-4 align-middle text-xs text-muted-foreground">
                  {subCategoryName}
                </td>
                <td className="py-3 px-4 align-middle text-center">
                  {addOnNames ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center justify-center h-6 min-w-6 px-2 text-xs font-semibold rounded-full bg-muted text-foreground cursor-help underline decoration-dotted">
                          {addOnCount}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs">
                        {addOnNames}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <span className="text-xs text-muted-foreground font-medium">{addOnCount}</span>
                  )}
                </td>
                <td className="py-3 px-4 align-middle text-center">
                  <div className="flex items-center justify-center">
                    <Switch
                      checked={Boolean(it.is_available)}
                      onCheckedChange={() => onToggleAvailability?.(it)}
                      className="data-[state=checked]:bg-primary"
                    />
                  </div>
                </td>
                <td className="py-3 px-4 align-middle text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => onEdit(it)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => onDelete(it.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}

          {rows.length === 0 && (
            <tr>
              <td colSpan={11 + (showRestaurant ? 1 : 0)} className="py-12 text-center text-muted-foreground">
                {emptyMessage || "No items found."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function Menu() {
  const { toast } = useToast();
  const { role } = useAuth();
  const isSuperAdmin = role === "super_admin";
  const { restaurantId, loading: activeRestaurantLoading } = useActiveRestaurant();
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "items";
  const itemsTab = activeTab === "items";
  const categoriesTab = activeTab === "categories";
  const subCategoriesTab = activeTab === "sub-categories";
  const addonsTab = activeTab === "addons";
  const inventoryTab = activeTab === "inventory";
  const maxOrderTab = activeTab === "max-order";

  const [categories, setCategories] = useState<Category[]>([]);
  const [subCategories, setSubCategories] = useState<SubCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [itemVariants, setItemVariants] = useState<MenuItemVariant[]>([]);
  const [addons, setAddons] = useState<MenuAddon[]>([]);
  const [itemAddonLinks, setItemAddonLinks] = useState<ItemAddonLink[]>([]);
  const [restaurantName, setRestaurantName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [catDialog, setCatDialog] = useState(false);
  const [subCatDialog, setSubCatDialog] = useState(false);
  const [itemDialog, setItemDialog] = useState(false);
  const [addonDialog, setAddonDialog] = useState(false);
  const [editCat, setEditCat] = useState<Category | null>(null);
  const [editSubCat, setEditSubCat] = useState<SubCategory | null>(null);
  const [editItem, setEditItem] = useState<MenuItem | null>(null);
  const [editItemAddonIds, setEditItemAddonIds] = useState<string[]>([]);
  const [editAddon, setEditAddon] = useState<MenuAddon | null>(null);

  const [restaurantFilterId, setRestaurantFilterId] = useState('all');
  const [restaurantPickerList, setRestaurantPickerList] = useState<{ id: string; name: string }[]>([]);
  const [allRestaurants, setAllRestaurants] = useState<{ id: string; name: string }[]>([]);
  const [restaurantMap, setRestaurantMap] = useState<Record<string, string>>({});
  const [addonRestaurantCluster, setAddonRestaurantCluster] = useState<
    Record<string, { count: number; restaurantNames: string[] }>
  >({});
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilterId, setCategoryFilterId] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const load = useCallback(async () => {
    if (!restaurantId) return;
    setLoading(true);
    if (isSuperAdmin) {
      const [
        { data: itemsData, error: itemsErr },
        { data: restData, error: restErr },
        { data: catsData },
        { data: subCatsData },
        { data: addonsData },
        { data: itemAddonsData }
      ] = await Promise.all([
        supabase.from('menu_items').select('*').order('sort_order'),
        supabase.from('restaurants').select('id, name').order('name'),
        supabase.from('menu_categories').select('*').order('sort_order'),
        supabase.from('menu_sub_categories').select('*').order('sort_order'),
        supabase.from('menu_addons').select('*').order('sort_order'),
        supabase.from('menu_item_addons').select('*'),
      ]);
      if (itemsErr) console.error(itemsErr);
      if (restErr) console.error(restErr);
      if (itemsData) setItems(itemsData as MenuItem[]);
      if (catsData) setCategories(catsData as Category[]);
      if (subCatsData) setSubCategories(subCatsData as SubCategory[]);
      if (addonsData) setAddons(addonsData as MenuAddon[]);
      if (itemAddonsData) setItemAddonLinks(itemAddonsData as any[]);
      const rlist = (restData as { id: string; name: string }[]) ?? [];
      setAllRestaurants((prev) => JSON.stringify(prev) === JSON.stringify(rlist) ? prev : rlist);
      const rmap: Record<string, string> = {};
      rlist.forEach(r => { rmap[r.id] = r.name; });
      setRestaurantMap(rmap);
    } else {
      const [
        { data: catsData },
        { data: subCatsData },
        { data: itemsData },
        { data: variantsData },
        { data: addonsData },
        { data: linksData },
        { data: restData },
        { data: allAddonsData },
      ] = await Promise.all([
        supabase.from('menu_categories').select('*').eq('restaurant_id', restaurantId).order('sort_order'),
        supabase.from('menu_sub_categories').select('*').eq('restaurant_id', restaurantId).order('sort_order'),
        supabase.from('menu_items').select('*').eq('restaurant_id', restaurantId).order('sort_order'),
        supabase.from('menu_item_variants').select('*').order('sort_order'),
        supabase.from('menu_addons').select('*').eq('restaurant_id', restaurantId).order('sort_order'),
        supabase.from('menu_item_addons').select('*'),
        supabase.from('restaurants').select('id, name').eq('id', restaurantId).single(),
        supabase.from('menu_addons').select('*').order('sort_order'),
      ]);
      if (catsData) setCategories(catsData as Category[]);
      if (subCatsData) setSubCategories(subCatsData as SubCategory[]);
      if (itemsData) setItems(itemsData as MenuItem[]);
      if (variantsData) setItemVariants(variantsData as MenuItemVariant[]);
      if (addonsData) setAddons(addonsData as MenuAddon[]);
      if (linksData) setItemAddonLinks(linksData as ItemAddonLink[]);
      if (restData) setRestaurantName((restData as any).name);
      if (allAddonsData) {
        const rNameMap = new Map<string, string>(allRestaurants.map(r => [r.id, r.name]));
        setAddonRestaurantCluster(buildAddonRestaurantClusters(allAddonsData as AddonClusterRow[], rNameMap));
      }
    }
    setLoading(false);
  }, [restaurantId, isSuperAdmin, allRestaurants]);

  const displayedItems = isSuperAdmin
    ? items.filter((it) => restaurantFilterId === 'all' || String(it.restaurant_id) === String(restaurantFilterId))
    : items;
  const displayedCategories = isSuperAdmin
    ? categories.filter((c) => restaurantFilterId === 'all' || String(c.restaurant_id) === String(restaurantFilterId))
    : categories;
  const displayedSubCategories = isSuperAdmin
    ? subCategories.filter((sc) => restaurantFilterId === 'all' || String(sc.restaurant_id) === String(restaurantFilterId))
    : subCategories;
  const displayedAddons = isSuperAdmin
    ? addons.filter((a) => restaurantFilterId === 'all' || String(a.restaurant_id) === String(restaurantFilterId))
    : addons;

  const filteredItems = useMemo(() => {
    let list = displayedItems;

    if (categoryFilterId !== 'all') {
      list = list.filter((it) => String(it.category_id) === String(categoryFilterId));
    }

    if (statusFilter === 'available') {
      list = list.filter((it) => Boolean(it.is_available));
    } else if (statusFilter === 'unavailable') {
      list = list.filter((it) => !it.is_available);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((it) =>
        it.name.toLowerCase().includes(q) ||
        (it.description && it.description.toLowerCase().includes(q))
      );
    }

    return list;
  }, [displayedItems, categoryFilterId, statusFilter, searchQuery]);

  const hasActiveFilters = searchQuery !== "" || categoryFilterId !== "all" || statusFilter !== "all" || (isSuperAdmin && restaurantFilterId !== "all");

  const clearFilters = () => {
    setSearchQuery("");
    setCategoryFilterId("all");
    setStatusFilter("all");
    if (isSuperAdmin) setRestaurantFilterId("all");
  };

  const { addonSummary, itemAddonCount } = useMemo(() => {
    const namesByItem: Record<string, string[]> = {};
    const countByItem: Record<string, number> = {};
    for (const row of itemAddonLinks) {
      if (!namesByItem[row.menu_item_id]) namesByItem[row.menu_item_id] = [];
      const ad = addons.find((a) => a.id === row.menu_addon_id);
      if (ad) namesByItem[row.menu_item_id].push(ad.name);
      countByItem[row.menu_item_id] = (countByItem[row.menu_item_id] || 0) + 1;
    }
    const out: Record<string, string> = {};
    for (const [id, names] of Object.entries(namesByItem)) {
      out[id] = names.join(", ");
    }
    return { addonSummary: out, itemAddonCount: countByItem };
  }, [itemAddonLinks, addons]);

  const toggleItemAvailability = async (item: MenuItem) => {
    const nextAvailable = !item.is_available;
    setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, is_available: nextAvailable } : row)));
    const { error } = await supabase.from("menu_items").update({ is_available: nextAvailable }).eq("id", item.id);
    if (error) {
      toast({ variant: "destructive", title: "Failed to update status", description: error.message });
      setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, is_available: item.is_available } : row)));
    } else {
      toast({ title: nextAvailable ? `"${item.name}" marked as available` : `"${item.name}" marked as unavailable` });
      void triggerMenuSync();
    }
  };

  // Load items for all restaurants when role is super_admin
  useEffect(() => {
    void load();
  }, [isSuperAdmin, load]);

  const triggerMenuSync = useCallback(async () => {
    if (!restaurantId) return;
    try {
      const { data, error } = await supabase.functions.invoke("sync-restaurant-menu-to-agent", {
        body: { restaurant_id: restaurantId },
      });
      if (error || (data as any)?.success === false) {
        console.error("AI sync failed:", error ?? (data as any)?.error);
        toast({
          variant: "destructive",
          title: "AI Sync Failed",
          description: "Menu updated locally, but failed to sync with the AI agent. You can retry manually.",
        });
      } else {
        toast({ title: "AI Agent Updated", description: "Your menu changes are now live on the voice agent." });
      }
    } catch (e) {
      console.error("AI sync error:", e);
    }
  }, [restaurantId, toast]);

  useEffect(() => {
    if (activeRestaurantLoading) return;
    if (!restaurantId) {
      setCategories([]);
      setSubCategories([]);
      setItems([]);
      setItemVariants([]);
      setAddons([]);
      setItemAddonLinks([]);
      setRestaurantName(null);
      setAddonRestaurantCluster({});
      setLoading(false);
      return;
    }
    void load();
  }, [restaurantId, activeRestaurantLoading, load]);

  useEffect(() => {
    if (!isSuperAdmin || (!itemDialog && !addonDialog && !catDialog && !subCatDialog)) return;
    void (async () => {
      const { data, error } = await supabase.from("restaurants").select("id, name").order("name");
      if (error) {
        console.error(error);
        return;
      }
      setRestaurantPickerList((data as { id: string; name: string }[]) ?? []);
    })();
  }, [isSuperAdmin, itemDialog, addonDialog, catDialog, subCatDialog]);

  const beginEditItem = async (it: MenuItem) => {
    setEditItem(it);
    const { data } = await supabase.from("menu_item_addons").select("menu_addon_id").eq("menu_item_id", it.id);
    const allowed = new Set(addons.map((x) => x.id));
    const raw = ((data as { menu_addon_id: string }[]) || []).map((r) => r.menu_addon_id);
    setEditItemAddonIds(raw.filter((id) => allowed.has(id)));
    setItemDialog(true);
  };

  /** Only links add-ons that belong to this restaurant (`addons` list). */
  const syncItemAddonLinks = async (itemId: string, addonIds: string[], allowedAddonIds: Set<string>) => {
    const safe = addonIds.filter((id) => allowedAddonIds.has(id));
    const { error: delErr } = await supabase.from("menu_item_addons").delete().eq("menu_item_id", itemId);
    if (delErr) throw delErr;
    if (!safe.length) return;
    const rows = safe.map((menu_addon_id) => ({ menu_item_id: itemId, menu_addon_id }));
    const { error: insErr } = await supabase.from("menu_item_addons").insert(rows);
    if (insErr) throw insErr;
  };
  const syncItemVariants = async (itemId: string, variants: Partial<MenuItemVariant>[]) => {
    const { error: delErr } = await supabase.from("menu_item_variants").delete().eq("menu_item_id", itemId);
    if (delErr) throw delErr;
    if (!variants.length) return;
    const rows = variants.map((v, idx) => ({
      menu_item_id: itemId,
      name: v.name || "",
      price: Number(v.price) || 0,
      sort_order: v.sort_order ?? idx,
      is_active: v.is_active ?? true,
    }));
    const { error: insErr } = await supabase.from("menu_item_variants").insert(rows);
    if (insErr) throw insErr;
  };

  const saveCategory = async (form: Partial<Category> & { restaurant_id?: string }) => {
    const targetRestaurantId = form.restaurant_id || restaurantId;
    if (!targetRestaurantId) return;
    setIsSaving(true);
    const payload = {
      name: form.name || "",
      description: form.description || null,
      sort_order: form.sort_order || 0,
      is_active: form.is_active ?? true,
      restaurant_id: targetRestaurantId
    };
    const res = editCat
      ? await supabase.from("menu_categories").update(payload).eq("id", editCat.id)
      : await supabase.from("menu_categories").insert(payload);
    setIsSaving(false);
    if (res.error) toast({ variant: "destructive", title: "Failed", description: (res.error as any).message });
    else {
      toast({ title: editCat ? "Category updated" : "Category created" });
      setCatDialog(false);
      setEditCat(null);
      load();
      void triggerMenuSync();
    }
  };

  const saveSubCategory = async (form: Partial<SubCategory> & { restaurant_id?: string }) => {
    const targetRestaurantId = form.restaurant_id || restaurantId;
    if (!targetRestaurantId) return;
    setIsSaving(true);
    const payload = {
      category_id: form.category_id,
      name: form.name || "",
      description: form.description || null,
      sort_order: form.sort_order || 0,
      is_active: form.is_active ?? true,
      restaurant_id: targetRestaurantId
    };
    const res = editSubCat
      ? await supabase.from("menu_sub_categories").update(payload).eq("id", editSubCat.id)
      : await supabase.from("menu_sub_categories").insert(payload);
    setIsSaving(false);
    if (res.error) toast({ variant: "destructive", title: "Failed", description: (res.error as any).message });
    else {
      toast({ title: editSubCat ? "Sub-category updated" : "Sub-category created" });
      setSubCatDialog(false);
      setEditSubCat(null);
      load();
      void triggerMenuSync();
    }
  };

  const saveItem = async (form: Partial<MenuItem> & { addon_ids?: string[]; variants?: Partial<MenuItemVariant>[]; restaurant_id?: string }) => {
    const targetRestaurantId = form.restaurant_id || restaurantId;
    if (!targetRestaurantId) return;
    setIsSaving(true);
    const addon_ids = form.addon_ids ?? [];
    const payload = {
      category_id: form.category_id || null,
      name: form.name || "",
      description: form.description || null,
      price: Number(form.price) || 0,
      image_url: form.image_url ?? null,
      is_available: form.is_available ?? true,
      prep_time_minutes: Number(form.prep_time_minutes) || 15,
      dietary_tags: form.dietary_tags || [],
      spice_level: Number(form.spice_level) || 0,
      sub_category_id: form.sub_category_id || null,
      restaurant_id: targetRestaurantId,
    };
    const allowedAddonIds = new Set(addons.map((x) => x.id));
    try {
      if (editItem) {
        const res = await supabase.from("menu_items").update(payload).eq("id", editItem.id);
        if (res.error) throw res.error;
        await syncItemAddonLinks(editItem.id, addon_ids, allowedAddonIds);
        if (form.variants) await syncItemVariants(editItem.id, form.variants);
      } else {
        const res = await supabase.from("menu_items").insert(payload).select("id").single();
        if (res.error) throw res.error;
        const id = (res.data as { id?: string })?.id;
        if (id) {
          await syncItemAddonLinks(id, addon_ids, allowedAddonIds);
          if (form.variants) await syncItemVariants(id, form.variants);
        }
      }
      setIsSaving(false);
      toast({ title: editItem ? "Item updated" : "Item created" });
      setItemDialog(false);
      setEditItem(null);
      setEditItemAddonIds([]);
      load();
      void triggerMenuSync();
    } catch (e: unknown) {
      setIsSaving(false);
      const msg = e instanceof Error ? e.message : String(e);
      toast({ variant: "destructive", title: "Failed", description: msg });
    }
  };

  const saveAddon = async (form: Partial<MenuAddon> & { restaurant_ids?: string[] }) => {
    if (editAddon && !isSuperAdmin && editAddon.restaurant_id !== restaurantId) {
      toast({ variant: "destructive", title: "Cannot edit this add-on", description: "It belongs to another restaurant." });
      return;
    }

    const addonFieldErrors = validateAddonForm(form);
    if (Object.keys(addonFieldErrors).length > 0) {
      toast({
        variant: "destructive",
        title: "Check your input",
        description: Object.values(addonFieldErrors).join(" "),
      });
      return;
    }

    setIsSaving(true);
    const nameTrim = (form.name ?? "").trim();
    const priceVal = typeof form.price === "number" ? form.price : parseFloat(String(form.price ?? "0"));
    const sortVal =
      typeof form.sort_order === "number" && Number.isFinite(form.sort_order)
        ? Math.trunc(form.sort_order)
        : parseInt(String(form.sort_order ?? "0"), 10);
    const descTrim = (form.description ?? "").trim();
    const basePayload = {
      name: nameTrim,
      description: descTrim.length ? descTrim : null,
      price: Math.round(priceVal * 100) / 100,
      sort_order: sortVal,
      is_active: form.is_active ?? true,
    };

    if (editAddon) {
      const targetRestaurantId = isSuperAdmin ? String(form.restaurant_id || editAddon.restaurant_id) : restaurantId;
      if (!targetRestaurantId) {
        toast({ variant: "destructive", title: "Restaurant required", description: "Select a restaurant for this add-on." });
        setIsSaving(false);
        return;
      }
      const payload = { ...basePayload, restaurant_id: targetRestaurantId };
      const res = await supabase.from("menu_addons").update(payload).eq("id", editAddon.id).eq("restaurant_id", editAddon.restaurant_id);
      setIsSaving(false);
      if (res.error) toast({ variant: "destructive", title: "Failed", description: (res.error as any).message });
      else {
        toast({ title: "Add-on updated" });
        setAddonDialog(false);
        setEditAddon(null);
        load();
      }
      return;
    }

    // Create
    let targetIds: string[];
    if (isSuperAdmin) {
      const fromMulti = form.restaurant_ids?.filter(Boolean) ?? [];
      targetIds = fromMulti.length ? [...new Set(fromMulti)] : [String(form.restaurant_id || restaurantId || "")].filter(Boolean);
    } else {
      if (!restaurantId) {
        toast({ variant: "destructive", title: "No restaurant", description: "No restaurant is linked to your account." });
        setIsSaving(false);
        return;
      }
      targetIds = [restaurantId];
    }
    if (!targetIds.length) {
      toast({
        variant: "destructive",
        title: "Restaurant required",
        description: isSuperAdmin ? "Select at least one restaurant." : "No restaurant is linked to your account.",
      });
      setIsSaving(false);
      return;
    }

    const rows = targetIds.map((restaurant_id) => ({ ...basePayload, restaurant_id }));
    const res = await supabase.from("menu_addons").insert(rows);
    setIsSaving(false);
    if (res.error) toast({ variant: "destructive", title: "Failed", description: (res.error as any).message });
    else {
      const n = rows.length;
      if (isSuperAdmin && n > 1) {
        toast({
          title: "Add-ons created",
          description: `Created ${n} copies (one per selected restaurant). This table still shows add-ons for your current location.`,
        });
      } else {
        const pickedName = restaurantPickerList.find((x) => x.id === targetIds[0])?.name;
        toast({
          title: "Add-on created",
          ...(pickedName && targetIds[0] !== restaurantId
            ? { description: `Stored for “${pickedName}”.` }
            : {}),
        });
      }
      setAddonDialog(false);
      setEditAddon(null);
      load();
    }
  };

  const deleteAddon = async (id: string) => {
    if (!restaurantId) return;
    if (!confirm("Delete this add-on? It will be removed from any linked menu items in this restaurant.")) return;
    const { error } = await supabase.from("menu_addons").delete().eq("id", id).eq("restaurant_id", restaurantId);
    if (error) toast({ variant: "destructive", title: "Failed", description: (error as any).message });
    else load();
  };

  const deleteCategory = async (id: string) => {
    if (!confirm("Delete this category?")) return;
    const { error } = await supabase.from("menu_categories").delete().eq("id", id);
    if (error) toast({ variant: "destructive", title: "Failed", description: (error as any).message });
    else {
      load();
      void triggerMenuSync();
    }
  };
  const deleteSubCategory = async (id: string) => {
    if (!confirm("Delete this sub-category?")) return;
    const { error } = await supabase.from("menu_sub_categories").delete().eq("id", id);
    if (error) toast({ variant: "destructive", title: "Failed", description: (error as any).message });
    else {
      load();
      void triggerMenuSync();
    }
  };
  const deleteItem = async (id: string) => {
    if (!confirm('Delete this item?')) return;
    const { error } = await supabase.from('menu_items').delete().eq('id', id);
    if (error) toast({ variant: 'destructive', title: 'Failed', description: (error as any).message });
    else { load(); void triggerMenuSync(); }
  };

  const saveInventoryFields = async (
    item: MenuItem,
    fields: { track_inventory: boolean; stock_quantity: number | null },
  ) => {
    setSavingItemId(item.id);
    const stockQty = fields.track_inventory ? Math.max(0, fields.stock_quantity ?? 0) : null;
    const isAvailable = fields.track_inventory ? stockQty! > 0 : item.is_available;
    const { error } = await supabase
      .from("menu_items")
      .update({
        track_inventory: fields.track_inventory,
        stock_quantity: stockQty,
        is_available: isAvailable,
      })
      .eq("id", item.id);
    setSavingItemId(null);
    if (error) {
      toast({ variant: "destructive", title: "Failed", description: error.message });
      return;
    }
    setItems((prev) =>
      prev.map((row) =>
        row.id === item.id
          ? { ...row, track_inventory: fields.track_inventory, stock_quantity: stockQty, is_available: isAvailable }
          : row,
      ),
    );
    toast({ title: "Inventory updated" });
    void triggerMenuSync();
  };

  const saveMaxOrderQuantity = async (item: MenuItem, raw: string) => {
    const trimmed = raw.trim();
    const maxOrderQty = trimmed === "" ? null : Math.max(1, parseInt(trimmed, 10) || 1);
    setSavingItemId(item.id);
    const { error } = await supabase
      .from("menu_items")
      .update({ max_order_quantity: maxOrderQty })
      .eq("id", item.id);
    setSavingItemId(null);
    if (error) {
      toast({ variant: "destructive", title: "Failed", description: error.message });
      return;
    }
    setItems((prev) =>
      prev.map((row) => (row.id === item.id ? { ...row, max_order_quantity: maxOrderQty } : row)),
    );
    toast({ title: "Max order updated" });
    void triggerMenuSync();
  };

  if (activeRestaurantLoading) {
    return <p className="text-muted-foreground p-4">Loading…</p>;
  }
  if (!restaurantId) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/20 p-8 text-center text-muted-foreground">
        <p className="font-medium text-foreground">No restaurant selected</p>
        <p className="text-sm mt-1">Menu and add-ons are per restaurant. Link your account to a restaurant, then open this page again.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              {itemsTab ? <UtensilsCrossed className="h-6 w-6" /> :
                categoriesTab ? <LayoutGrid className="h-6 w-6" /> :
                  subCategoriesTab ? <ListTree className="h-6 w-6" /> :
                    inventoryTab ? <Boxes className="h-6 w-6" /> :
                      maxOrderTab ? <Gauge className="h-6 w-6" /> :
                        <PlusSquare className="h-6 w-6" />}
              {itemsTab ? "Menu" :
                categoriesTab ? "Categories" :
                  subCategoriesTab ? "Sub-categories" :
                    inventoryTab ? "Inventory" :
                      maxOrderTab ? "Max Order" :
                        "Add-ons"}
            </h1>
            {isSuperAdmin ? (
              <Badge variant="secondary" className="font-normal">
                {restaurantFilterId === 'all' ? 'All Restaurants' : (restaurantMap[restaurantFilterId] || 'Loading...')}
              </Badge>
            ) : restaurantName ? (
              <Badge variant="secondary" className="font-normal">
                {restaurantName}
              </Badge>
            ) : null}
            {addonsTab ? (
              <Badge variant="outline" className="text-xs font-normal border-primary/40 text-primary">
                This location only
              </Badge>
            ) : null}
          </div>
          <p className="text-muted-foreground text-sm max-w-2xl">
            {addonsTab
              ? "Add-ons belong only to this restaurant. They never appear on another location’s menu. Link them to items from the Items tab when editing an item."
              : categoriesTab ? "Manage menu categories for this restaurant."
                : subCategoriesTab ? "Manage menu sub-categories for this restaurant."
                  : inventoryTab ? "Track stock per item. When inventory hits zero, the item is marked unavailable."
                    : maxOrderTab ? "Set the maximum quantity a customer can order per item. Leave blank for no limit."
                      : "Categories and items for this restaurant only."}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {itemsTab && restaurantId ? <MenuImportButton restaurantId={restaurantId} onImported={load} /> : null}
          {categoriesTab && (
            <Dialog open={catDialog} onOpenChange={(o) => { setCatDialog(o); if (!o) setEditCat(null); }}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Add Category</Button></DialogTrigger>
              <CategoryForm
                initial={editCat}
                onSubmit={saveCategory}
                isSaving={isSaving}
                isSuperAdmin={isSuperAdmin}
                restaurantPickerOptions={restaurantPickerList}
              />
            </Dialog>
          )}
          {subCategoriesTab && (
            <Dialog open={subCatDialog} onOpenChange={(o) => { setSubCatDialog(o); if (!o) setEditSubCat(null); }}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Add Sub-category</Button></DialogTrigger>
              <SubCategoryForm
                initial={editSubCat}
                categories={categories}
                onSubmit={saveSubCategory}
                isSaving={isSaving}
                isSuperAdmin={isSuperAdmin}
                restaurantPickerOptions={restaurantPickerList}
              />
            </Dialog>
          )}
          {itemsTab && (
            <Button
              onClick={() => {
                setEditItem(null);
                setEditItemAddonIds([]);
                setItemDialog(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1" />Add Item
            </Button>
          )}
          {addonsTab && (
            <Button
              onClick={() => {
                setEditAddon(null);
                setAddonDialog(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1" />Add Add-on
            </Button>
          )}
          <Button variant="outline" onClick={() => void triggerMenuSync()} title="Manually sync menu changes to ElevenLabs AI">
            <RefreshCw className="h-4 w-4 mr-1" />
            Sync AI
          </Button>
        </div>
      </div>

      <Dialog open={itemDialog} onOpenChange={(o) => {
        setItemDialog(o);
        if (!o) {
          setEditItem(null);
          setEditItemAddonIds([]);
        }
      }}
      >
        <ItemForm
          initial={editItem}
          initialAddonIds={editItemAddonIds}
          initialVariants={itemVariants.filter(v => v.menu_item_id === editItem?.id)}
          categories={categories}
          subCategories={subCategories}
          addons={addons}
          onSubmit={saveItem}
          isSaving={isSaving}
          isSuperAdmin={isSuperAdmin}
          restaurantPickerOptions={restaurantPickerList}
        />
      </Dialog>

      <Dialog open={addonDialog} onOpenChange={(o) => { setAddonDialog(o); if (!o) setEditAddon(null); }}>
        <AddonForm
          initial={editAddon}
          restaurantName={restaurantName}
          defaultRestaurantId={restaurantId}
          showRestaurantPicker={isSuperAdmin}
          restaurantPickerOptions={restaurantPickerList}
          onSubmit={saveAddon}
          isSaving={isSaving}
        />
      </Dialog>

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : addonsTab ? (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[520px]">
                <thead className="text-left bg-muted/50">
                  <tr>
                    <th className="p-3">Name</th>
                    <th className="p-3 max-w-[200px]">Description</th>
                    <th className="p-3 whitespace-nowrap">Price</th>
                    <th className="p-3">Sort</th>
                    <th className="p-3 whitespace-nowrap">Restaurants</th>
                    <th className="p-3">Active</th>
                    <th className="p-3 w-[100px]" />
                  </tr>
                </thead>
                <tbody>
                  {displayedAddons.map((ad) => {
                    const cluster = addonRestaurantCluster[ad.id];
                    const restaurantCount = cluster?.count ?? 1;
                    const restaurantNames =
                      cluster?.restaurantNames?.length ? cluster.restaurantNames : restaurantName ? [restaurantName] : [];
                    const tooltipTitle = restaurantNames.join(", ");
                    return (
                      <tr key={ad.id} className="border-t">
                        <td className="p-3 font-medium">{ad.name}</td>
                        <td className="p-3 text-muted-foreground truncate max-w-[200px]" title={ad.description || undefined}>{ad.description || "—"}</td>
                        <td className="p-3 whitespace-nowrap">{formatCurrency(ad.price)}</td>
                        <td className="p-3 text-muted-foreground">{ad.sort_order}</td>
                        <td className="p-3">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className={cn(
                                  "tabular-nums font-medium text-foreground rounded px-1.5 py-0.5 -mx-1.5",
                                  "hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                  restaurantNames.length ? "cursor-help underline decoration-dotted underline-offset-2" : "",
                                )}
                                aria-label={tooltipTitle ? `Restaurants: ${tooltipTitle}` : "Restaurants"}
                              >
                                {restaurantCount}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="text-xs font-medium text-foreground mb-1.5">
                                {restaurantCount === 1 ? "Restaurant" : `${restaurantCount} restaurants`}
                              </p>
                              {restaurantNames.length > 0 ? (
                                <ul className="text-xs text-popover-foreground list-disc pl-4 space-y-0.5">
                                  {restaurantNames.map((n, idx) => (
                                    <li key={`${n}-${idx}`}>{n}</li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-xs text-muted-foreground">No names loaded.</p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </td>
                        <td className="p-3">
                          {ad.is_active ? (
                            <Badge variant="outline" className="bg-green-500/15 text-green-700">Yes</Badge>
                          ) : (
                            <Badge variant="secondary">No</Badge>
                          )}
                        </td>
                        <td className="p-2">
                          <Button size="sm" variant="ghost" onClick={() => { setEditAddon(ad); setAddonDialog(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => deleteAddon(ad.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </td>
                      </tr>
                    );
                  })}
                  {addons.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-muted-foreground">No add-ons yet. Create add-ons here, then link them to items from the Items screen.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : categoriesTab ? (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left bg-muted/50">
                  <tr>
                    <th className="p-3">Name</th>
                    <th className="p-3">Description</th>
                    <th className="p-3">Sort</th>
                    {isSuperAdmin && <th className="p-3">Restaurant</th>}
                    <th className="p-3">Active</th>
                    <th className="p-3 w-[100px]" />
                  </tr>
                </thead>
                <tbody>
                  {displayedCategories.map((cat) => (
                    <tr key={cat.id} className="border-t">
                      <td className="p-3 font-medium">{cat.name}</td>
                      <td className="p-3 text-muted-foreground">{cat.description || "—"}</td>
                      <td className="p-3">{cat.sort_order}</td>
                      {isSuperAdmin && (
                        <td className="p-3 text-muted-foreground">
                          {restaurantMap[cat.restaurant_id || ""] || "—"}
                        </td>
                      )}
                      <td className="p-3">
                        {cat.is_active ? <Badge variant="outline" className="bg-green-500/15 text-green-700">Yes</Badge> : <Badge variant="secondary">No</Badge>}
                      </td>
                      <td className="p-2">
                        <Button size="sm" variant="ghost" onClick={() => { setEditCat(cat); setCatDialog(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteCategory(cat.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : subCategoriesTab ? (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left bg-muted/50">
                  <tr>
                    <th className="p-3">Name</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Description</th>
                    <th className="p-3">Sort</th>
                    {isSuperAdmin && <th className="p-3">Restaurant</th>}
                    <th className="p-3">Active</th>
                    <th className="p-3 w-[100px]" />
                  </tr>
                </thead>
                <tbody>
                  {displayedSubCategories.map((sc) => (
                    <tr key={sc.id} className="border-t">
                      <td className="p-3 font-medium">{sc.name}</td>
                      <td className="p-3">{categories.find(c => c.id === sc.category_id)?.name || "—"}</td>
                      <td className="p-3 text-muted-foreground">{sc.description || "—"}</td>
                      <td className="p-3">{sc.sort_order}</td>
                      {isSuperAdmin && (
                        <td className="p-3 text-muted-foreground">
                          {restaurantMap[sc.restaurant_id || ""] || "—"}
                        </td>
                      )}
                      <td className="p-3">
                        {sc.is_active ? <Badge variant="outline" className="bg-green-500/15 text-green-700">Yes</Badge> : <Badge variant="secondary">No</Badge>}
                      </td>
                      <td className="p-2">
                        <Button size="sm" variant="ghost" onClick={() => { setEditSubCat(sc); setSubCatDialog(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteSubCategory(sc.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : inventoryTab ? (
        <div className="space-y-4">
          {isSuperAdmin && restaurantFilterId === 'all' && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-600 dark:text-yellow-500 p-4 rounded-lg text-sm font-medium">
              ⚠️ To track and edit stock levels, please select a specific restaurant using the filter dropdown above.
            </div>
          )}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead className="text-left bg-muted/50">
                    <tr>
                      <th className="p-3">Item</th>
                      <th className="p-3">Track inventory</th>
                      <th className="p-3 whitespace-nowrap">Stock</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedItems.map((it) => {
                      const tracked = Boolean(it.track_inventory);
                      const stock = it.stock_quantity ?? 0;
                      const statusLabel = !tracked
                        ? "Not tracked"
                        : stock > 0
                          ? "In stock"
                          : "Out of stock";
                      const statusVariant = !tracked
                        ? "secondary"
                        : stock > 0
                          ? "outline"
                          : "destructive";
                      return (
                        <tr key={it.id} className="border-t">
                          <td className="p-3 font-medium">{it.name}</td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={tracked}
                                disabled={savingItemId === it.id || (isSuperAdmin && restaurantFilterId === 'all')}
                                onCheckedChange={(checked) =>
                                  void saveInventoryFields(it, {
                                    track_inventory: checked,
                                    stock_quantity: checked ? stock || 0 : null,
                                  })
                                }
                              />
                              {savingItemId === it.id ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
                            </div>
                          </td>
                          <td className="p-3">
                            {tracked ? (
                              <Input
                                key={`${it.id}-stock-${stock}`}
                                type="number"
                                min={0}
                                className="w-24"
                                defaultValue={stock}
                                disabled={savingItemId === it.id || (isSuperAdmin && restaurantFilterId === 'all')}
                                onBlur={(e) =>
                                  void saveInventoryFields(it, {
                                    track_inventory: true,
                                    stock_quantity: Math.max(0, parseInt(e.target.value, 10) || 0),
                                  })
                                }
                              />
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="p-3">
                            <Badge
                              variant={statusVariant as "outline" | "secondary" | "destructive"}
                              className={tracked && stock > 0 ? "bg-green-500/15 text-green-700" : undefined}
                            >
                              {statusLabel}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                    {displayedItems.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-muted-foreground">
                          No menu items yet. Add items from the Items tab first.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : maxOrderTab ? (
        <div className="space-y-4">
          {isSuperAdmin && restaurantFilterId === 'all' && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-600 dark:text-yellow-500 p-4 rounded-lg text-sm font-medium">
              ⚠️ To set and edit maximum order quantities, please select a specific restaurant using the filter dropdown above.
            </div>
          )}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[480px]">
                  <thead className="text-left bg-muted/50">
                    <tr>
                      <th className="p-3">Item</th>
                      <th className="p-3 whitespace-nowrap">Max per order</th>
                      <th className="p-3">Limit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedItems.map((it) => (
                      <tr key={it.id} className="border-t">
                        <td className="p-3 font-medium">{it.name}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Input
                              key={`${it.id}-max-${it.max_order_quantity ?? "none"}`}
                              type="number"
                              min={1}
                              className="w-28"
                              placeholder="No limit"
                              defaultValue={it.max_order_quantity ?? ""}
                              disabled={savingItemId === it.id || (isSuperAdmin && restaurantFilterId === 'all')}
                              onBlur={(e) => void saveMaxOrderQuantity(it, e.target.value)}
                            />
                            {savingItemId === it.id ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
                          </div>
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {it.max_order_quantity ? `Up to ${it.max_order_quantity}` : "Unlimited"}
                        </td>
                      </tr>
                    ))}
                    {displayedItems.length === 0 && (
                      <tr>
                        <td colSpan={3} className="p-8 text-center text-muted-foreground">
                          No menu items yet. Add items from the Items tab first.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="border shadow-sm">
          <CardHeader className="p-4 pb-3 border-b bg-card">
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              {/* Search by name */}
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by product name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-sm bg-background"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Filters */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Status filter */}
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[130px] h-9 text-sm">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Status: All</SelectItem>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="unavailable">Unavailable</SelectItem>
                  </SelectContent>
                </Select>

                {/* Category filter */}
                <Select value={categoryFilterId} onValueChange={setCategoryFilterId}>
                  <SelectTrigger className="w-[160px] h-9 text-sm">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Restaurants filter for Super Admin */}
                {isSuperAdmin && (
                  <Select value={restaurantFilterId} onValueChange={setRestaurantFilterId}>
                    <SelectTrigger className="w-[160px] h-9 text-sm">
                      <SelectValue placeholder="Restaurants" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Restaurants</SelectItem>
                      {allRestaurants.map((r) => (
                        <SelectItem key={r.id} value={String(r.id)}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {/* Clear filters button */}
                {hasActiveFilters && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearFilters}
                    className="h-9 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <FilterX className="h-3.5 w-3.5 mr-1" />
                    Clear filters
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <MenuItemsTable
              items={filteredItems}
              categories={categories}
              subCategories={subCategories}
              itemVariants={itemVariants}
              onEdit={beginEditItem}
              onDelete={deleteItem}
              onToggleAvailability={toggleItemAvailability}
              addonSummary={addonSummary}
              itemAddonCount={itemAddonCount}
              showRestaurant={isSuperAdmin || restaurantFilterId === 'all'}
              restaurantMap={restaurantMap}
              emptyMessage={
                hasActiveFilters
                  ? "No menu items match your current search and filter criteria."
                  : "No menu items found. Click 'Add Item' to create your first item."
              }
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

type AddonFormSubmit = Partial<MenuAddon> & { restaurant_ids?: string[] };

function AddonForm({
  initial,
  restaurantName,
  defaultRestaurantId,
  showRestaurantPicker,
  restaurantPickerOptions,
  onSubmit,
  isSaving,
}: {
  initial: MenuAddon | null;
  restaurantName: string | null;
  defaultRestaurantId: string;
  showRestaurantPicker: boolean;
  restaurantPickerOptions: { id: string; name: string }[];
  onSubmit: (f: AddonFormSubmit) => void;
  isSaving?: boolean;
}) {
  const { toast } = useToast();
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<AddonFieldKey, string>>>({});
  const [form, setForm] = useState<Partial<MenuAddon>>(() =>
    initial || {
      name: "",
      description: "",
      price: 0,
      sort_order: 0,
      is_active: true,
      restaurant_id: defaultRestaurantId,
    },
  );
  const [selectedRestaurantIds, setSelectedRestaurantIds] = useState<string[]>([defaultRestaurantId]);

  useEffect(() => {
    if (initial) {
      setForm({ ...initial });
    } else {
      setForm({
        name: "",
        description: "",
        price: 0,
        sort_order: 0,
        is_active: true,
        restaurant_id: defaultRestaurantId,
      });
      setSelectedRestaurantIds([defaultRestaurantId]);
    }
    setFieldErrors({});
  }, [initial, defaultRestaurantId]);

  const toggleRestaurantPick = (id: string) => {
    setSelectedRestaurantIds((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 1) return prev;
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
  };

  const selectedRid = String(form.restaurant_id || defaultRestaurantId);
  const selectedLabel = restaurantPickerOptions.find((x) => x.id === selectedRid)?.name ?? restaurantName;

  const handleSubmit = () => {
    const errs = validateAddonForm(form);
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    if (!initial && showRestaurantPicker && selectedRestaurantIds.length === 0) {
      toast({
        variant: "destructive",
        title: "Select a restaurant",
        description: "Choose at least one restaurant for this add-on.",
      });
      return;
    }
    if (!initial && showRestaurantPicker && selectedRestaurantIds.length) {
      onSubmit({ ...form, restaurant_ids: selectedRestaurantIds });
      return;
    }
    onSubmit({ ...form });
  };

  return (
    <DialogContent className="max-w-lg sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>{initial ? "Edit add-on" : "New add-on"}</DialogTitle>
        {showRestaurantPicker ? (
          <p className="text-sm text-muted-foreground pt-1">
            {initial
              ? "Super admin: move this add-on to another restaurant if needed."
              : "Super admin: select one or more restaurants — we create the same add-on for each. Tenant logins always create add-ons only for their own restaurant."}
          </p>
        ) : restaurantName ? (
          <p className="text-sm text-muted-foreground pt-1">
            Saved for <span className="font-medium text-foreground">{restaurantName}</span> (the restaurant linked to your
            account).
          </p>
        ) : (
          <p className="text-sm text-muted-foreground pt-1">Saved for your authenticated restaurant.</p>
        )}
      </DialogHeader>
      <DialogBody className="space-y-3">
        {showRestaurantPicker && restaurantPickerOptions.length > 0 && !initial ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Restaurants</Label>
              <div className="flex gap-1 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setSelectedRestaurantIds(restaurantPickerOptions.map((r) => r.id))}
                >
                  Select all
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setSelectedRestaurantIds([defaultRestaurantId])}
                >
                  Reset
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">One add-on row per selected location (same name, price, and options).</p>
            <div className="max-h-52 overflow-y-auto rounded-md border bg-muted/30 p-2 space-y-1.5">
              {restaurantPickerOptions.map((row) => (
                <label
                  key={row.id}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-sm cursor-pointer hover:bg-muted/80"
                >
                  <Checkbox
                    checked={selectedRestaurantIds.includes(row.id)}
                    onCheckedChange={() => toggleRestaurantPick(row.id)}
                  />
                  <span className="flex-1">{row.name}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {selectedRestaurantIds.length} restaurant{selectedRestaurantIds.length === 1 ? "" : "s"} selected
            </p>
          </div>
        ) : null}
        {showRestaurantPicker && restaurantPickerOptions.length > 0 && initial ? (
          <div className="space-y-2">
            <Label>Restaurant</Label>
            <Select value={selectedRid} onValueChange={(v) => setForm({ ...form, restaurant_id: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Select restaurant" />
              </SelectTrigger>
              <SelectContent>
                {restaurantPickerOptions.map((row) => (
                  <SelectItem key={row.id} value={String(row.id)}>
                    {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedLabel ? (
              <p className="text-xs text-muted-foreground">
                Add-on will be stored under <span className="font-medium text-foreground">{selectedLabel}</span>.
              </p>
            ) : null}
          </div>
        ) : null}
        <div>
          <Label htmlFor="addon-name">Name</Label>
          <Input
            id="addon-name"
            name="addon-name"
            required
            maxLength={200}
            value={form.name || ""}
            aria-invalid={!!fieldErrors.name}
            className={cn(fieldErrors.name && "border-destructive focus-visible:ring-destructive")}
            onChange={(e) => {
              setForm({ ...form, name: e.target.value });
              setFieldErrors((fe) => {
                if (!fe.name) return fe;
                const next = { ...fe };
                delete next.name;
                return next;
              });
            }}
          />
          {fieldErrors.name ? <p className="text-xs text-destructive mt-1">{fieldErrors.name}</p> : null}
        </div>
        <div>
          <Label htmlFor="addon-description">Description</Label>
          <Textarea
            id="addon-description"
            name="addon-description"
            maxLength={5000}
            value={form.description || ""}
            aria-invalid={!!fieldErrors.description}
            className={cn(fieldErrors.description && "border-destructive focus-visible:ring-destructive")}
            onChange={(e) => {
              setForm({ ...form, description: e.target.value });
              setFieldErrors((fe) => {
                if (!fe.description) return fe;
                const next = { ...fe };
                delete next.description;
                return next;
              });
            }}
          />
          {fieldErrors.description ? (
            <p className="text-xs text-destructive mt-1">{fieldErrors.description}</p>
          ) : (form.description || "").length > 0 ? (
            <p className="text-xs text-muted-foreground mt-1">{(form.description || "").length} / 5000</p>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="addon-price">Extra price</Label>
            <Input
              id="addon-price"
              name="addon-price"
              type="number"
              min={0}
              max={99999999.99}
              step="0.01"
              inputMode="decimal"
              value={form.price ?? 0}
              aria-invalid={!!fieldErrors.price}
              className={cn(fieldErrors.price && "border-destructive focus-visible:ring-destructive")}
              onChange={(e) => {
                const v = e.target.value;
                const n = v === "" ? 0 : parseFloat(v);
                setForm({ ...form, price: Number.isFinite(n) ? n : 0 });
                setFieldErrors((fe) => {
                  if (!fe.price) return fe;
                  const next = { ...fe };
                  delete next.price;
                  return next;
                });
              }}
            />
            {fieldErrors.price ? <p className="text-xs text-destructive mt-1">{fieldErrors.price}</p> : null}
          </div>
          <div>
            <Label htmlFor="addon-sort">Sort order</Label>
            <Input
              id="addon-sort"
              name="addon-sort"
              type="number"
              min={0}
              max={2147483647}
              step={1}
              inputMode="numeric"
              value={form.sort_order ?? 0}
              aria-invalid={!!fieldErrors.sort_order}
              className={cn(fieldErrors.sort_order && "border-destructive focus-visible:ring-destructive")}
              onChange={(e) => {
                const v = e.target.value;
                const n = v === "" ? 0 : parseInt(v, 10);
                setForm({ ...form, sort_order: Number.isFinite(n) && !Number.isNaN(n) ? n : 0 });
                setFieldErrors((fe) => {
                  if (!fe.sort_order) return fe;
                  const next = { ...fe };
                  delete next.sort_order;
                  return next;
                });
              }}
            />
            {fieldErrors.sort_order ? (
              <p className="text-xs text-destructive mt-1">{fieldErrors.sort_order}</p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={form.is_active ?? true} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
          <Label>Active</Label>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button type="button" onClick={handleSubmit} disabled={isSaving}>
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function CategoryForm({
  initial,
  onSubmit,
  isSaving,
  isSuperAdmin,
  restaurantPickerOptions,
}: {
  initial: Category | null;
  onSubmit: (f: Partial<Category> & { restaurant_id?: string }) => void;
  isSaving?: boolean;
  isSuperAdmin: boolean;
  restaurantPickerOptions: { id: string; name: string }[];
}) {
  const [form, setForm] = useState<Partial<Category> & { restaurant_id?: string }>(
    initial || { name: "", description: "", sort_order: 0, is_active: true }
  );
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string>(
    initial?.restaurant_id ?? (isSuperAdmin && restaurantPickerOptions.length ? restaurantPickerOptions[0].id : "")
  );

  useEffect(() => {
    setForm(initial || { name: "", description: "", sort_order: 0, is_active: true });
    if (isSuperAdmin && restaurantPickerOptions.length) {
      setSelectedRestaurantId(initial?.restaurant_id ?? restaurantPickerOptions[0].id);
    }
  }, [initial, isSuperAdmin, restaurantPickerOptions]);

  const handleSave = () => {
    const payload = { ...form };
    if (isSuperAdmin) {
      payload.restaurant_id = selectedRestaurantId;
    }
    onSubmit(payload);
  };

  return (
    <DialogContent className="max-w-lg sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>{initial ? "Edit category" : "New category"}</DialogTitle>
      </DialogHeader>
      <DialogBody className="space-y-3">
        {isSuperAdmin && (
          <div>
            <Label>Restaurant</Label>
            <Select value={selectedRestaurantId} onValueChange={setSelectedRestaurantId}>
              <SelectTrigger>
                <SelectValue placeholder="Select restaurant" />
              </SelectTrigger>
              <SelectContent>
                {restaurantPickerOptions.map((r) => (
                  <SelectItem key={r.id} value={String(r.id)}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div>
          <Label>Name</Label>
          <Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <Label>Description</Label>
          <Textarea value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div>
          <Label>Sort order</Label>
          <Input
            type="number"
            value={form.sort_order || 0}
            onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={form.is_active ?? true} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
          <Label>Active</Label>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function SubCategoryForm({
  initial,
  categories,
  onSubmit,
  isSaving,
  isSuperAdmin,
  restaurantPickerOptions,
}: {
  initial: SubCategory | null;
  categories: Category[];
  onSubmit: (f: Partial<SubCategory> & { restaurant_id?: string }) => void;
  isSaving?: boolean;
  isSuperAdmin: boolean;
  restaurantPickerOptions: { id: string; name: string }[];
}) {
  const [form, setForm] = useState<Partial<SubCategory> & { restaurant_id?: string }>(
    initial || { name: "", description: "", sort_order: 0, is_active: true, category_id: "" }
  );
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string>(
    initial?.restaurant_id ?? (isSuperAdmin && restaurantPickerOptions.length ? restaurantPickerOptions[0].id : "")
  );

  useEffect(() => {
    setForm(initial || { name: "", description: "", sort_order: 0, is_active: true, category_id: "" });
    if (isSuperAdmin && restaurantPickerOptions.length) {
      setSelectedRestaurantId(initial?.restaurant_id ?? restaurantPickerOptions[0].id);
    }
  }, [initial, isSuperAdmin, restaurantPickerOptions]);

  const handleSave = () => {
    const payload = { ...form };
    if (isSuperAdmin) {
      payload.restaurant_id = selectedRestaurantId;
    }
    onSubmit(payload);
  };

  const filteredCategories = useMemo(() => {
    if (!isSuperAdmin) return categories;
    return categories.filter(c => !selectedRestaurantId || String(c.restaurant_id) === String(selectedRestaurantId));
  }, [categories, isSuperAdmin, selectedRestaurantId]);

  return (
    <DialogContent className="max-w-lg sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>{initial ? "Edit sub-category" : "New sub-category"}</DialogTitle>
      </DialogHeader>
      <DialogBody className="space-y-3">
        {isSuperAdmin && (
          <div>
            <Label>Restaurant</Label>
            <Select value={selectedRestaurantId} onValueChange={(v) => {
              setSelectedRestaurantId(v);
              setForm(prev => ({ ...prev, category_id: "" }));
            }}>
              <SelectTrigger>
                <SelectValue placeholder="Select restaurant" />
              </SelectTrigger>
              <SelectContent>
                {restaurantPickerOptions.map((r) => (
                  <SelectItem key={r.id} value={String(r.id)}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div>
          <Label>Category</Label>
          <Select value={form.category_id || ""} onValueChange={(v) => setForm({ ...form, category_id: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Select parent category" />
            </SelectTrigger>
            <SelectContent>
              {filteredCategories.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Name</Label>
          <Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <Label>Description</Label>
          <Textarea value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div>
          <Label>Sort order</Label>
          <Input
            type="number"
            value={form.sort_order || 0}
            onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={form.is_active ?? true} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
          <Label>Active</Label>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}


function ItemForm({
  initial,
  initialAddonIds,
  initialVariants,
  categories,
  subCategories,
  addons,
  onSubmit,
  isSaving,
  isSuperAdmin,
  restaurantPickerOptions,
}: {
  initial: MenuItem | null;
  initialAddonIds: string[];
  initialVariants: MenuItemVariant[];
  categories: Category[];
  subCategories: SubCategory[];
  addons: MenuAddon[];
  onSubmit: (f: Partial<MenuItem> & { addon_ids?: string[]; variants?: Partial<MenuItemVariant>[]; restaurant_id?: string }) => void | Promise<void>;
  isSaving?: boolean;
  isSuperAdmin: boolean;
  restaurantPickerOptions: { id: string; name: string }[];
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<Partial<MenuItem>>(initial || { name: "", description: "", price: 0, is_available: true, prep_time_minutes: 15, dietary_tags: [], spice_level: 0 });
  const [tagsText, setTagsText] = useState((initial?.dietary_tags || []).join(", "));
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>(initialAddonIds);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string>(initial?.restaurant_id ?? (isSuperAdmin && restaurantPickerOptions.length ? restaurantPickerOptions[0].id : ''));
  const [variants, setVariants] = useState<Partial<MenuItemVariant>[]>(initialVariants);

  const filteredCategories = useMemo(() => {
    if (!isSuperAdmin) return categories;
    return categories.filter(c => !selectedRestaurantId || String(c.restaurant_id) === String(selectedRestaurantId));
  }, [categories, isSuperAdmin, selectedRestaurantId]);

  const filteredSubCategories = useMemo(() => {
    let list = subCategories;
    if (isSuperAdmin && selectedRestaurantId) {
      list = list.filter(sc => String(sc.restaurant_id) === String(selectedRestaurantId));
    }
    if (form.category_id) {
      list = list.filter(sc => sc.category_id === form.category_id);
    }
    return list;
  }, [subCategories, isSuperAdmin, selectedRestaurantId, form.category_id]);

  const filteredAddons = useMemo(() => {
    if (!isSuperAdmin) return addons;
    return addons.filter(a => !selectedRestaurantId || String(a.restaurant_id) === String(selectedRestaurantId));
  }, [addons, isSuperAdmin, selectedRestaurantId]);

  useEffect(() => {
    setForm(initial || { name: "", description: "", price: 0, is_available: true, prep_time_minutes: 15, dietary_tags: [], spice_level: 0 });
    setTagsText((initial?.dietary_tags || []).join(", "));
    setImageFile(null);
  }, [initial]);

  useEffect(() => {
    setSelectedAddonIds(initialAddonIds);
    setVariants(initialVariants);
    if (isSuperAdmin && restaurantPickerOptions.length) {
      setSelectedRestaurantId(initial?.restaurant_id ?? restaurantPickerOptions[0].id);
    }
  }, [initialAddonIds, initialVariants, initial?.id]);

  const toggleAddon = (id: string) => {
    setSelectedAddonIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const filePreview = imageFile ? URL.createObjectURL(imageFile) : null;
  useEffect(() => {
    return () => {
      if (filePreview) URL.revokeObjectURL(filePreview);
    };
  }, [filePreview]);

  const displayImageSrc = filePreview ?? resolveMediaUrl(form.image_url) ?? undefined;

  const handleSave = async () => {
    setUploading(true);
    try {
      let image_url: string | null = form.image_url ?? null;
      if (imageFile) {
        const token = getToken();
        if (!token) {
          toast({ variant: "destructive", title: "Not signed in", description: "Sign in to upload images." });
          return;
        }
        const fd = new FormData();
        fd.append("file", imageFile);
        const res = await fetch(`${getApiBase()}/api/uploads/menu-item-image`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast({ variant: "destructive", title: "Image upload failed", description: typeof j.error === "string" ? j.error : res.statusText });
          return;
        }
        if (!j.url || typeof j.url !== "string") {
          toast({ variant: "destructive", title: "Upload failed", description: "Invalid response from server." });
          return;
        }
        image_url = j.url;
      }
      const payload: any = { ...form, image_url, addon_ids: selectedAddonIds, variants };
      if (isSuperAdmin) payload.restaurant_id = selectedRestaurantId;
      await onSubmit(payload);
    } finally {
      setUploading(false);
    }
  };

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>{initial ? "Edit item" : "New item"}</DialogTitle>
        <p className="text-sm text-zinc-500 pt-1">Fill in the details below, then save to update the menu.</p>
      </DialogHeader>
      <DialogBody className="space-y-4">
        <div className="form-field">
          <Label>Name</Label>
          <Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Margherita Pizza" />
        </div>
        <div className="form-field">
          <Label>Category</Label>
          <Select value={form.category_id || ""} onValueChange={(v) => setForm({ ...form, category_id: v })}>
            <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
            <SelectContent>{filteredCategories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="form-row">
          {isSuperAdmin && (
            <div className="form-field">
              <Label>Restaurant</Label>
              <Select value={selectedRestaurantId} onValueChange={setSelectedRestaurantId}>
                <SelectTrigger><SelectValue placeholder="Select restaurant" /></SelectTrigger>
                <SelectContent>
                  {restaurantPickerOptions.map((r) => (
                    <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="form-field">
            <Label>Sub-category</Label>
            <Select
              value={form.sub_category_id || "none"}
              onValueChange={(v) => setForm({ ...form, sub_category_id: v === "none" ? null : v })}
            >
              <SelectTrigger><SelectValue placeholder="Select sub-category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {filteredSubCategories.map((sc) => (
                  <SelectItem key={sc.id} value={String(sc.id)}>{sc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="form-field">
          <Label>Description</Label>
          <Textarea value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Short description for customers" />
        </div>
        <div className="form-row">
          <div className="form-field">
            <Label>Price</Label>
            <Input type="number" step="0.01" value={form.price || 0} onChange={(e) => setForm({ ...form, price: parseFloat(e.target.value) || 0 })} />
          </div>
          <div className="form-field">
            <Label>Prep time (min)</Label>
            <Input type="number" value={form.prep_time_minutes || 15} onChange={(e) => setForm({ ...form, prep_time_minutes: parseInt(e.target.value) || 15 })} />
          </div>
        </div>
        <div className="form-field">
          <Label>Item image</Label>
          {displayImageSrc && (
            <img src={displayImageSrc} alt="" className="w-full max-h-40 object-cover rounded-lg border border-zinc-200" />
          )}
          <Input
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="cursor-pointer"
            onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
          />
          {(form.image_url || imageFile) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setImageFile(null);
                setForm((prev) => ({ ...prev, image_url: null }));
              }}
            >
              Remove image
            </Button>
          )}
          <p className="text-xs text-zinc-500">JPEG, PNG, GIF, or WebP — up to 5MB.</p>
        </div>
        <div className="form-field">
          <Label>Dietary tags (comma separated)</Label>
          <Input value={tagsText} onChange={(e) => { setTagsText(e.target.value); setForm({ ...form, dietary_tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) }); }} placeholder="vegan, gluten-free" />
        </div>
        <div className="form-field">
          <Label>Spice level (0-5)</Label>
          <Input type="number" min={0} max={5} value={form.spice_level || 0} onChange={(e) => setForm({ ...form, spice_level: parseInt(e.target.value) || 0 })} />
        </div>

        <div className="space-y-3 border-t border-zinc-200 pt-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label className="text-sm font-semibold text-zinc-900">Variants (Sizes/Options)</Label>
              <p className="text-xs text-zinc-500 mt-1">Add variants like Small, Large, or 2kg — each with its own price.</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setVariants([...variants, { name: "", price: 0, sort_order: variants.length, is_active: true }])}
            >
              <Plus className="h-4 w-4 mr-1" />Add Variant
            </Button>
          </div>
          {variants.length > 0 && (
            <div className="space-y-3 rounded-lg border border-zinc-200 p-3 bg-zinc-50">
              {variants.map((v, idx) => (
                <div key={idx} className="flex gap-3 items-end group">
                  <div className="flex-1 form-field">
                    <Label className="text-[11px] uppercase tracking-wide text-zinc-500">Name</Label>
                    <Input
                      placeholder="e.g. Small"
                      value={v.name || ""}
                      onChange={(e) => {
                        const next = [...variants];
                        next[idx] = { ...v, name: e.target.value };
                        setVariants(next);
                      }}
                    />
                  </div>
                  <div className="w-28 form-field">
                    <Label className="text-[11px] uppercase tracking-wide text-zinc-500">Price</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={v.price ?? 0}
                      onChange={(e) => {
                        const next = [...variants];
                        next[idx] = { ...v, price: parseFloat(e.target.value) || 0 };
                        setVariants(next);
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => setVariants(variants.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-2 border-t border-zinc-200 pt-4">
          <Label>Linked add-ons</Label>
          <p className="text-xs text-zinc-500">
            {addons.length === 0
              ? "Create add-ons for this restaurant under Menu → Add-ons, then link them here."
              : "Optional extras for this item (only add-ons defined for this restaurant)."}
          </p>
          {addons.length > 0 && (
            <div className="flex flex-col gap-1.5 max-h-44 overflow-y-auto rounded-lg border border-zinc-200 p-2 bg-zinc-50">
              {filteredAddons.map((a) => (
                <label
                  key={a.id}
                  className={cn(
                    "flex items-center gap-2 text-sm cursor-pointer rounded-md px-2 py-1.5 hover:bg-white",
                    !a.is_active && "opacity-70",
                  )}
                >
                  <Checkbox
                    checked={selectedAddonIds.includes(a.id)}
                    onCheckedChange={() => toggleAddon(a.id)}
                  />
                  <span className="flex-1">{a.name}</span>
                  <span className="text-zinc-500 text-xs tabular-nums">{formatCurrency(a.price)}</span>
                  {!a.is_active && <Badge variant="secondary" className="text-[10px] px-1 py-0">Inactive</Badge>}
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="setting-row !bg-white">
          <div className="space-y-0.5">
            <Label>Available</Label>
            <p className="text-xs text-zinc-500">Show this item on the menu</p>
          </div>
          <Switch checked={form.is_available ?? true} onCheckedChange={(v) => setForm({ ...form, is_available: v })} />
        </div>
      </DialogBody>
      <DialogFooter>
        <Button onClick={() => void handleSave()} disabled={uploading || isSaving}>
          {(uploading || isSaving) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {uploading || isSaving ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}