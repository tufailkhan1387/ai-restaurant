import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LiveStatsHeader } from "@/components/auto-dialer/LiveStatsHeader";
import { SessionsListView } from "@/components/auto-dialer/SessionsListView";
import { SessionDetailView } from "@/components/auto-dialer/SessionDetailView";

export default function AutoDialer() {
  const { t } = useTranslation(["calls", "common"]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto pb-10">
      <div>
        <h1 className="text-3xl font-bold">{t("calls:autoDialer", "AI Auto-Dialer")}</h1>
        <p className="text-muted-foreground mt-1">
          {t("calls:autoDialerDesc", "Upload client data, let AI analyze and call each contact automatically. Runs in the background — safe to close browser.")}
        </p>
      </div>

      <LiveStatsHeader />

      {activeSessionId ? (
        <SessionDetailView sessionId={activeSessionId} onBack={() => setActiveSessionId(null)} />
      ) : (
        <SessionsListView onSelect={setActiveSessionId} />
      )}
    </div>
  );
}

