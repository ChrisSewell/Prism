import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useRoom } from "@/hooks/useRoom";
import { RoomHeader } from "@/components/RoomHeader";
import { PeerList } from "@/components/PeerList";
import { FileDropZone } from "@/components/FileDropZone";
import { TransferQueue } from "@/components/TransferQueue";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const errorMessages: Record<string, string> = {
  ROOM_NOT_FOUND: "Room not found. It may have expired or the code is incorrect.",
  ROOM_FULL: "This room is full. Try again later.",
  GLOBAL_PEER_LIMIT: "Server is busy. Please try again later.",
};

export default function Room() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { roomState, transfers, sigConnected, create, join, leave, sendFiles, cancelTransfer, retryPeer } = useRoom();
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const action = searchParams.get("action");
    const code = searchParams.get("code");

    const init = async () => {
      try {
        if (action === "create") {
          const roomCode = await create();
          // Update URL without navigation
          window.history.replaceState({}, "", `/room?code=${roomCode}`);
        } else if (action === "join" && code) {
          await join(code);
          window.history.replaceState({}, "", `/room?code=${code}`);
        } else if (code) {
          await join(code);
        } else {
          navigate("/");
          return;
        }
      } catch {
        // Error is already handled in the hook
      }
      setInitializing(false);
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLeave = () => {
    leave();
    navigate("/");
  };

  if (initializing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Connecting…</span>
        </div>
      </div>
    );
  }

  if (roomState.error) {
    const msg = errorMessages[roomState.error.code] || roomState.error.message;
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="max-w-md rounded-2xl border border-destructive/30 bg-card p-8 text-center">
          <h1 className="mb-3 text-xl font-bold text-foreground">Error</h1>
          <p className="mb-6 text-sm text-muted-foreground">{msg}</p>
          <Button onClick={() => navigate("/")}>Back to Home</Button>
        </div>
      </div>
    );
  }

  if (!roomState.roomCode) {
    navigate("/");
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl space-y-4 p-4">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <RoomHeader
            roomCode={roomState.roomCode}
            sigConnected={sigConnected}
            onLeave={handleLeave}
          />
        </motion.div>

        {!sigConnected && (
          <div className="rounded-lg bg-warning/10 p-3 text-center text-sm text-warning">
            Connection to server lost. Reconnecting…
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-[280px_1fr]">
          <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
            <PeerList peers={roomState.peers} onRetry={retryPeer} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-4"
          >
            <FileDropZone peers={roomState.peers} onSend={sendFiles} />
            <TransferQueue transfers={transfers} onCancel={cancelTransfer} />
          </motion.div>
        </div>
      </div>
    </div>
  );
}
