import { Check, Circle, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  ORDER_FULFILLMENT_FLOW,
  OrderStatus,
} from "@/lib/restaurant";
import { getOrderStatusLabel, formatDate } from "@/i18n/formatters";
import { cn } from "@/lib/utils";

export type TimelineHistoryRow = {
  id: string;
  status: string;
  notes: string | null;
  created_at: string;
};

export type TimelineOrderSnap = {
  status: string;
  created_at: string;
  verified_at: string | null;
  assigned_at: string | null;
  delivered_at: string | null;
};

function firstHistoryAt(history: TimelineHistoryRow[], status: string): TimelineHistoryRow | null {
  const hits = history.filter((h) => h.status === status);
  if (hits.length === 0) return null;
  return hits.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];
}

function timestampForStep(
  step: OrderStatus,
  order: TimelineOrderSnap,
  history: TimelineHistoryRow[],
): string | null {
  const fromHist = firstHistoryAt(history, step);
  if (fromHist) return fromHist.created_at;
  if (step === "pending") return order.created_at;
  if (step === "confirmed") return order.verified_at;
  if (step === "assigned") return order.assigned_at;
  if (step === "delivered") return order.delivered_at;
  return null;
}

function notesForStep(step: OrderStatus, history: TimelineHistoryRow[]): string | null {
  return firstHistoryAt(history, step)?.notes ?? null;
}

function fmtWhen(iso: string | null): string {
  if (!iso) return "";
  return formatDate(iso, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Props = {
  order: TimelineOrderSnap;
  history: TimelineHistoryRow[];
  className?: string;
  /** horizontal on large screens */
  orientation?: "vertical" | "auto";
};

export function OrderFulfillmentTimeline({ order, history, className, orientation = "auto" }: Props) {
  const { t } = useTranslation(["orders", "common"]);
  const rawStatus = order.status;
  // "assigned" is hidden from the visible timeline; treat progress as past Ready.
  const st =
    rawStatus === "cancelled"
      ? ("cancelled" as const)
      : rawStatus === "assigned"
        ? ("ready" as OrderStatus)
        : (ORDER_FULFILLMENT_FLOW as readonly string[]).includes(rawStatus)
          ? (rawStatus as OrderStatus)
          : ("pending" as OrderStatus);

  const cancelled = st === "cancelled";
  const flowIdx = cancelled ? -1 : ORDER_FULFILLMENT_FLOW.indexOf(st);
  const assignedHidden = rawStatus === "assigned";

  if (cancelled) {
    return (
      <div className={cn("rounded-lg border border-red-200 bg-red-50 px-4 py-4", className)}>
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
            <X className="h-4 w-4" />
          </div>
          <div>
            <p className="font-semibold text-red-900">{t("orders:orderCancelledAt", "Order cancelled")}</p>
            <p className="text-sm text-red-700/80 mt-0.5">
              {t("orders:orderCancelledAt", "Fulfillment stopped.")}
            </p>
            {history.length > 0 && (
              <ol className="mt-4 space-y-3 border-l-2 border-red-200 ml-1.5 pl-4">
                {history.map((h) => (
                  <li key={h.id}>
                    <p className="text-sm font-medium text-red-900 capitalize">
                      {getOrderStatusLabel(h.status, t)}
                    </p>
                    <p className="text-xs text-red-700/70">{fmtWhen(h.created_at)}</p>
                    {h.notes && <p className="text-xs text-red-800/80 mt-0.5">{h.notes}</p>}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(className)}>
      {/* Desktop: horizontal stepper */}
      <ol
        className={cn(
          orientation === "vertical" ? "hidden" : "hidden lg:grid",
          "grid-cols-6 gap-0",
        )}
      >
        {ORDER_FULFILLMENT_FLOW.map((step, idx) => {
          const done = flowIdx >= 0 && (assignedHidden ? idx <= flowIdx : idx < flowIdx);
          const active = flowIdx >= 0 && !assignedHidden && idx === flowIdx;
          const when = timestampForStep(step, order, history);
          const notes = notesForStep(step, history);
          return (
            <li key={step} className="relative flex flex-col items-center text-center px-1">
              {idx < ORDER_FULFILLMENT_FLOW.length - 1 && (
                <div
                  className={cn(
                    "absolute top-4 left-[calc(50%+16px)] right-[calc(-50%+16px)] h-0.5",
                    done || active ? "bg-primary" : "bg-zinc-200",
                    done && "bg-emerald-500",
                  )}
                  aria-hidden
                />
              )}
              <div
                className={cn(
                  "relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold",
                  done && "border-emerald-500 bg-emerald-500 text-white",
                  active && "border-primary bg-primary text-white ring-4 ring-primary/15",
                  !done && !active && "border-zinc-300 bg-white text-zinc-400",
                )}
              >
                {done ? <Check className="h-4 w-4" /> : idx + 1}
              </div>
              <p
                className={cn(
                  "mt-2.5 text-xs font-semibold leading-tight",
                  done || active ? "text-zinc-900" : "text-zinc-400",
                )}
              >
                {getOrderStatusLabel(step, t)}
              </p>
              {when ? (
                <p className="mt-1 text-[11px] text-zinc-500 leading-snug">{fmtWhen(when)}</p>
              ) : (
                <p className="mt-1 text-[11px] text-zinc-300">{t("orders:pending", "Pending")}</p>
              )}
              {notes && <p className="mt-1 text-[10px] text-zinc-500 line-clamp-2 max-w-[110px]">{notes}</p>}
            </li>
          );
        })}
      </ol>

      {/* Mobile / vertical */}
      <ol className={cn(orientation === "vertical" ? "block" : "lg:hidden", "space-y-0")}>
        {ORDER_FULFILLMENT_FLOW.map((step, idx) => {
          const done = flowIdx >= 0 && (assignedHidden ? idx <= flowIdx : idx < flowIdx);
          const active = flowIdx >= 0 && !assignedHidden && idx === flowIdx;
          const when = timestampForStep(step, order, history);
          const notes = notesForStep(step, history);
          const isLast = idx === ORDER_FULFILLMENT_FLOW.length - 1;
          return (
            <li key={step} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2",
                    done && "border-emerald-500 bg-emerald-500 text-white",
                    active && "border-primary bg-primary text-white ring-4 ring-primary/15",
                    !done && !active && "border-zinc-300 bg-white text-zinc-400",
                  )}
                >
                  {done ? (
                    <Check className="h-4 w-4" />
                  ) : active ? (
                    <Circle className="h-3 w-3 fill-current" />
                  ) : (
                    <span className="text-xs font-semibold">{idx + 1}</span>
                  )}
                </div>
                {!isLast && (
                  <div
                    className={cn("w-0.5 flex-1 min-h-[28px]", done ? "bg-emerald-400" : "bg-zinc-200")}
                    aria-hidden
                  />
                )}
              </div>
              <div className={cn("pb-5 min-w-0 flex-1", isLast && "pb-0")}>
                <p
                  className={cn(
                    "text-sm font-semibold",
                    done || active ? "text-zinc-900" : "text-zinc-400",
                  )}
                >
                  {getOrderStatusLabel(step, t)}
                  {active && (
                    <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-primary">
                      {t("common:active", "Current")}
                    </span>
                  )}
                </p>
                {when ? (
                  <p className="text-xs text-zinc-500 mt-0.5">{fmtWhen(when)}</p>
                ) : (
                  <p className="text-xs text-zinc-400 mt-0.5">{t("orders:pending", "Pending")}</p>
                )}
                {notes && <p className="text-xs text-zinc-600 mt-1 bg-zinc-50 border border-zinc-200 rounded-md px-2 py-1">{notes}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

