import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Brain, ChevronDown, Loader2, Phone, Clock, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

type Call = Tables<"calls">;

interface Verdict {
  outcome: string;
  interest_level: string;
  qualify_as_lead: boolean;
  reason: string;
}

const outcomeStyles: Record<string, string> = {
  interested: "bg-green-500 text-white",
  callback_requested: "bg-blue-500 text-white",
  engaged_no_commit: "bg-yellow-500 text-white",
  not_interested: "bg-destructive text-white",
  voicemail: "bg-muted text-muted-foreground",
  gatekeeper: "bg-orange-500 text-white",
  no_answer: "bg-muted text-muted-foreground",
};

function countCustomerTurns(transcript: string): number {
  return (transcript || "")
    .split("\n")
    .filter((l) => l.startsWith("Customer:") && l.replace("Customer:", "").trim().length > 2)
    .length;
}

function getSummary(call: Call): string {
  const md = (call.metadata ?? {}) as Record<string, unknown>;
  return (md.ai_summary as string) || (md.summary as string) || "";
}

type FilterKey = "all" | "voicemail" | "gatekeeper" | "callback" | "interested" | "unclassified";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "interested", label: "Interested" },
  { key: "callback", label: "Callback" },
  { key: "gatekeeper", label: "Gatekeeper" },
  { key: "voicemail", label: "Voicemail" },
  { key: "unclassified", label: "Unclassified" },
];

export function ClassifierAuditPanel({ calls }: { calls: Call[] }) {
  const [verdicts, setVerdicts] = useState<Record<string, Verdict | { error: string }>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<FilterKey>("all");
  const [bulkLoading, setBulkLoading] = useState(false);

  const classify = async (call: Call) => {
    setLoading((p) => ({ ...p, [call.id]: true }));
    try {
      const { data, error } = await supabase.functions.invoke("classify-call-outcome", {
        body: {
          transcript: call.transcript || "",
          summary: getSummary(call),
          durationSeconds: call.duration_seconds || 0,
        },
      });
      if (error) throw error;
      setVerdicts((p) => ({ ...p, [call.id]: data as Verdict }));
    } catch (e) {
      setVerdicts((p) => ({
        ...p,
        [call.id]: { error: e instanceof Error ? e.message : "Unknown error" },
      }));
    } finally {
      setLoading((p) => ({ ...p, [call.id]: false }));
    }
  };

  const runClassifier = (call: Call) => classify(call);

  const classifyAll = async () => {
    setBulkLoading(true);
    const pending = calls.filter((c) => {
      const v = verdicts[c.id];
      return !v || "error" in (v as object);
    });
    for (const c of pending) {
      // eslint-disable-next-line no-await-in-loop
      await classify(c);
    }
    setBulkLoading(false);
  };

  const counts: Record<FilterKey, number> = {
    all: calls.length,
    interested: 0, callback: 0, gatekeeper: 0, voicemail: 0, unclassified: 0,
  };
  for (const c of calls) {
    const v = verdicts[c.id];
    if (!v || "error" in (v as object)) { counts.unclassified++; continue; }
    const o = (v as Verdict).outcome;
    if (o === "interested") counts.interested++;
    else if (o === "callback_requested") counts.callback++;
    else if (o === "gatekeeper") counts.gatekeeper++;
    else if (o === "voicemail") counts.voicemail++;
  }

  const matchesFilter = (call: Call) => {
    if (filter === "all") return true;
    const v = verdicts[call.id];
    if (filter === "unclassified") return !v || "error" in (v as object);
    if (!v || "error" in (v as object)) return false;
    const o = (v as Verdict).outcome;
    if (filter === "callback") return o === "callback_requested";
    return o === filter;
  };

  if (calls.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No calls available to audit
      </div>
    );
  }

  const visibleCalls = calls.filter(matchesFilter);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={filter === f.key ? "default" : "outline"}
              onClick={() => setFilter(f.key)}
              className="h-7 text-xs"
            >
              {f.label}
              <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">
                {counts[f.key]}
              </Badge>
            </Button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={classifyAll} disabled={bulkLoading}>
          {bulkLoading ? (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <Brain className="h-3 w-3 mr-1" />
          )}
          Classify all
        </Button>
      </div>

      <ScrollArea className="h-[360px] pr-4">
        {visibleCalls.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No calls match this filter
          </div>
        ) : (
        <div className="space-y-3">
        {visibleCalls.map((call) => {
          const verdict = verdicts[call.id];
          const isLoading = loading[call.id];
          const transcript = call.transcript || "";
          const summary = getSummary(call);
          const turns = countCustomerTurns(transcript);
          const duration = call.duration_seconds || 0;
          const snippet = transcript.slice(0, 600);
          const isError = verdict && "error" in verdict;
          const v = verdict && !("error" in verdict) ? verdict : null;

          return (
            <Card key={call.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <CardTitle className="text-sm truncate">
                        {call.phone_number}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {call.direction || "outbound"}
                        </span>
                      </CardTitle>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {duration}s
                        </span>
                        <span>{turns} customer turns</span>
                        {call.created_at && (
                          <span>{format(new Date(call.created_at), "PP p")}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={v ? "outline" : "default"}
                    onClick={() => runClassifier(call)}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Brain className="h-4 w-4 mr-1" />
                    )}
                    {v ? "Re-run" : "Classify"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {v && (
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={outcomeStyles[v.outcome] || "bg-muted"}>
                        {v.outcome.replace(/_/g, " ")}
                      </Badge>
                      <Badge variant="outline">interest: {v.interest_level}</Badge>
                      <Badge
                        variant="outline"
                        className={cn(
                          v.qualify_as_lead
                            ? "border-green-500 text-green-600"
                            : "border-muted-foreground/30 text-muted-foreground"
                        )}
                      >
                        {v.qualify_as_lead ? "✓ qualifies as lead" : "✗ not qualified"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Reason: </span>
                      {v.reason}
                    </p>
                  </div>
                )}

                {isError && (
                  <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    {(verdict as { error: string }).error}
                  </div>
                )}

                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-full justify-between h-8 px-2">
                      <span className="text-xs font-medium">
                        Inputs used for classification
                      </span>
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-2 pt-2">
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded bg-muted/50 p-2">
                        <div className="text-muted-foreground">Duration</div>
                        <div className="font-mono font-medium">{duration}s</div>
                      </div>
                      <div className="rounded bg-muted/50 p-2">
                        <div className="text-muted-foreground">Customer turns</div>
                        <div className="font-mono font-medium">{turns}</div>
                      </div>
                      <div className="rounded bg-muted/50 p-2">
                        <div className="text-muted-foreground">Transcript chars</div>
                        <div className="font-mono font-medium">{transcript.length}</div>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1">
                        Summary
                      </div>
                      <div className="rounded bg-muted/50 p-2 text-xs">
                        {summary || <span className="italic text-muted-foreground">(none)</span>}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1">
                        Transcript snippet (first 600 chars)
                      </div>
                      <pre className="rounded bg-muted/50 p-2 text-xs whitespace-pre-wrap font-mono max-h-[160px] overflow-y-auto">
                        {snippet || <span className="italic text-muted-foreground">(empty)</span>}
                        {transcript.length > 600 && "\n…"}
                      </pre>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </CardContent>
            </Card>
          );
        })}
        </div>
        )}
      </ScrollArea>
    </div>
  );
}
