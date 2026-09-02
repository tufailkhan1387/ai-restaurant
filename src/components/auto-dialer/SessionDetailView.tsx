import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Play, Pause, Square, ArrowLeft, Sparkles, Loader2, Download, Clock, Activity, PhoneCall, Globe, Timer } from "lucide-react";
import { StatusBadge, InterestBadge } from "./StatusBadge";
import { ExcelUploader } from "./ExcelUploader";
import { LeadDetailDialog } from "./LeadDetailDialog";
import { VariantsTab } from "./VariantsTab";
import { CampaignLogsTab } from "./CampaignLogsTab";
import { exportSessionToCsv } from "./exportCsv";
import { SessionSettingsCard } from "./SessionSettingsCard";
import { CallbacksTab } from "./CallbacksTab";
import { ColdProspectsPanel } from "./ColdProspectsPanel";
import { AutoHangupTimelineTab } from "./AutoHangupTimelineTab";

interface Props {
  sessionId: string;
  onBack: () => void;
}

export function SessionDetailView({ sessionId, onBack }: Props) {
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [reanalyzing, setReanalyzing] = useState(false);
  const queryClient = useQueryClient();

  const { data: session, refetch: refetchSession } = useQuery({
    queryKey: ["auto-dialer-session", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("auto_dialer_sessions")
        .select("*, agent:ai_agents(name)")
        .eq("id", sessionId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: leads, refetch: refetchLeads } = useQuery({
    queryKey: ["auto-dialer-leads", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("auto_dialer_leads")
        .select("*, variant:auto_dialer_prompt_variants(label)")
        .eq("session_id", sessionId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`session-${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "auto_dialer_leads", filter: `session_id=eq.${sessionId}` }, () => refetchLeads())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "auto_dialer_sessions", filter: `id=eq.${sessionId}` }, () => refetchSession())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [sessionId, refetchLeads, refetchSession]);

  const pending = leads?.filter((l) => l.call_status === "pending") || [];
  const ready = leads?.filter((l) => l.analysis_status === "ready") || [];
  const analyzing = leads?.filter((l) => l.analysis_status === "analyzing" || l.analysis_status === "pending") || [];
  const failed = leads?.filter((l) => l.analysis_status === "failed") || [];
  const needsAnalysis = analyzing.length + failed.length;
  const calling = leads?.find((l) => l.call_status === "calling");
  const completed = leads?.filter((l) => ["completed", "failed", "no_answer", "skipped"].includes(l.call_status)) || [];
  const progress = leads?.length ? (completed.length / leads.length) * 100 : 0;
  const allAnalyzed = leads && leads.length > 0 && analyzing.length === 0;

  const setStatus = async (status: string, eventType?: string, message?: string) => {
    await supabase.from("auto_dialer_sessions").update({ status }).eq("id", sessionId);
    if (eventType) {
      await supabase.from("auto_dialer_events").insert({
        session_id: sessionId,
        event_type: eventType,
        message: message || null,
        metadata: { trigger: "user", new_status: status },
      });
    }
    queryClient.invalidateQueries({ queryKey: ["auto-dialer-sessions"] });
  };

  const startDialing = async () => {
    if (!allAnalyzed) {
      toast({ variant: "destructive", title: "AI analysis incomplete", description: "Please wait for all leads to be analyzed" });
      return;
    }
    if (pending.length === 0) {
      toast({ variant: "destructive", title: "No pending leads" });
      return;
    }
    const isResume = session?.status === "paused";
    await setStatus(
      "running",
      isResume ? "campaign_resumed" : "campaign_started",
      isResume ? "User resumed the campaign" : "User started the campaign",
    );
    toast({ title: "Campaign started", description: "Background scheduler will dial automatically. Safe to close browser." });
  };

  const reanalyze = async () => {
    setReanalyzing(true);
    try {
      const { error } = await supabase.functions.invoke("analyze-auto-dialer-leads", { body: { sessionId } });
      if (error) throw error;
      toast({ title: "Analysis triggered" });
      refetchLeads();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Analysis failed", description: e.message });
    } finally {
      setReanalyzing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to campaigns
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{session?.name}</h2>
          <p className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
            {leads?.length || 0} leads · interval {Math.floor((session?.call_interval_seconds || 0) / 60)}m{(session?.call_interval_seconds || 0) % 60}s
            {(session as any)?.agent?.name && ` · agent: ${(session as any).agent.name}`}
            {session && (
              <span className="inline-flex items-center gap-1 text-xs">
                <Clock className="h-3 w-3" />
                {(session as any).dialing_window_start?.slice(0,5)}–{(session as any).dialing_window_end?.slice(0,5)}
                {(session as any).respect_timezone && " local"}
              </span>
            )}
            <Badge variant="outline" className="text-xs gap-1">
              <Clock className="h-3 w-3" />
              Max {Math.floor(((session as any)?.max_call_duration_seconds ?? 120) / 60)}m
              {((session as any)?.max_call_duration_seconds ?? 120) % 60 ? ` ${((session as any)?.max_call_duration_seconds ?? 120) % 60}s` : ""} / call
            </Badge>
            {(session as any)?.sms_fallback_enabled && <Badge variant="secondary" className="text-xs">SMS fallback</Badge>}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {leads && leads.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => exportSessionToCsv(sessionId, session?.name || "campaign")}>
              <Download className="h-4 w-4 mr-1" /> Export CSV
            </Button>
          )}
          {leads && leads.length > 0 && needsAnalysis > 0 && (
            <Button variant="outline" onClick={reanalyze} disabled={reanalyzing}>
              {reanalyzing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Retry AI Analysis ({needsAnalysis})
            </Button>
          )}
          {(session?.status === "draft" || session?.status === "paused" || session?.status === "completed") && pending.length > 0 && (
            <Button onClick={startDialing} disabled={!allAnalyzed}>
              <Play className="h-4 w-4 mr-2" />
              {session?.status === "paused" ? "Resume" : "Start"} Dialing
            </Button>
          )}
          {session?.status === "running" && (
            <>
              <Button variant="outline" onClick={() => setStatus("paused", "campaign_paused", "User paused the campaign")}>
                <Pause className="h-4 w-4 mr-2" /> Pause
              </Button>
              <Button variant="destructive" onClick={() => setStatus("completed", "campaign_stopped", "User stopped the campaign")}>
                <Square className="h-4 w-4 mr-2" /> Stop
              </Button>
            </>
          )}
        </div>
      </div>

      {session && (
        <SessionSettingsCard
          sessionId={sessionId}
          status={session.status}
          agentId={session.agent_id}
          intervalSeconds={session.call_interval_seconds}
          maxCallDurationSeconds={(session as any).max_call_duration_seconds ?? 120}
        />
      )}

      {(!leads || leads.length === 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Upload Client List</CardTitle>
            <CardDescription>
              Excel columns: <strong>Client Name, Email, Phone, Company, Pitched For, Services Done, Notes, Timezone (optional)</strong>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ExcelUploader sessionId={sessionId} />
          </CardContent>
        </Card>
      )}

      {leads && leads.length > 0 && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="flex justify-between text-sm flex-wrap gap-2">
              <span>Progress: {completed.length} / {leads.length}</span>
              <span className="text-muted-foreground">
                {ready.length} ready · {analyzing.length} analyzing · {failed.length > 0 && <span className="text-destructive">{failed.length} failed · </span>}{pending.length} pending
              </span>
            </div>
            <Progress value={progress} />
            {calling && (
              <div className="flex items-center gap-2 text-sm text-primary">
                <Loader2 className="h-4 w-4 animate-spin" />
                Calling {calling.client_name || calling.phone_number}…
              </div>
            )}
            {session?.status === "running" && !calling && (
              <p className="text-xs text-muted-foreground">
                Background scheduler runs every minute. Next call at scheduled interval.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="leads">
        <TabsList>
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="cold"><Globe className="h-3 w-3 mr-1" />Cold Prospects</TabsTrigger>
          <TabsTrigger value="callbacks"><PhoneCall className="h-3 w-3 mr-1" />Callbacks</TabsTrigger>
          <TabsTrigger value="hangup"><Timer className="h-3 w-3 mr-1" />Auto-hangup</TabsTrigger>
          <TabsTrigger value="logs"><Activity className="h-3 w-3 mr-1" />Logs</TabsTrigger>
          <TabsTrigger value="variants">A/B Variants</TabsTrigger>
        </TabsList>

        <TabsContent value="leads" className="mt-4">
          {leads && leads.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Leads</CardTitle>
                <CardDescription>Click any row for full call detail</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Phone / TZ</TableHead>
                        <TableHead>Pitched For</TableHead>
                        <TableHead>AI</TableHead>
                        <TableHead>Call</TableHead>
                        <TableHead>SMS</TableHead>
                        <TableHead>Variant</TableHead>
                        <TableHead>Interest</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leads.map((l: any, i) => (
                        <TableRow
                          key={l.id}
                          className={`cursor-pointer ${l.call_status === "calling" ? "bg-primary/5" : ""}`}
                          onClick={() => setSelectedLeadId(l.id)}
                        >
                          <TableCell>{i + 1}</TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{l.client_name || "Unknown"}</p>
                              {l.company && <p className="text-xs text-muted-foreground">{l.company}</p>}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            <div>
                              {l.phone_number}
                              {l.extension && <span className="text-muted-foreground"> ext {l.extension}</span>}
                            </div>
                            {l.timezone && <div className="text-[10px] text-muted-foreground">{l.timezone}</div>}
                          </TableCell>
                          <TableCell className="max-w-[180px] truncate">{l.pitched_for || "—"}</TableCell>
                          <TableCell><StatusBadge status={l.analysis_status} /></TableCell>
                          <TableCell><StatusBadge status={l.call_status} /></TableCell>
                          <TableCell>
                            {l.sms_status && l.sms_status !== "pending" ? (
                              <Badge variant="outline" className="text-xs">{l.sms_status}</Badge>
                            ) : <span className="text-xs text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell>{l.variant?.label ? <Badge variant="secondary" className="text-xs">{l.variant.label}</Badge> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                          <TableCell><InterestBadge level={l.interest_level} lead={l} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="cold" className="mt-4">
          <ColdProspectsPanel sessionId={sessionId} />
        </TabsContent>

        <TabsContent value="callbacks" className="mt-4">
          <CallbacksTab sessionId={sessionId} />
        </TabsContent>

        <TabsContent value="hangup" className="mt-4">
          <AutoHangupTimelineTab sessionId={sessionId} />
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <CampaignLogsTab sessionId={sessionId} />
        </TabsContent>

        <TabsContent value="variants" className="mt-4">
          <VariantsTab sessionId={sessionId} />
        </TabsContent>
      </Tabs>

      <LeadDetailDialog
        leadId={selectedLeadId}
        open={!!selectedLeadId}
        onOpenChange={(open) => !open && setSelectedLeadId(null)}
      />
    </div>
  );
}
