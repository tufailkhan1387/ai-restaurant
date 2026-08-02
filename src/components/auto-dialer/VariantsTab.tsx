import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Variant {
  id: string;
  session_id: string;
  label: string;
  system_prompt_override: string | null;
  first_message_override: string | null;
  weight: number;
  is_control: boolean;
}

interface Props { sessionId: string; }

export function VariantsTab({ sessionId }: Props) {
  const qc = useQueryClient();

  const { data: variants } = useQuery({
    queryKey: ["variants", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("auto_dialer_prompt_variants")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Variant[];
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["variant-stats", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("auto_dialer_leads")
        .select("variant_id, call_status, interest_level")
        .eq("session_id", sessionId);
      if (error) throw error;
      const map: Record<string, { total: number; completed: number; interested: number }> = {};
      for (const l of data || []) {
        const k = (l as any).variant_id || "__none__";
        if (!map[k]) map[k] = { total: 0, completed: 0, interested: 0 };
        map[k].total++;
        if (l.call_status === "completed") map[k].completed++;
        if (["high", "medium"].includes((l as any).interest_level || "")) map[k].interested++;
      }
      return map;
    },
  });

  const addVariant = useMutation({
    mutationFn: async () => {
      const nextLabel = String.fromCharCode(65 + (variants?.length || 0)); // A, B, C...
      const { error } = await supabase.from("auto_dialer_prompt_variants").insert({
        session_id: sessionId,
        label: nextLabel,
        weight: 50,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["variants", sessionId] }),
  });

  const updateVariant = useMutation({
    mutationFn: async (v: Partial<Variant> & { id: string }) => {
      const { error } = await supabase
        .from("auto_dialer_prompt_variants")
        .update({
          label: v.label,
          system_prompt_override: v.system_prompt_override,
          first_message_override: v.first_message_override,
          weight: v.weight,
        })
        .eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["variants", sessionId] });
      toast({ title: "Variant saved" });
    },
  });

  const deleteVariant = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("auto_dialer_prompt_variants").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["variants", sessionId] }),
  });

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-4 text-sm space-y-1">
          <p className="font-medium">What are A/B variants?</p>
          <p className="text-muted-foreground">
            A/B variants let you test <strong>different opening lines or system prompts</strong> on the same lead list.
            Each lead is randomly assigned a variant by weight at upload time, so you can compare which version
            converts more leads to "interested". Stats below update as calls complete.
          </p>
          <p className="text-muted-foreground text-xs">
            Example: Variant A opens with "Hi, this is QubeTech…" and Variant B opens with "Hey, quick question about your website…".
            Whichever has the higher interest rate wins. <strong>Skip this section if you only want one prompt</strong> — leads will use the default agent prompt.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-semibold">Prompt Variants</h3>
          <p className="text-sm text-muted-foreground">
            Leads are assigned by weight at upload. Leave empty to use the default agent prompt.
          </p>
        </div>
        <Button size="sm" onClick={() => addVariant.mutate()} disabled={addVariant.isPending}>
          <Plus className="h-4 w-4 mr-1" /> Add Variant
        </Button>
      </div>

      {(!variants || variants.length === 0) && (
        <Card><CardContent className="pt-6 text-center text-muted-foreground text-sm">
          No variants yet. Without variants, all leads use the default agent prompt — that's perfectly fine.
        </CardContent></Card>
      )}

      <div className="grid gap-3">
        {variants?.map((v) => {
          const s = stats?.[v.id] || { total: 0, completed: 0, interested: 0 };
          const conv = s.completed > 0 ? Math.round((s.interested / s.completed) * 100) : 0;
          return (
            <Card key={v.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">Variant {v.label}</CardTitle>
                  <Button variant="ghost" size="icon" onClick={() => { if (confirm("Delete variant?")) deleteVariant.mutate(v.id); }}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                <CardDescription className="text-xs">
                  {s.total} assigned · {s.completed} completed · {s.interested} interested
                  {s.completed > 0 && ` · ${conv}% interest rate`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Label</Label>
                    <Input
                      defaultValue={v.label}
                      onBlur={(e) => e.target.value !== v.label && updateVariant.mutate({ id: v.id, label: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Weight: {v.weight}</Label>
                    <Slider
                      defaultValue={[v.weight]}
                      min={1} max={100} step={1}
                      onValueCommit={(val) => updateVariant.mutate({ id: v.id, weight: val[0] })}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">First Message Override (optional)</Label>
                  <Textarea
                    rows={2}
                    placeholder="Leave blank to use default opening line"
                    defaultValue={v.first_message_override || ""}
                    onBlur={(e) => updateVariant.mutate({ id: v.id, first_message_override: e.target.value || null })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">System Prompt Override (optional)</Label>
                  <Textarea
                    rows={4}
                    placeholder="Leave blank to use AI-generated pitch script"
                    defaultValue={v.system_prompt_override || ""}
                    onBlur={(e) => updateVariant.mutate({ id: v.id, system_prompt_override: e.target.value || null })}
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
