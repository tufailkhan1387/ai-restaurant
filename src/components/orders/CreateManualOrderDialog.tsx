import { useState, useEffect, useMemo } from "react";
import {
  Plus,
  ShoppingCart,
  User,
  Phone,
  MapPin,
  Trash2,
  Search,
  Loader2,
  Check,
  UtensilsCrossed,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useActiveRestaurant } from "@/hooks/useActiveRestaurant";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { formatCurrency } from "@/i18n/formatters";
import { cn } from "@/lib/utils";

interface MenuItem {
  id: string;
  name: string;
  price: number;
  restaurant_id?: string | null;
  is_available?: boolean;
  image_url?: string | null;
}

interface CartItem {
  menu_item_id: string;
  item_name: string;
  unit_price: number;
  quantity: number;
  notes: string;
}

interface Props {
  onOrderCreated?: () => void;
}

export function CreateManualOrderDialog({ onOrderCreated }: Props) {
  const { t } = useTranslation(["orders", "common"]);
  const { toast } = useToast();
  const { restaurantId: activeRestaurantId } = useActiveRestaurant();

  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);

  // Customer details
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [orderType, setOrderType] = useState<"delivery" | "pickup" | "dine_in">("dine_in");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentStatus, setPaymentStatus] = useState("unpaid");

  // Menu items & Cart
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [itemSearch, setItemSearch] = useState("");
  const [fallbackRestaurantId, setFallbackRestaurantId] = useState<string | null>(null);

  // Custom Item inputs
  const [customItemName, setCustomItemName] = useState("");
  const [customItemPrice, setCustomItemPrice] = useState("");
  const [showCustomItem, setShowCustomItem] = useState(false);

  // Load menu items & fallback restaurant whenever dialog opens
  useEffect(() => {
    if (!open) return;

    let isMounted = true;
    setLoadingItems(true);

    async function loadData() {
      try {
        // 1. Fetch menu items
        let query = supabase.from("menu_items").select("id, name, price, restaurant_id, is_available, image_url");
        if (activeRestaurantId) {
          query = query.eq("restaurant_id", activeRestaurantId);
        }

        const { data: itemsData, error } = await query;
        if (error) console.error("Error fetching menu items:", error);

        let finalItems = (itemsData as MenuItem[]) || [];

        // If activeRestaurantId filter returned 0, fallback to all items
        if (finalItems.length === 0 && activeRestaurantId) {
          const { data: allItems } = await supabase
            .from("menu_items")
            .select("id, name, price, restaurant_id, is_available, image_url")
            .limit(100);
          const allItemsList = (allItems as any[]) || [];
          if (allItemsList.length > 0) {
            finalItems = allItemsList as MenuItem[];
          }
        }

        if (isMounted) {
          setMenuItems(finalItems.filter((i) => i.is_available !== false));
        }

        // 2. Fetch fallback restaurant id if not available
        if (!activeRestaurantId) {
          const { data: restList } = await supabase
            .from("restaurants")
            .select("id")
            .limit(1);
          const restArr = (restList as any[]) || [];
          if (restArr.length > 0 && isMounted) {
            setFallbackRestaurantId(restArr[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to load menu items for manual order:", err);
      } finally {
        if (isMounted) setLoadingItems(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [open, activeRestaurantId]);

  const filteredMenuItems = useMemo(() => {
    if (!itemSearch.trim()) return menuItems;
    const q = itemSearch.toLowerCase();
    return menuItems.filter((m) => m.name.toLowerCase().includes(q));
  }, [menuItems, itemSearch]);

  const addToCart = (item: MenuItem | { id: string; name: string; price: number }) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.menu_item_id === item.id);
      if (existing) {
        return prev.map((c) =>
          c.menu_item_id === item.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [
        ...prev,
        {
          menu_item_id: item.id,
          item_name: item.name,
          unit_price: Number(item.price) || 0,
          quantity: 1,
          notes: "",
        },
      ];
    });
  };

  const handleAddCustomItem = () => {
    if (!customItemName.trim()) return;
    const priceNum = parseFloat(customItemPrice) || 0;
    const fakeId = `custom-${Date.now()}`;
    addToCart({ id: fakeId, name: customItemName.trim(), price: priceNum });
    setCustomItemName("");
    setCustomItemPrice("");
    setShowCustomItem(false);
  };

  const updateQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => (c.menu_item_id === id ? { ...c, quantity: c.quantity + delta } : c))
        .filter((c) => c.quantity > 0)
    );
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => prev.filter((c) => c.menu_item_id !== id));
  };

  const subtotal = cart.reduce((s, c) => s + c.unit_price * c.quantity, 0);
  const total = subtotal;

  const resetForm = () => {
    setCustomerName("");
    setCustomerPhone("");
    setDeliveryAddress("");
    setOrderType("dine_in");
    setPaymentMethod("cash");
    setPaymentStatus("unpaid");
    setCart([]);
    setItemSearch("");
    setShowCustomItem(false);
    setCustomItemName("");
    setCustomItemPrice("");
  };

  const targetRestaurantId =
    activeRestaurantId ||
    menuItems[0]?.restaurant_id ||
    fallbackRestaurantId;

  const handleSubmit = async () => {
    if (!customerName.trim()) {
      toast({
        variant: "destructive",
        title: t("common:validationError", "Validation Error"),
        description: t("orders:customerNameRequired", "Customer name is required."),
      });
      return;
    }
    if (cart.length === 0) {
      toast({
        variant: "destructive",
        title: t("common:validationError", "Validation Error"),
        description: t("orders:cartEmpty", "Please add at least one item."),
      });
      return;
    }

    setSubmitting(true);
    try {
      const orderNum = `ORD-${Date.now().toString().slice(-6)}`;

      // 1. Insert order
      const { data: orderData, error: orderErr } = await supabase
        .from("orders")
        .insert({
          restaurant_id: targetRestaurantId,
          order_number: orderNum,
          tracking_code: Math.random().toString(36).slice(2, 10).toUpperCase(),
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim() || "—",
          delivery_address: deliveryAddress.trim() || (orderType === "dine_in" ? "Dine In" : "Takeaway"),
          delivery_notes: null,
          status: "pending",
          source: "manual",
          payment_method: paymentMethod,
          payment_status: paymentStatus,
          subtotal,
          tax_amount: 0,
          delivery_fee: 0,
          discount_amount: 0,
          total_amount: total,
          driver_id: null,
          call_id: null,
        })
        .select("id")
        .single();

      if (orderErr) throw orderErr;

      // 2. Insert order items
      const orderItemsToInsert = cart.map((c) => ({
        order_id: orderData.id,
        menu_item_id: c.menu_item_id.startsWith("custom-") ? null : c.menu_item_id,
        item_name: c.item_name,
        quantity: c.quantity,
        unit_price: c.unit_price,
        line_total: c.unit_price * c.quantity,
        notes: c.notes || null,
      }));

      const { error: itemsErr } = await supabase.from("order_items").insert(orderItemsToInsert);
      if (itemsErr) console.warn("Items insert warning:", itemsErr);

      toast({
        title: t("orders:orderCreated", "✅ Order Created"),
        description: `${orderNum} · ${customerName} · ${formatCurrency(total)}`,
        duration: 5000,
      });

      // Dispatch real-time event for the notification bell
      window.dispatchEvent(
        new CustomEvent("new-order-created", {
          detail: {
            id: orderData.id,
            order_number: orderNum,
            customer_name: customerName.trim(),
            total_amount: total,
            created_at: new Date().toISOString(),
          },
        })
      );

      setOpen(false);
      resetForm();
      onOrderCreated?.();
    } catch (err: any) {
      console.error("Order creation failed:", err);
      toast({
        variant: "destructive",
        title: t("common:error", "Error"),
        description: err?.message || "Failed to create order",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button className="gap-2 gradient-primary text-primary-foreground shadow-sm" id="btn-create-manual-order">
          <Plus className="h-4 w-4" />
          {t("orders:newManualOrder", "New Order")}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-2 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <ShoppingCart className="h-5 w-5 text-primary" />
            {t("orders:createManualOrder", "Create Manual Order")}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* Customer Info Section */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              {t("orders:customerInfo", "Customer Info")}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cust-name" className="flex items-center gap-1.5 text-xs font-semibold">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  {t("orders:customer", "Customer Name")} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="cust-name"
                  placeholder="e.g. John Doe"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cust-phone" className="flex items-center gap-1.5 text-xs font-semibold">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  {t("common:phone", "Phone")}
                </Label>
                <Input
                  id="cust-phone"
                  placeholder="e.g. +1 234 567 8900"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cust-addr" className="flex items-center gap-1.5 text-xs font-semibold">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                {t("common:address", "Delivery / Table Address")}
              </Label>
              <Input
                id="cust-addr"
                placeholder={t("orders:addressPlaceholder", "Table # / Street, City")}
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("orders:orderType", "Order Type")}</Label>
                <Select value={orderType} onValueChange={(v) => setOrderType(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dine_in">{t("orders:dineIn", "Dine In")}</SelectItem>
                    <SelectItem value="pickup">{t("orders:pickup", "Pickup")}</SelectItem>
                    <SelectItem value="delivery">{t("orders:delivery", "Delivery")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("orders:paymentMethod", "Payment Method")}</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">{t("orders:cashOnDelivery", "Cash")}</SelectItem>
                    <SelectItem value="card">{t("orders:creditCard", "Card")}</SelectItem>
                    <SelectItem value="online">Online</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("orders:paymentStatus", "Payment Status")}</Label>
                <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unpaid">{t("orders:unpaid", "Unpaid")}</SelectItem>
                    <SelectItem value="paid">{t("orders:paid", "Paid")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Menu Items Selection Section */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <UtensilsCrossed className="h-3.5 w-3.5" />
                {t("orders:items", "Select Menu Items")} <span className="text-destructive">*</span>
              </h4>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-primary hover:text-primary"
                onClick={() => setShowCustomItem((v) => !v)}
              >
                <Sparkles className="h-3.5 w-3.5 mr-1" />
                {showCustomItem ? "Cancel Custom" : "+ Custom Item"}
              </Button>
            </div>

            {/* Custom Item Form */}
            {showCustomItem && (
              <div className="p-3 border border-primary/30 rounded-xl bg-primary/5 space-y-2.5 animate-fade-in">
                <p className="text-xs font-semibold text-foreground">Add Custom / Off-Menu Item</p>
                <div className="flex gap-2">
                  <Input
                    placeholder="Item name (e.g. Special Burger)"
                    value={customItemName}
                    onChange={(e) => setCustomItemName(e.target.value)}
                    className="flex-1 h-8 text-xs"
                  />
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Price (e.g. 15.00)"
                    value={customItemPrice}
                    onChange={(e) => setCustomItemPrice(e.target.value)}
                    className="w-28 h-8 text-xs"
                  />
                  <Button size="sm" className="h-8 text-xs" onClick={handleAddCustomItem} disabled={!customItemName.trim()}>
                    Add
                  </Button>
                </div>
              </div>
            )}

            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder={t("orders:searchItems", "Search menu items by name...")}
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>

            {/* Menu Items List / Grid */}
            <div className="border border-border rounded-xl p-2 bg-muted/20 max-h-48 overflow-y-auto space-y-1">
              {loadingItems ? (
                <div className="py-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span>Loading menu items...</span>
                </div>
              ) : filteredMenuItems.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  {itemSearch ? `No menu items matching "${itemSearch}"` : "No menu items available. You can add a custom item above."}
                </div>
              ) : (
                filteredMenuItems.map((item) => {
                  const inCartQty = cart.find((c) => c.menu_item_id === item.id)?.quantity || 0;
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "flex items-center justify-between p-2 rounded-lg border border-transparent hover:border-border transition-all bg-card cursor-pointer group",
                        inCartQty > 0 && "border-primary/30 bg-primary/5"
                      )}
                      onClick={() => addToCart(item)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium text-xs text-foreground truncate group-hover:text-primary">
                          {item.name}
                        </span>
                        {inCartQty > 0 && (
                          <Badge variant="default" className="h-4 px-1.5 text-[9px] font-bold">
                            {inCartQty} in cart
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs font-bold text-primary">
                          {formatCurrency(item.price)}
                        </span>
                        <Button
                          type="button"
                          variant={inCartQty > 0 ? "default" : "outline"}
                          size="sm"
                          className="h-6 px-2 text-[10px] gap-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            addToCart(item);
                          }}
                        >
                          <Plus className="h-3 w-3" />
                          Add
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Order Cart / Summary */}
            <div className="space-y-2 pt-2">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Order Items ({cart.reduce((s, c) => s + c.quantity, 0)})
              </h4>

              {cart.length === 0 ? (
                <div className="border border-dashed border-border rounded-xl py-6 text-center text-muted-foreground text-xs">
                  {t("orders:searchAndAddItems", "Click any item above to add it to this order")}
                </div>
              ) : (
                <div className="border border-border rounded-xl divide-y divide-border overflow-hidden bg-card shadow-sm">
                  {cart.map((c) => (
                    <div key={c.menu_item_id} className="flex items-center gap-3 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-xs truncate text-foreground">{c.item_name}</p>
                        <p className="text-[10px] text-muted-foreground">{formatCurrency(c.unit_price)} each</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          type="button"
                          className="h-6 w-6 rounded-full"
                          onClick={() => updateQty(c.menu_item_id, -1)}
                        >
                          −
                        </Button>
                        <span className="w-5 text-center text-xs font-bold">{c.quantity}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          type="button"
                          className="h-6 w-6 rounded-full"
                          onClick={() => updateQty(c.menu_item_id, 1)}
                        >
                          +
                        </Button>
                      </div>
                      <span className="text-xs font-bold text-primary w-16 text-right">
                        {formatCurrency(c.unit_price * c.quantity)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        className="h-6 w-6 text-destructive hover:bg-destructive/10"
                        onClick={() => removeFromCart(c.menu_item_id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  {/* Total row */}
                  <div className="flex items-center justify-between px-3 py-2.5 bg-muted/40 font-bold text-sm">
                    <span className="text-foreground">{t("common:total", "Total")}</span>
                    <span className="text-primary text-base font-extrabold">{formatCurrency(total)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-3 border-t border-border bg-muted/10 gap-2 flex items-center justify-end">
          <Button variant="outline" type="button" onClick={() => setOpen(false)} disabled={submitting} className="h-9 text-xs">
            {t("common:cancel", "Cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || cart.length === 0 || !customerName.trim()}
            className="gradient-primary text-primary-foreground gap-2 min-w-[130px] h-9 text-xs font-semibold"
          >
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ShoppingCart className="h-3.5 w-3.5" />
            )}
            {submitting
              ? t("orders:placingOrder", "Placing order...")
              : t("orders:placeOrder", "Place Order")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
