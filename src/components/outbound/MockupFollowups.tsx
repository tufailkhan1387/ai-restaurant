import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Mail, Clock, Send, CheckCircle, Eye, MousePointer, MessageSquare, Plus, RefreshCw } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, formatDistanceToNow } from "date-fns";

type MockupFollowup = {
  id: string;
  lead_id: string | null;
  mockup_sent_at: string;
  mockup_url: string | null;
  email_status: string;
  followup_sequence: number;
  next_followup_at: string | null;
  followup_count: number;
  last_followup_sent_at: string | null;
  auto_followup_enabled: boolean;
  notes: string | null;
  created_at: string;
  lead?: {
    full_name: string | null;
    email: string | null;
    company: string | null;
  };
};

type OutboundLead = {
  id: string;
  full_name: string | null;
  email: string | null;
  company: string | null;
};

export function MockupFollowups() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState("");
  const [mockupUrl, setMockupUrl] = useState("");
  const queryClient = useQueryClient();

  const { data: followups, isLoading } = useQuery({
    queryKey: ["mockup-followups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mockup_followups")
        .select(`
          *,
          lead:outbound_leads(full_name, email, company)
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as MockupFollowup[];
    },
  });

  const { data: leadsWithEmail } = useQuery({
    queryKey: ["leads-with-email"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("outbound_leads")
        .select("id, full_name, email, company")
        .not("email", "is", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as OutboundLead[];
    },
  });

  const createFollowup = useMutation({
    mutationFn: async () => {
      // First create the mockup followup record
      const { data: followup, error: followupError } = await supabase
        .from("mockup_followups")
        .insert({
          lead_id: selectedLead,
          mockup_url: mockupUrl || null,
          next_followup_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days from now
        })
        .select()
        .single();
      
      if (followupError) throw followupError;

      // Then trigger the initial email send
      const response = await supabase.functions.invoke("send-mockup-email", {
        body: { followupId: followup.id },
      });
      
      if (response.error) throw response.error;
      return followup;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mockup-followups"] });
      setIsDialogOpen(false);
      setSelectedLead("");
      setMockupUrl("");
      toast({ title: "Mockup sent", description: "Initial mockup email has been sent" });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  const toggleAutoFollowup = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase
        .from("mockup_followups")
        .update({ auto_followup_enabled: enabled })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mockup-followups"] });
    },
  });

  const sendFollowup = useMutation({
    mutationFn: async (followupId: string) => {
      const response = await supabase.functions.invoke("send-followup-email", {
        body: { followupId },
      });
      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mockup-followups"] });
      toast({ title: "Follow-up sent", description: "Follow-up email has been sent" });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Failed to send", description: error.message });
    },
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "responded":
        return <MessageSquare className="h-4 w-4 text-green-500" />;
      case "clicked":
        return <MousePointer className="h-4 w-4 text-blue-500" />;
      case "opened":
        return <Eye className="h-4 w-4 text-yellow-500" />;
      case "delivered":
        return <CheckCircle className="h-4 w-4 text-muted-foreground" />;
      default:
        return <Send className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "responded":
        return "bg-green-500/10 text-green-500";
      case "clicked":
        return "bg-blue-500/10 text-blue-500";
      case "opened":
        return "bg-yellow-500/10 text-yellow-500";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  // Stats
  const stats = {
    total: followups?.length || 0,
    responded: followups?.filter(f => f.email_status === "responded").length || 0,
    opened: followups?.filter(f => ["opened", "clicked", "responded"].includes(f.email_status)).length || 0,
    pending: followups?.filter(f => f.auto_followup_enabled && f.email_status !== "responded").length || 0,
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Mockups Sent</CardDescription>
            <CardTitle className="text-2xl">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Responded</CardDescription>
            <CardTitle className="text-2xl text-green-500">{stats.responded}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Opened</CardDescription>
            <CardTitle className="text-2xl text-yellow-500">{stats.opened}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending Follow-ups</CardDescription>
            <CardTitle className="text-2xl">{stats.pending}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Mockup Follow-ups
            </CardTitle>
            <CardDescription>
              Track mockups sent and manage automated follow-up sequences
            </CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Send Mockup
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Send Mockup to Lead</DialogTitle>
                <DialogDescription>
                  Send a redesign mockup and enable automated follow-ups
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Select Lead</Label>
                  <Select value={selectedLead} onValueChange={setSelectedLead}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a lead with email" />
                    </SelectTrigger>
                    <SelectContent>
                      {leadsWithEmail?.map((lead) => (
                        <SelectItem key={lead.id} value={lead.id}>
                          {lead.full_name || lead.email} - {lead.company || "No company"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Mockup URL (optional)</Label>
                  <Input
                    placeholder="https://figma.com/..."
                    value={mockupUrl}
                    onChange={(e) => setMockupUrl(e.target.value)}
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={() => createFollowup.mutate()}
                  disabled={!selectedLead || createFollowup.isPending}
                >
                  {createFollowup.isPending ? "Sending..." : "Send Mockup & Start Sequence"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin" />
            </div>
          ) : followups?.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No mockups sent yet. Send your first mockup to start tracking.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead>Follow-ups</TableHead>
                  <TableHead>Next Follow-up</TableHead>
                  <TableHead>Auto</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {followups?.map((followup) => (
                  <TableRow key={followup.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{followup.lead?.full_name || "Unknown"}</p>
                        <p className="text-sm text-muted-foreground">{followup.lead?.company}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(followup.email_status)}
                        <Badge className={getStatusColor(followup.email_status)}>
                          {followup.email_status}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(followup.mockup_sent_at), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{followup.followup_count} sent</Badge>
                    </TableCell>
                    <TableCell>
                      {followup.next_followup_at && followup.email_status !== "responded" ? (
                        <div className="flex items-center gap-1 text-sm">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(followup.next_followup_at), { addSuffix: true })}
                        </div>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={followup.auto_followup_enabled}
                        onCheckedChange={(enabled) =>
                          toggleAutoFollowup.mutate({ id: followup.id, enabled })
                        }
                        disabled={followup.email_status === "responded"}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => sendFollowup.mutate(followup.id)}
                        disabled={
                          followup.email_status === "responded" ||
                          sendFollowup.isPending
                        }
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
