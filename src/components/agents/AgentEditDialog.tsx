import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

export interface AgentEditorValue {
  // Local row id (undefined = create flow)
  id?: string;
  name: string;
  description: string;
  voice_id: string | null;
  system_prompt: string;
  first_message: string;
}

interface Voice {
  voice_id: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
}

interface Props {
  open: boolean;
  initial: AgentEditorValue | null;
  onOpenChange: (o: boolean) => void;
  onSaved?: () => void;
}

export function AgentEditDialog({ open, initial, onOpenChange, onSaved }: Props) {
  const qc = useQueryClient();
  const isCreate = !initial?.id;
  const [form, setForm] = useState<AgentEditorValue>(
    initial ?? {
      name: "",
      description: "",
      voice_id: null,
      system_prompt: "",
      first_message: "",
    },
  );

  // Track which agent we've hydrated from live EL details (declared early so reset block can clear it)
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);

  // Reset form when dialog opens with new initial
  const [lastInitial, setLastInitial] = useState(initial);
  if (initial !== lastInitial) {
    setLastInitial(initial);
    setHydratedFor(null);
    setForm(
      initial ?? {
        name: "",
        description: "",
        voice_id: null,
        system_prompt: "",
        first_message: "",
      },
    );
  }

  const { data: voices, isLoading: loadingVoices } = useQuery({
    queryKey: ["elevenlabs-voices"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("elevenlabs-agent-crud", {
        body: { action: "list_voices" },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to load voices");
      return data.voices as Voice[];
    },
    staleTime: 5 * 60_000,
  });

  // When editing, fetch fresh details from ElevenLabs so voice_id, prompt, first_message
  // reflect the live state instead of the (potentially stale) local row.
  const { data: liveDetails } = useQuery({
    queryKey: ["agent-details", form.id],
    enabled: open && !isCreate && !!form.id,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("elevenlabs-agent-crud", {
        body: { action: "get_details", id: form.id },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to load details");
      return data.details as {
        voice: { voice_id: string } | null;
        first_message: string | null;
        system_prompt: string | null;
      };
    },
    staleTime: 60_000,
  });

  // Hydrate form once per agent with live EL details (don't overwrite user edits)
  if (liveDetails && form.id && hydratedFor !== form.id) {
    setHydratedFor(form.id);
    setForm((f) => ({
      ...f,
      voice_id: liveDetails.voice?.voice_id ?? f.voice_id ?? null,
      first_message: f.first_message || liveDetails.first_message || "",
      system_prompt: f.system_prompt || liveDetails.system_prompt || "",
    }));
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Name is required");
      const body: any = isCreate
        ? {
            action: "create",
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            voice_id: form.voice_id || null,
            system_prompt: form.system_prompt.trim() || undefined,
            first_message: form.first_message.trim() || undefined,
          }
        : {
            action: "update",
            id: form.id,
            name: form.name.trim(),
            description: form.description.trim(),
            voice_id: form.voice_id,
            system_prompt: form.system_prompt,
            first_message: form.first_message,
          };
      const { data, error } = await supabase.functions.invoke("elevenlabs-agent-crud", { body });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Save failed");
      return data;
    },
    onSuccess: async () => {
      toast.success(isCreate ? "Agent created in ElevenLabs" : "Agent updated in ElevenLabs");
      // Re-sync from ElevenLabs so local rows get fresh voice_id, prompt, first_message
      try {
        await supabase.functions.invoke("elevenlabs-sync-agents");
      } catch (_) {
        // best-effort
      }
      qc.invalidateQueries({ queryKey: ["ai-agents-full"] });
      qc.invalidateQueries({ queryKey: ["ai-agents"] });
      qc.invalidateQueries({ queryKey: ["agent-details"] });
      onSaved?.();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isCreate ? "Create new agent" : `Edit ${initial?.name ?? "agent"}`}</DialogTitle>
          <DialogDescription>
            Changes are pushed to ElevenLabs and synced locally. Voice changes apply to all calls.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="agent-name">Name *</Label>
            <Input
              id="agent-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="QubeTech Lead Qualifier"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="agent-desc">Description</Label>
            <Input
              id="agent-desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What this agent is for"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Voice</Label>
            <Select
              value={form.voice_id ?? "__keep__"}
              onValueChange={(v) => setForm({ ...form, voice_id: v === "__keep__" ? null : v })}
              disabled={loadingVoices}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingVoices ? "Loading voices…" : "Select a voice"} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="__keep__">— No change —</SelectItem>
                {voices?.map((v) => (
                  <SelectItem key={v.voice_id} value={v.voice_id}>
                    {v.name}
                    {v.category ? ` · ${v.category}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="agent-first">First message</Label>
            <Textarea
              id="agent-first"
              rows={2}
              value={form.first_message}
              onChange={(e) => setForm({ ...form, first_message: e.target.value })}
              placeholder="Hi, this is QubeTech calling..."
            />
            <p className="text-xs text-muted-foreground">
              The first thing the agent says when the call connects. Can be overridden per-lead.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="agent-prompt">System prompt</Label>
            <Textarea
              id="agent-prompt"
              rows={8}
              value={form.system_prompt}
              onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
              placeholder="You are a sales agent for QubeTech..."
              className="font-mono text-xs"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {isCreate ? "Create agent" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
