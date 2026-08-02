import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, Settings2, Timer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { AgentSelector } from "./AgentSelector";

interface SessionSettingsCardProps {
  sessionId: string;
  status: string;
  agentId: string | null;
  intervalSeconds: number;
  maxCallDurationSeconds?: number;
}

export function SessionSettingsCard({
  sessionId,
  status,
  agentId,
  intervalSeconds,
  maxCallDurationSeconds = 120,
}: SessionSettingsCardProps) {
  const queryClient = useQueryClient();
  const [draftAgentId, setDraftAgentId] = useState<string | null>(agentId);
  const [draftIntervalSeconds, setDraftIntervalSeconds] = useState(intervalSeconds);
  const [draftMaxDuration, setDraftMaxDuration] = useState(maxCallDurationSeconds);

  useEffect(() => {
    setDraftAgentId(agentId);
    setDraftIntervalSeconds(intervalSeconds);
    setDraftMaxDuration(maxCallDurationSeconds);
  }, [agentId, intervalSeconds, maxCallDurationSeconds]);

  const hasChanges = useMemo(
    () =>
      draftAgentId !== agentId ||
      draftIntervalSeconds !== intervalSeconds ||
      draftMaxDuration !== maxCallDurationSeconds,
    [agentId, draftAgentId, draftIntervalSeconds, intervalSeconds, draftMaxDuration, maxCallDurationSeconds],
  );

  const estMinutesSavedPerCall = Math.max(0, 5 - draftMaxDuration / 60); // vs an uncapped ~5 min ceiling
  const updateSettings = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("auto_dialer_sessions")
        .update({
          agent_id: draftAgentId,
          call_interval_seconds: draftIntervalSeconds,
          max_call_duration_seconds: draftMaxDuration,
        })
        .eq("id", sessionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auto-dialer-session", sessionId] });
      queryClient.invalidateQueries({ queryKey: ["auto-dialer-sessions"] });
      toast({
        title: "Campaign settings updated",
        description:
          status === "running"
            ? "The next outbound call will use the new agent and interval."
            : "The updated agent and interval are saved for the next run.",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Could not update campaign settings",
        description: error.message,
      });
    },
  });

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Settings2 className="h-4 w-4" /> Live campaign settings
            </CardTitle>
            <CardDescription>
              Update the agent and spacing between calls without recreating the campaign.
            </CardDescription>
          </div>
          <Badge variant="secondary" className="shrink-0">
            {status === "running" ? "Applies to next call" : "Saved for next run"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <Label>AI Agent</Label>
            <AgentSelector value={draftAgentId} onChange={setDraftAgentId} />
          </div>

          <div className="space-y-2">
            <Label>
              Call Interval: {Math.floor(draftIntervalSeconds / 60)}m {draftIntervalSeconds % 60}s
            </Label>
            <Slider
              value={[draftIntervalSeconds]}
              onValueChange={(value) => setDraftIntervalSeconds(value[0])}
              min={60}
              max={600}
              step={30}
            />
          </div>
        </div>

        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Label className="flex items-center gap-1.5">
              <Timer className="h-4 w-4 text-primary" />
              Max call duration: {Math.floor(draftMaxDuration / 60)}m {draftMaxDuration % 60}s
            </Label>
            <Badge variant="outline" className="text-xs">
              Saves ~{estMinutesSavedPerCall.toFixed(1)} min / call vs uncapped
            </Badge>
          </div>
          <Slider
            value={[draftMaxDuration]}
            onValueChange={(v) => setDraftMaxDuration(v[0])}
            min={30}
            max={600}
            step={15}
          />
          <p className="text-xs text-muted-foreground">
            The live monitor hangs up automatically at this cap (and immediately on detected voicemail) to protect your
            ElevenLabs minutes. Default 2 min — recommended for cold outbound. Raise to 5–10 min for booked demos.
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setDraftAgentId(agentId);
              setDraftIntervalSeconds(intervalSeconds);
              setDraftMaxDuration(maxCallDurationSeconds);
            }}
            disabled={!hasChanges || updateSettings.isPending}
          >
            Reset
          </Button>
          <Button onClick={() => updateSettings.mutate()} disabled={!hasChanges || updateSettings.isPending}>
            <Save className="h-4 w-4" /> Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}