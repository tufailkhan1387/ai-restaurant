import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Bell,
  BellRing,
  Volume2,
  VolumeX,
  Volume1,
  Play,
  Square,
  Repeat,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  NotificationPrefs,
  loadNotificationPrefs,
  saveNotificationPrefs,
  playNotificationSound,
  startNotificationLoop,
  stopNotificationLoop,
} from "@/lib/notificationSound";
import { cn } from "@/lib/utils";

interface BellSoundPickerProps {
  restaurantId?: string | null;
  onSaved?: (prefs: NotificationPrefs) => void;
  className?: string;
  showCardWrapper?: boolean;
}

export function BellSoundPicker({
  restaurantId,
  onSaved,
  className,
  showCardWrapper = true,
}: BellSoundPickerProps) {
  const { t } = useTranslation(["settings", "orders", "common"]);

  const [prefs, setPrefs] = useState<NotificationPrefs>(() => {
    const p = loadNotificationPrefs(restaurantId);
    return { ...p, ringtone: "classic-bell" };
  });

  const [isPlayingTest, setIsPlayingTest] = useState(false);
  const [isLoopTesting, setIsLoopTesting] = useState(false);
  const stopTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const p = loadNotificationPrefs(restaurantId);
    setPrefs({ ...p, ringtone: "classic-bell" });
  }, [restaurantId]);

  useEffect(() => {
    return () => {
      stopNotificationLoop();
      if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
    };
  }, []);

  const handleTestPlay = () => {
    if (isPlayingTest || isLoopTesting) {
      stopNotificationLoop();
      setIsPlayingTest(false);
      setIsLoopTesting(false);
      return;
    }

    stopNotificationLoop();
    if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
    setIsPlayingTest(true);
    playNotificationSound("classic-bell", prefs.volume);

    stopTimeoutRef.current = window.setTimeout(() => {
      setIsPlayingTest(false);
    }, 1800);
  };

  const handleToggleLoopTest = () => {
    if (isLoopTesting) {
      stopNotificationLoop();
      setIsLoopTesting(false);
      setIsPlayingTest(false);
    } else {
      setIsLoopTesting(true);
      setIsPlayingTest(false);
      startNotificationLoop("classic-bell", prefs.volume, 2600);
    }
  };

  const handleVolumeChange = (newVolPct: number) => {
    const vol = newVolPct / 100;
    const updated: NotificationPrefs = { ...prefs, volume: vol, ringtone: "classic-bell" };
    setPrefs(updated);
    saveNotificationPrefs(updated, restaurantId);
    onSaved?.(updated);
  };

  const handleToggleEnabled = (enabled: boolean) => {
    const updated: NotificationPrefs = { ...prefs, enabled, ringtone: "classic-bell" };
    setPrefs(updated);
    saveNotificationPrefs(updated, restaurantId);
    onSaved?.(updated);
    if (!enabled) {
      stopNotificationLoop();
      setIsLoopTesting(false);
      setIsPlayingTest(false);
    }
  };

  const handleToggleRepeat = (repeatUntilAcknowledged: boolean) => {
    const updated: NotificationPrefs = { ...prefs, repeatUntilAcknowledged, ringtone: "classic-bell" };
    setPrefs(updated);
    saveNotificationPrefs(updated, restaurantId);
    onSaved?.(updated);
  };

  const content = (
    <div className="space-y-5">
      {/* Active Bell Tone Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-primary/20 bg-primary/5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center text-xl shrink-0">
            🔔
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-foreground">Classic Dinner Bell</span>
              <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30 font-semibold">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Active Bell
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Traditional counter bell strike with warm resonance for new order alerts.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
          <Button
            type="button"
            variant={isPlayingTest ? "default" : "outline"}
            size="sm"
            className="h-8 px-3 text-xs font-semibold rounded-lg gap-1.5"
            onClick={handleTestPlay}
            disabled={!prefs.enabled}
          >
            {isPlayingTest ? (
              <>
                <Square className="h-3 w-3 fill-current" />
                <span>Stop</span>
              </>
            ) : (
              <>
                <Play className="h-3 w-3 fill-current" />
                <span>Test Bell Sound</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Enable & Continuous Ringing Toggles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex items-center justify-between p-4 rounded-xl border border-border/80 bg-card hover:border-primary/30 transition-colors">
          <div className="space-y-0.5 min-w-0 pr-3">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              <Label className="font-semibold text-sm cursor-pointer" htmlFor="bell-sound-toggle">
                {t("settings:enableRingtone", "Order Sound Alert")}
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("settings:enableRingtoneDesc", "Play Classic Dinner Bell on incoming orders")}
            </p>
          </div>
          <Switch
            id="bell-sound-toggle"
            checked={prefs.enabled}
            onCheckedChange={handleToggleEnabled}
          />
        </div>

        <div className="flex items-center justify-between p-4 rounded-xl border border-border/80 bg-card hover:border-primary/30 transition-colors">
          <div className="space-y-0.5 min-w-0 pr-3">
            <div className="flex items-center gap-2">
              <Repeat className="h-4 w-4 text-primary" />
              <Label className="font-semibold text-sm cursor-pointer" htmlFor="bell-repeat-toggle">
                {t("settings:continuousRinging", "Continuous Ringing")}
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("settings:continuousRingingDesc", "Keep ringing until order is acknowledged")}
            </p>
          </div>
          <Switch
            id="bell-repeat-toggle"
            checked={prefs.repeatUntilAcknowledged ?? true}
            disabled={!prefs.enabled}
            onCheckedChange={handleToggleRepeat}
          />
        </div>
      </div>

      {/* Volume Slider & Full Alarm Test */}
      <div className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1 min-w-[200px] flex-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                {prefs.volume === 0 ? (
                  <VolumeX className="h-4 w-4 text-muted-foreground" />
                ) : prefs.volume < 0.5 ? (
                  <Volume1 className="h-4 w-4 text-primary" />
                ) : (
                  <Volume2 className="h-4 w-4 text-primary" />
                )}
                {t("settings:volume", "Sound Volume")}
              </Label>
              <span className="text-xs font-extrabold text-foreground tabular-nums">
                {Math.round(prefs.volume * 100)}%
              </span>
            </div>

            <Slider
              value={[prefs.volume * 100]}
              min={0}
              max={100}
              step={5}
              disabled={!prefs.enabled}
              onValueChange={([v]) => handleVolumeChange(v)}
              className="py-1"
            />
          </div>

          <div className="flex items-center gap-2 sm:self-end">
            <Button
              type="button"
              variant={isLoopTesting ? "destructive" : "secondary"}
              size="sm"
              disabled={!prefs.enabled}
              onClick={handleToggleLoopTest}
              className="h-9 px-3 rounded-lg font-semibold gap-1.5 shadow-xs"
            >
              {isLoopTesting ? (
                <>
                  <Square className="h-3.5 w-3.5 fill-current" />
                  <span>Stop Alarm Test</span>
                </>
              ) : (
                <>
                  <BellRing className="h-3.5 w-3.5" />
                  <span>Test Incoming Order Alarm</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  if (!showCardWrapper) {
    return <div className={className}>{content}</div>;
  }

  return (
    <Card className={cn("rounded-2xl border-border/80 shadow-sm overflow-hidden", className)}>
      <CardHeader className="border-b border-border/40 pb-4 bg-muted/15">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-base font-bold tracking-tight">
              {t("settings:notificationBellSettings", "Order Notification Bell")}
            </CardTitle>
            <CardDescription className="text-xs">
              {t(
                "settings:notificationBellSettingsDesc",
                "Classic Dinner Bell settings for incoming order audio alerts"
              )}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-5">{content}</CardContent>
    </Card>
  );
}
