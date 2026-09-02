import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CampaignsList } from "@/components/outbound/CampaignsList";
import { LeadsDialer } from "@/components/outbound/LeadsDialer";
import { WebsiteAnalysis } from "@/components/outbound/WebsiteAnalysis";
import { MockupFollowups } from "@/components/outbound/MockupFollowups";
import { Phone, Upload, Globe, Mail } from "lucide-react";

export default function OutboundCalls() {
  const { t } = useTranslation(["calls", "common"]);
  const [activeTab, setActiveTab] = useState("campaigns");

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto pb-10">
      <div>
        <h1 className="text-3xl font-bold">{t("calls:outbound", "Outbound Calls")}</h1>
        <p className="text-muted-foreground mt-1">
          {t("calls:outboundSubtitle", "Manage campaigns, upload leads, and track outbound calling activities")}
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
          <TabsTrigger value="campaigns" className="gap-2">
            <Phone className="h-4 w-4" />
            <span className="hidden sm:inline">{t("calls:campaigns", "Campaigns")}</span>
          </TabsTrigger>
          <TabsTrigger value="dialer" className="gap-2">
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">{t("calls:previewDialer", "Preview Dialer")}</span>
          </TabsTrigger>
          <TabsTrigger value="analysis" className="gap-2">
            <Globe className="h-4 w-4" />
            <span className="hidden sm:inline">{t("calls:websiteAnalysis", "Website Analysis")}</span>
          </TabsTrigger>
          <TabsTrigger value="followups" className="gap-2">
            <Mail className="h-4 w-4" />
            <span className="hidden sm:inline">{t("calls:mockupFollowups", "Mockup Followups")}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="space-y-4">
          <CampaignsList />
        </TabsContent>

        <TabsContent value="dialer" className="space-y-4">
          <LeadsDialer />
        </TabsContent>

        <TabsContent value="analysis" className="space-y-4">
          <WebsiteAnalysis />
        </TabsContent>

        <TabsContent value="followups" className="space-y-4">
          <MockupFollowups />
        </TabsContent>
      </Tabs>
    </div>
  );
}

