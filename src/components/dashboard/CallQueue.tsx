import { useQuery } from "@tanstack/react-query";
import { Phone, Clock, User, PhoneIncoming } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

export function CallQueue() {
  const { data: queuedCalls = [], isLoading } = useQuery({
    queryKey: ["call-queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calls")
        .select(`
          *,
          leads (full_name, company)
        `)
        .in("status", ["queued", "in_progress"])
        .order("created_at", { ascending: true });
      
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Also fetch recent completed calls if queue is empty
  const { data: recentCalls = [] } = useQuery({
    queryKey: ["recent-completed-calls"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calls")
        .select(`
          *,
          leads (full_name, company)
        `)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(5);
      
      if (error) throw error;
      return data || [];
    },
    enabled: queuedCalls.length === 0,
  });

  const displayCalls = queuedCalls.length > 0 ? queuedCalls : recentCalls;
  const isShowingRecent = queuedCalls.length === 0 && recentCalls.length > 0;

  return (
    <Card className="border-border">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg font-semibold">
            {isShowingRecent ? "Recent Calls" : "Call Queue"}
          </CardTitle>
          <Badge variant="secondary" className="text-xs">
            {queuedCalls.length} {queuedCalls.length === 1 ? "call" : "calls"} waiting
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <PhoneIncoming className="h-5 w-5 text-primary" />
          <span className="text-sm text-muted-foreground">AI Agent Active</span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[300px]">
          <div className="space-y-2 px-6 pb-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              </div>
            ) : displayCalls.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Phone className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No calls in queue</p>
                <p className="text-xs mt-1">AI Agent is ready to receive calls</p>
              </div>
            ) : (
              displayCalls.map((call: any) => (
                <div
                  key={call.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-2 h-2 rounded-full ${
                      call.status === "queued" 
                        ? "bg-priority-high animate-pulse" 
                        : call.status === "in_progress"
                        ? "bg-status-on-call"
                        : "bg-status-available"
                    }`} />
                    <div>
                      <div className="flex items-center gap-2">
                        {call.leads?.full_name ? (
                          <>
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{call.leads.full_name}</span>
                          </>
                        ) : (
                          <span className="font-medium text-muted-foreground">
                            {call.phone_number === "Anonymous" ? "Unknown Caller" : call.phone_number}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {call.leads?.company || call.phone_number}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <Badge variant={call.status === "completed" ? "secondary" : "default"}>
                        {call.status}
                      </Badge>
                      <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {call.duration_seconds 
                          ? `${Math.floor(call.duration_seconds / 60)}:${String(call.duration_seconds % 60).padStart(2, "0")}`
                          : call.created_at 
                            ? formatDistanceToNow(new Date(call.created_at), { addSuffix: true })
                            : "-"
                        }
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
