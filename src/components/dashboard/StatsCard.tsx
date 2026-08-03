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
    <Card className="border-border/50 shadow-[0_4px_24px_-8px_rgba(15,23,42,0.08)] rounded-2xl hover:shadow-md transition-all duration-200">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold tracking-tight text-foreground tabular-nums">{value}</p>
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
              "p-3 rounded-2xl shrink-0",
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
