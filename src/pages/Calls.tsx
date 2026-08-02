import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Phone, PhoneIncoming, PhoneOutgoing, Clock, Search, Filter, CheckCircle, XCircle, FileText, PlayCircle, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { CallDetailDialog } from "@/components/calls/CallDetailDialog";
import { format } from "date-fns";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Call = Tables<"calls">;

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  queued: { label: "Queued", variant: "secondary" },
  in_progress: { label: "In Progress", variant: "default" },
  completed: { label: "Completed", variant: "outline" },
  missed: { label: "Missed", variant: "destructive" },
  transferred: { label: "Transferred", variant: "secondary" },
};

export default function Calls() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [relevanceFilter, setRelevanceFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const queryClient = useQueryClient();

  // Sync mutation
  const syncMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("elevenlabs-sync-conversations");
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Synced ${data.synced_calls} calls and ${data.synced_leads} leads from ElevenLabs`);
      queryClient.invalidateQueries({ queryKey: ["calls"] });
    },
    onError: (error) => {
      console.error("Sync error:", error);
      toast.error("Failed to sync from ElevenLabs");
    },
  });

  const { data: calls = [], isLoading } = useQuery({
    queryKey: ["calls", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("calls")
        .select("*, leads(id, full_name, services_interested)")
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter as Call["status"]);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as (Call & { leads: { id: string; full_name: string | null; services_interested: string[] | null } | null })[];
    },
  });

  // Filter by relevance (has lead = relevant, no lead = irrelevant)
  const filteredByRelevance = calls.filter((call) => {
    if (relevanceFilter === "all") return true;
    if (relevanceFilter === "relevant") return !!call.lead_id;
    if (relevanceFilter === "irrelevant") return !call.lead_id;
    return true;
  });

  const filteredCalls = filteredByRelevance.filter((call) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return call.phone_number?.toLowerCase().includes(query);
  });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayCalls = calls.filter(
    (c) => c.created_at && new Date(c.created_at) >= todayStart
  );
  const inboundCount = todayCalls.filter((c) => c.direction === "inbound").length;
  const outboundCount = todayCalls.filter((c) => c.direction === "outbound").length;
  const avgDuration = todayCalls.length > 0
    ? Math.round(
        todayCalls.reduce((acc, c) => acc + (c.duration_seconds || 0), 0) /
          todayCalls.filter((c) => c.duration_seconds).length || 1
      )
    : 0;

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, "0")}`;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Calls</h1>
          <p className="text-muted-foreground">View and manage all call activity</p>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            {syncMutation.isPending ? "Syncing..." : "Sync from ElevenLabs"}
          </Button>
          <Button className="gradient-primary text-primary-foreground">
            <Phone className="h-4 w-4 mr-2" />
            New Call
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Today's Calls</p>
                <p className="text-2xl font-bold">{todayCalls.length}</p>
              </div>
              <Phone className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Inbound</p>
                <p className="text-2xl font-bold">{inboundCount}</p>
              </div>
              <PhoneIncoming className="h-8 w-8 text-status-available" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Outbound</p>
                <p className="text-2xl font-bold">{outboundCount}</p>
              </div>
              <PhoneOutgoing className="h-8 w-8 text-status-on-call" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Duration</p>
                <p className="text-2xl font-bold">{formatDuration(avgDuration)}</p>
              </div>
              <Clock className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Calls Tabs */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Call Logs</CardTitle>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search calls..."
                  className="pl-10 w-[250px]"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={relevanceFilter} onValueChange={setRelevanceFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Relevance" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Calls</SelectItem>
                  <SelectItem value="relevant">Relevant</SelectItem>
                  <SelectItem value="irrelevant">Irrelevant</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="queued">Queued</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="missed">Missed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : filteredCalls.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No calls found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phone Number</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Relevance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Recording</TableHead>
                  <TableHead>Transcript</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCalls.map((call) => (
                  <TableRow
                    key={call.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedCall(call)}
                  >
                    <TableCell className="font-medium">{call.phone_number}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {call.direction === "inbound" ? (
                          <PhoneIncoming className="h-4 w-4 text-status-available" />
                        ) : (
                          <PhoneOutgoing className="h-4 w-4 text-status-on-call" />
                        )}
                        <span className="capitalize">{call.direction}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {call.lead_id ? (
                        <div className="flex items-center gap-1.5">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          <span className="text-green-600 text-sm">Relevant</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <XCircle className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground text-sm">Irrelevant</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusConfig[call.status || "queued"]?.variant || "outline"}>
                        {statusConfig[call.status || "queued"]?.label || call.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {call.duration_seconds ? formatDuration(call.duration_seconds) : "-"}
                    </TableCell>
                    <TableCell>
                      {call.recording_url ? (
                        <div className="flex items-center gap-1.5">
                          <PlayCircle className="h-4 w-4 text-primary" />
                          <span className="text-primary text-sm">Available</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">None</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {call.transcript ? (
                        <div className="flex items-center gap-1.5">
                          <FileText className="h-4 w-4 text-primary" />
                          <span className="text-primary text-sm">View</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">None</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {call.created_at
                        ? format(new Date(call.created_at), "MMM d, h:mm a")
                        : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Call Detail Dialog */}
      <CallDetailDialog
        call={selectedCall}
        open={!!selectedCall}
        onOpenChange={(open) => !open && setSelectedCall(null)}
      />
    </div>
  );
}
