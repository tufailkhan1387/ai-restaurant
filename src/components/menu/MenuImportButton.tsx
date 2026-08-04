import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  restaurantId: string | null;
  onImported: () => void;
}

/**
 * Bulk import menu items from Excel/CSV.
 * Expected columns (case-insensitive): name, category, price, description,
 * prep_time_minutes, image_url, dietary_tags, spice_level, is_available.
 * Categories are auto-created if missing.
 */
export function MenuImportButton({ restaurantId, onImported }: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

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

      // Existing categories
      const { data: cats } = await supabase
        .from("menu_categories")
        .select("id, name")
        .eq("restaurant_id", restaurantId);
      const catMap = new Map<string, string>(
        ((cats as any[]) ?? []).map((c: any) => [String(c.name).trim().toLowerCase(), c.id])
      );

      // Create missing categories
      const newCatNames = Array.from(
        new Set(
          rows
            .map((r) => String(r.category ?? r.Category ?? "").trim())
            .filter((n) => n && !catMap.has(n.toLowerCase()))
        )
      );
      if (newCatNames.length) {
        const { data: inserted, error } = await supabase
          .from("menu_categories")
          .insert(newCatNames.map((name) => ({ restaurant_id: restaurantId, name })))
          .select("id, name");
        if (error) throw error;
        (inserted as any[])?.forEach((c: any) => catMap.set(c.name.toLowerCase(), c.id));
      }

      const items = rows
        .map((r) => {
          const name = String(r.name ?? r.Name ?? "").trim();
          if (!name) return null;
          const catName = String(r.category ?? r.Category ?? "").trim().toLowerCase();
          const tagsRaw = String(r.dietary_tags ?? r.tags ?? "").trim();
          return {
            restaurant_id: restaurantId,
            name,
            description: String(r.description ?? "").trim() || null,
            price: Number(r.price ?? 0) || 0,
            prep_time_minutes: Number(r.prep_time_minutes ?? 15) || 15,
            image_url: String(r.image_url ?? "").trim() || null,
            dietary_tags: tagsRaw
              ? tagsRaw.split(/[,;|]/).map((t) => t.trim()).filter(Boolean)
              : [],
            spice_level: Number(r.spice_level ?? 0) || 0,
            is_available:
              String(r.is_available ?? "true").toLowerCase() !== "false",
            category_id: catName ? catMap.get(catName) ?? null : null,
          };
        })
        .filter(Boolean) as any[];

      if (!items.length) {
        toast({ variant: "destructive", title: "No valid rows", description: "Each row needs a 'name' value." });
        return;
      }

      const { error } = await supabase.from("menu_items").insert(items);
      if (error) throw error;
      toast({ title: `Imported ${items.length} item${items.length === 1 ? "" : "s"}` });
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
      <Button
        variant="outline"
        onClick={() => fileRef.current?.click()}
        disabled={busy || !restaurantId}
      >
        <Upload className="h-4 w-4 mr-1" />
        {busy ? "Importing…" : "Import Excel/CSV"}
      </Button>
    </>
  );
}