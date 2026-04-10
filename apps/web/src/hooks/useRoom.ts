import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import type { PeerState, PeerConnectionState, RelayType, TransferState, RoomState } from "@/lib/types";
import { getSocket, disconnectSocket, createRoom as sigCreateRoom, joinRoom as sigJoinRoom, fetchIceServers, updateUsername as sigUpdateUsername } from "@/lib/signaling";
import { createPeerConnection, createDataChannel, sendFile, handleIncomingFrame } from "@/lib/webrtc";

const log = (...args: unknown[]) => console.log("[useRoom]", ...args);
const warn = (...args: unknown[]) => console.warn("[useRoom]", ...args);

async function detectRelayType(pc: RTCPeerConnection): Promise<RelayType> {
  try {
    const stats = await pc.getStats();
    let activePairId: string | undefined;

    stats.forEach((report) => {
      if (report.type === "transport" && report.selectedCandidatePairId) {
        activePairId = report.selectedCandidatePairId;
      }
    });

    let localCandidateId: string | undefined;
    let remoteCandidateId: string | undefined;

    stats.forEach((report) => {
      if (report.type === "candidate-pair") {
        const isActive = activePairId
          ? report.id === activePairId
          : report.state === "succeeded" && report.nominated;
        if (isActive) {
          localCandidateId = report.localCandidateId;
          remoteCandidateId = report.remoteCandidateId;
        }
      }
    });

    if (!localCandidateId || !remoteCandidateId) return "unknown";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let localCandidate: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let remoteCandidate: any;

    stats.forEach((report) => {
      if (report.type === "local-candidate" && report.id === localCandidateId) {
        localCandidate = report;
      }
      if (report.type === "remote-candidate" && report.id === remoteCandidateId) {
        remoteCandidate = report;
      }
    });

    const localType = localCandidate?.candidateType;
    const remoteType = remoteCandidate?.candidateType;

    log(
      `detectRelayType: local=[type=${localType}, protocol=${localCandidate?.protocol}, address=${localCandidate?.address}:${localCandidate?.port}]` +
      ` remote=[type=${remoteType}, protocol=${remoteCandidate?.protocol}, address=${remoteCandidate?.address}:${remoteCandidate?.port}]`,
    );

    if (localType === "relay" || remoteType === "relay") return "relayed";
    if (localType && remoteType) return "direct";
    return "unknown";
  } catch (e) {
    warn("detectRelayType: getStats() failed", e);
    return "unknown";
  }
}

async function logIceDiagnostics(pc: RTCPeerConnection, label: string): Promise<void> {
  try {
    const stats = await pc.getStats();
    const candidates: string[] = [];
    const pairs: string[] = [];

    stats.forEach((report) => {
      if (report.type === "local-candidate") {
        candidates.push(`  LOCAL  ${report.candidateType} ${report.protocol ?? "?"} ${report.address ?? "?"}:${report.port ?? "?"}`);
      }
      if (report.type === "remote-candidate") {
        candidates.push(`  REMOTE ${report.candidateType} ${report.protocol ?? "?"} ${report.address ?? "?"}:${report.port ?? "?"}`);
      }
      if (report.type === "candidate-pair") {
        pairs.push(`  pair state=${report.state} nominated=${report.nominated} local=${report.localCandidateId} remote=${report.remoteCandidateId}`);
      }
    });

    warn(`ICE diagnostics(${label}): ${candidates.length} candidates, ${pairs.length} pairs`);
    for (const c of candidates) warn(c);
    for (const p of pairs) warn(p);
  } catch (e) {
    warn(`ICE diagnostics(${label}): getStats() failed`, e);
  }
}

export function useRoom() {
  const [roomState, setRoomState] = useState<RoomState>({
    roomCode: null,
    selfPeerId: null,
    peers: new Map(),
    isConnected: false,
    error: null,
  });
  const [transfers, setTransfers] = useState<TransferState[]>([]);
  const [sigConnected, setSigConnected] = useState(false);

  const iceServersRef = useRef<RTCIceServer[]>([]);
  const peersRef = useRef<Map<string, PeerState>>(new Map());
  const selfPeerIdRef = useRef<string | null>(null);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const remoteDescriptionSetRef = useRef<Set<string>>(new Set());
  const iceRestartAttemptedRef = useRef<Set<string>>(new Set());

  const updatePeerState = useCallback((peerId: string, updates: Partial<PeerState>) => {
    const peer = peersRef.current.get(peerId);
    if (peer) {
      Object.assign(peer, updates);
      setRoomState((prev) => ({
        ...prev,
        peers: new Map(peersRef.current),
      }));
    }
  }, []);

  const updateTransfer = useCallback((fileId: string, update: TransferState) => {
    setTransfers((prev) => {
      const idx = prev.findIndex((t) => t.fileId === fileId && t.peerId === update.peerId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = update;
        return next;
      }
      return [...prev, update];
    });
  }, []);

  const getPeerLabel = useCallback((peerId: string) => {
    const peer = peersRef.current.get(peerId);
    return peer?.username || peerId.substring(0, 6);
  }, []);

  const flushPendingCandidates = useCallback(async (peerId: string) => {
    const peer = peersRef.current.get(peerId);
    const pending = pendingCandidatesRef.current.get(peerId);
    if (!peer?.peerConnection || !pending || pending.length === 0) {
      log(`flushPendingCandidates(${peerId.substring(0, 6)}): nothing to flush (peer=${!!peer}, pending=${pending?.length ?? 0})`);
      return;
    }
    log(`flushPendingCandidates(${peerId.substring(0, 6)}): flushing ${pending.length} buffered candidates`);
    pendingCandidatesRef.current.delete(peerId);
    for (const candidate of pending) {
      try {
        await peer.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        warn(`flushPendingCandidates(${peerId.substring(0, 6)}): failed to add buffered candidate`, e);
      }
    }
    log(`flushPendingCandidates(${peerId.substring(0, 6)}): flush complete`);
  }, []);

  const setupPeerConnection = useCallback(
    async (peerId: string, isImpolite: boolean, username?: string) => {
      const label = peerId.substring(0, 6);
      log(`setupPeerConnection(${label}): role=${isImpolite ? "IMPOLITE (offerer)" : "POLITE (answerer)"}, selfPeerId=${selfPeerIdRef.current?.substring(0, 6)}`);
      const socket = getSocket();

      const onIceCandidate = (candidate: RTCIceCandidate) => {
        log(`onIceCandidate(${label}): sending candidate, type=${candidate.type ?? "unknown"}, protocol=${candidate.protocol ?? "?"}, address=${candidate.address ?? "?"}`);
        socket.emit("signal:candidate", {
          toPeerId: peerId,
          data: {
            candidate: candidate.candidate,
            sdpMid: candidate.sdpMid,
            sdpMLineIndex: candidate.sdpMLineIndex,
          },
        });
      };

      const mapConnectionState = (s: RTCPeerConnectionState): PeerConnectionState => {
        switch (s) {
          case "connected": return "connected";
          case "failed": return "failed";
          case "disconnected": return "disconnected";
          case "closed": return "disconnected";
          default: return "connecting";
        }
      };

      const onConnectionStateChange = (state: RTCPeerConnectionState) => {
        const mapped = mapConnectionState(state);
        log(`onConnectionStateChange(${label}): raw="${state}" mapped="${mapped}"`);
        updatePeerState(peerId, { connectionState: mapped });
        if (mapped === "connected") {
          iceRestartAttemptedRef.current.delete(peerId);
          toast.success(`Connected to peer ${getPeerLabel(peerId)}`);
          const peer = peersRef.current.get(peerId);
          if (peer?.peerConnection) {
            detectRelayType(peer.peerConnection).then((relayType) => {
              updatePeerState(peerId, { relayType });
              if (relayType === "relayed") {
                toast.warning(
                  `Connection to ${getPeerLabel(peerId)} is relayed through a server — transfer speeds may be reduced`,
                );
              }
            });
          }
        } else if (mapped === "failed") {
          toast.error(`Connection to peer ${getPeerLabel(peerId)} failed`);
        }
      };

      const onDataChannel = (channel: RTCDataChannel) => {
        log(`onDataChannel(${label}): received data channel "${channel.label}", readyState=${channel.readyState}`);
        updatePeerState(peerId, { dataChannel: channel });
        channel.onopen = () => {
          log(`onDataChannel(${label}): channel OPEN`);
          updatePeerState(peerId, { connectionState: "connected" });
        };
        channel.onclose = () => log(`onDataChannel(${label}): channel CLOSED`);
        channel.onerror = (e) => warn(`onDataChannel(${label}): channel ERROR`, e);
        channel.onmessage = (e) => {
          const peer = peersRef.current.get(peerId);
          if (!peer) return;
          handleIncomingFrame(
            e.data as ArrayBuffer,
            peer.incomingTransfers,
            peerId,
            getPeerLabel(peerId),
            updateTransfer,
          );
        };
      };

      const onIceCandidateError = (evt: RTCPeerConnectionIceErrorEvent) => {
        warn(`onIceCandidateError(${label}): url=${evt.url} code=${evt.errorCode} text=${evt.errorText}`);
      };

      const pc = createPeerConnection(iceServersRef.current, onIceCandidate, onConnectionStateChange, onDataChannel, onIceCandidateError);
      log(`setupPeerConnection(${label}): RTCPeerConnection created, iceServers=${JSON.stringify(iceServersRef.current.map(s => s.urls))}`);

      pc.onicegatheringstatechange = () => {
        log(`iceGatheringState(${label}): ${pc.iceGatheringState}`);
      };
      pc.oniceconnectionstatechange = () => {
        log(`iceConnectionState(${label}): ${pc.iceConnectionState}`);
        if (pc.iceConnectionState === "failed") {
          logIceDiagnostics(pc, label);
          const selfId = selfPeerIdRef.current!;
          const shouldInitiateRestart = selfId < peerId;
          if (shouldInitiateRestart && !iceRestartAttemptedRef.current.has(peerId)) {
            iceRestartAttemptedRef.current.add(peerId);
            log(`iceConnectionState(${label}): attempting ICE restart (first attempt)`);
            pc.createOffer({ iceRestart: true }).then(async (offer) => {
              await pc.setLocalDescription(offer);
              remoteDescriptionSetRef.current.delete(peerId);
              pendingCandidatesRef.current.delete(peerId);
              socket.emit("signal:offer", {
                toPeerId: peerId,
                data: { sdp: offer.sdp, type: offer.type },
              });
              log(`iceConnectionState(${label}): ICE restart offer emitted`);
            }).catch((e) => {
              warn(`iceConnectionState(${label}): ICE restart failed`, e);
            });
          } else if (shouldInitiateRestart) {
            log(`iceConnectionState(${label}): ICE restart already attempted, manual retry needed`);
          }
        }
      };
      pc.onsignalingstatechange = () => {
        log(`signalingState(${label}): ${pc.signalingState}`);
      };
      
      const peerState: PeerState = {
        peerId,
        username,
        connectionState: "connecting",
        peerConnection: pc,
        dataChannel: null,
        outgoingTransfers: new Map(),
        incomingTransfers: new Map(),
      };
      peersRef.current.set(peerId, peerState);
      setRoomState((prev) => ({ ...prev, peers: new Map(peersRef.current) }));

      if (isImpolite) {
        log(`setupPeerConnection(${label}): creating data channel + offer`);
        const dc = createDataChannel(pc);
        peerState.dataChannel = dc;
        dc.onopen = () => {
          log(`dc.onopen(${label}): offerer data channel OPEN`);
          updatePeerState(peerId, { connectionState: "connected" });
        };
        dc.onclose = () => log(`dc.onclose(${label}): offerer data channel CLOSED`);
        dc.onerror = (e) => warn(`dc.onerror(${label}): offerer data channel ERROR`, e);
        dc.onmessage = (e) => {
          const peer = peersRef.current.get(peerId);
          if (!peer) return;
          handleIncomingFrame(
            e.data as ArrayBuffer,
            peer.incomingTransfers,
            peerId,
            getPeerLabel(peerId),
            updateTransfer,
          );
        };

        const offer = await pc.createOffer();
        log(`setupPeerConnection(${label}): offer created, setting local description`);
        await pc.setLocalDescription(offer);
        log(`setupPeerConnection(${label}): local description set, emitting signal:offer`);
        socket.emit("signal:offer", {
          toPeerId: peerId,
          data: { sdp: offer.sdp, type: offer.type },
        });
        log(`setupPeerConnection(${label}): signal:offer emitted`);
      } else {
        log(`setupPeerConnection(${label}): polite peer, waiting for offer`);
      }
    },
    [updatePeerState, updateTransfer, getPeerLabel],
  );

  const setupSignaling = useCallback(() => {
    const socket = getSocket();
    log("setupSignaling: registering socket handlers, socket.id=", socket.id, "connected=", socket.connected);

    socket.on("connect", () => {
      log("socket connected, id=", socket.id);
      setSigConnected(true);
    });
    socket.on("disconnect", (reason) => {
      log("socket disconnected, reason=", reason);
      setSigConnected(false);
    });
    socket.on("connect_error", (err) => {
      warn("socket connect_error:", err.message);
    });

    socket.on("peer:joined", ({ peerId, username }: { peerId: string; username?: string }) => {
      const displayName = username || peerId.substring(0, 6);
      log(`peer:joined received: peerId=${peerId.substring(0, 6)} username=${username ?? "(none)"}, selfPeerId=${selfPeerIdRef.current?.substring(0, 6)}`);
      toast(`${displayName} joined`);
      const selfId = selfPeerIdRef.current!;
      const isImpolite = selfId < peerId;
      log(`peer:joined: selfId(${selfId.substring(0, 6)}) < peerId(${peerId.substring(0, 6)}) = ${isImpolite}, so self is ${isImpolite ? "IMPOLITE (will offer)" : "POLITE (will wait)"}`);
      setupPeerConnection(peerId, isImpolite, username);
    });

    socket.on("peer:left", ({ peerId }: { peerId: string }) => {
      const displayName = getPeerLabel(peerId);
      log(`peer:left received: peerId=${peerId.substring(0, 6)}`);
      toast(`${displayName} left`);
      pendingCandidatesRef.current.delete(peerId);
      remoteDescriptionSetRef.current.delete(peerId);
      iceRestartAttemptedRef.current.delete(peerId);
      const peer = peersRef.current.get(peerId);
      if (peer) {
        peer.peerConnection?.close();
        peer.connectionState = "disconnected";
        setRoomState((prev) => ({ ...prev, peers: new Map(peersRef.current) }));
        setTimeout(() => {
          peersRef.current.delete(peerId);
          setRoomState((prev) => ({ ...prev, peers: new Map(peersRef.current) }));
        }, 3000);
      }
    });

    socket.on("peer:update-name", ({ peerId, username }: { peerId: string; username?: string }) => {
      log(`peer:update-name received: peerId=${peerId.substring(0, 6)} username=${username ?? "(cleared)"}`);
      updatePeerState(peerId, { username });
    });

    socket.on("signal:offer", async ({ fromPeerId, data }: { fromPeerId: string; toPeerId: string; data: RTCSessionDescriptionInit }) => {
      const label = fromPeerId.substring(0, 6);
      log(`signal:offer received from ${label}, type=${data.type}`);
      let peer = peersRef.current.get(fromPeerId);
      if (!peer) {
        log(`signal:offer(${label}): no peer state yet, calling setupPeerConnection as polite`);
        await setupPeerConnection(fromPeerId, false);
        peer = peersRef.current.get(fromPeerId)!;
      }
      const pc = peer.peerConnection!;
      log(`signal:offer(${label}): signalingState before setRemoteDescription = ${pc.signalingState}`);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data));
        log(`signal:offer(${label}): setRemoteDescription SUCCESS, signalingState = ${pc.signalingState}`);
      } catch (e) {
        warn(`signal:offer(${label}): setRemoteDescription FAILED`, e);
        return;
      }
      remoteDescriptionSetRef.current.add(fromPeerId);
      await flushPendingCandidates(fromPeerId);
      const answer = await pc.createAnswer();
      log(`signal:offer(${label}): answer created, setting local description`);
      await pc.setLocalDescription(answer);
      log(`signal:offer(${label}): local description set, emitting signal:answer`);
      socket.emit("signal:answer", {
        toPeerId: fromPeerId,
        data: { sdp: answer.sdp, type: answer.type },
      });
      log(`signal:offer(${label}): signal:answer emitted`);
    });

    socket.on("signal:answer", async ({ fromPeerId, data }: { fromPeerId: string; toPeerId: string; data: RTCSessionDescriptionInit }) => {
      const label = fromPeerId.substring(0, 6);
      log(`signal:answer received from ${label}, type=${data.type}`);
      const peer = peersRef.current.get(fromPeerId);
      if (!peer) {
        warn(`signal:answer(${label}): no peer state found, ignoring`);
        return;
      }
      const pc = peer.peerConnection!;
      log(`signal:answer(${label}): signalingState before setRemoteDescription = ${pc.signalingState}`);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data));
        log(`signal:answer(${label}): setRemoteDescription SUCCESS, signalingState = ${pc.signalingState}`);
      } catch (e) {
        warn(`signal:answer(${label}): setRemoteDescription FAILED`, e);
        return;
      }
      remoteDescriptionSetRef.current.add(fromPeerId);
      await flushPendingCandidates(fromPeerId);
    });

    socket.on("signal:candidate", async ({ fromPeerId, data }: { fromPeerId: string; toPeerId: string; data: RTCIceCandidateInit }) => {
      const label = fromPeerId.substring(0, 6);
      if (!remoteDescriptionSetRef.current.has(fromPeerId)) {
        const pending = pendingCandidatesRef.current.get(fromPeerId) || [];
        pending.push(data);
        pendingCandidatesRef.current.set(fromPeerId, pending);
        log(`signal:candidate(${label}): BUFFERED (remoteDescription not set yet), total buffered=${pending.length}`);
        return;
      }
      const peer = peersRef.current.get(fromPeerId);
      if (!peer) {
        warn(`signal:candidate(${label}): no peer state found, DROPPING candidate`);
        return;
      }
      try {
        await peer.peerConnection!.addIceCandidate(new RTCIceCandidate(data));
        log(`signal:candidate(${label}): added candidate OK`);
      } catch (e) {
        warn(`signal:candidate(${label}): addIceCandidate FAILED`, e);
      }
    });

    socket.on("error", ({ code, message }: { code: string; message: string }) => {
      warn(`socket error event: code=${code} message=${message}`);
      setRoomState((prev) => ({ ...prev, error: { code, message } }));
      toast.error(message);
    });

    socket.onAny((event, ...args) => {
      if (event.startsWith("signal:") || event.startsWith("peer:") || event.startsWith("room:")) {
        log(`[socket.onAny] event="${event}"`, JSON.stringify(args).substring(0, 200));
      }
    });
  }, [setupPeerConnection, flushPendingCandidates, getPeerLabel, updatePeerState]);

  const create = useCallback(async (pin?: string, username?: string) => {
    log("create: starting, pin=", pin ? "yes" : "no", "username=", username ?? "(none)");
    try {
      iceServersRef.current = await fetchIceServers();
      log("create: ICE servers fetched:", JSON.stringify(iceServersRef.current.map(s => s.urls)));
      setupSignaling();
      const socket = getSocket();
      if (!socket.connected) {
        log("create: socket not connected, calling connect()");
        socket.connect();
      }
      
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Connection timeout")), 10000);
        if (socket.connected) { clearTimeout(timeout); log("create: socket already connected"); resolve(); return; }
        socket.once("connect", () => { clearTimeout(timeout); log("create: socket connected via event"); resolve(); });
        socket.once("connect_error", (err) => { clearTimeout(timeout); warn("create: socket connect_error", err.message); reject(err); });
      });

      log("create: emitting room:create");
      const result = await sigCreateRoom(pin, username);
      log("create: room created, roomCode=", result.roomCode, "peerId=", result.peerId.substring(0, 6));
      selfPeerIdRef.current = result.peerId;
      setRoomState((prev) => ({
        ...prev,
        roomCode: result.roomCode,
        selfPeerId: result.peerId,
        selfUsername: username || null,
        isConnected: true,
        error: null,
      }));
      return result.roomCode;
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      warn("create: FAILED", error);
      setRoomState((prev) => ({
        ...prev,
        error: { code: error.code || "UNKNOWN", message: error.message || "Failed to create room" },
      }));
      toast.error(error.message || "Failed to create room");
      throw err;
    }
  }, [setupSignaling]);

  const join = useCallback(async (roomCode: string, pin?: string, username?: string) => {
    log("join: starting, roomCode=", roomCode, "pin=", pin ? "yes" : "no", "username=", username ?? "(none)");
    try {
      iceServersRef.current = await fetchIceServers();
      log("join: ICE servers fetched:", JSON.stringify(iceServersRef.current.map(s => s.urls)));
      setupSignaling();
      const socket = getSocket();
      if (!socket.connected) {
        log("join: socket not connected, calling connect()");
        socket.connect();
      }
      
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Connection timeout")), 10000);
        if (socket.connected) { clearTimeout(timeout); log("join: socket already connected"); resolve(); return; }
        socket.once("connect", () => { clearTimeout(timeout); log("join: socket connected via event"); resolve(); });
        socket.once("connect_error", (err) => { clearTimeout(timeout); warn("join: socket connect_error", err.message); reject(err); });
      });

      log("join: emitting room:join");
      const result = await sigJoinRoom(roomCode, pin, username);
      log("join: joined room, selfPeerId=", result.selfPeerId.substring(0, 6), "existingPeers=", result.peers.map(p => p.peerId.substring(0, 6)));
      selfPeerIdRef.current = result.selfPeerId;
      setRoomState((prev) => ({
        ...prev,
        roomCode: result.roomCode,
        selfPeerId: result.selfPeerId,
        selfUsername: username || null,
        isConnected: true,
        error: null,
      }));

      for (const existingPeer of result.peers) {
        const isImpolite = result.selfPeerId < existingPeer.peerId;
        log(`join: setting up peer ${existingPeer.peerId.substring(0, 6)}, isImpolite=${isImpolite}`);
        await setupPeerConnection(existingPeer.peerId, isImpolite, existingPeer.username);
      }
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      warn("join: FAILED", error);
      setRoomState((prev) => ({
        ...prev,
        error: { code: error.code || "UNKNOWN", message: error.message || "Failed to join room" },
      }));
      toast.error(error.message || "Failed to join room");
      throw err;
    }
  }, [setupSignaling, setupPeerConnection]);

  const leave = useCallback(() => {
    log("leave: cleaning up");
    for (const [, peer] of peersRef.current) {
      peer.peerConnection?.close();
    }
    peersRef.current.clear();
    abortControllersRef.current.forEach((ac) => ac.abort());
    abortControllersRef.current.clear();
    pendingCandidatesRef.current.clear();
    remoteDescriptionSetRef.current.clear();
    iceRestartAttemptedRef.current.clear();
    disconnectSocket();
    setRoomState({
      roomCode: null,
      selfPeerId: null,
      selfUsername: null,
      peers: new Map(),
      isConnected: false,
      error: null,
    });
    setTransfers([]);
    setSigConnected(false);
  }, []);

  const changeUsername = useCallback((name: string) => {
    const trimmed = name.trim().slice(0, 30);
    sigUpdateUsername(trimmed);
    setRoomState((prev) => ({ ...prev, selfUsername: trimmed || null }));
  }, []);

  const sendFiles = useCallback(
    async (files: File[], targetPeerIds: string[]) => {
      for (const file of files) {
        for (const peerId of targetPeerIds) {
          const peer = peersRef.current.get(peerId);
          if (!peer || !peer.dataChannel || peer.dataChannel.readyState !== "open") {
            toast.error(`Cannot send to peer ${getPeerLabel(peerId)} - not connected`);
            continue;
          }

          const ac = new AbortController();
          let realFileId: string | null = null;

          sendFile(
            file,
            peer.dataChannel,
            peerId,
            getPeerLabel(peerId),
            (update) => {
              if (!realFileId && update.fileId) {
                realFileId = update.fileId;
                abortControllersRef.current.set(realFileId, ac);
              }

              setTransfers((prev) => {
                const idx = prev.findIndex((t) => t.fileId === update.fileId && t.peerId === update.peerId);
                if (idx >= 0) {
                  const next = [...prev];
                  next[idx] = { ...next[idx], ...update };
                  return next;
                }
                return [...prev, update as TransferState];
              });
            },
            ac.signal,
          ).then((result) => {
            if (result.status === "completed") {
              toast.success(`Sent ${file.name} to ${getPeerLabel(peerId)}`);
            }
            if (realFileId) abortControllersRef.current.delete(realFileId);
          });
        }
      }
    },
    [getPeerLabel],
  );

  const cancelTransfer = useCallback((fileId: string) => {
    const ac = abortControllersRef.current.get(fileId);
    if (ac) ac.abort();
  }, []);

  const retryPeer = useCallback(
    async (peerId: string) => {
      log(`retryPeer(${peerId.substring(0, 6)}): retrying with fresh ICE servers`);
      const peer = peersRef.current.get(peerId);
      if (peer) {
        peer.peerConnection?.close();
        peersRef.current.delete(peerId);
      }
      pendingCandidatesRef.current.delete(peerId);
      remoteDescriptionSetRef.current.delete(peerId);
      iceRestartAttemptedRef.current.delete(peerId);
      try {
        iceServersRef.current = await fetchIceServers();
        log(`retryPeer(${peerId.substring(0, 6)}): refreshed ICE servers: ${JSON.stringify(iceServersRef.current.map(s => s.urls))}`);
      } catch (e) {
        warn(`retryPeer(${peerId.substring(0, 6)}): failed to refresh ICE servers, using cached`, e);
      }
      const selfId = selfPeerIdRef.current!;
      const isImpolite = selfId < peerId;
      await setupPeerConnection(peerId, isImpolite);
    },
    [setupPeerConnection],
  );

  useEffect(() => {
    return () => {
      leave();
    };
  }, [leave]);

  return {
    roomState,
    transfers,
    sigConnected,
    create,
    join,
    leave,
    changeUsername,
    sendFiles,
    cancelTransfer,
    retryPeer,
  };
}
