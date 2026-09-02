import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

function csvEscape(v: any): string {
  if (v === null || v === undefined) return "";
  const s = String(v).replace(/\r?\n/g, " ").replace(/"/g, '""');
  return `"${s}"`;
}

export async function exportSessionToCsv(sessionId: string, sessionName: string) {
  const { data: leads, error } = await supabase
    .from("auto_dialer_leads")
    .select("*, call:calls(transcript, recording_url, duration_seconds), variant:auto_dialer_prompt_variants(label)")
    .eq("session_id", sessionId)
    .order("sort_order", { ascending: true });

  if (error) {
    toast({ variant: "destructive", title: "Export failed", description: error.message });
    return;
  }
  if (!leads || leads.length === 0) {
    toast({ variant: "destructive", title: "No leads to export" });
    return;
  }

  const headers = [
    "client_name", "company", "phone_number", "email", "pitched_for",
    "call_status", "interest_level", "variant",
    "called_at", "duration_seconds", "retry_count",
    "ai_summary", "transcript_preview", "recording_url",
    "sms_status", "sms_sent_at", "timezone",
  ];

  const rows = leads.map((l: any) => [
    l.client_name, l.company, l.phone_number, l.email, l.pitched_for,
    l.call_status, l.interest_level, l.variant?.label || "",
    l.called_at, l.call?.duration_seconds || 0, l.retry_count,
    l.ai_summary, (l.call?.transcript || "").slice(0, 500), l.call?.recording_url || "",
    l.sms_status, l.sms_sent_at, l.timezone,
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeName = sessionName.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  a.href = url;
  a.download = `${safeName}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  toast({ title: "CSV exported", description: `${leads.length} rows downloaded` });
}
