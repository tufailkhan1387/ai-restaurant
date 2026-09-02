import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { PhoneCall, Loader2, Sparkles, Users } from "lucide-react";

interface Props {
  sessionId: string;
  onCampaignCreated?: (newSessionId: string) => void;
}

export function CallbacksTab({ sessionId, onCampaignCreated }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const queryClient = useQueryClient();

  const { data: leads, isLoading, refetch } = useQuery({
    queryKey: ["callback-leads", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("auto_dialer_leads")
        .select("id, client_name, company, phone_number, extension, ai_summary, callback_reason, gatekeeper_encountered, call_status, interest_level")
        .eq("session_id", sessionId)
        .or("callback_requested.eq.true,gatekeeper_encountered.eq.true,call_status.eq.no_answer,interest_level.eq.callback")
        .order("client_name", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const toggleAll = () => {
    if (!leads) return;
    if (selected.size === leads.length) setSelected(new Set());
    else setSelected(new Set(leads.map((l) => l.id)));
  };

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const reanalyzeFlags = async () => {
    setAnalyzing(true);
    try {
      const { error } = await supabase.functions.invoke("sync-auto-dialer-call", {
        body: { sessionId, onlyMissing: false },
      });
      if (error) throw error;
      toast({ title: "Re-scanned all calls", description: "Callback flags refreshed from AI summaries" });
      refetch();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Failed", description: e.message });
    } finally {
      setAnalyzing(false);
    }
  };

  const createFollowupCampaign = async () => {
    if (selected.size === 0) {
      toast({ variant: "destructive", title: "Select at least one lead" });
      return;
    }
    setCreating(true);
    try {
      // Pull source session for defaults
      const { data: src } = await supabase
        .from("auto_dialer_sessions").select("*").eq("id", sessionId).single();

      const { data: newSession, error: sErr } = await supabase
        .from("auto_dialer_sessions")
        .insert({
          name: `${src?.name || "Campaign"} — Callbacks`,
          status: "draft",
          call_interval_seconds: src?.call_interval_seconds || 120,
          agent_id: src?.agent_id || null,
          dialing_window_start: src?.dialing_window_start,
          dialing_window_end: src?.dialing_window_end,
          respect_timezone: src?.respect_timezone,
          default_timezone: src?.default_timezone,
          allowed_weekdays: src?.allowed_weekdays,
        } as any)
        .select().single();
      if (sErr) throw sErr;

      // Clone selected leads into the new campaign
      const sourceLeads = (leads || []).filter((l) => selected.has(l.id));
      const cloned = sourceLeads.map((l, idx) => ({
        session_id: newSession.id,
        client_name: l.client_name,
        company: l.company,
        phone_number: l.phone_number,
        extension: (l as any).extension,
        pitched_for: `Callback follow-up: ${l.callback_reason || "previous attempt incomplete"}`,
        additional_notes: l.ai_summary || null,
        sort_order: idx,
        analysis_status: "pending",
      }));
      if (cloned.length > 0) {
        const { error: insErr } = await supabase.from("auto_dialer_leads").insert(cloned);
        if (insErr) throw insErr;
      }

      await supabase.from("auto_dialer_sessions")
        .update({ total_leads: cloned.length }).eq("id", newSession.id);

      await supabase.from("auto_dialer_events").insert({
        session_id: newSession.id,
        event_type: "campaign_created_from_callbacks",
        message: `Spawned from ${cloned.length} callback leads`,
        metadata: { source_session_id: sessionId },
      });

      // Trigger AI analysis on new leads
      supabase.functions.invoke("analyze-auto-dialer-leads", { body: { sessionId: newSession.id } })
        .catch(console.error);

      queryClient.invalidateQueries({ queryKey: ["auto-dialer-sessions"] });
      toast({
        title: "Callback campaign created",
        description: `${cloned.length} leads added. AI analyzing now.`,
      });
      setSelected(new Set());
      onCampaignCreated?.(newSession.id);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Failed", description: e.message });
    } finally {
      setCreating(false);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Leads needing callback
            </CardTitle>
            <CardDescription>
              Auto-flagged when AI detected receptionist, hold, voicemail, or callback request.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={reanalyzeFlags} disabled={analyzing}>
              {analyzing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
              Re-scan calls
            </Button>
            <Button
              size="sm"
              onClick={createFollowupCampaign}
              disabled={creating || selected.size === 0}
            >
              {creating ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <PhoneCall className="h-3 w-3 mr-1" />}
              Create callback campaign ({selected.size})
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!leads || leads.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No callbacks queued yet. Once calls complete, AI-detected callbacks will appear here.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <Checkbox
                      checked={selected.size === leads.length && leads.length > 0}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Flags</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((l: any) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <Checkbox checked={selected.has(l.id)} onCheckedChange={() => toggle(l.id)} />
                    </TableCell>
                    <TableCell>
                      <p className="font-medium text-sm">{l.client_name || "Unknown"}</p>
                      {l.company && <p className="text-xs text-muted-foreground">{l.company}</p>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {l.phone_number}
                      {l.extension && <span className="text-muted-foreground"> ext {l.extension}</span>}
                    </TableCell>
                    <TableCell className="max-w-[280px]">
                      <p className="text-xs">{l.callback_reason || "—"}</p>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {l.gatekeeper_encountered && <Badge variant="outline" className="text-xs">Gatekeeper</Badge>}
                        {l.call_status === "no_answer" && <Badge variant="outline" className="text-xs">No answer</Badge>}
                        {l.interest_level === "callback" && <Badge variant="secondary" className="text-xs">Callback</Badge>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
