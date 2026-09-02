import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Bell, BellRing, CheckCheck, ShoppingBag, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import {
  getRingtoneUrl,
  loadNotificationPrefs,
  NotificationPrefs,
} from "@/lib/notificationSound";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/i18n/formatters";
import { toast } from "@/hooks/use-toast";

export interface OrderNotification {
  id: string;
  order_number: string;
  customer_name: string;
  total_amount: number;
  created_at: string;
  seen: boolean;
}

const MAX_NOTIFICATIONS = 50;
const STORAGE_KEY = "order_notifications_list";
const SEEN_IDS_KEY = "order_known_ids";

function loadStoredNotifications(): OrderNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveNotifications(notifications: OrderNotification[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications.slice(0, MAX_NOTIFICATIONS)));
  } catch {
    // ignore
  }
}

function loadKnownIds(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_IDS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveKnownIds(ids: Set<string>) {
  try {
    const arr = Array.from(ids).slice(-200);
    localStorage.setItem(SEEN_IDS_KEY, JSON.stringify(arr));
  } catch {
    // ignore
  }
}

export function OrderNotificationBell() {
  const { t } = useTranslation(["orders", "common"]);
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<OrderNotification[]>(loadStoredNotifications);
  const [ringing, setRinging] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPrefs>(loadNotificationPrefs());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const knownIdsRef = useRef<Set<string>>(loadKnownIds());
  const prefsRef = useRef<NotificationPrefs>(prefs);
  prefsRef.current = prefs;

  const unreadCount = notifications.filter((n) => !n.seen).length;

  // Persist notifications whenever they change
  useEffect(() => {
    saveNotifications(notifications);
  }, [notifications]);

  // Sync preferences across tabs / settings page
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<NotificationPrefs>;
      setPrefs(ce.detail);
    };
    window.addEventListener("notification-prefs-changed", handler);
    return () => window.removeEventListener("notification-prefs-changed", handler);
  }, []);

  // Build audio element when ringtone changes
  useEffect(() => {
    const a = new Audio(getRingtoneUrl(prefs.ringtone));
    a.loop = true;
    a.volume = prefs.volume;
    audioRef.current = a;
    return () => {
      a.pause();
      audioRef.current = null;
    };
  }, [prefs.ringtone, prefs.volume]);

  const startRinging = useCallback(async () => {
    setRinging(true);
    const a = audioRef.current;
    if (!a) return;
    try {
      a.currentTime = 0;
      await a.play();
    } catch {
      // Autoplay policy may block before user interaction
    }
  }, []);

  const stopRinging = useCallback(() => {
    setRinging(false);
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.currentTime = 0;
    }
  }, []);

  const addNotification = useCallback(
    (order: Omit<OrderNotification, "seen">, triggerAlert = true) => {
      const newNotif: OrderNotification = { ...order, seen: false };

      setNotifications((prev) => {
        if (prev.some((n) => n.id === order.id)) return prev;
        return [newNotif, ...prev];
      });

      knownIdsRef.current.add(order.id);
      saveKnownIds(knownIdsRef.current);

      if (triggerAlert) {
        toast({
          title: t("orders:newOrderAlert", "🛒 New Order Received"),
          description: `${order.order_number} · ${order.customer_name} · ${formatCurrency(order.total_amount)}`,
          duration: 6000,
        });

        if (prefsRef.current.enabled) {
          startRinging();
        }
      }
    },
    [startRinging, t]
  );

  const addNotificationRef = useRef(addNotification);
  addNotificationRef.current = addNotification;

  // 1. Listen to instant custom event from manual order / cart checkout
  useEffect(() => {
    const handleNewOrderEvent = (e: Event) => {
      const customEvent = e as CustomEvent<Omit<OrderNotification, "seen">>;
      if (customEvent.detail && customEvent.detail.id) {
        addNotificationRef.current(customEvent.detail, true);
      }
    };

    window.addEventListener("new-order-created", handleNewOrderEvent);
    return () => {
      window.removeEventListener("new-order-created", handleNewOrderEvent);
    };
  }, []);

  // 2. Periodic background poll - Runs ONCE on mount with fixed 6-second interval (stable reference)
  useEffect(() => {
    let cancelled = false;
    let isInitial = true;

    async function checkNewOrders() {
      try {
        const { data, error } = await supabase
          .from("orders")
          .select("id, order_number, customer_name, total_amount, created_at")
          .order("created_at", { ascending: false })
          .limit(15);

        if (error || !data || cancelled) return;

        const orderList = data as any[];

        if (isInitial) {
          orderList.forEach((o) => knownIdsRef.current.add(o.id));
          saveKnownIds(knownIdsRef.current);
          isInitial = false;
          return;
        }

        // Check for new orders that were not in knownIds
        for (const o of orderList) {
          if (!knownIdsRef.current.has(o.id)) {
            addNotificationRef.current(
              {
                id: o.id,
                order_number: o.order_number || `ORD-${o.id.slice(0, 6)}`,
                customer_name: o.customer_name || "Customer",
                total_amount: Number(o.total_amount ?? 0),
                created_at: o.created_at ?? new Date().toISOString(),
              },
              true
            );
          }
        }
      } catch (err) {
        console.error("Failed to check new orders:", err);
      }
    }

    checkNewOrders();
    const interval = setInterval(checkNewOrders, 6000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const handlePopoverChange = (open: boolean) => {
    setPopoverOpen(open);
    if (open) {
      stopRinging();
    }
  };

  const markAllSeen = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, seen: true })));
  };

  const markOneSeen = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, seen: true } : n))
    );
  };

  const clearAll = () => {
    setNotifications([]);
    saveNotifications([]);
  };

  const goToOrder = (id: string) => {
    markOneSeen(id);
    stopRinging();
    setPopoverOpen(false);
    navigate(`/orders/${id}`);
  };

  const formatTimeAgo = (iso: string) => {
    try {
      const diffMs = Date.now() - new Date(iso).getTime();
      const diffSec = Math.floor(diffMs / 1000);
      if (diffSec < 60) return "just now";
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr}h ago`;
      return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    } catch {
      return "";
    }
  };

  return (
    <Popover open={popoverOpen} onOpenChange={handlePopoverChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "relative rounded-xl transition-all duration-300",
            unreadCount > 0
              ? "bg-primary/10 text-primary hover:bg-primary/20"
              : "hover:bg-accent text-muted-foreground hover:text-foreground"
          )}
          aria-label={t("orders:notifications", "Notifications")}
        >
          {ringing ? (
            <BellRing className="h-5 w-5 text-primary animate-bounce" />
          ) : (
            <Bell className={cn("h-5 w-5 transition-transform", unreadCount > 0 && "scale-105 text-primary")} />
          )}

          {/* Unread Counter Badge */}
          {unreadCount > 0 && (
            <Badge
              className={cn(
                "absolute -top-1 -right-1 h-5 min-w-5 px-1 flex items-center justify-center p-0 text-[10px] font-bold shadow-md",
                "bg-destructive text-destructive-foreground animate-in zoom-in-50",
                ringing && "animate-pulse"
              )}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-88 sm:w-96 p-0 shadow-2xl rounded-2xl border border-border overflow-hidden" sideOffset={8}>
        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-muted/40 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <ShoppingBag className="h-4 w-4" />
            </div>
            <div>
              <p className="font-bold text-sm text-foreground">
                {t("orders:notifications", "Order Notifications")}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {unreadCount > 0
                  ? `${unreadCount} ${t("orders:unread", "unread")} order${unreadCount > 1 ? "s" : ""}`
                  : "All caught up"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {notifications.length > 0 && (
              <>
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={markAllSeen}
                    className="h-7 px-2 text-xs gap-1 text-primary hover:bg-primary/10"
                    title={t("common:markAllRead", "Mark all as read")}
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    <span>Read</span>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAll}
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                >
                  {t("common:clearAll", "Clear")}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Notification List */}
        <div className="max-h-[380px] overflow-y-auto divide-y divide-border">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                <Bell className="h-6 w-6 opacity-30" />
              </div>
              <p className="text-sm font-medium">{t("orders:noNotifications", "No notifications yet")}</p>
              <p className="text-xs opacity-60 text-center max-w-[200px]">
                {t("orders:noNotificationsDesc", "New orders will appear here in real time")}
              </p>
            </div>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => goToOrder(n.id)}
                className={cn(
                  "w-full text-left px-4 py-3 transition-all duration-200 group relative flex items-start gap-3",
                  n.seen
                    ? "bg-card hover:bg-accent/40 opacity-75 hover:opacity-100"
                    : "bg-primary/5 hover:bg-primary/10 border-l-4 border-l-primary"
                )}
              >
                {/* Unseen / Seen indicator dot */}
                <div className="mt-1 flex-shrink-0">
                  {n.seen ? (
                    <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                  ) : (
                    <div className="h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-primary/20 animate-pulse" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "font-bold text-xs",
                        n.seen ? "text-muted-foreground" : "text-foreground"
                      )}
                    >
                      {n.order_number}
                    </span>
                    <span
                      className={cn(
                        "text-xs font-extrabold flex-shrink-0",
                        n.seen ? "text-muted-foreground" : "text-primary"
                      )}
                    >
                      {formatCurrency(n.total_amount)}
                    </span>
                  </div>

                  <p
                    className={cn(
                      "text-xs truncate mt-0.5",
                      n.seen ? "text-muted-foreground/80" : "text-foreground font-medium"
                    )}
                  >
                    {n.customer_name}
                  </p>

                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground/60 mt-1">
                    <Clock className="h-3 w-3" />
                    <span>{formatTimeAgo(n.created_at)}</span>
                    {!n.seen && (
                      <Badge variant="secondary" className="ml-auto h-4 px-1 text-[9px] font-semibold">
                        New
                      </Badge>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="p-2 border-t border-border bg-muted/20">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs h-8 text-primary hover:text-primary hover:bg-primary/10 font-semibold"
              onClick={() => {
                setPopoverOpen(false);
                navigate("/orders");
              }}
            >
              {t("orders:viewAllOrders", "View all orders")} →
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}