import React, { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { MessageSquare } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

interface AIChatTestProps {
  agentId: string;
}

export const AIChatTest: React.FC<AIChatTestProps> = ({ agentId }) => {
  useEffect(() => {
    // Load official ElevenLabs widget embed script
    const scriptId = "elevenlabs-convai-widget-embed";
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (existing) return;

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = "https://unpkg.com/@elevenlabs/convai-widget-embed";
    script.async = true;
    script.type = "text/javascript";
    document.body.appendChild(script);

    return () => {
      // Keep script cached for future openings
    };
  }, []);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" className="gap-2">
          <MessageSquare className="h-4 w-4" />
          Test Chat
        </Button>
      </SheetTrigger>
      <SheetContent className="sm:max-w-md flex flex-col h-full overflow-hidden">
        <SheetHeader>
          <SheetTitle>AI Agent Chat Test</SheetTitle>
        </SheetHeader>
        
        <div className="flex-1 mt-8 flex items-center justify-center border rounded-xl bg-white shadow-inner relative overflow-hidden">
          {/* Official ElevenLabs Widget Element */}
          <elevenlabs-convai
            agent-id={agentId}
            variant="full"
            action-text="Order by chat"
            start-call-text="Start call"
          ></elevenlabs-convai>
          
          <style dangerouslySetInnerHTML={{ __html: `
            elevenlabs-convai {
              position: absolute !important;
              inset: 0 !important;
              width: 100% !important;
              height: 100% !important;
              z-index: 10 !important;
            }
          ` }} />
        </div>
        
        <div className="mt-4 text-[10px] text-muted-foreground text-center uppercase tracking-widest">
          ElevenLabs Conversational AI
        </div>
      </SheetContent>
    </Sheet>
  );
};

// Add type definition for the custom element
declare global {
  namespace JSX {
    interface IntrinsicElements {
      "elevenlabs-convai": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          "agent-id": string;
          variant?: string;
          "action-text"?: string;
          "start-call-text"?: string;
        },
        HTMLElement
      >;
    }
  }
}
