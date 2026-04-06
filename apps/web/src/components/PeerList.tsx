import { Users, RefreshCw } from "lucide-react";
import type { PeerState } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";
import { Button } from "@/components/ui/button";

interface PeerListProps {
  peers: Map<string, PeerState>;
  onRetry: (peerId: string) => void;
}

export function PeerList({ peers, onRetry }: PeerListProps) {
  const peerEntries = Array.from(peers.entries());

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Users className="h-4 w-4" />
        <span>Peers ({peerEntries.length})</span>
      </div>
      {peerEntries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Waiting for peers to join…</p>
      ) : (
        <div className="space-y-2">
          {peerEntries.map(([id, peer]) => (
            <div
              key={id}
              className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-2"
            >
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-medium text-foreground">
                  {id.substring(0, 6)}
                </span>
                <StatusBadge state={peer.connectionState} />
              </div>
              {peer.connectionState === "failed" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRetry(id)}
                  className="h-7 gap-1 text-xs"
                >
                  <RefreshCw className="h-3 w-3" />
                  Retry
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
