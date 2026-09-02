import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Upload, Phone, PhoneOff, SkipForward, User, Building2, Mail, Globe, FileSpreadsheet } from "lucide-react";
import { useTwilio } from "@/hooks/useTwilio";
import * as XLSX from "xlsx";

type OutboundLead = {
  id: string;
  campaign_id: string | null;
  full_name: string | null;
  phone_number: string;
  email: string | null;
  company: string | null;
  website_url: string | null;
  status: string;
  call_attempts: number;
  last_called_at: string | null;
  notes: string | null;
};

type Campaign = {
  id: string;
  name: string;
};

export function LeadsDialer() {
  const [selectedCampaign, setSelectedCampaign] = useState<string>("");
  const [currentLeadIndex, setCurrentLeadIndex] = useState(0);
  const [callNotes, setCallNotes] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const queryClient = useQueryClient();
  const { makeCall, endCall, isLoading: isCallLoading, activeCallSid } = useTwilio();

  const { data: campaigns } = useQuery({
    queryKey: ["outbound-campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("outbound_campaigns")
        .select("id, name")
        .eq("status", "active")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Campaign[];
    },
  });

  const { data: leads, isLoading: leadsLoading } = useQuery({
    queryKey: ["outbound-leads", selectedCampaign],
    queryFn: async () => {
      if (!selectedCampaign) return [];
      const { data, error } = await supabase
        .from("outbound_leads")
        .select("*")
        .eq("campaign_id", selectedCampaign)
        .in("status", ["pending", "callback", "no_answer"])
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as OutboundLead[];
    },
    enabled: !!selectedCampaign,
  });

  const updateLead = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: string; notes?: string }) => {
      const { error } = await supabase
        .from("outbound_leads")
        .update({
          status,
          notes: notes || null,
          call_attempts: (leads?.find(l => l.id === id)?.call_attempts || 0) + 1,
          last_called_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outbound-leads"] });
      setCallNotes("");
    },
  });

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedCampaign) return;

    setIsUploading(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      const leadsToInsert = jsonData.map((row: any) => ({
        campaign_id: selectedCampaign,
        full_name: row.name || row.full_name || row.Name || row["Full Name"] || null,
        phone_number: String(row.phone || row.phone_number || row.Phone || row["Phone Number"] || ""),
        email: row.email || row.Email || null,
        company: row.company || row.Company || null,
        website_url: row.website || row.website_url || row.Website || null,
      })).filter((lead: any) => lead.phone_number);

      if (leadsToInsert.length === 0) {
        toast({ variant: "destructive", title: "No valid leads found", description: "Make sure your Excel file has a phone column" });
        return;
      }

      const { error } = await supabase.from("outbound_leads").insert(leadsToInsert);
      if (error) throw error;

      toast({ title: "Leads uploaded", description: `${leadsToInsert.length} leads imported successfully` });
      queryClient.invalidateQueries({ queryKey: ["outbound-leads"] });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Upload failed", description: error.message });
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  }, [selectedCampaign, queryClient]);

  const currentLead = leads?.[currentLeadIndex];

  const handleCall = async () => {
    if (!currentLead) return;
    await makeCall(currentLead.phone_number, `Hello, this is QubeTech calling regarding our services. Am I speaking with ${currentLead.full_name || "the business owner"}?`);
  };

  const handleEndCall = async () => {
    await endCall();
  };

  const handleOutcome = (status: string) => {
    if (!currentLead) return;
    updateLead.mutate({ id: currentLead.id, status, notes: callNotes });
    setCurrentLeadIndex((prev) => Math.min(prev + 1, (leads?.length || 1) - 1));
  };

  const skipLead = () => {
    setCurrentLeadIndex((prev) => Math.min(prev + 1, (leads?.length || 1) - 1));
    setCallNotes("");
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "interested": return "bg-green-500/10 text-green-500";
      case "not_interested": return "bg-red-500/10 text-red-500";
      case "callback": return "bg-yellow-500/10 text-yellow-500";
      case "no_answer": return "bg-muted text-muted-foreground";
      default: return "bg-blue-500/10 text-blue-500";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
        <div className="w-full sm:w-64 space-y-2">
          <Label>Select Campaign</Label>
          <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a campaign" />
            </SelectTrigger>
            <SelectContent>
              {campaigns?.map((campaign) => (
                <SelectItem key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedCampaign && (
          <div className="flex gap-2">
            <Label htmlFor="excel-upload" className="cursor-pointer">
              <div className="inline-flex items-center gap-2 px-4 py-2 border rounded-md hover:bg-accent transition-colors">
                <FileSpreadsheet className="h-4 w-4" />
                {isUploading ? "Uploading..." : "Upload Excel"}
              </div>
              <Input
                id="excel-upload"
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleFileUpload}
                disabled={isUploading}
              />
            </Label>
          </div>
        )}
      </div>

      {selectedCampaign && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Lead Preview Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Preview Dialer</CardTitle>
                  <CardDescription>
                    {leads?.length ? `Lead ${currentLeadIndex + 1} of ${leads.length}` : "No leads available"}
                  </CardDescription>
                </div>
                {currentLead && (
                  <Badge className={getStatusColor(currentLead.status)}>{currentLead.status}</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {leadsLoading ? (
                <div className="space-y-4 animate-pulse">
                  <div className="h-6 bg-muted rounded w-3/4" />
                  <div className="h-4 bg-muted rounded w-1/2" />
                  <div className="h-4 bg-muted rounded w-2/3" />
                </div>
              ) : currentLead ? (
                <div className="space-y-4">
                  <div className="grid gap-3">
                    <div className="flex items-center gap-3">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{currentLead.full_name || "Unknown"}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span>{currentLead.phone_number}</span>
                    </div>
                    {currentLead.company && (
                      <div className="flex items-center gap-3">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span>{currentLead.company}</span>
                      </div>
                    )}
                    {currentLead.email && (
                      <div className="flex items-center gap-3">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span>{currentLead.email}</span>
                      </div>
                    )}
                    {currentLead.website_url && (
                      <div className="flex items-center gap-3">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <a href={currentLead.website_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          {currentLead.website_url}
                        </a>
                      </div>
                    )}
                  </div>

                  {currentLead.call_attempts > 0 && (
                    <p className="text-sm text-muted-foreground">
                      Called {currentLead.call_attempts} time(s)
                    </p>
                  )}

                  <div className="flex gap-2 pt-2">
                    {activeCallSid ? (
                      <Button variant="destructive" onClick={handleEndCall} disabled={isCallLoading}>
                        <PhoneOff className="h-4 w-4 mr-2" />
                        End Call
                      </Button>
                    ) : (
                      <Button onClick={handleCall} disabled={isCallLoading}>
                        <Phone className="h-4 w-4 mr-2" />
                        Call Now
                      </Button>
                    )}
                    <Button variant="outline" onClick={skipLead}>
                      <SkipForward className="h-4 w-4 mr-2" />
                      Skip
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">No more leads to call in this campaign.</p>
              )}
            </CardContent>
          </Card>

          {/* Call Outcome Card */}
          <Card>
            <CardHeader>
              <CardTitle>Call Outcome</CardTitle>
              <CardDescription>Record the result of this call</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={callNotes}
                  onChange={(e) => setCallNotes(e.target.value)}
                  placeholder="Add notes about the call..."
                  rows={4}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="border-green-500 text-green-500 hover:bg-green-500/10"
                  onClick={() => handleOutcome("interested")}
                  disabled={!currentLead || updateLead.isPending}
                >
                  Interested
                </Button>
                <Button
                  variant="outline"
                  className="border-red-500 text-red-500 hover:bg-red-500/10"
                  onClick={() => handleOutcome("not_interested")}
                  disabled={!currentLead || updateLead.isPending}
                >
                  Not Interested
                </Button>
                <Button
                  variant="outline"
                  className="border-yellow-500 text-yellow-500 hover:bg-yellow-500/10"
                  onClick={() => handleOutcome("callback")}
                  disabled={!currentLead || updateLead.isPending}
                >
                  Callback Later
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleOutcome("no_answer")}
                  disabled={!currentLead || updateLead.isPending}
                >
                  No Answer
                </Button>
              </div>

              <Button
                className="w-full"
                variant="default"
                onClick={() => handleOutcome("converted")}
                disabled={!currentLead || updateLead.isPending}
              >
                Mark as Converted
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
