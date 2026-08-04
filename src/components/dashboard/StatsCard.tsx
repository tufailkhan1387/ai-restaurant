import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string | number;
  change?: {
    value: number;
    type: "increase" | "decrease";
  };
  icon: LucideIcon;
  iconClassName?: string;
}

export function StatsCard({ title, value, change, icon: Icon, iconClassName }: StatsCardProps) {
  return (
    <Card className="border-border/80 shadow-[0_1px_2px_rgba(31,41,55,0.05),0_10px_28px_-12px_rgba(249,115,22,0.16)] rounded-xl overflow-hidden hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_12px_32px_-12px_rgba(249,115,22,0.28)] transition-all duration-200">
      <CardContent className="p-5 relative">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-amber-400/80 to-transparent" />
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{title}</p>
            <p className="text-2xl font-extrabold tracking-tight text-foreground tabular-nums">{value}</p>
            {change && (
              <p
                className={cn(
                  "text-sm font-medium",
                  change.type === "increase" ? "text-status-available" : "text-destructive"
                )}
              >
                {change.type === "increase" ? "+" : "-"}
                {Math.abs(change.value)}%{" "}
                <span className="text-muted-foreground font-normal">vs last week</span>
              </p>
            )}
          </div>
          <div
            className={cn(
              "p-2.5 rounded-lg shrink-0",
              iconClassName || "bg-primary/10 text-primary"
            )}
          >
            <Icon className="h-5 w-5" aria-hidden />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
