import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Props {
  sessionId: string;
  capSeconds: number;
}

/**
 * Shows a live "Used Xm Ys" counter for the currently-dialing lead in a campaign.
 * Polls the active lead every 5s, ticks visually every 1s, and turns destructive
 * when within 15s of the per-campaign max-duration cap.
 */
export function LiveCallTimer({ sessionId, capSeconds }: Props) {
  const [, force] = useState(0);

  const { data: activeLead } = useQuery({
    queryKey: ["session-active-lead", sessionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("auto_dialer_leads")
        .select("id, called_at, call_status")
        .eq("session_id", sessionId)
        .eq("call_status", "calling")
        .order("called_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    refetchInterval: 5000,
  });

  // Tick every second so the elapsed string updates smoothly.
  useEffect(() => {
    if (!activeLead?.called_at) return;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [activeLead?.called_at]);

  if (!activeLead?.called_at) return null;

  const startedMs = new Date(activeLead.called_at).getTime();
  const elapsed = Math.max(0, Math.floor((Date.now() - startedMs) / 1000));
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  const remaining = capSeconds - elapsed;
  const danger = remaining <= 15;
  const warn = !danger && remaining <= 30;

  const remainingClamped = Math.max(0, remaining);
  const rm = Math.floor(remainingClamped / 60);
  const rs = remainingClamped % 60;

  // Auto-hangup lifecycle:
  //   scheduled  → cap not yet imminent (>15s remaining)
  //   in progress → within the kill window (≤15s remaining, monitor will fire on next poll)
  //   done       → cap exceeded; Twilio hangup already issued / about to be issued
  const hangupPhase: "scheduled" | "in_progress" | "done" =
    remaining > 15 ? "scheduled" : remaining > 0 ? "in_progress" : "done";

  const hangupBadge = {
    scheduled: {
      variant: "outline" as const,
      icon: Clock,
      label: `Auto-hangup: scheduled @ ${Math.floor(capSeconds / 60)}m${capSeconds % 60 ? ` ${capSeconds % 60}s` : ""}`,
      pulse: false,
    },
    in_progress: {
      variant: "secondary" as const,
      icon: Loader2,
      label: "Auto-hangup: in progress",
      pulse: true,
    },
    done: {
      variant: "destructive" as const,
      icon: CheckCircle2,
      label: "Auto-hangup: done",
      pulse: false,
    },
  }[hangupPhase];

  const HangupIcon = hangupBadge.icon;

  return (
    <>
      <Badge
        variant={danger ? "destructive" : warn ? "secondary" : "default"}
        className={cn("text-xs gap-1 tabular-nums", danger && "animate-pulse")}
        title={
          remaining > 0
            ? `Auto-hangup in ${remaining}s (per-campaign cap)`
            : "Cap reached — hanging up on next monitor poll"
        }
      >
        <Activity className="h-3 w-3" />
        Used {m}m {s.toString().padStart(2, "0")}s
      </Badge>
      <Badge
        variant={danger ? "destructive" : warn ? "secondary" : "outline"}
        className={cn("text-xs tabular-nums", danger && "animate-pulse")}
        title="Time left before this call is auto-ended"
      >
        Remaining {rm > 0 ? `${rm}m ` : ""}{rs.toString().padStart(2, "0")}s
      </Badge>
      <Badge
        variant={hangupBadge.variant}
        className={cn("text-xs gap-1", hangupBadge.pulse && "animate-pulse")}
        title="Status of the per-campaign auto-hangup safety net"
      >
        <HangupIcon className={cn("h-3 w-3", hangupPhase === "in_progress" && "animate-spin")} />
        {hangupBadge.label}
      </Badge>
    </>
  );
}
