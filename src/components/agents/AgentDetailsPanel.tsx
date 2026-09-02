import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Play, Pause, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Props {
  agentId: string; // local ai_agents.id
}

interface Details {
  agent_id: string;
  name: string | null;
  first_message: string | null;
  system_prompt: string | null;
  language: string | null;
  llm: string | null;
  temperature: number | null;
  voice: { voice_id: string; name: string; preview_url: string | null; category?: string } | null;
  text_only: boolean | null;
  tags: string[];
  access_level: string | null;
}

export function AgentDetailsPanel({ agentId }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["agent-details", agentId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("elevenlabs-agent-crud", {
        body: { action: "get_details", id: agentId },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to load details");
      return data.details as Details;
    },
    staleTime: 60_000,
  });

  const togglePlay = () => {
    const url = data?.voice?.preview_url;
    if (!url) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(url);
      audioRef.current.onended = () => setPlaying(false);
    }
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play();
      setPlaying(true);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading details…
      </div>
    );
  }

  if (error || !data) {
    return (
      <p className="text-xs text-destructive py-1">
        Couldn't load ElevenLabs details
      </p>
    );
  }

  return (
    <div className="space-y-2 text-xs">
      {/* Voice row with preview */}
      <div className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/50">
        <div className="flex items-center gap-2 min-w-0">
          <Volume2 className="h-3.5 w-3.5 text-primary shrink-0" />
          <div className="min-w-0">
            <p className="font-medium truncate">
              {data.voice?.name ?? "No voice configured"}
            </p>
            {data.voice?.category && (
              <p className="text-muted-foreground capitalize">{data.voice.category}</p>
            )}
          </div>
        </div>
        {data.voice?.preview_url && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 shrink-0"
            onClick={togglePlay}
            title={playing ? "Pause demo" : "Play voice demo"}
          >
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </Button>
        )}
      </div>

      {/* Meta badges */}
      <div className="flex flex-wrap gap-1">
        {data.language && (
          <Badge variant="outline" className="text-[10px]">
            Lang: {data.language.toUpperCase()}
          </Badge>
        )}
        {data.llm && (
          <Badge variant="outline" className="text-[10px]">
            LLM: {data.llm}
          </Badge>
        )}
        {data.temperature !== null && (
          <Badge variant="outline" className="text-[10px]">
            Temp: {data.temperature}
          </Badge>
        )}
        {data.text_only && (
          <Badge variant="destructive" className="text-[10px]">
            Text-only ⚠
          </Badge>
        )}
      </div>

      {data.first_message && (
        <div>
          <p className="text-muted-foreground mb-0.5">First message:</p>
          <p className="line-clamp-2 italic">"{data.first_message}"</p>
        </div>
      )}
    </div>
  );
}
