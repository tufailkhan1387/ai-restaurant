import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Activity, PhoneCall, PhoneIncoming, PhoneOutgoing } from "lucide-react";

export function LiveStatsHeader() {
  const { data } = useQuery({
    queryKey: ["live-stats"],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [activeOutbound, activeCalling, callsToday, inboundToday] = await Promise.all([
        supabase.from("auto_dialer_sessions").select("id", { count: "exact", head: true }).eq("status", "running"),
        supabase.from("auto_dialer_leads").select("id", { count: "exact", head: true }).eq("call_status", "calling"),
        supabase.from("calls").select("id", { count: "exact", head: true }).gte("created_at", today.toISOString()),
        supabase.from("calls").select("id", { count: "exact", head: true })
          .gte("created_at", today.toISOString())
          .eq("direction", "inbound"),
      ]);

      return {
        activeOutbound: activeOutbound.count ?? 0,
        activeCalling: activeCalling.count ?? 0,
        callsToday: callsToday.count ?? 0,
        inboundToday: inboundToday.count ?? 0,
      };
    },
    refetchInterval: 10000,
  });

  const stats = [
    { icon: Activity, label: "Live Calls", value: data?.activeCalling ?? 0, color: "text-blue-500" },
    { icon: PhoneOutgoing, label: "Active Campaigns", value: data?.activeOutbound ?? 0, color: "text-green-500" },
    { icon: PhoneCall, label: "Calls Today", value: data?.callsToday ?? 0, color: "text-primary" },
    { icon: PhoneIncoming, label: "Inbound Today", value: data?.inboundToday ?? 0, color: "text-purple-500" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {stats.map((s) => (
        <Card key={s.label}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-muted ${s.color}`}>
                <s.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
