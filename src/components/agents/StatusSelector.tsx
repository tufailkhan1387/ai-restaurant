import { Circle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

type AgentStatus = "available" | "on_call" | "busy" | "offline" | "break";

const statusConfig: Record<AgentStatus, { label: string; colorClass: string }> = {
  available: { label: "Available", colorClass: "text-status-available" },
  on_call: { label: "On Call", colorClass: "text-status-on-call" },
  busy: { label: "Busy", colorClass: "text-status-busy" },
  offline: { label: "Offline", colorClass: "text-status-offline" },
  break: { label: "On Break", colorClass: "text-status-break" },
};

export function StatusSelector() {
  const { profile, updateStatus } = useAuth();
  const currentStatus = (profile?.status || "offline") as AgentStatus;

  const handleStatusChange = (value: string) => {
    updateStatus(value as AgentStatus);
  };

  return (
    <Select value={currentStatus} onValueChange={handleStatusChange}>
      <SelectTrigger className="w-[140px] bg-background">
        <div className="flex items-center gap-2">
          <Circle
            className={cn("h-2 w-2 fill-current", statusConfig[currentStatus].colorClass)}
          />
          <SelectValue />
        </div>
      </SelectTrigger>
      <SelectContent>
        {Object.entries(statusConfig).map(([status, config]) => (
          <SelectItem key={status} value={status}>
            <div className="flex items-center gap-2">
              <Circle className={cn("h-2 w-2 fill-current", config.colorClass)} />
              {config.label}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
