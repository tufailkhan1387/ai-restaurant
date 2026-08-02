import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Upload, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  restaurantId: string | null;
  type: "deals" | "discounts";
  onImported: () => void;
}

/**
 * Bulk import deals OR discount codes from Excel/CSV.
 * Deals columns: name, description, price, original_price, image_url, starts_at, ends_at, is_active
 * Discounts columns: code, description, discount_type (percentage|fixed), discount_value,
 *   min_order_amount, max_uses, starts_at, ends_at, is_active
 */
export function DealsImportButton({ restaurantId, type, onImported }: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const downloadTemplate = () => {
    const sample =
      type === "deals"
        ? [
            {
              name: "Family Combo",
              description: "2 pizzas + drinks",
              price: 25,
              original_price: 32,
              image_url: "",
              starts_at: "",
              ends_at: "",
              is_active: true,
            },
          ]
        : [
            {
              code: "WELCOME10",
              description: "10% off first order",
              discount_type: "percentage",
              discount_value: 10,
              min_order_amount: 0,
              max_uses: 100,
              starts_at: "",
              ends_at: "",
              is_active: true,
            },
          ];
    const ws = XLSX.utils.json_to_sheet(sample);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, type);
    XLSX.writeFile(wb, `${type}-import-template.xlsx`);
  };

  const handleFile = async (file: File) => {
    if (!restaurantId) {
      toast({ variant: "destructive", title: "No active restaurant" });
      return;
    }
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
      if (!rows.length) {
        toast({ variant: "destructive", title: "Empty file" });
        return;
      }

      const truthy = (v: any) => String(v ?? "true").toLowerCase() !== "false";
      const dt = (v: any) => {
        const s = String(v ?? "").trim();
        return s ? new Date(s).toISOString() : null;
      };

      let payload: any[] = [];
      if (type === "deals") {
        payload = rows
          .map((r) => {
            const name = String(r.name ?? r.Name ?? "").trim();
            if (!name) return null;
            return {
              restaurant_id: restaurantId,
              name,
              description: String(r.description ?? "").trim() || null,
              price: Number(r.price ?? 0) || 0,
              original_price: r.original_price ? Number(r.original_price) : null,
              image_url: String(r.image_url ?? "").trim() || null,
              starts_at: dt(r.starts_at),
              ends_at: dt(r.ends_at),
              is_active: truthy(r.is_active),
            };
          })
          .filter(Boolean) as any[];
      } else {
        payload = rows
          .map((r) => {
            const code = String(r.code ?? r.Code ?? "").trim().toUpperCase();
            if (!code) return null;
            const dtype = String(r.discount_type ?? "percentage").trim().toLowerCase();
            return {
              restaurant_id: restaurantId,
              code,
              description: String(r.description ?? "").trim() || null,
              discount_type: dtype === "fixed" ? "fixed" : "percentage",
              discount_value: Number(r.discount_value ?? 0) || 0,
              min_order_amount: Number(r.min_order_amount ?? 0) || 0,
              max_uses: r.max_uses ? Number(r.max_uses) : null,
              starts_at: dt(r.starts_at),
              ends_at: dt(r.ends_at),
              is_active: truthy(r.is_active),
            };
          })
          .filter(Boolean) as any[];
      }

      if (!payload.length) {
        toast({ variant: "destructive", title: "No valid rows" });
        return;
      }
      const { error } = await supabase.from(type).insert(payload);
      if (error) throw error;
      toast({ title: `Imported ${payload.length} ${type}` });
      onImported();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Import failed", description: e.message });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      <Button variant="outline" size="sm" onClick={downloadTemplate}>
        <Download className="h-4 w-4 mr-1" />
        Template
      </Button>
      <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy || !restaurantId}>
        <Upload className="h-4 w-4 mr-1" />
        {busy ? "Importing…" : "Import Excel/CSV"}
      </Button>
    </>
  );
}