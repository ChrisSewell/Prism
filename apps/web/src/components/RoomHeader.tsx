import { Copy, Link, LogOut, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./ThemeToggle";
import { toast } from "sonner";
import { copyToClipboard } from "@/lib/clipboard";

interface RoomHeaderProps {
  roomCode: string;
  sigConnected: boolean;
  onLeave: () => void;
}

export function RoomHeader({ roomCode, sigConnected, onLeave }: RoomHeaderProps) {
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
