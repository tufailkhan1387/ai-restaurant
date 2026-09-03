import {
  Check,
  X,
  ShoppingBag,
  CheckCircle2,
  ChefHat,
  UtensilsCrossed,
  Truck,
  PackageCheck,
} from "lucide-react";
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

const STEP_ICONS: Record<string, any> = {
  pending: ShoppingBag,
  confirmed: CheckCircle2,
  preparing: ChefHat,
  ready: UtensilsCrossed,
  assigned: Truck,
  out_for_delivery: Truck,
  delivered: PackageCheck,
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
  if (step === "out_for_delivery" && order.assigned_at) return order.assigned_at;
  if (step === "delivered") return order.delivered_at;
  return null;
}

function notesForStep(step: OrderStatus, history: TimelineHistoryRow[]): string | null {
  return firstHistoryAt(history, step)?.notes ?? null;
}

function formatStepTime(iso: string | null): { time: string; date: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { time: iso, date: "" };
  const time = d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  const date = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return { time, date };
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
  const isDelivered = st === "delivered";

  if (cancelled) {
    return (
      <div className={cn("rounded-xl border border-red-200/80 bg-red-50/60 dark:bg-red-950/20 px-5 py-4", className)}>
        <div className="flex items-start gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 shadow-sm">
            <X className="h-5 w-5" />
          </div>
          <div>
            <p className="font-bold text-red-900 dark:text-red-300">{t("orders:orderCancelledAt", "Order cancelled")}</p>
            <p className="text-xs text-red-700/80 dark:text-red-400/80 mt-0.5">
              {t("orders:orderCancelledAt", "Fulfillment stopped.")}
            </p>
            {history.length > 0 && (
              <ol className="mt-4 space-y-3 border-l-2 border-red-200 dark:border-red-900/60 ml-2 pl-4">
                {history.map((h) => (
                  <li key={h.id}>
                    <p className="text-xs font-semibold text-red-900 dark:text-red-300 capitalize">
                      {getOrderStatusLabel(h.status, t)}
                    </p>
                    <p className="text-[11px] text-red-700/70 dark:text-red-400/70">{fmtWhen(h.created_at)}</p>
                    {h.notes && <p className="text-xs text-red-800/80 dark:text-red-300/80 mt-0.5">{h.notes}</p>}
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
      {/* Desktop: Modern horizontal stepper */}
      <ol
        className={cn(
          orientation === "vertical" ? "hidden" : "hidden lg:grid",
          "grid-cols-6 gap-2",
        )}
      >
        {ORDER_FULFILLMENT_FLOW.map((step, idx) => {
          const done = flowIdx >= 0 && (isDelivered || assignedHidden ? idx <= flowIdx : idx < flowIdx);
          const active = !isDelivered && flowIdx >= 0 && !assignedHidden && idx === flowIdx;
          const when = timestampForStep(step, order, history);
          const formatted = formatStepTime(when);
          const notes = notesForStep(step, history);
          const StepIcon = STEP_ICONS[step] || ShoppingBag;

          return (
            <li key={step} className="relative flex flex-col items-center text-center px-1">
              {/* Connecting Bar */}
              {idx < ORDER_FULFILLMENT_FLOW.length - 1 && (
                <div
                  className={cn(
                    "absolute top-5 left-[calc(50%+22px)] right-[calc(-50%+22px)] h-[3px] rounded-full transition-colors duration-300",
                    done
                      ? "bg-emerald-500"
                      : active
                        ? "bg-gradient-to-r from-orange-500 to-border/70"
                        : "bg-muted dark:bg-muted/40",
                  )}
                  aria-hidden
                />
              )}

              {/* Node Circle */}
              <div
                className={cn(
                  "relative z-10 flex h-10 w-10 items-center justify-center rounded-xl border-2 transition-all duration-300",
                  done &&
                    "border-emerald-500 bg-emerald-500 text-white shadow-md shadow-emerald-500/25 ring-4 ring-emerald-50 dark:ring-emerald-950/40",
                  active &&
                    "border-primary bg-primary text-white shadow-lg shadow-primary/30 ring-4 ring-primary/20 scale-105",
                  !done &&
                    !active &&
                    "border-border/70 bg-card text-muted-foreground/50 shadow-2xs",
                )}
              >
                {done ? (
                  <Check className="h-5 w-5 stroke-[2.5]" />
                ) : (
                  <StepIcon className="h-4.5 w-4.5" />
                )}
              </div>

              {/* Step Title */}
              <p
                className={cn(
                  "mt-3 text-xs sm:text-[13px] font-bold tracking-tight leading-tight",
                  done
                    ? "text-foreground"
                    : active
                      ? "text-primary"
                      : "text-muted-foreground/70",
                )}
              >
                {getOrderStatusLabel(step, t)}
              </p>

              {/* Step Time / Badge */}
              {formatted ? (
                <div className="mt-1.5 flex flex-col items-center">
                  <span className="text-xs font-semibold text-foreground leading-snug">
                    {formatted.time}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-medium leading-tight">
                    {formatted.date}
                  </span>
                </div>
              ) : done ? (
                <span className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-full border border-emerald-200/60 shadow-2xs">
                  <Check className="h-2.5 w-2.5" />
                  {t("common:completed", "Completed")}
                </span>
              ) : active ? (
                <span className="mt-1.5 inline-flex items-center gap-1.5 text-[10px] font-bold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full border border-primary/25 shadow-2xs animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  {t("orders:inProgress", "In progress")}
                </span>
              ) : (
                <span className="mt-1.5 text-[11px] font-medium text-muted-foreground/45">
                  {t("orders:pending", "Pending")}
                </span>
              )}

              {/* Notes */}
              {notes && (
                <p className="mt-1 text-[10px] text-muted-foreground bg-muted/40 border border-border/40 rounded-md px-2 py-0.5 line-clamp-2 max-w-[110px]">
                  {notes}
                </p>
              )}
            </li>
          );
        })}
      </ol>

      {/* Mobile: Modern vertical stepper */}
      <ol className={cn(orientation === "vertical" ? "block" : "lg:hidden", "space-y-0")}>
        {ORDER_FULFILLMENT_FLOW.map((step, idx) => {
          const done = flowIdx >= 0 && (isDelivered || assignedHidden ? idx <= flowIdx : idx < flowIdx);
          const active = !isDelivered && flowIdx >= 0 && !assignedHidden && idx === flowIdx;
          const when = timestampForStep(step, order, history);
          const formatted = formatStepTime(when);
          const notes = notesForStep(step, history);
          const isLast = idx === ORDER_FULFILLMENT_FLOW.length - 1;
          const StepIcon = STEP_ICONS[step] || ShoppingBag;

          return (
            <li key={step} className="flex gap-3.5">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-2 transition-all",
                    done &&
                      "border-emerald-500 bg-emerald-500 text-white shadow-sm shadow-emerald-500/20 ring-3 ring-emerald-50 dark:ring-emerald-950/40",
                    active &&
                      "border-primary bg-primary text-white shadow-md shadow-primary/25 ring-3 ring-primary/20",
                    !done &&
                      !active &&
                      "border-border/70 bg-card text-muted-foreground/50",
                  )}
                >
                  {done ? (
                    <Check className="h-4.5 w-4.5 stroke-[2.5]" />
                  ) : (
                    <StepIcon className="h-4 w-4" />
                  )}
                </div>
                {!isLast && (
                  <div
                    className={cn(
                      "w-[2.5px] flex-1 min-h-[30px] rounded-full my-1",
                      done ? "bg-emerald-500" : "bg-border/60",
                    )}
                    aria-hidden
                  />
                )}
              </div>
              <div className={cn("pb-5 min-w-0 flex-1", isLast && "pb-0")}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p
                    className={cn(
                      "text-sm font-bold",
                      done
                        ? "text-foreground"
                        : active
                          ? "text-primary"
                          : "text-muted-foreground/70",
                    )}
                  >
                    {getOrderStatusLabel(step, t)}
                  </p>
                  {formatted ? (
                    <span className="text-xs font-semibold text-foreground">
                      {formatted.time} <span className="text-muted-foreground font-normal">({formatted.date})</span>
                    </span>
                  ) : done ? (
                    <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-full border border-emerald-200/60">
                      {t("common:completed", "Completed")}
                    </span>
                  ) : active ? (
                    <span className="text-[10px] font-bold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full border border-primary/25">
                      {t("orders:inProgress", "In progress")}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground/50">
                      {t("orders:pending", "Pending")}
                    </span>
                  )}
                </div>
                {notes && (
                  <p className="text-xs text-muted-foreground mt-1 bg-muted/40 border border-border/40 rounded-md px-2.5 py-1">
                    {notes}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

