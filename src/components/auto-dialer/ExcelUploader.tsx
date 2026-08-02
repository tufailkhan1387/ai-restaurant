import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "@/hooks/use-toast";
import { FileSpreadsheet, AlertTriangle } from "lucide-react";
import * as XLSX from "xlsx";

interface ExcelUploaderProps {
  sessionId: string;
  onUploaded?: () => void;
}

function normalizePhone(raw: string): string {
  return raw.toString().trim().replace(/[^\d+]/g, "");
}

function detectCountryCode(phone: string): string {
  const p = phone.replace(/^\+/, "");
  if (p.startsWith("1") && p.length === 11) return "US/CA";
  if (p.startsWith("44")) return "UK";
  if (p.startsWith("92")) return "Pakistan";
  if (p.startsWith("91")) return "India";
  if (p.startsWith("971")) return "UAE";
  if (p.startsWith("61")) return "Australia";
  return "International";
}

// Phone country code → IANA timezone (best-guess; can be overridden in Excel "Timezone" column)
function inferTimezone(phone: string, fallback: string): string {
  const p = phone.replace(/^\+/, "");
  if (p.startsWith("1")) return fallback; // US/CA: keep session default (covers many TZs)
  if (p.startsWith("44")) return "Europe/London";
  if (p.startsWith("92")) return "Asia/Karachi";
  if (p.startsWith("91")) return "Asia/Kolkata";
  if (p.startsWith("971")) return "Asia/Dubai";
  if (p.startsWith("61")) return "Australia/Sydney";
  if (p.startsWith("33")) return "Europe/Paris";
  if (p.startsWith("49")) return "Europe/Berlin";
  if (p.startsWith("81")) return "Asia/Tokyo";
  if (p.startsWith("86")) return "Asia/Shanghai";
  if (p.startsWith("65")) return "Asia/Singapore";
  if (p.startsWith("63")) return "Asia/Manila";
  if (p.startsWith("234")) return "Africa/Lagos";
  if (p.startsWith("27")) return "Africa/Johannesburg";
  if (p.startsWith("55")) return "America/Sao_Paulo";
  if (p.startsWith("52")) return "America/Mexico_City";
  return fallback;
}

export function ExcelUploader({ sessionId, onUploaded }: ExcelUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const queryClient = useQueryClient();

  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || !sessionId) return;

      setIsUploading(true);
      setWarnings([]);

      try {
        // Load session for TZ default + variants
        const { data: session } = await supabase
          .from("auto_dialer_sessions")
          .select("default_timezone")
          .eq("id", sessionId)
          .maybeSingle();
        const fallbackTz = (session?.default_timezone as string) || "America/New_York";

        const { data: variants } = await supabase
          .from("auto_dialer_prompt_variants")
          .select("id, weight")
          .eq("session_id", sessionId);

        // Weighted variant picker
        const variantPool: string[] = [];
        if (variants && variants.length > 0) {
          for (const v of variants) {
            const w = Math.max(1, v.weight || 1);
            for (let i = 0; i < w; i++) variantPool.push(v.id);
          }
        }
        const pickVariant = (): string | null =>
          variantPool.length === 0
            ? null
            : variantPool[Math.floor(Math.random() * variantPool.length)];

        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        const leadsToInsert: any[] = [];
        const countries: Record<string, number> = {};
        const phoneCounts = new Map<string, number>();
        let emptyRowCount = 0;
        let missingPhoneCount = 0;
        let duplicatePhoneCount = 0;
        let nonUsSkippedCount = 0;

        jsonData.forEach((row: any, idx: number) => {
          // Skip fully empty rows silently
          const hasAnyValue = Object.values(row).some((v) => v !== null && v !== undefined && String(v).trim() !== "");
          if (!hasAnyValue) { emptyRowCount++; return; }

          const rawPhone = String(row["Phone"] || row["Phone Number"] || row.phone || row.phone_number || "").trim();
          if (!rawPhone) { missingPhoneCount++; return; }
          const phone = normalizePhone(rawPhone);
          if (!phone) { missingPhoneCount++; return; }

          // Track duplicates but DO NOT drop them — same phone may belong to different
          // contacts/businesses or be the test number for multiple leads.
          const prev = phoneCounts.get(phone) || 0;
          phoneCounts.set(phone, prev + 1);
          if (prev > 0) duplicatePhoneCount++;

          const country = detectCountryCode(phone);
          countries[country] = (countries[country] || 0) + 1;
          const isUsCa = country === "US/CA";
          if (!isUsCa) nonUsSkippedCount++;

          const tzOverride = String(row["Timezone"] || row["TZ"] || row.timezone || "").trim();
          const timezone = tzOverride || inferTimezone(phone, fallbackTz);

          const rawExt = String(row["Extension"] || row["Ext"] || row.extension || row.ext || "").trim();
          const extension = rawExt ? rawExt.replace(/[^\d#*]/g, "") : null;

          leadsToInsert.push({
            session_id: sessionId,
            client_name: row["Client Name"] || row["Name"] || row.name || row.client_name || null,
            email: row["Email"] || row.email || null,
            phone_number: phone,
            extension,
            company: row["Company"] || row.company || null,
            pitched_for: row["Pitched For"] || row["Service Pitched"] || row.pitched_for || null,
            services_done: row["Services Done"] || row["Work Done"] || row.services_done || null,
            additional_notes: row["Notes"] || row["Additional Notes"] || row.notes || null,
            sort_order: idx,
            analysis_status: isUsCa ? "pending" : "skipped",
            call_status: isUsCa ? "pending" : "skipped_non_us",
            timezone,
            variant_id: isUsCa ? pickVariant() : null,
          });
        });

        if (leadsToInsert.length === 0) {
          toast({
            variant: "destructive",
            title: "No valid leads found",
            description: `Parsed ${jsonData.length} rows. Missing phone in ${missingPhoneCount}, empty rows: ${emptyRowCount}. Make sure your file has a 'Phone' column.`,
          });
          return;
        }

        const newWarnings: string[] = [];
        if (duplicatePhoneCount > 0) {
          newWarnings.push(
            `${duplicatePhoneCount} row(s) share a phone number with another row — all will still be dialed (each row = one contact).`,
          );
        }
        if (missingPhoneCount > 0) {
          newWarnings.push(`${missingPhoneCount} row(s) skipped: missing or invalid phone number.`);
        }
        const nonUS = Object.entries(countries).filter(([c]) => c !== "US/CA");
        if (nonUS.length > 0) {
          for (const [country, count] of nonUS) {
            newWarnings.push(
              `${count} ${country} number(s) imported but will NOT be dialed (non-US/CA, marked skipped_non_us).`,
            );
          }
        }
        setWarnings(newWarnings);

        const { error } = await supabase.from("auto_dialer_leads").insert(leadsToInsert);
        if (error) throw error;

        await supabase
          .from("auto_dialer_sessions")
          .update({ total_leads: leadsToInsert.length })
          .eq("id", sessionId);

        // Log import event
        await supabase.from("auto_dialer_events").insert({
          session_id: sessionId,
          event_type: "leads_imported",
          message: `Imported ${leadsToInsert.length} leads from Excel (${nonUsSkippedCount} non-US skipped from dialing)`,
          metadata: {
            total_rows: jsonData.length,
            inserted: leadsToInsert.length,
            empty_rows: emptyRowCount,
            missing_phone: missingPhoneCount,
            duplicate_phone: duplicatePhoneCount,
            non_us_skipped: nonUsSkippedCount,
            countries,
          },
        });

        toast({
          title: "Leads uploaded",
          description: `${leadsToInsert.length} of ${jsonData.length} rows imported. AI analysis starting…`,
        });

        supabase.functions.invoke("analyze-auto-dialer-leads", { body: { sessionId } }).catch(console.error);

        queryClient.invalidateQueries({ queryKey: ["auto-dialer-leads", sessionId] });
        queryClient.invalidateQueries({ queryKey: ["auto-dialer-sessions"] });
        onUploaded?.();
      } catch (err: any) {
        toast({ variant: "destructive", title: "Upload failed", description: err.message });
      } finally {
        setIsUploading(false);
        event.target.value = "";
      }
    },
    [sessionId, queryClient, onUploaded],
  );

  return (
    <div className="space-y-3">
      <Label htmlFor="excel-upload-auto" className="cursor-pointer">
        <div className="inline-flex items-center gap-2 px-4 py-2 border rounded-md hover:bg-accent transition-colors">
          <FileSpreadsheet className="h-4 w-4" />
          {isUploading ? "Uploading & analyzing…" : "Upload Excel"}
        </div>
        <Input
          id="excel-upload-auto"
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={handleFileUpload}
          disabled={isUploading}
        />
      </Label>

      {warnings.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <div className="font-medium mb-1">Phone validation warnings:</div>
            <ul className="list-disc list-inside text-sm">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
            <a
              href="https://console.twilio.com/us1/develop/voice/settings/geo-permissions"
              target="_blank"
              rel="noopener"
              className="text-xs underline mt-1 inline-block"
            >
              Open Twilio Geo Permissions →
            </a>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
