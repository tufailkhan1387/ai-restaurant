import { useEffect, useState, useRef } from "react";
import { Bell, Play, Square, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RINGTONES,
  RingtoneId,
  getRingtoneUrl,
  saveNotificationPrefs,
} from "@/lib/notificationSound";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

export function NotificationSettings() {
  const { t } = useTranslation(["settings", "common"]);
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);

  const [notifications, setNotifications] = useState({
    email: true,
    desktop: true,
    missedCalls: true,
  });

  const [orderPrefs, setOrderPrefs] = useState({
    ringtone: "classic-bell" as RingtoneId,
    volume: 0.9,
    enabled: true,
  });

  const previewRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const { data, error } = await supabase
          .from("restaurant_settings")
          .select("*")
          .maybeSingle();

        if (error) throw error;
        if (data) {
          setSettingsId(data.id);
          setNotifications({
            email: data.notification_email ?? true,
            desktop: data.notification_desktop ?? true,
            missedCalls: data.notification_missed_calls ?? true,
          });
          setOrderPrefs({
            ringtone: (data.notification_ringtone as RingtoneId) || "classic-bell",
            volume: Number(data.notification_volume) || 0.9,
            enabled: data.notification_enabled ?? true,
          });
          saveNotificationPrefs({
            ringtone: (data.notification_ringtone as RingtoneId) || "classic-bell",
            volume: Number(data.notification_volume) || 0.9,
            enabled: data.notification_enabled ?? true,
          });
        }
      } catch (err) {
        console.error("Failed to load notification settings:", err);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, []);

  const handleSave = async (updates: any) => {
    if (!settingsId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("restaurant_settings")
        .update(updates)
        .eq("id", settingsId);

      if (error) throw error;
    } catch (err) {
      console.error("Failed to save settings:", err);
      toast({
        variant: "destructive",
        title: t("common:error", "Error"),
        description: t("settings:saveError", "Failed to save notification preferences"),
      });
    } finally {
      setSaving(false);
    }
  };

  const togglePreview = async () => {
    if (playing) {
      previewRef.current?.pause();
      setPlaying(false);
      return;
    }
    const a = new Audio(getRingtoneUrl(orderPrefs.ringtone));
    a.volume = orderPrefs.volume;
    a.onended = () => setPlaying(false);
    previewRef.current = a;
    try {
      await a.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            {t("settings:newOrderAlerts", "New Order Alerts")}
          </CardTitle>
          <CardDescription>
            {t("settings:newOrderAlertsDesc", "The bell rings continuously when a new order arrives until you acknowledge it.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="setting-row">
            <div className="space-y-0.5 min-w-0">
              <Label>{t("settings:enableRingtone", "Enable order ringtone")}</Label>
              <p className="text-sm text-muted-foreground">{t("settings:enableRingtoneDesc", "Play a sound on every new order")}</p>
            </div>
            <Switch
              checked={orderPrefs.enabled}
              onCheckedChange={(checked) => {
                const newPrefs = { ...orderPrefs, enabled: checked };
                setOrderPrefs(newPrefs);
                saveNotificationPrefs(newPrefs);
                handleSave({ notification_enabled: checked });
              }}
            />
          </div>

          <div className="form-field">
            <Label>{t("settings:ringtone", "Ringtone")}</Label>
            <div className="flex gap-2">
              <Select
                value={orderPrefs.ringtone}
                onValueChange={(v) => {
                  const newPrefs = { ...orderPrefs, ringtone: v as RingtoneId };
                  setOrderPrefs(newPrefs);
                  saveNotificationPrefs(newPrefs);
                  handleSave({ notification_ringtone: v });
                }}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RINGTONES.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={togglePreview}>
                {playing ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                <span className="ml-2">{playing ? t("settings:stop", "Stop") : t("settings:test", "Test")}</span>
              </Button>
            </div>
          </div>

          <div className="form-field">
            <div className="flex items-center justify-between">
              <Label>{t("settings:volume", "Volume")}</Label>
              <span className="text-sm text-muted-foreground">
                {Math.round(orderPrefs.volume * 100)}%
              </span>
            </div>
            <Slider
              value={[orderPrefs.volume * 100]}
              min={0}
              max={100}
              step={5}
              onValueChange={([v]) => {
                const newVol = v / 100;
                setOrderPrefs({ ...orderPrefs, volume: newVol });
              }}
              onValueCommit={([v]) => {
                const newVol = v / 100;
                saveNotificationPrefs({ ...orderPrefs, volume: newVol });
                handleSave({ notification_volume: newVol });
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            {t("settings:otherNotifications", "Other Notifications")}
          </CardTitle>
          <CardDescription>{t("settings:otherNotificationsDesc", "General notification preferences")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="setting-row">
            <div className="space-y-0.5 min-w-0">
              <Label>{t("settings:emailNotifications", "Email Notifications")}</Label>
              <p className="text-sm text-muted-foreground">{t("settings:emailNotificationsDesc", "Receive email updates for important events")}</p>
            </div>
            <Switch
              checked={notifications.email}
              onCheckedChange={(checked) => {
                setNotifications({ ...notifications, email: checked });
                handleSave({ notification_email: checked });
              }}
            />
          </div>
          <div className="setting-row">
            <div className="space-y-0.5 min-w-0">
              <Label>{t("settings:desktopNotifications", "Desktop Notifications")}</Label>
              <p className="text-sm text-muted-foreground">{t("settings:desktopNotificationsDesc", "Show browser notifications")}</p>
            </div>
            <Switch
              checked={notifications.desktop}
              onCheckedChange={(checked) => {
                setNotifications({ ...notifications, desktop: checked });
                handleSave({ notification_desktop: checked });
              }}
            />
          </div>
          <div className="setting-row">
            <div className="space-y-0.5 min-w-0">
              <Label>{t("settings:missedCallAlerts", "Missed Call Alerts")}</Label>
              <p className="text-sm text-muted-foreground">{t("settings:missedCallAlertsDesc", "Get notified about missed calls")}</p>
            </div>
            <Switch
              checked={notifications.missedCalls}
              onCheckedChange={(checked) => {
                setNotifications({ ...notifications, missedCalls: checked });
                handleSave({ notification_missed_calls: checked });
              }}
            />
          </div>
        </CardContent>
      </Card>
      {saving && (
        <div className="fixed bottom-4 right-4 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-bottom-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("settings:savingChanges", "Saving changes...")}
        </div>
      )}
    </div>
  );
}
