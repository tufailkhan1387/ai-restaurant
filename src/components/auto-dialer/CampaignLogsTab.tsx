import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Activity, Play, Pause, Square, PhoneOutgoing, PhoneOff, Upload, MessageSquare,
  CheckCircle2, AlertCircle, Calendar as CalIcon, Download,
} from "lucide-react";

interface Props { sessionId: string; }

const EVENT_META: Record<string, { icon: any; color: string; label: string }> = {
  campaign_created:   { icon: CalIcon,      color: "text-muted-foreground", label: "Campaign created" },
  campaign_started:   { icon: Play,         color: "text-success",          label: "Campaign started" },
  campaign_paused:    { icon: Pause,        color: "text-warning",          label: "Paused" },
  campaign_resumed:   { icon: Play,         color: "text-success",          label: "Resumed" },
  campaign_stopped:   { icon: Square,       color: "text-destructive",      label: "Stopped" },
  campaign_completed: { icon: CheckCircle2, color: "text-success",          label: "Campaign completed" },
  campaign_scheduled: { icon: CalIcon,      color: "text-primary",          label: "Scheduled" },
  leads_imported:     { icon: Upload,       color: "text-primary",          label: "Leads imported" },
  call_started:       { icon: PhoneOutgoing,color: "text-primary",          label: "Call started" },
  call_ended:         { icon: PhoneOff,     color: "text-muted-foreground", label: "Call ended" },
  sms_sent:           { icon: MessageSquare,color: "text-primary",          label: "SMS sent" },
};

function fmtDuration(sec: number): string {
  if (!sec) return "0s";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function CampaignLogsTab({ sessionId }: Props) {
  const [filter, setFilter] = useState<string>("all");

  const { data: events, refetch } = useQuery({
    queryKey: ["auto-dialer-events", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("auto_dialer_events")
        .select("*, lead:auto_dialer_leads(client_name, phone_number), agent:ai_agents(name)")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`session-events-${sessionId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "auto_dialer_events", filter: `session_id=eq.${sessionId}` }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [sessionId, refetch]);

  const filtered = filter === "all" ? events || [] : (events || []).filter((e: any) => e.event_type === filter);

  const stats = {
    total: events?.length || 0,
    calls: events?.filter((e: any) => e.event_type === "call_ended").length || 0,
    totalDuration: events
      ?.filter((e: any) => e.event_type === "call_ended")
      .reduce((sum: number, e: any) => sum + (e.metadata?.duration_seconds || 0), 0) || 0,
  };

  const exportCsv = () => {
    const rows = [
      ["timestamp", "event", "lead", "phone", "agent", "duration_s", "message"],
      ...filtered.map((e: any) => [
        e.created_at,
        e.event_type,
        e.lead?.client_name || "",
        e.lead?.phone_number || "",
        e.agent?.name || "",
        e.metadata?.duration_seconds || "",
        (e.message || "").replace(/"/g, '""'),
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v ?? "")}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campaign-logs-${sessionId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" /> Campaign Activity Log</CardTitle>
          <CardDescription>
            {stats.total} events · {stats.calls} calls · total talk time {fmtDuration(stats.totalDuration)}
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events</SelectItem>
              {Object.entries(EVENT_META).map(([key, meta]) => (
                <SelectItem key={key} value={key}>{meta.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No events yet. Events appear in real time as the campaign runs.
          </p>
        ) : (
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {filtered.map((e: any) => {
              const meta = EVENT_META[e.event_type] || { icon: AlertCircle, color: "text-muted-foreground", label: e.event_type };
              const Icon = meta.icon;
              const dur = e.metadata?.duration_seconds;
              return (
                <div key={e.id} className="flex gap-3 p-3 border rounded-md hover:bg-accent/50 transition-colors">
                  <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${meta.color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-medium text-sm">{meta.label}</span>
                      {e.lead?.client_name && (
                        <span className="text-xs text-muted-foreground">· {e.lead.client_name}</span>
                      )}
                      {e.agent?.name && (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">agent: {e.agent.name}</Badge>
                      )}
                      {dur != null && dur > 0 && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5">{fmtDuration(dur)}</Badge>
                      )}
                    </div>
                    {e.message && <p className="text-xs text-muted-foreground mt-0.5 break-words">{e.message}</p>}
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {format(new Date(e.created_at), "MMM d, HH:mm:ss")} · {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
