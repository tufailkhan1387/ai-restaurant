import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Pencil, Plus, Tag, Trash2, Ticket } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/restaurant";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActiveRestaurant } from "@/hooks/useActiveRestaurant";
import { DealsImportButton } from "@/components/deals/DealsImportButton";
import { getApiBase, resolveMediaUrl } from "@/lib/apiBase";
import { getToken } from "@/lib/authStorage";
import { useAuth } from "@/hooks/useAuth";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface Deal {
  id: string;
  restaurant_id: string;
  name: string;
  description: string | null;
  price: number;
  original_price: number | null;
  image_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
}
interface Discount { id: string; code: string; description: string | null; discount_type: string; discount_value: number; min_order_amount: number; max_uses: number | null; used_count: number; starts_at: string | null; ends_at: string | null; is_active: boolean }

type DealFieldKey = "name" | "description" | "price" | "original_price" | "dates";

function validateDealForm(form: Partial<Deal>): Partial<Record<DealFieldKey, string>> {
  const errors: Partial<Record<DealFieldKey, string>> = {};
  const name = (form.name ?? "").trim();
  if (!name) errors.name = "Name is required.";
  else if (name.length > 200) errors.name = "Name must be at most 200 characters.";

  const descRaw = form.description;
  if (descRaw != null && String(descRaw).length > 5000) {
    errors.description = "Description must be at most 5000 characters.";
  }

  const rawPrice = form.price;
  const price = typeof rawPrice === "number" ? rawPrice : parseFloat(String(rawPrice ?? ""));
  if (!Number.isFinite(price)) errors.price = "Enter a valid price.";
  else if (price < 0) errors.price = "Price cannot be negative.";
  else if (price > 99_999_999.99) errors.price = "Price is too large (max 99,999,999.99).";

  const op = form.original_price;
  if (op != null && !(typeof op === "string" && op.trim() === "")) {
    const orig = typeof op === "number" ? op : parseFloat(String(op));
    if (!Number.isFinite(orig)) errors.original_price = "Enter a valid original price or leave it empty.";
    else if (orig < 0) errors.original_price = "Original price cannot be negative.";
    else if (orig > 99_999_999.99) errors.original_price = "Original price is too large.";
    else if (Number.isFinite(price) && orig < price) {
      errors.original_price = "Original price should be at least the deal price.";
    }
  }

  const s = form.starts_at;
  const e = form.ends_at;
  if (s && e) {
    const ts = new Date(s).getTime();
    const te = new Date(e).getTime();
    if (!Number.isFinite(ts) || !Number.isFinite(te)) errors.dates = "Enter valid start and end dates.";
    else if (ts > te) errors.dates = "End date/time must be on or after the start.";
  }

  return errors;
}

type DealClusterRow = Pick<
  Deal,
  "id" | "restaurant_id" | "name" | "description" | "price" | "original_price" | "image_url" | "starts_at" | "ends_at" | "is_active"
>;

function dealPriceNorm(n: unknown): string {
  const x = typeof n === "number" ? n : parseFloat(String(n ?? ""));
  if (!Number.isFinite(x)) return "";
  return String(Math.round(x * 100) / 100);
}

/** Best-effort grouping for multi-restaurant copies (same fields; no shared DB group id). */
function dealIdentityKey(
  d: Pick<Deal, "name" | "description" | "price" | "original_price" | "image_url" | "starts_at" | "ends_at" | "is_active">,
) {
  const desc = d.description == null ? "" : String(d.description);
  const orig = d.original_price == null ? "" : dealPriceNorm(d.original_price);
  return [
    (d.name ?? "").trim(),
    desc,
    dealPriceNorm(d.price),
    orig,
    d.image_url ?? "",
    d.starts_at ?? "",
    d.ends_at ?? "",
    Boolean(d.is_active),
  ].join("\t");
}

function buildDealRestaurantClusters(
  rows: DealClusterRow[],
  restaurantNameById: Map<string, string>,
): Record<string, { count: number; restaurantNames: string[] }> {
  const fpToRestaurantIds = new Map<string, Set<string>>();
  for (const row of rows) {
    const fp = dealIdentityKey(row);
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
  const byDealId: Record<string, { count: number; restaurantNames: string[] }> = {};
  for (const row of rows) {
    const fp = dealIdentityKey(row);
    byDealId[row.id] = {
      count: fpToRestaurantIds.get(fp)!.size,
      restaurantNames: fpToSortedNames.get(fp)!,
    };
  }
  return byDealId;
}

function buildDealRestaurantIdClusters(
  rows: DealClusterRow[],
): Record<string, string[]> {
  const fpToRestaurantIds = new Map<string, Set<string>>();
  for (const row of rows) {
    const fp = dealIdentityKey(row);
    if (!fpToRestaurantIds.has(fp)) fpToRestaurantIds.set(fp, new Set());
    fpToRestaurantIds.get(fp)!.add(row.restaurant_id);
  }
  const byDealId: Record<string, string[]> = {};
  for (const row of rows) {
    const fp = dealIdentityKey(row);
    byDealId[row.id] = [...(fpToRestaurantIds.get(fp) ?? new Set())];
  }
  return byDealId;
}

function fmtTableDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16);
  return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

type DealFormSubmit = Partial<Deal> & { restaurant_ids?: string[] };

export default function Deals() {
  const { toast } = useToast();
  const { role } = useAuth();
  const isSuperAdmin = role === "super_admin";
  const { restaurantId, loading: activeRestaurantLoading } = useActiveRestaurant();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [dealDialog, setDealDialog] = useState(false);
  const [discDialog, setDiscDialog] = useState(false);
  const [editDeal, setEditDeal] = useState<Deal | null>(null);
  const [restaurantName, setRestaurantName] = useState<string | null>(null);
  const [restaurantPickerList, setRestaurantPickerList] = useState<{ id: string; name: string }[]>([]);
  const [dealRestaurantCluster, setDealRestaurantCluster] = useState<
    Record<string, { count: number; restaurantNames: string[] }>
  >({});
  const [dealRestaurantIdsMap, setDealRestaurantIdsMap] = useState<Record<string, string[]>>({});

  const load = useCallback(async () => {
    if (!restaurantId) return;
    const [d, rn] = await Promise.all([
      supabase.from("deals").select("*").eq("restaurant_id", restaurantId).order("created_at", { ascending: false }),
      supabase.from("restaurants").select("name").eq("id", restaurantId).maybeSingle(),
    ]);
    if (d.data) setDeals(d.data as Deal[]);
    else setDeals([]);
    setRestaurantName((rn.data as { name?: string } | null)?.name ?? null);

    if (isSuperAdmin) {
      const [{ data: allDeals }, { data: allRest }] = await Promise.all([
        supabase
          .from("deals")
          .select("id, restaurant_id, name, description, price, original_price, image_url, starts_at, ends_at, is_active"),
        supabase.from("restaurants").select("id, name"),
      ]);
      const rmap = new Map<string, string>(
        ((allRest as { id: string; name: string }[]) || []).map((r) => [r.id, r.name]),
      );
      const rows = (allDeals as DealClusterRow[] | null) ?? [];
      setDealRestaurantCluster(buildDealRestaurantClusters(rows, rmap));
      setDealRestaurantIdsMap(buildDealRestaurantIdClusters(rows));
    } else {
      setDealRestaurantCluster({});
      setDealRestaurantIdsMap({});
    }
  }, [restaurantId, isSuperAdmin]);

  useEffect(() => {
    if (activeRestaurantLoading) return;
    if (!restaurantId) {
      setDeals([]);
      setRestaurantName(null);
      setDealRestaurantCluster({});
      setDealRestaurantIdsMap({});
      return;
    }
    void load();
  }, [restaurantId, activeRestaurantLoading, load]);

  useEffect(() => {
    if (!dealDialog || !isSuperAdmin) return;
    void (async () => {
      const { data, error } = await supabase.from("restaurants").select("id, name").order("name");
      if (error) {
        console.error(error);
        return;
      }
      setRestaurantPickerList((data as { id: string; name: string }[]) ?? []);
    })();
  }, [dealDialog, isSuperAdmin]);

  const saveDeal = async (form: DealFormSubmit) => {
    if (editDeal && !isSuperAdmin && editDeal.restaurant_id !== restaurantId) {
      toast({ variant: "destructive", title: "Cannot edit this deal", description: "It belongs to another restaurant." });
      return;
    }

    const fieldErrs = validateDealForm(form);
    if (Object.keys(fieldErrs).length > 0) {
      toast({
        variant: "destructive",
        title: "Check your input",
        description: Object.values(fieldErrs).join(" "),
      });
      return;
    }

    const nameTrim = (form.name ?? "").trim();
    const priceVal = typeof form.price === "number" ? form.price : parseFloat(String(form.price ?? "0"));
    const opRaw = form.original_price;
    let original_price: number | null = null;
    if (opRaw != null && !(typeof opRaw === "string" && opRaw.trim() === "")) {
      const o = typeof opRaw === "number" ? opRaw : parseFloat(String(opRaw));
      if (Number.isFinite(o)) original_price = Math.round(o * 100) / 100;
    }
    const descTrim = (form.description ?? "").trim();
    const basePayload = {
      name: nameTrim,
      description: descTrim.length ? descTrim : null,
      price: Math.round(priceVal * 100) / 100,
      original_price,
      image_url: form.image_url ?? null,
      starts_at: form.starts_at || null,
      ends_at: form.ends_at || null,
      is_active: form.is_active ?? true,
    };

    if (editDeal) {
      if (isSuperAdmin) {
        const targetIds = (form.restaurant_ids?.filter(Boolean) ?? []).length
          ? [...new Set(form.restaurant_ids!.filter(Boolean))]
          : [String(form.restaurant_id || editDeal.restaurant_id)].filter(Boolean);
        if (!targetIds.length) {
          toast({ variant: "destructive", title: "Restaurant required", description: "Select at least one restaurant." });
          return;
        }

        const oldFingerprint = dealIdentityKey(editDeal);
        const { data: allDeals, error: allErr } = await supabase
          .from("deals")
          .select("id, restaurant_id, name, description, price, original_price, image_url, starts_at, ends_at, is_active");
        if (allErr) {
          toast({ variant: "destructive", title: "Failed", description: allErr.message });
          return;
        }
        const rows = ((allDeals as DealClusterRow[] | null) ?? []).filter((d) => dealIdentityKey(d) === oldFingerprint);
        const existingByRestaurant = new Map(rows.map((r) => [r.restaurant_id, r]));

        for (const rid of targetIds) {
          const payload = { ...basePayload, restaurant_id: rid };
          const existing = existingByRestaurant.get(rid);
          if (existing) {
            const up = await supabase.from("deals").update(payload).eq("id", existing.id);
            if (up.error) {
              toast({ variant: "destructive", title: "Failed", description: up.error.message });
              return;
            }
          } else {
            const ins = await supabase.from("deals").insert(payload);
            if (ins.error) {
              toast({ variant: "destructive", title: "Failed", description: ins.error.message });
              return;
            }
          }
        }

        const toDelete = rows.filter((r) => !targetIds.includes(r.restaurant_id));
        for (const d of toDelete) {
          const del = await supabase.from("deals").delete().eq("id", d.id);
          if (del.error) {
            toast({ variant: "destructive", title: "Failed", description: del.error.message });
            return;
          }
        }

        toast({ title: "Deal updated across selected restaurants" });
        setDealDialog(false);
        setEditDeal(null);
        void load();
      } else {
        const targetRestaurantId = restaurantId!;
        const payload = { ...basePayload, restaurant_id: targetRestaurantId };
        const res = await supabase.from("deals").update(payload).eq("id", editDeal.id).eq("restaurant_id", editDeal.restaurant_id);
        if (res.error) toast({ variant: "destructive", title: "Failed", description: res.error.message });
        else {
          toast({ title: "Deal updated" });
          setDealDialog(false);
          setEditDeal(null);
          void load();
        }
      }
      return;
    }

    let targetIds: string[];
    if (isSuperAdmin) {
      const fromMulti = form.restaurant_ids?.filter(Boolean) ?? [];
      targetIds = fromMulti.length ? [...new Set(fromMulti)] : [String(form.restaurant_id || restaurantId || "")].filter(Boolean);
    } else {
      if (!restaurantId) {
        toast({ variant: "destructive", title: "No restaurant", description: "No restaurant is linked to your account." });
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
      return;
    }

    const rows = targetIds.map((restaurant_id) => ({ ...basePayload, restaurant_id }));
    const res = await supabase.from("deals").insert(rows);
    if (res.error) toast({ variant: "destructive", title: "Failed", description: res.error.message });
    else {
      const n = rows.length;
      if (isSuperAdmin && n > 1) {
        toast({
          title: "Deals created",
          description: `Created ${n} copies (one per selected restaurant).`,
        });
      } else {
        const pickedName = restaurantPickerList.find((x) => x.id === targetIds[0])?.name;
        toast({
          title: "Deal created",
          ...(pickedName && targetIds[0] !== restaurantId ? { description: `Stored for “${pickedName}”.` } : {}),
        });
      }
      setDealDialog(false);
      setEditDeal(null);
      void load();
    }
  };

  if (activeRestaurantLoading) {
    return <p className="text-muted-foreground p-4">Loading…</p>;
  }
  if (!restaurantId) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/20 p-8 text-center text-muted-foreground">
        <p className="font-medium text-foreground">No restaurant selected</p>
        <p className="text-sm mt-1">Select or join a restaurant to manage deals.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Tag className="h-6 w-6" />Deals & Offers</h1>
          <p className="text-muted-foreground text-sm">Combo deals and promotional offers</p>
        </div>
        <div className="flex items-center gap-2">
          <DealsImportButton restaurantId={restaurantId} type="deals" onImported={() => void load()} />
          <Dialog open={dealDialog} onOpenChange={(o) => { setDealDialog(o); if (!o) setEditDeal(null); }}>
            <DialogTrigger asChild>
              <Button type="button" onClick={() => setEditDeal(null)}>
                <Plus className="h-4 w-4 mr-1" />New deal
              </Button>
            </DialogTrigger>
            <DealForm
              initial={editDeal}
              initialRestaurantIds={editDeal ? dealRestaurantIdsMap[editDeal.id] ?? [editDeal.restaurant_id] : [restaurantId]}
              restaurantName={restaurantName}
              defaultRestaurantId={restaurantId}
              showRestaurantPicker={isSuperAdmin}
              restaurantPickerOptions={restaurantPickerList}
              onSubmit={saveDeal}
            />
          </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="text-left bg-muted/50">
              <tr>
                <th className="p-3 w-14">Image</th>
                <th className="p-3">Name</th>
                <th className="p-3 max-w-[200px]">Description</th>
                <th className="p-3 whitespace-nowrap">Price</th>
                <th className="p-3 whitespace-nowrap">Original</th>
                <th className="p-3 whitespace-nowrap">Starts</th>
                <th className="p-3 whitespace-nowrap">Ends</th>
                <th className="p-3 whitespace-nowrap">Restaurants</th>
                <th className="p-3">Status</th>
                <th className="p-3 w-[100px]" />
              </tr>
            </thead>
            <tbody>
              {deals.map((d) => {
                const cluster = dealRestaurantCluster[d.id];
                const restaurantCount = cluster?.count ?? 1;
                const restaurantNames =
                  cluster?.restaurantNames?.length ? cluster.restaurantNames : restaurantName ? [restaurantName] : [];
                const tooltipTitle = restaurantNames.join(", ");
                const imgSrc = resolveMediaUrl(d.image_url);
                return (
                  <tr key={d.id} className="border-t">
                    <td className="p-2 align-middle">
                      {imgSrc ? (
                        <img src={imgSrc} alt="" className="h-10 w-10 rounded object-cover border" />
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="p-3 align-middle font-medium">{d.name}</td>
                    <td className="p-3 align-middle text-muted-foreground max-w-[220px] truncate" title={d.description || undefined}>{d.description || "—"}</td>
                    <td className="p-3 align-middle whitespace-nowrap">{formatCurrency(d.price)}</td>
                    <td className="p-3 align-middle whitespace-nowrap text-muted-foreground">{d.original_price != null ? formatCurrency(d.original_price) : "—"}</td>
                    <td className="p-3 align-middle whitespace-nowrap text-muted-foreground">{fmtTableDate(d.starts_at)}</td>
                    <td className="p-3 align-middle whitespace-nowrap text-muted-foreground">{fmtTableDate(d.ends_at)}</td>
                    <td className="p-3 align-middle">
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
                    <td className="p-3 align-middle">
                      {d.is_active ? (
                        <Badge variant="outline" className="bg-green-500/15 text-green-700">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </td>
                    <td className="p-2 align-middle">
                      <Button size="sm" variant="ghost" onClick={() => { setEditDeal(d); setDealDialog(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          if (!confirm("Delete?")) return;
                          let q = supabase.from("deals").delete().eq("id", d.id);
                          if (!isSuperAdmin) q = q.eq("restaurant_id", restaurantId);
                          const { error } = await q;
                          if (error) toast({ variant: "destructive", title: "Failed", description: error.message });
                          else void load();
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {deals.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-10 text-center text-muted-foreground">No deals yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function DealForm({
  initial,
  initialRestaurantIds,
  restaurantName,
  defaultRestaurantId,
  showRestaurantPicker,
  restaurantPickerOptions,
  onSubmit,
}: {
  initial: Deal | null;
  initialRestaurantIds: string[];
  restaurantName: string | null;
  defaultRestaurantId: string;
  showRestaurantPicker: boolean;
  restaurantPickerOptions: { id: string; name: string }[];
  onSubmit: (f: DealFormSubmit) => void | Promise<void>;
}) {
  const { toast } = useToast();
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<DealFieldKey, string>>>({});
  const [form, setForm] = useState<Partial<Deal>>(
    () =>
      initial || {
        name: "",
        description: "",
        price: 0,
        original_price: null,
        image_url: null,
        starts_at: null,
        ends_at: null,
        is_active: true,
        restaurant_id: defaultRestaurantId,
      },
  );
  const [selectedRestaurantIds, setSelectedRestaurantIds] = useState<string[]>([defaultRestaurantId]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (initial) {
      setForm({ ...initial });
      setSelectedRestaurantIds(initialRestaurantIds.length ? initialRestaurantIds : [initial.restaurant_id]);
    } else {
      setForm({
        name: "",
        description: "",
        price: 0,
        original_price: null,
        image_url: null,
        starts_at: null,
        ends_at: null,
        is_active: true,
        restaurant_id: defaultRestaurantId,
      });
      setSelectedRestaurantIds([defaultRestaurantId]);
    }
    setImageFile(null);
    setFieldErrors({});
  }, [initial, defaultRestaurantId, initialRestaurantIds]);

  const toggleRestaurantPick = (id: string) => {
    setSelectedRestaurantIds((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 1) return prev;
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
  };

  const selectedLabel = selectedRestaurantIds
    .map((rid) => restaurantPickerOptions.find((x) => x.id === rid)?.name)
    .filter(Boolean)
    .join(", ");

  const filePreview = imageFile ? URL.createObjectURL(imageFile) : null;
  useEffect(() => {
    return () => {
      if (filePreview) URL.revokeObjectURL(filePreview);
    };
  }, [filePreview]);

  const displayImageSrc = filePreview ?? resolveMediaUrl(form.image_url) ?? undefined;

  const clearFieldError = (key: DealFieldKey) => {
    setFieldErrors((fe) => {
      if (!fe[key]) return fe;
      const next = { ...fe };
      delete next[key];
      return next;
    });
  };

  const handleSave = async () => {
    const errs = validateDealForm(form);
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    if (!initial && showRestaurantPicker && selectedRestaurantIds.length === 0) {
      toast({
        variant: "destructive",
        title: "Select a restaurant",
        description: "Choose at least one restaurant for this deal.",
      });
      return;
    }

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
        const res = await fetch(`${getApiBase()}/api/uploads/deal-image`, {
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
      const base: DealFormSubmit = { ...form, image_url };
      if (!initial && showRestaurantPicker && selectedRestaurantIds.length) {
        base.restaurant_ids = selectedRestaurantIds;
      }
      await onSubmit(base);
    } finally {
      setUploading(false);
    }
  };

  const origInputValue =
    form.original_price === null || form.original_price === undefined ? "" : String(form.original_price);

  return (
    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{initial ? "Edit deal" : "New deal"}</DialogTitle>
        {showRestaurantPicker ? (
          <p className="text-sm text-muted-foreground pt-1">
            {initial
              ? "Super admin: move this deal to another restaurant if needed."
              : "Super admin: select one or more restaurants."}
          </p>
        ) : restaurantName ? (
          <p className="text-sm text-muted-foreground pt-1">
            account).
          </p>
        ) : (
          <p className="text-sm text-muted-foreground pt-1">Saved for your authenticated restaurant.</p>
        )}
      </DialogHeader>
      <div className="space-y-3">
        {showRestaurantPicker && restaurantPickerOptions.length > 0 ? (
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
                  onClick={() => setSelectedRestaurantIds(initial ? initialRestaurantIds : [defaultRestaurantId])}
                >
                  Reset
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {initial
                ? "Editing updates one grouped deal across selected locations."
                : "Creates one deal row per selected location (same details and image)."}
            </p>
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
        {showRestaurantPicker && selectedLabel ? (
          <p className="text-xs text-muted-foreground">
            Selected: <span className="font-medium text-foreground">{selectedLabel}</span>
          </p>
        ) : null}
        <div>
          <Label htmlFor="deal-name">Name</Label>
          <Input
            id="deal-name"
            required
            maxLength={200}
            value={form.name || ""}
            aria-invalid={!!fieldErrors.name}
            className={cn(fieldErrors.name && "border-destructive focus-visible:ring-destructive")}
            onChange={(e) => {
              setForm({ ...form, name: e.target.value });
              clearFieldError("name");
            }}
          />
          {fieldErrors.name ? <p className="text-xs text-destructive mt-1">{fieldErrors.name}</p> : null}
        </div>
        <div>
          <Label htmlFor="deal-description">Description</Label>
          <Textarea
            id="deal-description"
            maxLength={5000}
            value={form.description || ""}
            aria-invalid={!!fieldErrors.description}
            className={cn(fieldErrors.description && "border-destructive focus-visible:ring-destructive")}
            onChange={(e) => {
              setForm({ ...form, description: e.target.value });
              clearFieldError("description");
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
            <Label htmlFor="deal-price">Price</Label>
            <Input
              id="deal-price"
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
                clearFieldError("price");
                clearFieldError("original_price");
              }}
            />
            {fieldErrors.price ? <p className="text-xs text-destructive mt-1">{fieldErrors.price}</p> : null}
          </div>
          <div>
            <Label htmlFor="deal-original">Original price</Label>
            <Input
              id="deal-original"
              type="number"
              min={0}
              max={99999999.99}
              step="0.01"
              inputMode="decimal"
              value={origInputValue}
              aria-invalid={!!fieldErrors.original_price}
              className={cn(fieldErrors.original_price && "border-destructive focus-visible:ring-destructive")}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "") setForm({ ...form, original_price: null });
                else {
                  const n = parseFloat(v);
                  setForm({ ...form, original_price: Number.isFinite(n) ? n : null });
                }
                clearFieldError("original_price");
                clearFieldError("price");
              }}
            />
            {fieldErrors.original_price ? (
              <p className="text-xs text-destructive mt-1">{fieldErrors.original_price}</p>
            ) : null}
          </div>
        </div>
        <div className="space-y-2">
          <Label>Deal image</Label>
          {displayImageSrc ? <img src={displayImageSrc} alt="" className="w-full h-32 object-cover rounded-md border" /> : null}
          <Input
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="cursor-pointer"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setImageFile(f ?? null);
            }}
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
          <p className="text-xs text-muted-foreground">JPEG, PNG, GIF, or WebP — up to 5MB.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="deal-starts">Starts</Label>
            <Input
              id="deal-starts"
              type="datetime-local"
              value={form.starts_at?.slice(0, 16) || ""}
              aria-invalid={!!fieldErrors.dates}
              className={cn(fieldErrors.dates && "border-destructive focus-visible:ring-destructive")}
              onChange={(e) => {
                setForm({ ...form, starts_at: e.target.value || null });
                clearFieldError("dates");
              }}
            />
          </div>
          <div>
            <Label htmlFor="deal-ends">Ends</Label>
            <Input
              id="deal-ends"
              type="datetime-local"
              value={form.ends_at?.slice(0, 16) || ""}
              aria-invalid={!!fieldErrors.dates}
              className={cn(fieldErrors.dates && "border-destructive focus-visible:ring-destructive")}
              onChange={(e) => {
                setForm({ ...form, ends_at: e.target.value || null });
                clearFieldError("dates");
              }}
            />
          </div>
        </div>
        {fieldErrors.dates ? <p className="text-xs text-destructive">{fieldErrors.dates}</p> : null}
        <div className="flex items-center gap-2">
          <Switch checked={form.is_active ?? true} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
          <Label>Active</Label>
        </div>
      </div>
      <DialogFooter>
        <Button type="button" onClick={() => void handleSave()} disabled={uploading}>
          {uploading ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function DiscountForm({ initial, onSubmit }: { initial: Discount | null; onSubmit: (f: Partial<Discount>) => void }) {
  const [form, setForm] = useState<Partial<Discount>>(initial || { code: "", discount_type: "percentage", discount_value: 10, min_order_amount: 0, is_active: true });
  useEffect(() => { setForm(initial || { code: "", discount_type: "percentage", discount_value: 10, min_order_amount: 0, is_active: true }); }, [initial]);
  return (
    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{initial ? "Edit code" : "New discount code"}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Code</Label><Input value={form.code || ""} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></div>
        <div><Label>Description</Label><Input value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Type</Label>
            <Select value={form.discount_type || "percentage"} onValueChange={(v) => setForm({ ...form, discount_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="percentage">Percentage</SelectItem><SelectItem value="fixed">Fixed amount</SelectItem></SelectContent>
            </Select>
          </div>
          <div><Label>Value</Label><Input type="number" step="0.01" value={form.discount_value || 0} onChange={(e) => setForm({ ...form, discount_value: parseFloat(e.target.value) || 0 })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Min order</Label><Input type="number" step="0.01" value={form.min_order_amount || 0} onChange={(e) => setForm({ ...form, min_order_amount: parseFloat(e.target.value) || 0 })} /></div>
          <div><Label>Max uses</Label><Input type="number" value={form.max_uses || ""} onChange={(e) => setForm({ ...form, max_uses: parseInt(e.target.value) || null })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Starts</Label><Input type="datetime-local" value={form.starts_at?.slice(0,16) || ""} onChange={(e) => setForm({ ...form, starts_at: e.target.value || null })} /></div>
          <div><Label>Ends</Label><Input type="datetime-local" value={form.ends_at?.slice(0,16) || ""} onChange={(e) => setForm({ ...form, ends_at: e.target.value || null })} /></div>
        </div>
        <div className="flex items-center gap-2"><Switch checked={form.is_active ?? true} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /><Label>Active</Label></div>
      </div>
      <DialogFooter><Button onClick={() => onSubmit(form)}>Save</Button></DialogFooter>
    </DialogContent>
  );
}