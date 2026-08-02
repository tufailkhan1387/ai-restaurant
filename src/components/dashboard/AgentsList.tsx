import { Circle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type AgentStatus = "available" | "on_call" | "busy" | "offline" | "break";

interface Agent {
  id: string;
  name: string;
  avatar?: string;
  status: AgentStatus;
  extension: string;
  calls_today: number;
}

const mockAgents: Agent[] = [
  { id: "1", name: "Alice Chen", status: "available", extension: "101", calls_today: 23 },
  { id: "2", name: "Bob Martinez", status: "on_call", extension: "102", calls_today: 18 },
  { id: "3", name: "Carol White", status: "busy", extension: "103", calls_today: 31 },
  { id: "4", name: "David Kim", status: "break", extension: "104", calls_today: 15 },
  { id: "5", name: "Emma Brown", status: "available", extension: "105", calls_today: 27 },
  { id: "6", name: "Frank Wilson", status: "offline", extension: "106", calls_today: 0 },
];

const statusConfig: Record<AgentStatus, { label: string; colorClass: string }> = {
  available: { label: "Available", colorClass: "text-status-available" },
  on_call: { label: "On Call", colorClass: "text-status-on-call" },
  busy: { label: "Busy", colorClass: "text-status-busy" },
  offline: { label: "Offline", colorClass: "text-status-offline" },
  break: { label: "On Break", colorClass: "text-status-break" },
};

export function AgentsList() {
  const onlineCount = mockAgents.filter((a) => a.status !== "offline").length;

  return (
    <Card className="border-border">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Team Status</CardTitle>
          <span className="text-sm text-muted-foreground">
            {onlineCount}/{mockAgents.length} online
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[300px]">
          <div className="space-y-2 px-6 pb-6">
            {mockAgents.map((agent) => (
              <div
                key={agent.id}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={agent.avatar} />
                      <AvatarFallback className="bg-primary/10 text-primary text-sm">
                        {agent.name.split(" ").map((n) => n[0]).join("")}
                      </AvatarFallback>
                    </Avatar>
                    <Circle
                      className={cn(
                        "absolute -bottom-0.5 -right-0.5 h-3 w-3 fill-current rounded-full border-2 border-card",
                        statusConfig[agent.status].colorClass
                      )}
                    />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{agent.name}</p>
                    <p className="text-xs text-muted-foreground">Ext. {agent.extension}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">{agent.calls_today}</p>
                  <p className="text-xs text-muted-foreground">calls today</p>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
