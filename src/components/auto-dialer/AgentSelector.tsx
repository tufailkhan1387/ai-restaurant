import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Plus, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";

interface AgentSelectorProps {
  value?: string | null;
  onChange: (id: string | null) => void;
}

export function AgentSelector({ value, onChange }: AgentSelectorProps) {
  const queryClient = useQueryClient();

  const { data: agents, isLoading } = useQuery({
    queryKey: ["ai-agents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_agents")
        .select("*")
        .eq("is_active", true)
        .order("is_default", { ascending: false })
        .order("name");
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("ai-agents-selector-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_agents" }, () => {
        queryClient.invalidateQueries({ queryKey: ["ai-agents"] });
        queryClient.invalidateQueries({ queryKey: ["ai-agents-full"] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const syncAgents = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("elevenlabs-sync-agents");
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Sync failed");
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["ai-agents"] });
      queryClient.invalidateQueries({ queryKey: ["ai-agents-full"] });
      toast({
        title: "Agents refreshed",
        description: `Loaded ${data.total} live agent${data.total === 1 ? "" : "s"} from ElevenLabs.`,
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Could not refresh agents",
        description: error.message,
      });
    },
  });

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Select value={value ?? "default"} onValueChange={(v) => onChange(v === "default" ? null : v)}>
          <SelectTrigger>
            <SelectValue placeholder={isLoading ? "Loading AI agents..." : "Select AI agent"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Default Agent (workspace)</SelectItem>
            {agents?.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name} {a.is_default ? "★" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => syncAgents.mutate()}
          disabled={syncAgents.isPending}
          title="Refresh agents from ElevenLabs"
        >
          <RefreshCw className={`h-4 w-4 ${syncAgents.isPending ? "animate-spin" : ""}`} />
        </Button>

        <Button asChild type="button" variant="outline" size="icon" title="Manage agents">
          <Link to="/agents">
            <Plus className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Live agents refresh automatically. Use the refresh button to pull the latest from ElevenLabs now.
      </p>
    </div>
  );
}
