import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { OrderFulfillmentTimeline, type TimelineHistoryRow, type TimelineOrderSnap } from "@/components/orders/OrderFulfillmentTimeline";

type Props = {
  orderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function OrderTimelineDialog({ orderId, open, onOpenChange }: Props) {
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<(TimelineOrderSnap & { order_number: string }) | null>(null);
  const [history, setHistory] = useState<TimelineHistoryRow[]>([]);

  useEffect(() => {
    if (!open || !orderId) {
      setOrder(null);
      setHistory([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [oRes, hRes] = await Promise.all([
        supabase
          .from("orders")
          .select("order_number, status, created_at, verified_at, assigned_at, delivered_at")
          .eq("id", orderId)
          .maybeSingle(),
        supabase.from("order_status_history").select("*").eq("order_id", orderId).order("created_at", { ascending: true }),
      ]);
      if (cancelled) return;
      setOrder((oRes.data as TimelineOrderSnap & { order_number: string }) || null);
      setHistory((hRes.data as TimelineHistoryRow[]) || []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, orderId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Order status timeline</DialogTitle>
          <DialogDescription>
            {order ? (
              <span className="font-mono text-foreground">{order.order_number}</span>
            ) : (
              "Loading…"
            )}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex justify-center py-10 text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading timeline…
          </div>
        )}

        {!loading && !order && <p className="text-sm text-muted-foreground py-6 text-center">Order not found.</p>}

        {!loading && order && (
          <OrderFulfillmentTimeline order={order} history={history} orientation="vertical" />
        )}
      </DialogContent>
    </Dialog>
  );
}
