import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Clock,
  Copy,
  Layers,
  Loader2,
  Package,
  Pencil,
  Store,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/restaurant";
import { resolveMediaUrl } from "@/lib/apiBase";
import { cn } from "@/lib/utils";

type MenuItemRow = {
  id: string;
  restaurant_id: string;
  category_id: string | null;
  sub_category_id: string | null;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_available: boolean;
  prep_time_minutes: number | null;
  dietary_tags: string[] | null;
  spice_level: number | null;
  track_inventory: boolean | null;
  stock_quantity: number | null;
  max_order_quantity: number | null;
  created_at: string | null;
  updated_at: string | null;
};

type VariantRow = {
  id: string;
  name: string;
  price: number;
  sort_order: number;
  is_active: boolean;
};

type AddonRow = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  is_active: boolean;
};

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 py-2.5 text-sm sm:grid-cols-[160px_1fr]">
      <dt className="text-muted-foreground font-medium">{label}</dt>
      <dd className="text-foreground min-w-0">{children}</dd>
    </div>
  );
}

export default function MenuItemDetail() {
  const { itemId } = useParams<{ itemId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState<MenuItemRow | null>(null);
  const [restaurantName, setRestaurantName] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState<string | null>(null);
  const [subCategoryName, setSubCategoryName] = useState<string | null>(null);
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [addons, setAddons] = useState<AddonRow[]>([]);
  const [imgFailed, setImgFailed] = useState(false);

  const load = useCallback(async () => {
    if (!itemId) return;
    setLoading(true);
    try {
      const { data: row, error } = await supabase
        .from("menu_items")
        .select(
          "id, restaurant_id, category_id, sub_category_id, name, description, price, image_url, is_available, prep_time_minutes, dietary_tags, spice_level, track_inventory, stock_quantity, max_order_quantity, created_at, updated_at",
        )
        .eq("id", itemId)
        .maybeSingle();

      if (error) throw error;
      if (!row) {
        setItem(null);
        return;
      }

      const menuItem = row as MenuItemRow;
      setItem(menuItem);

      const [restRes, catRes, subRes, varRes, linkRes] = await Promise.all([
        supabase.from("restaurants").select("name").eq("id", menuItem.restaurant_id).maybeSingle(),
        menuItem.category_id
          ? supabase.from("menu_categories").select("name").eq("id", menuItem.category_id).maybeSingle()
          : Promise.resolve({ data: null }),
        menuItem.sub_category_id
          ? supabase.from("menu_sub_categories").select("name").eq("id", menuItem.sub_category_id).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase
          .from("menu_item_variants")
          .select("id, name, price, sort_order, is_active")
          .eq("menu_item_id", menuItem.id)
          .order("sort_order"),
        supabase.from("menu_item_addons").select("menu_addon_id").eq("menu_item_id", menuItem.id),
      ]);

      setRestaurantName((restRes.data as { name?: string } | null)?.name ?? null);
      setCategoryName((catRes.data as { name?: string } | null)?.name ?? null);
      setSubCategoryName((subRes.data as { name?: string } | null)?.name ?? null);
      setVariants(((varRes.data as VariantRow[]) || []).filter(Boolean));

      const addonIds = ((linkRes.data as { menu_addon_id: string }[]) || []).map((l) => l.menu_addon_id);
      if (addonIds.length) {
        const { data: addonRows } = await supabase
          .from("menu_addons")
          .select("id, name, description, price, is_active")
          .in("id", addonIds)
          .order("sort_order");
        setAddons((addonRows as AddonRow[]) || []);
      } else {
        setAddons([]);
      }
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Failed to load item",
        description: e instanceof Error ? e.message : String(e),
      });
      setItem(null);
    } finally {
      setLoading(false);
    }
  }, [itemId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setImgFailed(false);
  }, [item?.image_url]);

  const copyId = async () => {
    if (!item?.id) return;
    try {
      await navigator.clipboard.writeText(item.id);
      toast({ title: "Item ID copied" });
    } catch {
      toast({ variant: "destructive", title: "Could not copy ID" });
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-16 text-center">
        <Package className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Item not found</h1>
        <p className="text-sm text-muted-foreground">This menu item may have been deleted.</p>
        <Button variant="outline" onClick={() => navigate("/menu")}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to menu
        </Button>
      </div>
    );
  }

  const imageSrc = resolveMediaUrl(item.image_url);
  const tags = Array.isArray(item.dietary_tags) ? item.dietary_tags : [];
  const displayImage = imageSrc && !imgFailed ? imageSrc : "/menu-item-placeholder.svg";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/menu">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Menu
            </Link>
          </Button>
          <Separator orientation="vertical" className="hidden h-6 sm:block" />
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{item.name}</h1>
            <p className="text-xs text-muted-foreground sm:text-sm">
              {restaurantName ? (
                <span className="inline-flex items-center gap-1">
                  <Store className="h-3.5 w-3.5" />
                  {restaurantName}
                </span>
              ) : (
                "Menu item details"
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={item.is_available ? "default" : "secondary"}>
            {item.is_available ? "Available" : "Unavailable"}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/menu?tab=items&editItem=${item.id}`)}
          >
            <Pencil className="mr-1 h-4 w-4" />
            Edit
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Card className="overflow-hidden">
          <div className="aspect-square bg-muted/40">
            <img
              src={displayImage}
              alt={item.name}
              className="h-full w-full object-cover"
              onError={() => {
                if (displayImage !== "/menu-item-placeholder.svg") setImgFailed(true);
              }}
            />
          </div>
          <CardContent className="space-y-3 p-4">
            <div className="text-2xl font-bold text-foreground">{formatCurrency(item.price)}</div>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {item.prep_time_minutes ? (
                <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1">
                  <Clock className="h-3.5 w-3.5" />
                  {item.prep_time_minutes} min prep
                </span>
              ) : null}
              {item.spice_level != null && item.spice_level > 0 ? (
                <span className="rounded-md border px-2 py-1">Spice {item.spice_level}/5</span>
              ) : null}
            </div>
            <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => void copyId()}>
              <Copy className="mr-1 h-3.5 w-3.5" />
              Copy ID
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y divide-border/60">
                <DetailRow label="Description">
                  {item.description?.trim() ? (
                    <p className="leading-relaxed whitespace-pre-wrap">{item.description}</p>
                  ) : (
                    <span className="text-muted-foreground">No description</span>
                  )}
                </DetailRow>
                <DetailRow label="Category">{categoryName || "Uncategorized"}</DetailRow>
                <DetailRow label="Sub-category">{subCategoryName || "—"}</DetailRow>
                <DetailRow label="Prep time">
                  {item.prep_time_minutes != null ? `${item.prep_time_minutes} minutes` : "—"}
                </DetailRow>
                <DetailRow label="Dietary tags">
                  {tags.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="font-normal">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    "—"
                  )}
                </DetailRow>
                <DetailRow label="Item ID">
                  <code className="break-all text-xs">{item.id}</code>
                </DetailRow>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Inventory & ordering</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y divide-border/60">
                <DetailRow label="Track inventory">{item.track_inventory ? "Yes" : "No"}</DetailRow>
                <DetailRow label="Stock">
                  {item.track_inventory
                    ? item.stock_quantity != null
                      ? String(item.stock_quantity)
                      : "0"
                    : "Not tracked"}
                </DetailRow>
                <DetailRow label="Max per order">
                  {item.max_order_quantity != null ? String(item.max_order_quantity) : "No limit"}
                </DetailRow>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Layers className="h-4 w-4" />
                Variants
              </CardTitle>
            </CardHeader>
            <CardContent>
              {variants.length === 0 ? (
                <p className="text-sm text-muted-foreground">No variants for this item.</p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {variants.map((v) => (
                    <li key={v.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <span className={cn("font-medium", !v.is_active && "text-muted-foreground line-through")}>
                        {v.name}
                      </span>
                      <span className="font-semibold tabular-nums">{formatCurrency(v.price)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Add-ons</CardTitle>
            </CardHeader>
            <CardContent>
              {addons.length === 0 ? (
                <p className="text-sm text-muted-foreground">No add-ons linked to this item.</p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {addons.map((a) => (
                    <li key={a.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                      <div className="min-w-0">
                        <div className={cn("font-medium", !a.is_active && "text-muted-foreground")}>{a.name}</div>
                        {a.description ? (
                          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{a.description}</p>
                        ) : null}
                      </div>
                      <span className="shrink-0 font-semibold tabular-nums">+{formatCurrency(a.price)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
