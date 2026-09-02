import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getApiBase } from "@/lib/apiBase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogBody,
} from "@/components/ui/dialog";
import { Minus, Plus, ShoppingCart, Trash2, Check, Sparkles } from "lucide-react";
import { formatCurrency } from "@/lib/restaurant";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AIChatTest } from "@/components/agents/AIChatTest";
import { LanguageSwitcher } from "@/components/common/LanguageSwitcher";

type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  category_id: string | null;
  dietary_tags: string[];
  is_available?: boolean;
  track_inventory?: boolean;
  stock_quantity?: number | null;
};

type Variant = {
  id: string;
  menu_item_id: string;
  name: string;
  price: number;
  sort_order: number;
  is_active: boolean;
};

type Addon = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  sort_order: number;
  is_active: boolean;
};

type ItemAddonLink = {
  menu_item_id: string;
  menu_addon_id: string;
};

type Category = { id: string; name: string; sort_order: number };
type Deal = { id: string; name: string; description: string | null; price: number; original_price: number | null; image_url: string | null };
type Settings = { name: string; phone: string | null; address: string | null; tax_rate: number; delivery_fee: number; min_order_amount: number; currency: string; is_open: boolean; allows_delivery?: boolean; allows_pickup?: boolean };
type Restaurant = { id: string; elevenlabs_agent_id?: string | null };

type CartLine = { kind: "item" | "deal"; refId: string; name: string; price: number; quantity: number };
type WorkingHour = { day_of_week: number; open_time: string; close_time: string };

export default function Order() {
  const { t } = useTranslation(["ordering", "common", "deals", "menu", "orders"]);
  const navigate = useNavigate();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [hours, setHours] = useState<WorkingHour[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [itemAddons, setItemAddons] = useState<ItemAddonLink[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [activeCat, setActiveCat] = useState<string>("deals");
  const [submitting, setSubmitting] = useState(false);
  const [fulfillmentType, setFulfillmentType] = useState<"delivery" | "pickup">("delivery");
  const [form, setForm] = useState({ customer_name: "", customer_phone: "", customer_email: "", delivery_address: "", notes: "" });

  // Customization Dialog State (Pizza sizes, Burger sizes, Sauces & Extras)
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);
  const [chosenVariant, setChosenVariant] = useState<Variant | null>(null);
  const [chosenAddonIds, setChosenAddonIds] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const res = await fetch(`${getApiBase()}/api/public/storefront`);
      if (!res.ok) return;
      const bundle = await res.json();
      const s = bundle.settings || {};
      const r = bundle.restaurant || {};
      setRestaurant({ id: r.id, elevenlabs_agent_id: r.elevenlabs_agent_id ?? null });
      setSettings({ ...s, allows_delivery: r.allows_delivery, allows_pickup: r.allows_pickup } as any);
      
      if (r.allows_delivery === false && r.allows_pickup !== false) {
        setFulfillmentType("pickup");
      }
      
      setCategories(bundle.categories || []);
      setItems(bundle.items || []);
      setDeals(bundle.deals || []);
      setHours(bundle.hours || []);
      setVariants(bundle.variants || []);
      setAddons(bundle.addons || []);
      setItemAddons(bundle.itemAddons || []);

      if ((bundle.deals?.length ?? 0) === 0 && (bundle.categories?.length ?? 0) > 0) {
        setActiveCat(bundle.categories[0].id);
      }
    })();
  }, []);

  const addItem = (line: Omit<CartLine, "quantity">) => {
    setCart((prev) => {
      const idx = prev.findIndex((p) => p.kind === line.kind && p.refId === line.refId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, { ...line, quantity: 1 }];
    });
  };

  const handleItemAddClick = (it: MenuItem) => {
    const itemVariants = variants.filter((v) => v.menu_item_id === it.id);
    const linkedAddonIds = itemAddons.filter((l) => l.menu_item_id === it.id).map((l) => l.menu_addon_id);
    const itemLinkedAddons = addons.filter((a) => linkedAddonIds.includes(a.id));

    // If item has sizes (variants) or sauces/addons, open customization dialog
    if (itemVariants.length > 0 || itemLinkedAddons.length > 0) {
      setCustomizingItem(it);
      setChosenVariant(itemVariants.length > 0 ? itemVariants[0] : null);
      setChosenAddonIds([]);
    } else {
      addItem({ kind: "item", refId: it.id, name: it.name, price: Number(it.price) });
      toast.success(`Added ${it.name} to cart`);
    }
  };

  const addCustomizedItemToCart = () => {
    if (!customizingItem) return;
    const basePrice = chosenVariant ? Number(chosenVariant.price) : Number(customizingItem.price);
    const selectedAddonsList = addons.filter((a) => chosenAddonIds.includes(a.id));
    const addonsTotal = selectedAddonsList.reduce((sum, a) => sum + Number(a.price), 0);
    const finalPrice = basePrice + addonsTotal;

    const sizePart = chosenVariant ? ` (${chosenVariant.name})` : "";
    const addonsPart =
      selectedAddonsList.length > 0 ? ` + ${selectedAddonsList.map((a) => a.name).join(", ")}` : "";
    const fullName = `${customizingItem.name}${sizePart}${addonsPart}`;

    addItem({
      kind: "item",
      refId: `${customizingItem.id}-${chosenVariant?.id || "std"}-${chosenAddonIds.sort().join("-")}`,
      name: fullName,
      price: finalPrice,
    });

    setCustomizingItem(null);
    toast.success(`Added ${fullName} to order!`);
  };

  const updateQty = (idx: number, delta: number) => {
    setCart((prev) => prev.map((p, i) => (i === idx ? { ...p, quantity: Math.max(1, p.quantity + delta) } : p)));
  };
  const removeLine = (idx: number) => setCart((prev) => prev.filter((_, i) => i !== idx));

  const subtotal = useMemo(() => cart.reduce((s, l) => s + l.price * l.quantity, 0), [cart]);
  const tax = useMemo(() => subtotal * ((settings?.tax_rate || 0) / 100), [subtotal, settings]);
  const deliveryFee = fulfillmentType === "delivery" ? Number(settings?.delivery_fee || 0) : 0;
  const total = subtotal + tax + deliveryFee;

  const isOpenNow = useMemo(() => {
    if (!hours.length) return true; // default open if no hours set
    const now = new Date();
    const day = now.getDay();
    const currentTime = now.getHours() * 100 + now.getMinutes();

    const todaySlots = hours.filter((h) => h.day_of_week === day);
    if (!todaySlots.length) return false;

    return todaySlots.some((slot) => {
      const [oH, oM] = slot.open_time.split(":").map(Number);
      const [cH, cM] = slot.close_time.split(":").map(Number);
      const open = oH * 100 + oM;
      const close = cH * 100 + cM;
      return currentTime >= open && currentTime <= close;
    });
  }, [hours]);

  const submitOrder = async () => {
    if (cart.length === 0) return toast.error("Your cart is empty");
    if (!form.customer_name || !form.customer_phone || (fulfillmentType === "delivery" && !form.delivery_address)) {
      return toast.error("Name, phone and delivery details are required");
    }
    if (settings && subtotal < Number(settings.min_order_amount || 0)) {
      return toast.error(`Minimum order is ${formatCurrency(settings.min_order_amount, settings.currency)}`);
    }
    setSubmitting(true);
    try {
      const restaurantId = (settings as any)?.restaurant_id as string | undefined;
      if (!restaurantId) {
        toast.error("Restaurant configuration missing");
        setSubmitting(false);
        return;
      }
      const lines = cart.map((l) => ({
        menu_item_id: l.kind === "item" ? l.refId.split("-")[0] : null,
        deal_id: l.kind === "deal" ? l.refId : null,
        item_name: l.name,
        quantity: l.quantity,
        unit_price: l.price,
        line_total: l.price * l.quantity,
      }));
      const res = await fetch(`${getApiBase()}/api/public/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurant_id: restaurantId,
          customer_name: form.customer_name,
          customer_phone: form.customer_phone,
          customer_email: form.customer_email || null,
          delivery_address: fulfillmentType === "delivery" ? form.delivery_address : "Self Pickup",
          fulfillment_type: fulfillmentType,
          notes: form.notes || null,
          subtotal,
          tax_amount: tax,
          delivery_fee: deliveryFee,
          total_amount: total,
          lines,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Order failed");
      const order = body.order;
      toast.success("Order placed!");
      navigate(`/track/${order.tracking_code}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to place order");
    } finally {
      setSubmitting(false);
    }
  };

  const visibleItems = useMemo(
    () => items.filter((i) => i.category_id === activeCat),
    [items, activeCat],
  );

  // Customization active options
  const activeCustomizingVariants = useMemo(() => {
    if (!customizingItem) return [];
    return variants.filter((v) => v.menu_item_id === customizingItem.id);
  }, [customizingItem, variants]);

  const activeCustomizingAddons = useMemo(() => {
    if (!customizingItem) return [];
    const linkedIds = itemAddons
      .filter((l) => l.menu_item_id === customizingItem.id)
      .map((l) => l.menu_addon_id);
    return addons.filter((a) => linkedIds.includes(a.id));
  }, [customizingItem, itemAddons, addons]);

  const computedCustomizingTotal = useMemo(() => {
    if (!customizingItem) return 0;
    const base = chosenVariant ? Number(chosenVariant.price) : Number(customizingItem.price);
    const addonsCost = addons
      .filter((a) => chosenAddonIds.includes(a.id))
      .reduce((sum, a) => sum + Number(a.price), 0);
    return base + addonsCost;
  }, [customizingItem, chosenVariant, chosenAddonIds, addons]);

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background sticky top-0 z-10 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground font-extrabold flex items-center justify-center text-lg shadow-md shadow-primary/20">
              {settings?.name?.charAt(0) || "R"}
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">{settings?.name || "Restaurant"}</h1>
              <p className="text-xs text-muted-foreground">{settings?.address || "Order online"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5">
              <LanguageSwitcher />
              {restaurant?.elevenlabs_agent_id && (
                <AIChatTest
                  agentId={restaurant.elevenlabs_agent_id}
                  restaurantName={settings?.name || "our restaurant"}
                />
              )}
              <Badge variant={isOpenNow && settings?.is_open ? "default" : "destructive"} className="text-xs font-semibold">
                {isOpenNow && settings?.is_open ? t("common:active", "Open Now") : t("common:inactive", "Closed")}
              </Badge>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 grid md:grid-cols-[200px_1fr_320px] gap-6">
        {/* Categories */}
        <aside className="space-y-1">
          {deals.length > 0 && (
            <Button
              variant={activeCat === "deals" ? "default" : "ghost"}
              className="w-full justify-start font-semibold"
              onClick={() => setActiveCat("deals")}
            >
              🏷️ {t("deals:title", "Deals & Offers")}
            </Button>
          )}
          {categories.map((c) => (
            <Button
              key={c.id}
              variant={activeCat === c.id ? "default" : "ghost"}
              className="w-full justify-start"
              onClick={() => setActiveCat(c.id)}
            >
              {c.name}
            </Button>
          ))}
        </aside>

        {/* Items */}
        <section className="space-y-3">
          {activeCat === "deals" &&
            deals.map((d) => (
              <Card key={d.id} className="hover:border-primary/50 transition-colors">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{d.name}</h3>
                      <Badge variant="destructive">{t("deals:title", "Deal")}</Badge>
                    </div>
                    {d.description && <p className="text-sm text-muted-foreground mt-1">{d.description}</p>}
                    <div className="mt-2 flex items-center gap-2">
                      <span className="font-semibold">{formatCurrency(d.price, settings?.currency)}</span>
                      {d.original_price && (
                        <span className="text-sm text-muted-foreground line-through">
                          {formatCurrency(d.original_price, settings?.currency)}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button onClick={() => addItem({ kind: "deal", refId: d.id, name: d.name, price: Number(d.price) })}>
                    <Plus className="h-4 w-4 mr-1" /> {t("ordering:addToCart", "Add")}
                  </Button>
                </CardContent>
              </Card>
            ))}

          {visibleItems.map((it) => {
            const isOutOfStock =
              it.is_available === false ||
              (it.track_inventory && Number(it.stock_quantity ?? 0) <= 0);

            const itemVariants = variants.filter((v) => v.menu_item_id === it.id);
            const linkedAddonIds = itemAddons
              .filter((l) => l.menu_item_id === it.id)
              .map((l) => l.menu_addon_id);
            const hasCustomization = itemVariants.length > 0 || linkedAddonIds.length > 0;

            return (
              <Card
                key={it.id}
                className={cn("transition-all hover:border-primary/40", isOutOfStock && "opacity-75 bg-muted/20 border-destructive/20")}
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-base">{it.name}</h3>
                      {isOutOfStock && (
                        <Badge
                          variant="destructive"
                          className="bg-destructive/10 text-destructive border-destructive/20 text-xs font-semibold px-2 py-0.5"
                        >
                          {t("menu:outOfStock", "Out of Order")}
                        </Badge>
                      )}
                    </div>
                    {it.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{it.description}</p>}
                    
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-foreground">
                        {itemVariants.length > 0
                          ? `From ${formatCurrency(Math.min(...itemVariants.map((v) => Number(v.price))), settings?.currency)}`
                          : formatCurrency(it.price, settings?.currency)}
                      </span>
                      {it.dietary_tags?.map((t) => (
                        <Badge key={t} variant="secondary" className="text-xs">
                          {t}
                        </Badge>
                      ))}
                      {itemVariants.length > 0 && (
                        <span className="text-xs text-muted-foreground font-medium">
                          ({itemVariants.length} Sizes)
                        </span>
                      )}
                    </div>
                  </div>

                  {isOutOfStock ? (
                    <Button
                      disabled
                      variant="secondary"
                      size="sm"
                      className="opacity-70 cursor-not-allowed bg-muted text-muted-foreground border border-border"
                    >
                      {t("menu:outOfStock", "Out of Order")}
                    </Button>
                  ) : (
                    <Button onClick={() => handleItemAddClick(it)}>
                      <Plus className="h-4 w-4 mr-1" />
                      {hasCustomization ? t("ordering:itemOptions", "Choose Size / Sauces") : t("ordering:addToCart", "Add")}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {activeCat !== "deals" && visibleItems.length === 0 && (
            <p className="text-muted-foreground text-sm py-8 text-center">{t("menu:noItemsFound", "No items in this category.")}</p>
          )}
        </section>

        {/* Cart */}
        <aside className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShoppingCart className="h-5 w-5" /> {t("ordering:yourCart", "Your order")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {cart.length === 0 && <p className="text-sm text-muted-foreground py-2 text-center">{t("ordering:emptyCart", "Cart is empty.")}</p>}
              {cart.map((l, idx) => (
                <div key={idx} className="flex items-start gap-2 py-1.5 border-b border-border/50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-foreground leading-snug">{l.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{formatCurrency(l.price, settings?.currency)}</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(idx, -1)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-5 text-center text-sm font-bold">{l.quantity}</span>
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(idx, 1)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeLine(idx)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
              <Separator />
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>{t("ordering:subtotal", "Subtotal")}</span>
                  <span>{formatCurrency(subtotal, settings?.currency)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>{t("ordering:tax", "Tax")}</span>
                  <span>{formatCurrency(tax, settings?.currency)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>{t("ordering:deliveryFee", "Delivery")}</span>
                  <span>{formatCurrency(deliveryFee, settings?.currency)}</span>
                </div>
                <div className="flex justify-between font-bold text-base pt-2 border-t text-foreground">
                  <span>{t("ordering:total", "Total")}</span>
                  <span>{formatCurrency(total, settings?.currency)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("ordering:deliveryDetails", "Order Details")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {settings?.allows_delivery !== false && settings?.allows_pickup !== false && (
                <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-lg">
                  <Button
                    variant={fulfillmentType === "delivery" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setFulfillmentType("delivery")}
                    className="text-xs"
                  >
                    {t("orders:delivery", "Delivery")}
                  </Button>
                  <Button
                    variant={fulfillmentType === "pickup" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setFulfillmentType("pickup")}
                    className="text-xs"
                  >
                    {t("orders:pickup", "Pickup")}
                  </Button>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <Label>{t("ordering:customerName", "Name")} *</Label>
                  <Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
                </div>
                <div>
                  <Label>{t("ordering:customerPhone", "Phone")} *</Label>
                  <Input value={form.customer_phone} onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} />
                </div>
                <div>
                  <Label>{t("ordering:customerEmail", "Email")}</Label>
                  <Input type="email" value={form.customer_email} onChange={(e) => setForm({ ...form, customer_email: e.target.value })} />
                </div>

                {fulfillmentType === "delivery" ? (
                  <div>
                    <Label>{t("ordering:deliveryAddress", "Delivery Address")} *</Label>
                    <Textarea
                      value={form.delivery_address}
                      onChange={(e) => setForm({ ...form, delivery_address: e.target.value })}
                      placeholder="Enter your full address"
                    />
                  </div>
                ) : (
                  <div className="p-3 rounded-lg border bg-primary/5 text-primary text-xs flex flex-col gap-1">
                    <p className="font-bold">{t("orders:pickup", "Pickup from")}:</p>
                    <p>{settings?.name}</p>
                    <p className="opacity-80">{settings?.address}</p>
                  </div>
                )}

                <div>
                  <Label>{t("ordering:specialInstructions", "Notes")}</Label>
                  <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Any special instructions?" />
                </div>
              </div>
              <Button className="w-full font-bold" onClick={submitOrder} disabled={submitting || cart.length === 0}>
                {submitting ? t("ordering:processingOrder", "Placing order…") : `${t("ordering:placeOrder", "Place order")} — ${formatCurrency(total, settings?.currency)}`}
              </Button>
            </CardContent>
          </Card>
        </aside>
      </main>

      {/* Item Customization Dialog (Sizes & Sauces) */}
      <Dialog open={!!customizingItem} onOpenChange={(open) => !open && setCustomizingItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              {t("ordering:itemOptions", "Customize")} {customizingItem?.name}
            </DialogTitle>
            {customizingItem?.description && (
              <p className="text-sm text-muted-foreground pt-1">{customizingItem.description}</p>
            )}
          </DialogHeader>

          <DialogBody className="space-y-5 py-2">
            {/* 1. Size Selection (Variants) */}
            {activeCustomizingVariants.length > 0 && (
              <div className="space-y-2.5">
                <Label className="text-sm font-bold text-foreground uppercase tracking-wider text-xs">
                  1. {t("menu:extraPrice", "Select Size / Variant")} *
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {activeCustomizingVariants.map((v) => {
                    const isSelected = chosenVariant?.id === v.id;
                    return (
                      <button
                        type="button"
                        key={v.id}
                        onClick={() => setChosenVariant(v)}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-xl border text-left transition-all",
                          isSelected
                            ? "border-primary bg-primary/10 text-primary font-bold shadow-xs ring-1 ring-primary"
                            : "border-border hover:bg-muted/50 text-foreground"
                        )}
                      >
                        <span className="text-sm font-semibold">{v.name}</span>
                        <span className="text-sm tabular-nums font-bold">
                          {formatCurrency(v.price, settings?.currency)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 2. Sauces & Add-ons Selection */}
            {activeCustomizingAddons.length > 0 && (
              <div className="space-y-2.5">
                <Label className="text-sm font-bold text-foreground uppercase tracking-wider text-xs">
                  2. {t("menu:tabAddOns", "Choose Extra Sauces / Add-ons")} ({t("common:optional", "Optional")})
                </Label>
                <div className="space-y-2">
                  {activeCustomizingAddons.map((ad) => {
                    const isChecked = chosenAddonIds.includes(ad.id);
                    return (
                      <label
                        key={ad.id}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all",
                          isChecked
                            ? "border-primary bg-primary/5 text-foreground font-semibold shadow-2xs"
                            : "border-border hover:bg-muted/40 text-foreground"
                        )}
                      >
                        <div className="flex items-center gap-2.5">
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={() => {
                              setChosenAddonIds((prev) =>
                                isChecked ? prev.filter((id) => id !== ad.id) : [...prev, ad.id]
                              );
                            }}
                          />
                          <div>
                            <span className="text-sm font-medium">{ad.name}</span>
                            {ad.description && (
                              <p className="text-xs text-muted-foreground">{ad.description}</p>
                            )}
                          </div>
                        </div>
                        <span className="text-xs font-bold text-primary tabular-nums">
                          +{formatCurrency(ad.price, settings?.currency)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </DialogBody>

          <DialogFooter className="flex items-center justify-between sm:justify-between border-t pt-4">
            <div>
              <p className="text-xs text-muted-foreground">{t("common:total", "Total Price")}</p>
              <p className="text-lg font-extrabold text-foreground tabular-nums">
                {formatCurrency(computedCustomizingTotal, settings?.currency)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setCustomizingItem(null)}>
                {t("common:cancel", "Cancel")}
              </Button>
              <Button onClick={addCustomizedItemToCart} className="font-bold">
                <Check className="h-4 w-4 mr-1.5" />
                {t("ordering:addToCart", "Add to Cart")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}