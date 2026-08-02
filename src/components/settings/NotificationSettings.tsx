import { useEffect, useState } from "react";
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
import { useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export function NotificationSettings() {
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

  // Load from DB
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
          // Also update local storage for the actual sound engine
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
        title: "Error",
        description: "Failed to save notification preferences",
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
            <Bell className="h-5 w-5" />
            New Order Alerts
          </CardTitle>
          <CardDescription>
            The bell rings continuously when a new order arrives until you acknowledge it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable order ringtone</Label>
              <p className="text-sm text-muted-foreground">Play a sound on every new order</p>
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

          <div className="space-y-2">
            <Label>Ringtone</Label>
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
                <span className="ml-2">{playing ? "Stop" : "Test"}</span>
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Volume</Label>
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
            <Bell className="h-5 w-5" />
            Other Notifications
          </CardTitle>
          <CardDescription>General notification preferences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Email Notifications</Label>
              <p className="text-sm text-muted-foreground">Receive email updates for important events</p>
            </div>
            <Switch
              checked={notifications.email}
              onCheckedChange={(checked) => {
                setNotifications({ ...notifications, email: checked });
                handleSave({ notification_email: checked });
              }}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Desktop Notifications</Label>
              <p className="text-sm text-muted-foreground">Show browser notifications</p>
            </div>
            <Switch
              checked={notifications.desktop}
              onCheckedChange={(checked) => {
                setNotifications({ ...notifications, desktop: checked });
                handleSave({ notification_desktop: checked });
              }}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Missed Call Alerts</Label>
              <p className="text-sm text-muted-foreground">Get notified about missed calls</p>
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
        <div className="fixed bottom-4 right-4 bg-primary text-primary-foreground px-4 py-2 rounded-md shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-bottom-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          Saving changes...
        </div>
      )}
    </div>
  );
}
