import { useState, useRef, useEffect } from "react";
import { Copy, Link, LogOut, Wifi, WifiOff, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "./ThemeToggle";
import { toast } from "sonner";
import { copyToClipboard } from "@/lib/clipboard";
import { saveUsername } from "@/lib/storage";

interface RoomHeaderProps {
  roomCode: string;
  selfPeerId: string | null;
  selfUsername?: string;
  sigConnected: boolean;
  onLeave: () => void;
  onChangeUsername: (name: string) => void;
}

export function RoomHeader({ roomCode, selfPeerId, selfUsername, sigConnected, onLeave, onChangeUsername }: RoomHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const displayName = selfUsername || (selfPeerId ? selfPeerId.substring(0, 6) : "You");

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

  const copyCode = async () => {
    const ok = await copyToClipboard(roomCode);
    if (ok) toast.success("Room code copied!");
    else toast.error("Failed to copy — try selecting the code manually");
  };

  const copyLink = async () => {
    const url = `${window.location.origin}/?room=${roomCode}`;
    const ok = await copyToClipboard(url);
    if (ok) toast.success("Invite link copied!");
    else toast.error("Failed to copy — try selecting the link manually");
  };

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Room</span>
          <code className="rounded-lg bg-secondary px-3 py-1 font-mono text-lg font-bold tracking-wider text-foreground select-all">
            {roomCode}
          </code>
        </div>
        <button
          onClick={copyCode}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Copy room code"
        >
          <Copy className="h-4 w-4" />
        </button>
        <button
          onClick={copyLink}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label="Copy invite link"
        >
          <Link className="h-4 w-4" />
        </button>

        <div className="ml-2 flex items-center gap-1.5 border-l border-border pl-3">
          {editing ? (
            <>
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
                className="h-7 w-32 text-sm"
                title="Stored in your browser only"
              />
              {selfUsername && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={clearUsername}
                  className="rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
                  aria-label="Clear display name"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </>
          ) : (
            <button
              onClick={startEdit}
              className="group flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-sm transition-colors hover:bg-secondary"
              aria-label="Edit display name"
            >
              <span className={selfUsername ? "font-medium text-foreground" : "text-muted-foreground italic"}>
                {displayName}
              </span>
              <Pencil className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className={`flex items-center gap-1.5 text-xs ${sigConnected ? "text-success" : "text-destructive"}`}>
          {sigConnected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
          {sigConnected ? "Connected" : "Disconnected"}
        </span>
        <ThemeToggle />
        <Button variant="outline" size="sm" onClick={onLeave} className="gap-1.5">
          <LogOut className="h-3.5 w-3.5" />
          Leave
        </Button>
      </div>
    </header>
  );
}
