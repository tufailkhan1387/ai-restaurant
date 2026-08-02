import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2, ChevronRight, CalendarClock, Timer } from "lucide-react";
import { format } from "date-fns";
import { StatusBadge } from "./StatusBadge";
import { AgentSelector } from "./AgentSelector";
import { Badge } from "@/components/ui/badge";
import { LiveCallTimer } from "./LiveCallTimer";
import { CampaignScheduleFields, defaultSchedule, scheduleToDbFields, type ScheduleValue } from "./CampaignScheduleFields";

const COMMON_TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "Europe/London", "Europe/Paris", "Europe/Berlin",
  "Asia/Karachi", "Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Asia/Tokyo",
  "Australia/Sydney",
];

interface Props { onSelect: (sessionId: string) => void; }

export function SessionsListView({ onSelect }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [interval_, setIntervalSec] = useState(120);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [winStart, setWinStart] = useState("09:00");
  const [winEnd, setWinEnd] = useState("18:00");
  const [respectTz, setRespectTz] = useState(true);
  const [defaultTz, setDefaultTz] = useState("America/New_York");
  const [smsFallback, setSmsFallback] = useState(false);
  const [smsTemplate, setSmsTemplate] = useState(
    "Hi {{client_name}}, sorry we missed you! This is QubeTech regarding {{pitched_for}}. Reply or call us back at (201) 479-9258. — QubeTech",
  );
  const [schedule, setSchedule] = useState<ScheduleValue>(defaultSchedule);
  const queryClient = useQueryClient();

  const { data: sessions, refetch } = useQuery({
    queryKey: ["auto-dialer-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("auto_dialer_sessions")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("sessions-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "auto_dialer_sessions" }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refetch]);

  const createSession = useMutation({
    mutationFn: async () => {
      const sched = scheduleToDbFields(schedule);
      const { data, error } = await supabase
        .from("auto_dialer_sessions")
        .insert({
          name: name || "New Auto-Dial Session",
          call_interval_seconds: interval_,
          agent_id: agentId,
          dialing_window_start: winStart,
          dialing_window_end: winEnd,
          respect_timezone: respectTz,
          default_timezone: defaultTz,
          sms_fallback_enabled: smsFallback,
          sms_fallback_template: smsTemplate,
          scheduled_start_at: sched.scheduled_start_at,
          scheduled_end_at: sched.scheduled_end_at,
          allowed_weekdays: sched.allowed_weekdays,
          bypass_schedule_window: sched.bypass_schedule_window,
          status: sched.initial_status,
        } as any)
        .select()
        .single();
      if (error) throw error;

      // Log creation event
      const evtType =
        sched.initial_status === "scheduled"
          ? "campaign_scheduled"
          : sched.bypass_schedule_window
            ? "campaign_started_instant"
            : "campaign_started";
      const evtMsg =
        sched.initial_status === "scheduled"
          ? `Campaign scheduled to start ${sched.scheduled_start_at ? new Date(sched.scheduled_start_at).toLocaleString() : "later"}`
          : sched.bypass_schedule_window
            ? "Campaign started — bypassing window/weekday/timezone (24/7 dial)"
            : "Campaign started immediately (respecting window)";

      await supabase.from("auto_dialer_events").insert({
        session_id: data.id,
        event_type: evtType,
        message: evtMsg,
        metadata: {
          interval_seconds: interval_,
          agent_id: agentId,
          scheduled_start_at: sched.scheduled_start_at,
          scheduled_end_at: sched.scheduled_end_at,
          allowed_weekdays: sched.allowed_weekdays,
          bypass_schedule_window: sched.bypass_schedule_window,
          sms_fallback: smsFallback,
        },
      });

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["auto-dialer-sessions"] });
      setShowCreate(false);
      setName("");
      setSchedule(defaultSchedule);
      onSelect(data.id);
      const isScheduled = data.status === "scheduled";
      toast({
        title: isScheduled ? "Campaign scheduled" : "Campaign started",
        description: isScheduled
          ? "Will auto-start at the scheduled time. Upload leads now."
          : "Upload an Excel file — dialing begins as soon as analysis completes.",
      });
    },
  });

  const deleteSession = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("auto_dialer_leads").delete().eq("session_id", id);
      const { error } = await supabase.from("auto_dialer_sessions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auto-dialer-sessions"] });
      toast({ title: "Session deleted" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Campaigns</h2>
        <Button onClick={() => setShowCreate((v) => !v)}>
          <Plus className="h-4 w-4 mr-2" /> New Campaign
        </Button>
      </div>

      {showCreate && (
        <Card>
          <CardHeader>
            <CardTitle>Create New Dialing Campaign</CardTitle>
            <CardDescription>Configure interval, dialing window, AI agent, and SMS fallback</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Campaign Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Website Redesign Follow-ups" />
            </div>
            <div className="space-y-2">
              <Label>AI Agent</Label>
              <AgentSelector value={agentId} onChange={setAgentId} />
            </div>
            <div className="space-y-2">
              <Label>Call Interval: {Math.floor(interval_ / 60)}m {interval_ % 60}s</Label>
              <Slider value={[interval_]} onValueChange={(v) => setIntervalSec(v[0])} min={60} max={600} step={30} />
              <p className="text-xs text-muted-foreground">Time between calls (1–10 min)</p>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t">
              <div className="space-y-2">
                <Label>Dialing Window Start</Label>
                <Input type="time" value={winStart} onChange={(e) => setWinStart(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Dialing Window End</Label>
                <Input type="time" value={winEnd} onChange={(e) => setWinEnd(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <Label>Respect lead timezone</Label>
                <p className="text-xs text-muted-foreground">Window applies to each lead's local time</p>
              </div>
              <Switch checked={respectTz} onCheckedChange={setRespectTz} />
            </div>
            <div className="space-y-2">
              <Label>Default Timezone (US numbers fallback)</Label>
              <Select value={defaultTz} onValueChange={setDefaultTz}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COMMON_TIMEZONES.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2 border-t">
              <div className="space-y-0.5">
                <Label>SMS fallback on no-answer</Label>
                <p className="text-xs text-muted-foreground">Send a text if the lead doesn't pick up</p>
              </div>
              <Switch checked={smsFallback} onCheckedChange={setSmsFallback} />
            </div>
            {smsFallback && (
              <div className="space-y-2">
                <Label>SMS Template</Label>
                <Textarea
                  value={smsTemplate}
                  onChange={(e) => setSmsTemplate(e.target.value)}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Variables: {"{{client_name}}"}, {"{{pitched_for}}"}, {"{{company}}"}
                </p>
              </div>
            )}

            <CampaignScheduleFields value={schedule} onChange={setSchedule} />

            <div className="flex gap-2 pt-2 border-t">
              <Button onClick={() => createSession.mutate()} disabled={createSession.isPending}>
                {schedule.startNow
                  ? schedule.bypassWindow
                    ? "Start Dialing Now (24/7)"
                    : "Start Dialing Now"
                  : "Schedule Campaign"}
              </Button>
              <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {sessions?.length === 0 && (
          <Card><CardContent className="pt-6 text-center text-muted-foreground">
            No campaigns yet. Click "New Campaign" to start.
          </CardContent></Card>
        )}

        {sessions?.map((s) => {
          const progress = s.total_leads > 0 ? (s.completed_leads / s.total_leads) * 100 : 0;
          return (
            <Card key={s.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => onSelect(s.id)}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <h3 className="font-semibold">{s.name}</h3>
                      <StatusBadge status={s.status} />
                      {(() => {
                        const cap = (s as any).max_call_duration_seconds ?? 120;
                        const m = Math.floor(cap / 60);
                        const sec = cap % 60;
                        const isRunning = s.status === "running";
                        return (
                          <>
                            <Badge
                              variant={isRunning ? "default" : "outline"}
                              className="text-xs gap-1"
                              title="Maximum duration of any single call before auto-hangup (saves ElevenLabs minutes)"
                            >
                              <Timer className="h-3 w-3" />
                              Cap {m}m{sec ? ` ${sec}s` : ""}
                            </Badge>
                            {isRunning && <LiveCallTimer sessionId={s.id} capSeconds={cap} />}
                          </>
                        );
                      })()}
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">
                      {s.completed_leads} / {s.total_leads} leads · interval {Math.floor(s.call_interval_seconds / 60)}m
                      {(s as any).sms_fallback_enabled && " · SMS fallback"}
                    </p>
                    {(s as any).scheduled_start_at && s.status === "scheduled" && (
                      <p className="text-xs text-primary flex items-center gap-1 mb-2">
                        <CalendarClock className="h-3 w-3" />
                        Starts {format(new Date((s as any).scheduled_start_at), "MMM d, h:mm a")}
                      </p>
                    )}
                    {s.total_leads > 0 && <Progress value={progress} className="h-2" />}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => { e.stopPropagation(); if (confirm("Delete this campaign and all leads?")) deleteSession.mutate(s.id); }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
