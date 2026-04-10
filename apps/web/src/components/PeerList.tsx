import { useState, useRef, useEffect } from "react";
import { Users, RefreshCw, Pencil, X } from "lucide-react";
import type { PeerState } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveUsername } from "@/lib/storage";

interface PeerListProps {
  peers: Map<string, PeerState>;
  selfPeerId: string | null;
  selfUsername?: string;
  onRetry: (peerId: string) => void;
  onChangeUsername: (name: string) => void;
}

function SelfNameEditor({
  selfUsername,
  selfPeerId,
  onChangeUsername,
}: {
  selfUsername?: string;
  selfPeerId: string;
  onChangeUsername: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const displayName = selfUsername || selfPeerId.substring(0, 6);

  const startEdit = () => {
    setDraft(selfUsername || "");
    setEditing(true);
  };

  const commitEdit = () => {
    const trimmed = draft.trim().slice(0, 30);
    onChangeUsername(trimmed);
    saveUsername(trimmed);
    setEditing(false);
  };

  const clearUsername = () => {
    onChangeUsername("");
    saveUsername("");
    setEditing(false);
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 30))}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitEdit();
            if (e.key === "Escape") cancelEdit();
          }}
          onBlur={commitEdit}
          placeholder="Anonymous"
          className="h-6 w-28 text-xs"
          title="Stored in your browser only"
        />
        {selfUsername && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={clearUsername}
            className="rounded p-0.5 text-muted-foreground transition-colors hover:text-destructive"
            aria-label="Clear display name"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={startEdit}
      className="group flex items-center gap-1.5"
      aria-label="Edit display name"
    >
      <span className={`text-sm font-medium ${selfUsername ? "text-foreground" : "font-mono text-foreground"}`}>
        {displayName}
      </span>
      <Pencil className="h-2.5 w-2.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

export function PeerList({ peers, selfPeerId, selfUsername, onRetry, onChangeUsername }: PeerListProps) {
  const peerEntries = Array.from(peers.entries());
  const totalCount = peerEntries.length + (selfPeerId ? 1 : 0);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Users className="h-4 w-4" />
        <span>Peers ({totalCount})</span>
      </div>

      <div className="space-y-2">
        {/* Self entry */}
        {selfPeerId && (
          <div className="flex items-center justify-between rounded-lg bg-primary/5 border border-primary/10 px-3 py-2">
            <div className="flex items-center gap-3">
              <SelfNameEditor
                selfUsername={selfUsername}
                selfPeerId={selfPeerId}
                onChangeUsername={onChangeUsername}
              />
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                you
              </span>
            </div>
          </div>
        )}

        {/* Remote peers */}
        {peerEntries.length === 0 && !selfPeerId ? (
          <p className="text-sm text-muted-foreground">Waiting for peers to join…</p>
        ) : peerEntries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Waiting for peers to join…</p>
        ) : (
          peerEntries.map(([id, peer]) => (
            <div
              key={id}
              className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-2"
            >
              <div className="flex items-center gap-3">
                <div className="flex flex-col">
                  {peer.username ? (
                    <>
                      <span className="text-sm font-medium text-foreground">{peer.username}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{id.substring(0, 6)}</span>
                    </>
                  ) : (
                    <span className="font-mono text-sm font-medium text-foreground">
                      {id.substring(0, 6)}
                    </span>
                  )}
                </div>
                <StatusBadge state={peer.connectionState} relayType={peer.relayType} />
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
          ))
        )}
      </div>
    </div>
  );
}
