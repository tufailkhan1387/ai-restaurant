import { useState, useEffect } from "react";
import { Phone, Mail, Mic, RefreshCw, Check, X, Loader2, Upload, Download } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { getApiBase } from "@/lib/apiBase";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation(["settings", "common"]);
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
        title: t("common:error", "Error"),
        description: t("settings:integrationCheckError", "Failed to check integration statuses"),
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
          title: action === "push"
            ? t("settings:knowledgeSynced", "Knowledge Synced")
            : t("settings:agentInfoRetrieved", "Agent Info Retrieved"),
          description: data.message || (action === "push"
            ? t("settings:knowledgeSyncedDesc", "Successfully pushed knowledge")
            : t("settings:agentInfoRetrievedDesc", "Successfully pulled knowledge")),
        });
      }
    } catch (error) {
      console.error("Sync failed:", error);
      toast({
        variant: "destructive",
        title: t("settings:syncFailed", "Sync Failed"),
        description: error instanceof Error ? error.message : t("common:unknownError", "Unknown error"),
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
          {t("settings:connected", "Connected")}
        </>
      ) : (
        <>
          <X className="h-3 w-3" />
          {t("settings:notConfigured", "Not configured")}
        </>
      )}
    </Badge>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{t("settings:integrationStatus", "Integration Status")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("settings:integrationStatusDesc", "View and manage your connected services")}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchStatuses} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          {t("common:refresh", "Refresh")}
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
            <CardDescription>{t("settings:twilioDesc", "Voice calling and SMS integration")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {statuses.twilio?.details && (
                <p className="text-sm text-muted-foreground">{statuses.twilio.details}</p>
              )}
              <div className="text-xs text-muted-foreground">
                <p>• {t("settings:twilioFeature1", "Handles inbound/outbound calls")}</p>
                <p>• {t("settings:twilioFeature2", "Status updates via webhook")}</p>
                <p>• {t("settings:twilioFeature3", "Connected to ElevenLabs for AI")}</p>
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
            <CardDescription>{t("settings:elevenlabsDesc", "AI voice synthesis & conversation")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {statuses.elevenlabs?.details && (
                <p className="text-sm text-muted-foreground">{statuses.elevenlabs.details}</p>
              )}
              <div className="text-xs text-muted-foreground mb-3">
                <p>• {t("settings:elevenlabsFeature1", "Powers AI voice agent")}</p>
                <p>• {t("settings:elevenlabsFeature2", "Native Twilio integration")}</p>
                <p>• {t("settings:elevenlabsFeature3", "Automatic lead qualification")}</p>
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
                    {t("settings:syncKnowledge", "Sync Knowledge")}
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
            <CardDescription>{t("settings:resendDesc", "Email sending integration")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-muted-foreground">
              <p>• {t("settings:resendFeature1", "Mockup email delivery")}</p>
              <p>• {t("settings:resendFeature2", "Follow-up automation")}</p>
              <p>• {t("settings:resendFeature3", "Transactional emails")}</p>
            </div>
          </CardContent>
        </Card>

        {/* Webhook Info Card */}
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-sm font-medium">{t("settings:webhookUrls", "Webhook URLs")}</CardTitle>
            <CardDescription>{t("settings:webhookUrlsDesc", "Configure these in your ElevenLabs dashboard")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-xs">
              <div>
                <p className="font-medium text-muted-foreground">{t("settings:conversationWebhook", "Conversation Webhook")}:</p>
                <code className="text-[10px] bg-muted px-1 py-0.5 rounded break-all">
                  {getApiBase()}/api/functions/elevenlabs-conversation-webhook
                </code>
              </div>
              <div>
                <p className="font-medium text-muted-foreground">{t("settings:twilioStatusCallback", "Twilio Status Callback")}:</p>
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
