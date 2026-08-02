import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ORDER_FULFILLMENT_FLOW,
  ORDER_STATUS_COLORS,
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  OrderStatus,
} from "@/lib/restaurant";
import { CheckCircle2, Circle, Loader2, AlertTriangle } from "lucide-react";

type HistoryRow = { id: string; order_id: string; status: string; notes: string | null; created_at: string };

type OrderSnap = {
  order_number: string;
  status: string;
  created_at: string;
  verified_at: string | null;
  assigned_at: string | null;
  delivered_at: string | null;
};

function asStatus(s: string): OrderStatus {
  return (ORDER_STATUSES as readonly string[]).includes(s) ? (s as OrderStatus) : "pending";
}

function firstHistoryAt(history: HistoryRow[], status: string): string | null {
  const hits = history.filter((h) => h.status === status);
  if (hits.length === 0) return null;
  return hits.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0]
    .created_at;
}

function timestampForStep(step: OrderStatus, order: OrderSnap, history: HistoryRow[]): string | null {
  const fromHist = firstHistoryAt(history, step);
  if (fromHist) return fromHist;
  if (step === "pending") return order.created_at;
  if (step === "confirmed") return order.verified_at;
  if (step === "assigned") return order.assigned_at;
  if (step === "delivered") return order.delivered_at;
  return null;
}

function fmtWhen(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

type Props = {
  orderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function OrderTimelineDialog({ orderId, open, onOpenChange }: Props) {
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<OrderSnap | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);

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
      setOrder((oRes.data as OrderSnap) || null);
      setHistory((hRes.data as HistoryRow[]) || []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, orderId]);

  const st = order ? asStatus(order.status) : "pending";
  const cancelled = st === "cancelled";
  const flowIdx = cancelled ? -1 : ORDER_FULFILLMENT_FLOW.indexOf(st);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
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

        {!loading && order && cancelled && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm flex gap-2 items-start">
            <AlertTriangle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
            <span>This order was cancelled. History entries below may show prior progress.</span>
          </div>
        )}

        {!loading && order && !cancelled && (
          <ol className="space-y-3 pt-1">
            {ORDER_FULFILLMENT_FLOW.map((step, idx) => {
              const done = flowIdx >= 0 && idx < flowIdx;
              const active = flowIdx >= 0 && idx === flowIdx;
              const when = timestampForStep(step, order, history);
              return (
                <li key={step} className="flex items-start gap-3">
                  {done ? (
                    <CheckCircle2
                      className={`h-5 w-5 mt-0.5 shrink-0 ${active ? "text-primary" : "text-green-600"}`}
                    />
                  ) : active ? (
                    <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0 text-primary animate-pulse" />
                  ) : (
                    <Circle className="h-5 w-5 mt-0.5 shrink-0 text-muted-foreground" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm ${done || active ? "font-medium text-foreground" : "text-muted-foreground"}`}
                    >
                      <span className={`inline-flex items-center rounded-md border px-2 py-0.5 mr-2 text-xs ${ORDER_STATUS_COLORS[step]}`}>
                        {ORDER_STATUS_LABELS[step]}
                      </span>
                    </p>
                    {when && (
                      <p className="text-xs text-muted-foreground mt-0.5">{fmtWhen(when)}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {!loading && history.length > 0 && (
          <div className="border-t pt-4 mt-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Raw audit log</p>
            <ul className="space-y-1.5 max-h-40 overflow-y-auto text-xs text-muted-foreground">
              {history.map((h) => (
                <li key={h.id} className="flex justify-between gap-2 border-b border-border/50 pb-1">
                  <span className="capitalize">{(h.status || "").replace(/_/g, " ")}</span>
                  <span className="shrink-0 tabular-nums">{fmtWhen(h.created_at)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
