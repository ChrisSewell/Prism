import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Shield, Zap, Globe, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/ThemeToggle";
import { checkWebRTCSupport } from "@/lib/compat";

export default function Landing() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [roomCode, setRoomCode] = useState("");
  const [loading, setLoading] = useState<"create" | "join" | null>(null);
  const [supported, setSupported] = useState(true);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [pin, setPin] = useState("");

  useEffect(() => {
    setSupported(checkWebRTCSupport());
    const autoJoin = searchParams.get("room");
    if (autoJoin) {
      setRoomCode(autoJoin);
    }
  }, [searchParams]);

  const handleCreate = () => {
    const params = new URLSearchParams({ action: "create" });
    if (pinEnabled && pin) {
      params.set("pin", pin);
    }
    navigate(`/room?${params.toString()}`);
  };

  const handleJoin = () => {
    if (!roomCode.trim()) return;
    navigate(`/room?action=join&code=${roomCode.trim()}`);
  };

  const isPinValid = !pinEnabled || /^\d{4,8}$/.test(pin);

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
            <div className="space-y-3">
              <Button
                onClick={handleCreate}
                size="lg"
                className="w-full gap-2 text-base"
                disabled={pinEnabled && !isPinValid}
              >
                Create Room
                <ArrowRight className="h-4 w-4" />
              </Button>

              <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 px-3 py-2">
                <div className="flex items-center gap-2">
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  <Label htmlFor="pin-toggle" className="cursor-pointer text-sm text-muted-foreground">
                    Require PIN to join
                  </Label>
                </div>
                <Switch
                  id="pin-toggle"
                  checked={pinEnabled}
                  onCheckedChange={(checked) => {
                    setPinEnabled(checked);
                    if (!checked) setPin("");
                  }}
                />
              </div>

              <AnimatePresence>
                {pinEnabled && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Input
                      type="text"
                      inputMode="numeric"
                      pattern="\d*"
                      placeholder="Enter 4–8 digit PIN"
                      value={pin}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, "").slice(0, 8);
                        setPin(v);
                      }}
                      className="font-mono text-base tracking-widest"
                      autoFocus
                    />
                    {pin.length > 0 && pin.length < 4 && (
                      <p className="mt-1 text-xs text-destructive">PIN must be at least 4 digits</p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

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
