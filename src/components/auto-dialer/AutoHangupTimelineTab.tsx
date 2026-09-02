import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Clock, Loader2, ShieldAlert, Timer, Phone, User, Calendar, Search, ExternalLink, FileAudio } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { LeadDetailDialog } from "./LeadDetailDialog";
import { CallDetailDialog } from "@/components/calls/CallDetailDialog";
import type { Tables } from "@/integrations/supabase/types";

type PhaseFilter = "all" | "scheduled" | "kill_window" | "confirmed";

const FILTER_TO_TYPES: Record<PhaseFilter, string[]> = {
  all: ["auto_hangup_scheduled", "auto_hangup_kill_window", "auto_hangup_confirmed", "call_auto_ended"],
  scheduled: ["auto_hangup_scheduled"],
  kill_window: ["auto_hangup_kill_window"],
  confirmed: ["auto_hangup_confirmed", "call_auto_ended"],
};

interface Props {
  sessionId: string;
}

const PHASE_TYPES = [
  "auto_hangup_scheduled",
  "auto_hangup_kill_window",
  "auto_hangup_confirmed",
  "call_auto_ended",
] as const;

const phaseConfig: Record<
  string,
  { label: string; icon: typeof Clock; variant: "outline" | "secondary" | "destructive" | "default"; tone: string }
> = {
  auto_hangup_scheduled: {
    label: "Scheduled",
    icon: Clock,
    variant: "outline",
    tone: "text-muted-foreground",
  },
  auto_hangup_kill_window: {
    label: "Kill window started",
    icon: Loader2,
    variant: "secondary",
    tone: "text-amber-600 dark:text-amber-400",
  },
  auto_hangup_confirmed: {
    label: "Hangup confirmed",
    icon: CheckCircle2,
    variant: "destructive",
    tone: "text-destructive",
  },
  call_auto_ended: {
    label: "Auto-ended (legacy)",
    icon: ShieldAlert,
    variant: "secondary",
    tone: "text-muted-foreground",
  },
};

interface AutoEvent {
  id: string;
  event_type: string;
  message: string | null;
  metadata: any;
  created_at: string;
  lead_id: string | null;
  lead?: { client_name: string | null; phone_number: string } | null;
}

export function AutoHangupTimelineTab({ sessionId }: Props) {
  const [filter, setFilter] = useState<PhaseFilter>("all");
  const [selectedEvent, setSelectedEvent] = useState<AutoEvent | null>(null);
  const [leadSearch, setLeadSearch] = useState("");
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [openCall, setOpenCall] = useState<Tables<"calls"> | null>(null);
  const [loadingCall, setLoadingCall] = useState(false);

  const openLastCallForLead = async (leadId: string) => {
    setLoadingCall(true);
    try {
      const { data, error } = await supabase
        .from("calls")
        .select("*")
        .eq("lead_id", leadId)
        .order("started_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (data) setOpenCall(data);
      else alert("No calls found yet for this lead.");
    } finally {
      setLoadingCall(false);
    }
  };

  const { data: leadResults, isFetching: searching } = useQuery({
    queryKey: ["auto-hangup-lead-search", sessionId, leadSearch],
    enabled: !!selectedEvent && leadSearch.trim().length >= 2,
    queryFn: async () => {
      const term = leadSearch.trim().replace(/[%,()]/g, "");
      const { data, error } = await supabase
        .from("auto_dialer_leads")
        .select("id, client_name, phone_number, company, call_status")
        .eq("session_id", sessionId)
        .or(`client_name.ilike.%${term}%,phone_number.ilike.%${term}%,company.ilike.%${term}%`)
        .limit(15);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: events, refetch } = useQuery<AutoEvent[]>({
    queryKey: ["auto-hangup-timeline", sessionId, filter],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("auto_dialer_events")
        .select("id, event_type, message, metadata, created_at, lead_id, lead:auto_dialer_leads(client_name, phone_number)")
        .eq("session_id", sessionId)
        .in("event_type", FILTER_TO_TYPES[filter])
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as unknown as AutoEvent[];
    },
  });

  const filteredEvents = events || [];

  const counts = useMemo(() => {
    const c = { all: 0, scheduled: 0, kill_window: 0, confirmed: 0 };
    for (const e of filteredEvents) {
      if (e.event_type === "auto_hangup_scheduled") c.scheduled++;
      else if (e.event_type === "auto_hangup_kill_window") c.kill_window++;
      else if (e.event_type === "auto_hangup_confirmed" || e.event_type === "call_auto_ended") c.confirmed++;
    }
    c.all = filteredEvents.length;
    return c;
  }, [filteredEvents]);

  useEffect(() => {
    const ch = supabase
      .channel(`auto-hangup-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "auto_dialer_events", filter: `session_id=eq.${sessionId}` },
        () => refetch(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [sessionId, refetch]);

  // Group by lead so we render one timeline per call (using the FILTERED set)
  const byLead = new Map<string, AutoEvent[]>();
  for (const e of filteredEvents) {
    const key = e.lead_id || e.id;
    if (!byLead.has(key)) byLead.set(key, []);
    byLead.get(key)!.push(e);
  }

  const groups = Array.from(byLead.entries())
    .map(([leadId, evts]) => {
      const sorted = [...evts].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      return {
        leadId,
        lead: sorted[sorted.length - 1].lead,
        events: sorted,
        latestAt: sorted[sorted.length - 1].created_at,
      };
    })
    .sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime());

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Timer className="h-5 w-5" /> Auto-hangup Timeline
        </CardTitle>
        <CardDescription>
          Per-call audit trail of the cost-saving auto-hangup safety net: when it was armed, when the kill window
          opened, and when Twilio confirmed the hangup.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ToggleGroup
          type="single"
          value={filter}
          onValueChange={(v) => v && setFilter(v as PhaseFilter)}
          className="justify-start flex-wrap"
        >
          <ToggleGroupItem value="all" size="sm" className="gap-1.5 text-xs">
            All <Badge variant="secondary" className="text-[10px] px-1 py-0">{counts.all}</Badge>
          </ToggleGroupItem>
          <ToggleGroupItem value="scheduled" size="sm" className="gap-1.5 text-xs">
            <Clock className="h-3 w-3" /> Scheduled
            <Badge variant="secondary" className="text-[10px] px-1 py-0">{counts.scheduled}</Badge>
          </ToggleGroupItem>
          <ToggleGroupItem value="kill_window" size="sm" className="gap-1.5 text-xs">
            <Loader2 className="h-3 w-3" /> Kill window
            <Badge variant="secondary" className="text-[10px] px-1 py-0">{counts.kill_window}</Badge>
          </ToggleGroupItem>
          <ToggleGroupItem value="confirmed" size="sm" className="gap-1.5 text-xs">
            <CheckCircle2 className="h-3 w-3" /> Confirmed
            <Badge variant="secondary" className="text-[10px] px-1 py-0">{counts.confirmed}</Badge>
          </ToggleGroupItem>
        </ToggleGroup>

        {groups.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {filter === "all"
              ? "No auto-hangup activity yet. Events appear here as soon as a call goes live in this campaign."
              : `No "${filter.replace("_", " ")}" events for this campaign yet.`}
          </p>
        )}

        {groups.map((g) => {
          const hasConfirmed = g.events.some(
            (e) => e.event_type === "auto_hangup_confirmed" || e.event_type === "call_auto_ended",
          );
          const hasKillWindow = g.events.some((e) => e.event_type === "auto_hangup_kill_window");
          const phase: "done" | "in_progress" | "scheduled" = hasConfirmed
            ? "done"
            : hasKillWindow
              ? "in_progress"
              : "scheduled";

          return (
            <div key={g.leadId} className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-sm font-medium">
                  {g.lead?.client_name || "Unknown"}{" "}
                  <span className="text-muted-foreground font-mono text-xs">{g.lead?.phone_number}</span>
                </div>
                <Badge
                  variant={phase === "done" ? "destructive" : phase === "in_progress" ? "secondary" : "outline"}
                  className={cn("text-xs gap-1", phase === "in_progress" && "animate-pulse")}
                >
                  {phase === "done" ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : phase === "in_progress" ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Clock className="h-3 w-3" />
                  )}
                  Auto-hangup: {phase === "done" ? "done" : phase === "in_progress" ? "in progress" : "scheduled"}
                </Badge>
              </div>

              <ol className="relative border-l border-border ml-2 space-y-2 pl-4">
                {g.events.map((e) => {
                  const cfg = phaseConfig[e.event_type] || phaseConfig.auto_hangup_scheduled;
                  const Icon = cfg.icon;
                  return (
                    <li key={e.id} className="relative">
                      <span className="absolute -left-[22px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-background border border-border">
                        <Icon className={cn("h-3 w-3", cfg.tone, e.event_type === "auto_hangup_kill_window" && "animate-spin")} />
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedEvent(e)}
                        className="w-full text-left rounded-md hover:bg-accent/50 px-2 py-1 -mx-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div>
                            <p className="text-sm font-medium">{cfg.label}</p>
                            {e.message && <p className="text-xs text-muted-foreground">{e.message}</p>}
                          </div>
                          <span className="text-[10px] text-muted-foreground tabular-nums">
                            {format(new Date(e.created_at), "MMM d, HH:mm:ss")}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          );
        })}
      </CardContent>

      <Sheet open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          {selectedEvent && (() => {
            const cfg = phaseConfig[selectedEvent.event_type] || phaseConfig.auto_hangup_scheduled;
            const Icon = cfg.icon;
            const meta = selectedEvent.metadata && typeof selectedEvent.metadata === "object" ? selectedEvent.metadata : {};
            const metaEntries = Object.entries(meta);
            return (
              <>
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    <Icon className={cn("h-5 w-5", cfg.tone)} />
                    {cfg.label}
                  </SheetTitle>
                  <SheetDescription>
                    Event ID <span className="font-mono text-[10px]">{selectedEvent.id}</span>
                  </SheetDescription>
                </SheetHeader>

                <div className="mt-6 space-y-5">
                  <section className="space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" /> Timing
                    </h4>
                    <div className="rounded-md border p-3 text-sm space-y-1">
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Occurred</span>
                        <span className="tabular-nums">{format(new Date(selectedEvent.created_at), "PPpp")}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Relative</span>
                        <span>{formatDistanceToNow(new Date(selectedEvent.created_at), { addSuffix: true })}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Event type</span>
                        <span className="font-mono text-xs">{selectedEvent.event_type}</span>
                      </div>
                    </div>
                  </section>

                  {selectedEvent.message && (
                    <section className="space-y-2">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Message</h4>
                      <p className="rounded-md border p-3 text-sm">{selectedEvent.message}</p>
                    </section>
                  )}

                  <section className="space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5" /> Lead
                    </h4>
                    {selectedEvent.lead ? (
                      <div className="rounded-md border p-3 text-sm space-y-2">
                        <div className="flex items-center gap-2">
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-medium">{selectedEvent.lead.client_name || "Unknown"}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-mono text-xs">{selectedEvent.lead.phone_number}</span>
                        </div>
                        {selectedEvent.lead_id && (
                          <>
                            <div className="text-[10px] text-muted-foreground font-mono pt-1">
                              lead_id: {selectedEvent.lead_id}
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="secondary"
                                size="sm"
                                className="flex-1 gap-1.5"
                                onClick={() => setOpenLeadId(selectedEvent.lead_id!)}
                              >
                                <ExternalLink className="h-3.5 w-3.5" /> Open lead
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 gap-1.5"
                                disabled={loadingCall}
                                onClick={() => openLastCallForLead(selectedEvent.lead_id!)}
                              >
                                {loadingCall ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <FileAudio className="h-3.5 w-3.5" />
                                )}
                                View last call
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No lead linked to this event.</p>
                    )}

                    <div className="space-y-2 pt-2 border-t">
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                        Search other leads in this campaign
                      </label>
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          value={leadSearch}
                          onChange={(e) => setLeadSearch(e.target.value)}
                          placeholder="Name, phone, or company…"
                          className="pl-7 h-8 text-sm"
                        />
                      </div>
                      {leadSearch.trim().length > 0 && leadSearch.trim().length < 2 && (
                        <p className="text-[10px] text-muted-foreground">Type at least 2 characters.</p>
                      )}
                      {leadSearch.trim().length >= 2 && (
                        <div className="rounded-md border max-h-56 overflow-y-auto divide-y">
                          {searching && (
                            <div className="p-2 text-xs text-muted-foreground flex items-center gap-2">
                              <Loader2 className="h-3 w-3 animate-spin" /> Searching…
                            </div>
                          )}
                          {!searching && (leadResults?.length ?? 0) === 0 && (
                            <div className="p-2 text-xs text-muted-foreground">No matching leads.</div>
                          )}
                          {!searching && leadResults?.map((l) => (
                            <div
                              key={l.id}
                              className="p-2 hover:bg-accent/50 transition-colors space-y-1.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium truncate">
                                  {l.client_name || "Unknown"}
                                </span>
                                <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">
                                  {l.call_status}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                <Phone className="h-3 w-3" />
                                <span className="font-mono truncate">{l.phone_number}</span>
                                {l.company && <span className="truncate">· {l.company}</span>}
                              </div>
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className="w-full h-7 gap-1.5 text-xs"
                                onClick={() => {
                                  setOpenLeadId(l.id);
                                  setSelectedEvent(null);
                                  setLeadSearch("");
                                }}
                              >
                                <ExternalLink className="h-3 w-3" /> Jump to this lead
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Metadata</h4>
                    {metaEntries.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No metadata recorded.</p>
                    ) : (
                      <div className="rounded-md border divide-y text-sm">
                        {metaEntries.map(([k, v]) => (
                          <div key={k} className="flex justify-between gap-3 p-2">
                            <span className="text-muted-foreground font-mono text-xs">{k}</span>
                            <span className="text-right break-all font-mono text-xs">
                              {typeof v === "object" ? JSON.stringify(v) : String(v)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Raw JSON</summary>
                      <pre className="mt-2 rounded-md border bg-muted/50 p-2 overflow-x-auto text-[10px]">
{JSON.stringify(selectedEvent.metadata, null, 2)}
                      </pre>
                    </details>
                  </section>

                  <div className="flex justify-end pt-2">
                    <Button variant="outline" size="sm" onClick={() => setSelectedEvent(null)}>Close</Button>
                  </div>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      <LeadDetailDialog
        leadId={openLeadId}
        open={!!openLeadId}
        onOpenChange={(o) => !o && setOpenLeadId(null)}
      />

      <CallDetailDialog
        call={openCall}
        open={!!openCall}
        onOpenChange={(o) => !o && setOpenCall(null)}
      />
    </Card>
  );
}
