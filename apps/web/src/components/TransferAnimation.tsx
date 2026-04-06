import { motion } from "framer-motion";

interface TransferAnimationProps {
  direction: "sending" | "receiving";
  progress: number; // 0-100
  isActive: boolean;
}

export function TransferAnimation({ direction, progress, isActive }: TransferAnimationProps) {
  if (!isActive) return null;

  const isSending = direction === "sending";

  return (
    <div className="relative flex items-center justify-center gap-3 py-2">
      {/* Source node */}
      <div className={`flex h-8 w-8 items-center justify-center rounded-full ${isSending ? "bg-primary/20" : "bg-muted"}`}>
        <motion.div
          className={`h-3 w-3 rounded-full ${isSending ? "bg-primary" : "bg-muted-foreground"}`}
          animate={isActive ? { scale: [1, 1.3, 1] } : {}}
          transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
        />
      </div>

      {/* Animated data stream */}
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
        {/* Progress fill */}
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-primary/30"
          style={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />

        {/* Flying particles */}
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute top-0 h-full w-3 rounded-full bg-primary"
            initial={{ x: isSending ? "-12px" : "100%" }}
            animate={{
              x: isSending ? ["0%", "100%"] : ["100%", "0%"],
              opacity: [0, 1, 1, 0],
            }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              delay: i * 0.4,
              ease: "linear",
            }}
          />
        ))}
      </div>

      {/* Destination node */}
      <div className={`flex h-8 w-8 items-center justify-center rounded-full ${isSending ? "bg-muted" : "bg-success/20"}`}>
        <motion.div
          className={`h-3 w-3 rounded-full ${isSending ? "bg-muted-foreground" : "bg-success"}`}
          animate={isActive ? { scale: [1, 1.3, 1] } : {}}
          transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut", delay: 0.6 }}
        />
      </div>
    </div>
  );
}
