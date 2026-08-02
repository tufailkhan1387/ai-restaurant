export type RingtoneId = "classic-bell" | "alert-chime" | "urgent-buzz" | "soft-ding";

export const RINGTONES: { id: RingtoneId; label: string; url: string }[] = [
  {
    id: "classic-bell",
    label: "Classic Bell",
    url: "https://assets.mixkit.co/active_storage/sfx/2558/2558-preview.mp3", // Service Bell
  },
  {
    id: "alert-chime",
    label: "Alert Chime",
    url: "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3", // Digital Chime
  },
  {
    id: "urgent-buzz",
    label: "Urgent Buzz",
    url: "https://assets.mixkit.co/active_storage/sfx/951/951-preview.mp3", // Alarm Buzz
  },
  {
    id: "soft-ding",
    label: "Soft Ding",
    url: "https://assets.mixkit.co/active_storage/sfx/3005/3005-preview.mp3", // Success Ding
  },
];

const STORAGE_KEY = "order_notification_prefs";

export interface NotificationPrefs {
  ringtone: RingtoneId;
  volume: number; // 0..1
  enabled: boolean;
}

const DEFAULT: NotificationPrefs = {
  ringtone: "classic-bell",
  volume: 0.9,
  enabled: true,
};

export function loadNotificationPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    return DEFAULT;
  }
}

export function saveNotificationPrefs(prefs: NotificationPrefs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  window.dispatchEvent(new CustomEvent("notification-prefs-changed", { detail: prefs }));
}

export function getRingtoneUrl(id: RingtoneId): string {
  return RINGTONES.find((r) => r.id === id)?.url ?? RINGTONES[0].url;
}