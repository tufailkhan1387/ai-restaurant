import { useState } from "react";
import { Bell, Mail, Monitor, PhoneCall } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "react-i18next";

export function NotificationSettings() {
  const { t } = useTranslation(["settings", "common"]);

  const [notifications, setNotifications] = useState({
    email: true,
    desktop: true,
    missedCalls: true,
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Channel & System Notification Preferences */}
      <Card className="rounded-2xl border-border/80 shadow-sm overflow-hidden">
        <CardHeader className="border-b border-border/40 pb-4 bg-muted/15">
          <CardTitle className="text-base font-bold tracking-tight flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            {t("settings:otherNotifications", "Channel & System Notifications")}
          </CardTitle>
          <CardDescription className="text-xs">
            {t("settings:otherNotificationsDesc", "Configure additional notification channels and alert preferences")}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between p-3.5 rounded-xl border border-border/70 bg-card hover:border-primary/30 transition-colors">
            <div className="space-y-0.5 min-w-0 pr-3">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-primary" />
                <Label className="font-semibold text-sm cursor-pointer" htmlFor="email-notifs">
                  {t("settings:emailNotifications", "Email Notifications")}
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("settings:emailNotificationsDesc", "Receive instant email updates for new orders and daily summaries")}
              </p>
            </div>
            <Switch
              id="email-notifs"
              checked={notifications.email}
              onCheckedChange={(checked) => {
                setNotifications({ ...notifications, email: checked });
              }}
            />
          </div>

          <div className="flex items-center justify-between p-3.5 rounded-xl border border-border/70 bg-card hover:border-primary/30 transition-colors">
            <div className="space-y-0.5 min-w-0 pr-3">
              <div className="flex items-center gap-2">
                <Monitor className="h-4 w-4 text-primary" />
                <Label className="font-semibold text-sm cursor-pointer" htmlFor="desktop-notifs">
                  {t("settings:desktopNotifications", "Desktop Browser Popups")}
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("settings:desktopNotificationsDesc", "Show native browser notification alerts even when the tab is in the background")}
              </p>
            </div>
            <Switch
              id="desktop-notifs"
              checked={notifications.desktop}
              onCheckedChange={(checked) => {
                setNotifications({ ...notifications, desktop: checked });
                if (checked && "Notification" in window && Notification.permission !== "granted") {
                  Notification.requestPermission();
                }
              }}
            />
          </div>

          <div className="flex items-center justify-between p-3.5 rounded-xl border border-border/70 bg-card hover:border-primary/30 transition-colors">
            <div className="space-y-0.5 min-w-0 pr-3">
              <div className="flex items-center gap-2">
                <PhoneCall className="h-4 w-4 text-primary" />
                <Label className="font-semibold text-sm cursor-pointer" htmlFor="missed-calls">
                  {t("settings:missedCallAlerts", "Missed Call Alerts")}
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("settings:missedCallAlertsDesc", "Get notified about missed AI voice agent phone calls")}
              </p>
            </div>
            <Switch
              id="missed-calls"
              checked={notifications.missedCalls}
              onCheckedChange={(checked) => {
                setNotifications({ ...notifications, missedCalls: checked });
              }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
