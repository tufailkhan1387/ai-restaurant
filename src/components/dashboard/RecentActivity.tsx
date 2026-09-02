import { useQuery } from "@tanstack/react-query";
import { PhoneIncoming, PhoneOutgoing, PhoneMissed, UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/i18n/formatters";

type ActivityType = "call_inbound" | "call_outbound" | "call_missed" | "lead_new";

interface Activity {
  id: string;
  type: ActivityType;
  description: string;
  time: string;
  details?: string;
}

const activityConfig: Record<ActivityType, { icon: any; iconClass: string; bgClass: string }> = {
  call_inbound: { icon: PhoneIncoming, iconClass: "text-status-available", bgClass: "bg-status-available/10" },
  call_outbound: { icon: PhoneOutgoing, iconClass: "text-status-on-call", bgClass: "bg-status-on-call/10" },
  call_missed: { icon: PhoneMissed, iconClass: "text-destructive", bgClass: "bg-destructive/10" },
  lead_new: { icon: UserPlus, iconClass: "text-primary", bgClass: "bg-primary/10" },
};

export function RecentActivity() {
  const { t } = useTranslation(["dashboard", "common", "calls"]);
  const { data: activities = [], isLoading } = useQuery({
    queryKey: ["recent-activity"],
    queryFn: async () => {
      const activityList: Activity[] = [];

      // Fetch recent calls
      const { data: calls } = await supabase
        .from("calls")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);

      if (Array.isArray(calls)) {
        (calls as any[]).forEach((call) => {
          let type: ActivityType = "call_inbound";
          if (call.status === "missed") {
            type = "call_missed";
          } else if (call.direction === "outbound") {
            type = "call_outbound";
          }

          activityList.push({
            id: `call-${call.id}`,
            type,
            description: `${call.direction === "inbound" ? "Call from" : "Call to"} ${call.phone_number}`,
            time: call.created_at ? formatDate(call.created_at, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "",
            details: call.duration_seconds 
              ? `${Math.floor(call.duration_seconds / 60)}:${String(call.duration_seconds % 60).padStart(2, "0")}`
              : undefined,
          });
        });
      }

      // Fetch recent leads
      const { data: leads } = await supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5);

      if (Array.isArray(leads)) {
        (leads as any[]).forEach((lead) => {
          activityList.push({
            id: `lead-${lead.id}`,
            type: "lead_new",
            description: `${lead.full_name || lead.phone_number}`,
            time: lead.created_at ? formatDate(lead.created_at, { month: "short", day: "numeric" }) : "",
            details: lead.company || undefined,
          });
        });
      }

      return activityList.slice(0, 10);
    },
    refetchInterval: 30000,
  });

  return (
    <Card className="border-border">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg font-semibold">{t("dashboard:recentActivity", "Recent Activity")}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[300px]">
          <div className="space-y-4 px-6 pb-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              </div>
            ) : activities.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {t("dashboard:noRecentActivity", "No recent activity")}
              </div>
            ) : (
              activities.map((activity) => {
                const config = activityConfig[activity.type];
                const Icon = config.icon;

                return (
                  <div key={activity.id} className="flex items-start gap-4">
                    <div className={cn("p-2 rounded-lg", config.bgClass)}>
                      <Icon className={cn("h-4 w-4", config.iconClass)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{activity.description}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {activity.details && <span>{activity.details}</span>}
                        {activity.details && <span>•</span>}
                        <span>{activity.time}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

