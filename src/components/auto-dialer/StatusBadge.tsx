import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock, PhoneCall, Phone, SkipForward, Loader2, Sparkles, Voicemail, Shield, PhoneForwarded, Globe2 } from "lucide-react";

const map: Record<string, { class: string; icon: any; label?: string }> = {
  pending: { class: "bg-muted text-muted-foreground", icon: Clock },
  analyzing: { class: "bg-purple-500/10 text-purple-500", icon: Loader2, label: "analyzing" },
  ready: { class: "bg-emerald-500/10 text-emerald-600", icon: Sparkles, label: "ready" },
  calling: { class: "bg-blue-500/10 text-blue-500", icon: PhoneCall },
  completed: { class: "bg-green-500/10 text-green-500", icon: CheckCircle2 },
  failed: { class: "bg-red-500/10 text-red-500", icon: XCircle },
  no_answer: { class: "bg-yellow-500/10 text-yellow-500", icon: Phone },
  voicemail: { class: "bg-slate-500/10 text-slate-500", icon: Voicemail },
  gatekeeper: { class: "bg-orange-500/10 text-orange-500", icon: Shield },
  not_interested: { class: "bg-rose-500/10 text-rose-500", icon: XCircle, label: "not interested" },
  callback: { class: "bg-amber-500/10 text-amber-500", icon: PhoneForwarded },
  skipped: { class: "bg-muted text-muted-foreground", icon: SkipForward },
  skipped_non_us: { class: "bg-muted text-muted-foreground", icon: Globe2, label: "non-US" },
  draft: { class: "bg-muted text-muted-foreground", icon: Clock },
  running: { class: "bg-blue-500/10 text-blue-500", icon: PhoneCall },
  paused: { class: "bg-yellow-500/10 text-yellow-500", icon: Clock },
};

export function StatusBadge({ status }: { status: string }) {
  const cfg = map[status] || map.pending;
  const Icon = cfg.icon;
  return (
    <Badge className={cfg.class} variant="outline">
      <Icon className={`h-3 w-3 mr-1 ${status === "analyzing" ? "animate-spin" : ""}`} />
      {(cfg.label || status).replace("_", " ")}
    </Badge>
  );
}

export function InterestBadge({ level, lead }: { level: string | null; lead?: any }) {
  // Derive a more truthful label using ai_summary + flags so we never show
  // "not interested" / "unclear" for what was really voicemail or a gatekeeper.
  const summary = (lead?.ai_summary || "").toLowerCase();
  const isVoicemail =
    /voicemail|voice mail|leave a message|after the (tone|beep)|answering machine|mailbox|automated greeting|you've reached|you have reached/.test(summary);
  const isGatekeeper =
    lead?.gatekeeper_encountered === true ||
    /receptionist|switchboard|front desk|please hold|operator|transferred|secretary|how (may|can) i direct/.test(summary);
  const isNoAnswer = lead?.call_status === "no_answer" || /no answer|did not pick up|no one picked up|never connected/.test(summary);
  const isCallback = lead?.callback_requested === true || level === "callback";

  // Resolve effective label
  let effective = level || "unclear";
  if (isVoicemail) effective = "voicemail";
  else if (isGatekeeper) effective = "gatekeeper";
  else if (isCallback) effective = "callback";
  else if (isNoAnswer && (effective === "not_interested" || effective === "unclear")) effective = "no_answer";

  if (!level && !isVoicemail && !isGatekeeper && !isNoAnswer && !isCallback) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }

  const cfg: Record<string, string> = {
    interested: "bg-green-500/10 text-green-600",
    not_interested: "bg-red-500/10 text-red-600",
    callback: "bg-yellow-500/10 text-yellow-600",
    voicemail: "bg-slate-500/10 text-slate-600",
    gatekeeper: "bg-orange-500/10 text-orange-600",
    no_answer: "bg-muted text-muted-foreground",
    unclear: "bg-muted text-muted-foreground",
  };
  return <Badge className={cfg[effective] || cfg.unclear} variant="outline">{effective.replace("_", " ")}</Badge>;
}
