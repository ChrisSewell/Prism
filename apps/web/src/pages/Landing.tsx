import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Shield, Zap, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/ThemeToggle";
import { checkWebRTCSupport } from "@/lib/compat";

export default function Landing() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [roomCode, setRoomCode] = useState("");
  const [loading, setLoading] = useState<"create" | "join" | null>(null);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setSupported(checkWebRTCSupport());
    const autoJoin = searchParams.get("room");
    if (autoJoin) {
      setRoomCode(autoJoin);
    }
  }, [searchParams]);

  const handleCreate = () => {
    navigate("/room?action=create");
  };

  const handleJoin = () => {
    if (!roomCode.trim()) return;
    navigate(`/room?action=join&code=${roomCode.trim()}`);
  };

  if (!supported) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="max-w-md rounded-2xl border border-destructive/30 bg-card p-8 text-center">
          <h1 className="mb-3 text-xl font-bold text-foreground">Browser Not Supported</h1>
          <p className="mb-4 text-sm text-muted-foreground">
            Your browser doesn't support WebRTC, which is required for peer-to-peer file transfer.
          </p>
          <p className="text-sm text-muted-foreground">
            Please use: Chrome 80+, Firefox 75+, Safari 15+, or Edge 80+
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top bar */}
      <div className="flex justify-end p-4">
        <ThemeToggle />
      </div>

      {/* Hero */}
      <div className="flex flex-1 items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md space-y-8"
        >
          {/* Title */}
          <div className="text-center">
            <h1 className="mb-2 text-4xl font-bold tracking-tight text-foreground">
              <span className="text-gradient-primary">Prism</span>
            </h1>
            <p className="text-muted-foreground">
              Send files straight between browsers. No uploads—your data stays peer-to-peer.
            </p>
          </div>

          {/* Actions */}
          <div className="space-y-4">
            <Button
              onClick={handleCreate}
              size="lg"
              className="w-full gap-2 text-base"
            >
              Create Room
              <ArrowRight className="h-4 w-4" />
            </Button>

            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">or join existing</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="Enter room code"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                className="font-mono text-base tracking-widest"
              />
              <Button
                onClick={handleJoin}
                variant="outline"
                disabled={!roomCode.trim()}
              >
                Join
              </Button>
            </div>
          </div>

          {/* Features */}
          <div className="grid grid-cols-3 gap-4 pt-4">
            {[
              { icon: Shield, label: "End-to-end encrypted" },
              { icon: Zap, label: "Direct peer-to-peer" },
              { icon: Globe, label: "No file size limit" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center gap-2 text-center">
                <div className="rounded-lg bg-secondary p-2">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
