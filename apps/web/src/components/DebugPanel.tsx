import { useState, useEffect, useCallback } from "react";
import { ChevronDown, RefreshCw, Bug, Copy, Check } from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import type { PeerDebugInfo, CandidatePairInfo } from "@/hooks/useRoom";

interface DebugPanelProps {
  getDebugInfo: () => Promise<PeerDebugInfo[]>;
  selfPeerId: string | null;
}

function formatRtt(rtt?: number): string {
  if (rtt == null) return "—";
  return `${(rtt * 1000).toFixed(0)}ms`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function PairRow({ pair, isSelected }: { pair: CandidatePairInfo; isSelected: boolean }) {
  return (
    <tr className={isSelected ? "bg-primary/10" : ""}>
      <td className="px-2 py-1 font-mono text-[10px]">
        {pair.state}
        {pair.nominated && " ★"}
        {isSelected && " ●"}
      </td>
      <td className="px-2 py-1 font-mono text-[10px]">{pair.localType}</td>
      <td className="px-2 py-1 font-mono text-[10px]">{pair.remoteType}</td>
      <td className="px-2 py-1 font-mono text-[10px]">{pair.protocol}</td>
      <td className="px-2 py-1 font-mono text-[10px]">{pair.localAddress}</td>
      <td className="px-2 py-1 font-mono text-[10px]">{pair.remoteAddress}</td>
      <td className="px-2 py-1 font-mono text-[10px] text-right">{formatRtt(pair.currentRoundTripTime)}</td>
      <td className="px-2 py-1 font-mono text-[10px] text-right">{formatBytes(pair.bytesSent)}</td>
      <td className="px-2 py-1 font-mono text-[10px] text-right">{formatBytes(pair.bytesReceived)}</td>
    </tr>
  );
}

function PeerSection({ peer }: { peer: PeerDebugInfo }) {
  const label = peer.username || peer.peerId.substring(0, 6);
  const relayColor =
    peer.relayType === "direct" ? "text-emerald-400" :
    peer.relayType === "relayed" ? "text-amber-400" :
    "text-muted-foreground";

  return (
    <div className="space-y-2 rounded-lg border border-border/50 bg-background/50 p-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="font-semibold text-foreground">{label}</span>
        <span className="font-mono text-muted-foreground">{peer.peerId.substring(0, 8)}</span>
        <span className={`font-semibold ${relayColor}`}>{peer.relayType.toUpperCase()}</span>
        <span className="text-muted-foreground">conn={peer.connectionState}</span>
        <span className="text-muted-foreground">ice={peer.iceConnectionState}</span>
        <span className="text-muted-foreground">gather={peer.iceGatheringState}</span>
        <span className="text-muted-foreground">sig={peer.signalingState}</span>
      </div>

      {peer.selectedPair && (
        <div className="rounded bg-primary/5 px-2 py-1.5 text-[11px]">
          <span className="font-medium text-primary">Selected: </span>
          <span className="font-mono text-foreground">
            {peer.selectedPair.localType} {peer.selectedPair.localAddress}
            {" ↔ "}
            {peer.selectedPair.remoteType} {peer.selectedPair.remoteAddress}
            {" | "}{peer.selectedPair.protocol}
            {" | RTT "}{formatRtt(peer.selectedPair.currentRoundTripTime)}
          </span>
        </div>
      )}

      <div className="flex gap-6 text-[10px] text-muted-foreground">
        <span>Local candidates: {peer.localCandidates.length}</span>
        <span>Remote candidates: {peer.remoteCandidates.length}</span>
        <span>Pairs: {peer.candidatePairs.length}</span>
      </div>

      {peer.localCandidates.length > 0 && (
        <div className="space-y-0.5">
          <div className="text-[10px] font-medium text-muted-foreground">Local Candidates</div>
          <div className="flex flex-wrap gap-1">
            {peer.localCandidates.map((c, i) => (
              <span key={i} className="rounded bg-secondary/80 px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                {c.type} {c.protocol} {c.address}:{c.port}
              </span>
            ))}
          </div>
        </div>
      )}

      {peer.remoteCandidates.length > 0 && (
        <div className="space-y-0.5">
          <div className="text-[10px] font-medium text-muted-foreground">Remote Candidates</div>
          <div className="flex flex-wrap gap-1">
            {peer.remoteCandidates.map((c, i) => (
              <span key={i} className="rounded bg-secondary/80 px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                {c.type} {c.protocol} {c.address}:{c.port}
              </span>
            ))}
          </div>
        </div>
      )}

      {peer.candidatePairs.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border/30 text-[10px] font-medium text-muted-foreground">
                <th className="px-2 py-1">State</th>
                <th className="px-2 py-1">Local</th>
                <th className="px-2 py-1">Remote</th>
                <th className="px-2 py-1">Proto</th>
                <th className="px-2 py-1">Local Addr</th>
                <th className="px-2 py-1">Remote Addr</th>
                <th className="px-2 py-1 text-right">RTT</th>
                <th className="px-2 py-1 text-right">Sent</th>
                <th className="px-2 py-1 text-right">Recv</th>
              </tr>
            </thead>
            <tbody>
              {peer.candidatePairs.map((pair, i) => (
                <PairRow key={i} pair={pair} isSelected={pair.selected} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatDebugText(selfPeerId: string | null, peers: PeerDebugInfo[]): string {
  const lines: string[] = [];
  lines.push(`=== ICE Debug Dump ===`);
  lines.push(`Time: ${new Date().toISOString()}`);
  lines.push(`Self: ${selfPeerId ?? "unknown"}`);
  lines.push(`Peers: ${peers.length}`);
  lines.push("");

  for (const peer of peers) {
    const label = peer.username ? `${peer.username} (${peer.peerId.substring(0, 8)})` : peer.peerId.substring(0, 8);
    lines.push(`--- Peer: ${label} ---`);
    lines.push(`  Relay type:       ${peer.relayType}`);
    lines.push(`  Connection state: ${peer.connectionState}`);
    lines.push(`  ICE connection:   ${peer.iceConnectionState}`);
    lines.push(`  ICE gathering:    ${peer.iceGatheringState}`);
    lines.push(`  Signaling:        ${peer.signalingState}`);

    if (peer.selectedPair) {
      const p = peer.selectedPair;
      lines.push(`  Selected pair:    ${p.localType} ${p.localAddress} <-> ${p.remoteType} ${p.remoteAddress} | ${p.protocol} | RTT ${formatRtt(p.currentRoundTripTime)}`);
    }

    if (peer.localCandidates.length > 0) {
      lines.push(`  Local candidates (${peer.localCandidates.length}):`);
      for (const c of peer.localCandidates) {
        lines.push(`    ${c.type.padEnd(8)} ${c.protocol.padEnd(4)} ${c.address}:${c.port}`);
      }
    }

    if (peer.remoteCandidates.length > 0) {
      lines.push(`  Remote candidates (${peer.remoteCandidates.length}):`);
      for (const c of peer.remoteCandidates) {
        lines.push(`    ${c.type.padEnd(8)} ${c.protocol.padEnd(4)} ${c.address}:${c.port}`);
      }
    }

    if (peer.candidatePairs.length > 0) {
      lines.push(`  Candidate pairs (${peer.candidatePairs.length}):`);
      lines.push(`    ${"State".padEnd(14)} ${"Local".padEnd(8)} ${"Remote".padEnd(8)} ${"Proto".padEnd(5)} ${"Local Addr".padEnd(22)} ${"Remote Addr".padEnd(22)} ${"RTT".padStart(6)} ${"Sent".padStart(10)} ${"Recv".padStart(10)}`);
      for (const p of peer.candidatePairs) {
        const flags = `${p.state}${p.nominated ? " ★" : ""}${p.selected ? " ●" : ""}`;
        lines.push(`    ${flags.padEnd(14)} ${p.localType.padEnd(8)} ${p.remoteType.padEnd(8)} ${p.protocol.padEnd(5)} ${p.localAddress.padEnd(22)} ${p.remoteAddress.padEnd(22)} ${formatRtt(p.currentRoundTripTime).padStart(6)} ${formatBytes(p.bytesSent).padStart(10)} ${formatBytes(p.bytesReceived).padStart(10)}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function DebugPanel({ getDebugInfo, selfPeerId }: DebugPanelProps) {
  const [open, setOpen] = useState(false);
  const [peers, setPeers] = useState<PeerDebugInfo[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string>("");
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    const info = await getDebugInfo();
    setPeers(info);
    setLastUpdate(new Date().toLocaleTimeString());
  }, [getDebugInfo]);

  const copyToClipboard = useCallback(() => {
    const text = formatDebugText(selfPeerId, peers);
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [selfPeerId, peers]);

  useEffect(() => {
    if (!open) return;
    refresh();
    if (!autoRefresh) return;
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [open, autoRefresh, refresh]);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="fixed bottom-0 left-0 right-0 z-50">
      <div className="border-t border-border bg-card/95 backdrop-blur">
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center justify-between px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <span className="flex items-center gap-2">
              <Bug className="h-3.5 w-3.5" />
              <span className="font-medium">ICE Debug</span>
              {selfPeerId && <span className="font-mono text-[10px]">self={selfPeerId.substring(0, 8)}</span>}
              {lastUpdate && <span className="text-[10px]">updated {lastUpdate}</span>}
            </span>
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="max-h-[50vh] overflow-y-auto border-t border-border/50 px-4 py-3">
            <div className="mb-3 flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-6 gap-1 text-[10px]" onClick={refresh}>
                <RefreshCw className="h-3 w-3" />
                Refresh
              </Button>
              <Button
                variant={autoRefresh ? "default" : "outline"}
                size="sm"
                className="h-6 text-[10px]"
                onClick={() => setAutoRefresh(!autoRefresh)}
              >
                {autoRefresh ? "Auto: ON (2s)" : "Auto: OFF"}
              </Button>
              <Button variant="outline" size="sm" className="h-6 gap-1 text-[10px]" onClick={copyToClipboard}>
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>

            {peers.length === 0 ? (
              <p className="text-xs text-muted-foreground">No peer connections.</p>
            ) : (
              <div className="space-y-3">
                {peers.map((peer) => (
                  <PeerSection key={peer.peerId} peer={peer} />
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
