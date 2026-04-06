import type { PeerConnectionState } from "@/lib/types";

const stateConfig: Record<PeerConnectionState, { label: string; className: string }> = {
  connecting: { label: "Connecting", className: "bg-warning/20 text-warning" },
  connected: { label: "Connected", className: "bg-success/20 text-success" },
  failed: { label: "Failed", className: "bg-destructive/20 text-destructive" },
  disconnected: { label: "Disconnected", className: "bg-muted text-muted-foreground" },
};

interface StatusBadgeProps {
  state: PeerConnectionState;
}

export function StatusBadge({ state }: StatusBadgeProps) {
  const config = stateConfig[state];
  return (
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
  );
}
