import { Info } from "lucide-react";
import type { PeerConnectionState, RelayType } from "@/lib/types";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

const stateConfig: Record<PeerConnectionState, { label: string; className: string }> = {
  connecting: { label: "Connecting", className: "bg-warning/20 text-warning" },
  connected: { label: "Connected", className: "bg-success/20 text-success" },
  failed: { label: "Failed", className: "bg-destructive/20 text-destructive" },
  disconnected: { label: "Disconnected", className: "bg-muted text-muted-foreground" },
};

interface StatusBadgeProps {
  state: PeerConnectionState;
  relayType?: RelayType;
}

export function StatusBadge({ state, relayType }: StatusBadgeProps) {
  const config = stateConfig[state];
  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${config.className}`}>
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            state === "connecting" ? "animate-pulse-glow bg-warning" :
            state === "connected" ? "bg-success" :
            state === "failed" ? "bg-destructive" :
            "bg-muted-foreground"
          }`}
        />
        {config.label}
      </span>
      {state === "connected" && relayType && relayType !== "unknown" && (
        <RelayBadge relayType={relayType} />
      )}
    </div>
  );
}

function RelayBadge({ relayType }: { relayType: "direct" | "relayed" }) {
  if (relayType === "direct") {
    return (
      <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
        P2P
      </span>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium text-warning cursor-help">
          Relayed
          <Info className="h-2.5 w-2.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-64 text-xs">
        This connection is routed through a relay server because a direct
        connection could not be established. Transfer speeds may be slower
        than a direct peer-to-peer connection.
      </TooltipContent>
    </Tooltip>
  );
}
