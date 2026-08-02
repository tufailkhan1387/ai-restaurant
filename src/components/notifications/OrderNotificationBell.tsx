import { useEffect, useRef, useState } from "react";
import { Bell, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useActiveRestaurant } from "@/hooks/useActiveRestaurant";
import {
  getRingtoneUrl,
  loadNotificationPrefs,
  NotificationPrefs,
} from "@/lib/notificationSound";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface PendingOrder {
  id: string;
  order_number: string;
  customer_name: string;
  total_amount: number;
}

export function OrderNotificationBell() {
  const { restaurantId } = useActiveRestaurant();
  const navigate = useNavigate();
  const [pending, setPending] = useState<PendingOrder[]>([]);
  const [ringing, setRinging] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPrefs>(loadNotificationPrefs());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const open = useRef(false);

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

  // Realtime subscription for new orders
  useEffect(() => {
    if (!restaurantId) return;
    const channel = supabase
      .channel(`orders-new-${restaurantId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          const o = payload.new as any;
          setPending((prev) => {
            if (prev.some((p) => p.id === o.id)) return prev;
            return [
              {
                id: o.id,
                order_number: o.order_number,
                customer_name: o.customer_name,
                total_amount: Number(o.total_amount ?? 0),
              },
              ...prev,
            ];
          });
          if (prefs.enabled) startRinging();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, prefs.enabled]);

  const startRinging = async () => {
    setRinging(true);
    const a = audioRef.current;
    if (!a) return;
    try {
      a.currentTime = 0;
      await a.play();
    } catch {
      // Browser blocked autoplay until user interacts; bell still flashes
    }
  };

  const stopRinging = () => {
    setRinging(false);
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.currentTime = 0;
    }
  };

  const acknowledge = () => {
    stopRinging();
    setPending([]);
  };

  const goToOrder = (id: string) => {
    acknowledge();
    navigate("/orders/new");
  };

  return (
    <Popover
      onOpenChange={(o) => {
        open.current = o;
        if (o) stopRinging();
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          {ringing ? (
            <BellRing className="h-5 w-5 text-primary animate-pulse" />
          ) : (
            <Bell className="h-5 w-5" />
          )}
          {pending.length > 0 && (
            <Badge
              className={cn(
                "absolute -top-1 -right-1 h-5 min-w-5 px-1 flex items-center justify-center p-0 text-xs",
                ringing && "animate-pulse"
              )}
            >
              {pending.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <p className="font-semibold text-sm">New orders</p>
          {pending.length > 0 && (
            <Button variant="ghost" size="sm" onClick={acknowledge} className="h-7 text-xs">
              Acknowledge all
            </Button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No new orders
            </p>
          ) : (
            pending.map((o) => (
              <button
                key={o.id}
                onClick={() => goToOrder(o.id)}
                className="w-full text-left px-3 py-2.5 hover:bg-accent border-b border-border last:border-0 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm">{o.order_number}</span>
                  <span className="text-sm text-primary font-semibold">
                    ${o.total_amount.toFixed(2)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate">{o.customer_name}</p>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}