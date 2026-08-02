import { useState, useEffect } from "react";
import { Phone, Mail, Mic, RefreshCw, Check, X, Loader2, Upload, Download } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { getApiBase } from "@/lib/apiBase";
import { useToast } from "@/hooks/use-toast";

interface IntegrationStatus {
  configured: boolean;
  details?: string;
}

interface IntegrationStatuses {
  twilio?: IntegrationStatus;
  elevenlabs?: IntegrationStatus;
  resend?: IntegrationStatus;
}

export function IntegrationSettings() {
  const [statuses, setStatuses] = useState<IntegrationStatuses>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const { toast } = useToast();

  const fetchStatuses = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("check-integration-status");
      
      if (error) throw error;
      
      setStatuses(data?.integrations || {});
    } catch (error) {
      console.error("Failed to fetch integration statuses:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to check integration statuses",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatuses();
  }, []);

  const syncKnowledge = async (action: "push" | "pull") => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("elevenlabs-sync-knowledge", {
        body: { action },
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: action === "push" ? "Knowledge Synced" : "Agent Info Retrieved",
          description: data.message || `Successfully ${action === "push" ? "pushed" : "pulled"} knowledge`,
        });
      }
    } catch (error) {
      console.error("Sync failed:", error);
      toast({
        variant: "destructive",
        title: "Sync Failed",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setSyncing(false);
    }
  };

  const StatusBadge = ({ configured }: { configured?: boolean }) => (
    <Badge variant={configured ? "default" : "secondary"} className="gap-1">
      {configured ? (
        <>
          <Check className="h-3 w-3" />
          Connected
        </>
      ) : (
        <>
          <X className="h-3 w-3" />
          Not configured
        </>
      )}
    </Badge>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Integration Status</h3>
          <p className="text-sm text-muted-foreground">
            View and manage your connected services
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchStatuses} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Twilio */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5" />
                Twilio
              </CardTitle>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <StatusBadge configured={statuses.twilio?.configured} />
              )}
            </div>
            <CardDescription>Voice calling and SMS integration</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {statuses.twilio?.details && (
                <p className="text-sm text-muted-foreground">{statuses.twilio.details}</p>
              )}
              <div className="text-xs text-muted-foreground">
                <p>• Handles inbound/outbound calls</p>
                <p>• Status updates via webhook</p>
                <p>• Connected to ElevenLabs for AI</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ElevenLabs */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Mic className="h-5 w-5" />
                ElevenLabs
              </CardTitle>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <StatusBadge configured={statuses.elevenlabs?.configured} />
              )}
            </div>
            <CardDescription>AI voice synthesis & conversation</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {statuses.elevenlabs?.details && (
                <p className="text-sm text-muted-foreground">{statuses.elevenlabs.details}</p>
              )}
              <div className="text-xs text-muted-foreground mb-3">
                <p>• Powers AI voice agent</p>
                <p>• Native Twilio integration</p>
                <p>• Automatic lead qualification</p>
              </div>
              {statuses.elevenlabs?.configured && (
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => syncKnowledge("push")}
                    disabled={syncing}
                    className="flex-1"
                  >
                    {syncing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    Sync Knowledge
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => syncKnowledge("pull")}
                    disabled={syncing}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Resend */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Resend
              </CardTitle>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <StatusBadge configured={statuses.resend?.configured} />
              )}
            </div>
            <CardDescription>Email sending integration</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-muted-foreground">
              <p>• Mockup email delivery</p>
              <p>• Follow-up automation</p>
              <p>• Transactional emails</p>
            </div>
          </CardContent>
        </Card>

        {/* Webhook Info Card */}
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Webhook URLs</CardTitle>
            <CardDescription>Configure these in your ElevenLabs dashboard</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-xs">
              <div>
                <p className="font-medium text-muted-foreground">Conversation Webhook:</p>
                <code className="text-[10px] bg-muted px-1 py-0.5 rounded break-all">
                  {getApiBase()}/api/functions/elevenlabs-conversation-webhook
                </code>
              </div>
              <div>
                <p className="font-medium text-muted-foreground">Twilio Status Callback:</p>
                <code className="text-[10px] bg-muted px-1 py-0.5 rounded break-all">
                  {getApiBase()}/api/functions/twilio-status-callback
                </code>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
