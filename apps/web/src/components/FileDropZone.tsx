import { useCallback, useState, useRef } from "react";
import { Upload, Send } from "lucide-react";
import type { PeerState } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

interface FileDropZoneProps {
  peers: Map<string, PeerState>;
  onSend: (files: File[], peerIds: string[]) => void;
}

export function FileDropZone({ peers, onSend }: FileDropZoneProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedPeers, setSelectedPeers] = useState<Set<string>>(new Set());
  const [allSelected, setAllSelected] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const connectedPeers = Array.from(peers.entries()).filter(
    ([, p]) => p.connectionState === "connected"
  );

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length > 0) setFiles((prev) => [...prev, ...dropped]);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length > 0) setFiles((prev) => [...prev, ...selected]);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const togglePeer = useCallback((peerId: string) => {
    setAllSelected(false);
    setSelectedPeers((prev) => {
      const next = new Set(prev);
      if (next.has(peerId)) next.delete(peerId);
      else next.add(peerId);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setAllSelected(true);
    setSelectedPeers(new Set());
  }, []);

  const handleSend = useCallback(() => {
    const targetIds = allSelected
      ? connectedPeers.map(([id]) => id)
      : Array.from(selectedPeers);
    if (files.length === 0 || targetIds.length === 0) return;
    onSend(files, targetIds);
    setFiles([]);
    if (inputRef.current) inputRef.current.value = "";
  }, [files, allSelected, selectedPeers, connectedPeers, onSend]);

  const removeFile = useCallback((idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragEnter={handleDragIn}
        onDragLeave={handleDragOut}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-all ${
          isDragging
            ? "border-primary bg-primary/5 glow-primary"
            : "border-border hover:border-primary/50 hover:bg-primary/5"
        }`}
        role="button"
        aria-label="Drop files here or click to browse"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          onClick={(e) => e.stopPropagation()}
          className="sr-only"
        />
        <Upload className={`mx-auto mb-3 h-10 w-10 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
        <p className="text-sm font-medium text-foreground">
          Drop files here or click to browse
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Files are sent directly peer-to-peer. No size limits.
        </p>
      </div>

      {/* Selected files */}
      <AnimatePresence>
        {files.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3"
          >
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="mb-2 text-sm font-medium text-foreground">
                Selected Files ({files.length})
              </h3>
              <div className="space-y-1.5">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-1.5 text-sm">
                    <span className="truncate text-foreground">{f.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{formatSize(f.size)}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={`Remove ${f.name}`}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Peer selector */}
            {connectedPeers.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="mb-2 text-sm font-medium text-foreground">Send to</h3>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={selectAll}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      allSelected
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground hover:bg-primary/10"
                    }`}
                  >
                    All peers
                  </button>
                  {connectedPeers.map(([id]) => (
                    <button
                      key={id}
                      onClick={() => togglePeer(id)}
                      className={`rounded-full px-3 py-1 font-mono text-xs font-medium transition-colors ${
                        !allSelected && selectedPeers.has(id)
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-secondary-foreground hover:bg-primary/10"
                      }`}
                    >
                      {id.substring(0, 6)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Send button */}
            <Button
              onClick={handleSend}
              disabled={connectedPeers.length === 0}
              className="w-full gap-2"
              size="lg"
            >
              <Send className="h-4 w-4" />
              Send {files.length} file{files.length > 1 ? "s" : ""}
              {connectedPeers.length === 0 && " (no connected peers)"}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
