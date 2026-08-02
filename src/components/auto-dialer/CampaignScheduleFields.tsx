import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const WEEKDAYS = [
  { value: "1", label: "Mon" }, { value: "2", label: "Tue" }, { value: "3", label: "Wed" },
  { value: "4", label: "Thu" }, { value: "5", label: "Fri" }, { value: "6", label: "Sat" }, { value: "0", label: "Sun" },
];

export interface ScheduleValue {
  startNow: boolean;
  startAt: Date | null;
  startTime: string; // HH:mm
  endAt: Date | null;
  endTime: string;
  weekdays: number[]; // 0-6 (Sun-Sat)
  bypassWindow: boolean; // when true, ignore dialing window + weekdays + timezone
}

export const defaultSchedule: ScheduleValue = {
  startNow: true,
  startAt: null,
  startTime: "09:00",
  endAt: null,
  endTime: "18:00",
  weekdays: [1, 2, 3, 4, 5], // Mon-Fri default
  bypassWindow: false,
};

interface Props {
  value: ScheduleValue;
  onChange: (v: ScheduleValue) => void;
}

function combineDateTime(date: Date | null, time: string): Date | null {
  if (!date) return null;
  const [h, m] = time.split(":").map((x) => parseInt(x, 10));
  const d = new Date(date);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

export function CampaignScheduleFields({ value, onChange }: Props) {
  const set = (patch: Partial<ScheduleValue>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-4 pt-2 border-t">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <Label>Start dialing immediately</Label>
          <p className="text-xs text-muted-foreground">
            {value.startNow ? "Campaign starts running as soon as leads are uploaded & analyzed" : "Schedule a future start time"}
          </p>
        </div>
        <Switch checked={value.startNow} onCheckedChange={(v) => set({ startNow: v })} />
      </div>

      {value.startNow && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div className="space-y-0.5">
            <Label className="text-primary">Override window, weekdays & timezone</Label>
            <p className="text-xs text-muted-foreground">
              {value.bypassWindow
                ? "⚠️ Dialing 24/7 — ignores 9-6 window, weekday rules, and lead timezones."
                : "Recommended off for production. Turn on for testing or urgent campaigns."}
            </p>
          </div>
          <Switch checked={value.bypassWindow} onCheckedChange={(v) => set({ bypassWindow: v })} />
        </div>
      )}

      {!value.startNow && (
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Start date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !value.startAt && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {value.startAt ? format(value.startAt, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={value.startAt || undefined}
                  onSelect={(d) => set({ startAt: d || null })}
                  disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-2">
            <Label>Start time</Label>
            <Input type="time" value={value.startTime} onChange={(e) => set({ startTime: e.target.value })} />
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="flex items-center gap-1"><Clock className="h-3 w-3" /> Auto-stop date <span className="text-xs text-muted-foreground">(optional)</span></Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !value.endAt && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {value.endAt ? format(value.endAt, "PPP") : "No end date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={value.endAt || undefined}
                onSelect={(d) => set({ endAt: d || null })}
                disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
          {value.endAt && (
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => set({ endAt: null })}>Clear end date</Button>
          )}
        </div>
        <div className="space-y-2">
          <Label>End time</Label>
          <Input type="time" value={value.endTime} onChange={(e) => set({ endTime: e.target.value })} disabled={!value.endAt} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Allowed weekdays</Label>
        <ToggleGroup
          type="multiple"
          value={value.weekdays.map(String)}
          onValueChange={(vals) => set({ weekdays: vals.map((v) => parseInt(v, 10)).sort() })}
          className="justify-start flex-wrap"
        >
          {WEEKDAYS.map((d) => (
            <ToggleGroupItem key={d.value} value={d.value} size="sm" className="px-3">
              {d.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="text-xs text-muted-foreground">
          Dialing is paused on unselected days. Currently allowed: {value.weekdays.length} day(s).
        </p>
      </div>
    </div>
  );
}

export function scheduleToDbFields(s: ScheduleValue) {
  const startDt = s.startNow ? null : combineDateTime(s.startAt, s.startTime);
  const endDt = combineDateTime(s.endAt, s.endTime);
  return {
    scheduled_start_at: startDt ? startDt.toISOString() : null,
    scheduled_end_at: endDt ? endDt.toISOString() : null,
    allowed_weekdays: s.weekdays.length === 0 ? [0, 1, 2, 3, 4, 5, 6] : s.weekdays,
    bypass_schedule_window: s.startNow && s.bypassWindow,
    // Start instantly campaigns go straight to "running"; scheduled ones wait for cron
    initial_status: s.startNow ? "running" : "scheduled",
  };
}
