import { Download, X, ArrowUp, ArrowDown } from "lucide-react";
import type { TransferState } from "@/lib/types";
import { formatFileSize, formatSpeed } from "@/lib/protocol";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { TransferAnimation } from "./TransferAnimation";

interface TransferQueueProps {
  transfers: TransferState[];
  onCancel: (fileId: string) => void;
}

export function TransferQueue({ transfers, onCancel }: TransferQueueProps) {
  if (transfers.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-medium text-foreground">Transfers</h3>
      <div className="space-y-2">
        <AnimatePresence>
          {transfers.map((t) => (
            <TransferRow key={`${t.fileId}-${t.peerId}`} transfer={t} onCancel={onCancel} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function TransferRow({ transfer: t, onCancel }: { transfer: TransferState; onCancel: (id: string) => void }) {
  const progress = t.fileSize > 0 ? Math.round((t.bytesTransferred / t.fileSize) * 100) : 0;
  const elapsed = (Date.now() - t.startTime) / 1000;
  const speed = elapsed > 0 ? t.bytesTransferred / elapsed : 0;
  const isSending = t.direction === "sending";

  const statusColor =
    t.status === "completed" ? "text-success" :
    t.status === "failed" || t.status === "cancelled" ? "text-destructive" :
    "text-muted-foreground";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="rounded-lg bg-secondary/50 p-3"
    >
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2 overflow-hidden">
          {isSending ? (
            <ArrowUp className="h-3.5 w-3.5 shrink-0 text-primary" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5 shrink-0 text-success" />
          )}
          <span className="truncate text-sm font-medium text-foreground">{t.fileName}</span>
        </div>
        <div className="flex items-center gap-2">
          {t.status === "transferring" && isSending && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onCancel(t.fileId)}
              className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
              aria-label="Cancel transfer"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
          {t.status === "completed" && t.blobUrl && (
            <a
              href={t.blobUrl}
              download={t.fileName}
              className="inline-flex items-center gap-1 rounded-md bg-success/10 px-2 py-1 text-xs font-medium text-success transition-colors hover:bg-success/20"
            >
              <Download className="h-3 w-3" />
              Save
            </a>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>{formatFileSize(t.fileSize)}</span>
        <span>→ {t.peerLabel}</span>
        <span className={statusColor}>{t.status}</span>
        {t.status === "transferring" && (
          <>
            <span>{progress}%</span>
            <span>{formatSpeed(speed)}</span>
          </>
        )}
      </div>
      {(t.status === "transferring" || t.status === "pending") && (
        <TransferAnimation
          direction={t.direction}
          progress={progress}
          isActive={t.status === "transferring"}
        />
      )}
    </motion.div>
  );
}
