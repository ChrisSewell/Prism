import { useState, useCallback, useRef, useEffect } from "react";
import { toast } from "sonner";
import type { PeerState, PeerConnectionState, TransferState, RoomState } from "@/lib/types";
import { getSocket, disconnectSocket, createRoom as sigCreateRoom, joinRoom as sigJoinRoom, fetchIceServers } from "@/lib/signaling";
import { createPeerConnection, createDataChannel, sendFile, handleIncomingFrame } from "@/lib/webrtc";

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
    return peerId.substring(0, 6);
  }, []);

  const setupPeerConnection = useCallback(
    async (peerId: string, isImpolite: boolean) => {
      const socket = getSocket();

      const onIceCandidate = (candidate: RTCIceCandidate) => {
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
        updatePeerState(peerId, { connectionState: mapped });
        if (mapped === "connected") {
          toast.success(`Connected to peer ${getPeerLabel(peerId)}`);
        } else if (mapped === "failed") {
          toast.error(`Connection to peer ${getPeerLabel(peerId)} failed`);
        }
      };

      const onDataChannel = (channel: RTCDataChannel) => {
        updatePeerState(peerId, { dataChannel: channel });
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

      const pc = createPeerConnection(iceServersRef.current, onIceCandidate, onConnectionStateChange, onDataChannel);
      
      const peerState: PeerState = {
        peerId,
        connectionState: "connecting",
        peerConnection: pc,
        dataChannel: null,
        outgoingTransfers: new Map(),
        incomingTransfers: new Map(),
      };
      peersRef.current.set(peerId, peerState);
      setRoomState((prev) => ({ ...prev, peers: new Map(peersRef.current) }));

      // If impolite (selfPeerId < peerId), we create offer
      if (isImpolite) {
        const dc = createDataChannel(pc);
        peerState.dataChannel = dc;
        dc.onopen = () => {
          updatePeerState(peerId, { connectionState: "connected" });
        };
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
        await pc.setLocalDescription(offer);
        socket.emit("signal:offer", {
          toPeerId: peerId,
          data: { sdp: offer.sdp, type: offer.type },
        });
      }
    },
    [updatePeerState, updateTransfer, getPeerLabel],
  );

  const setupSignaling = useCallback(() => {
    const socket = getSocket();

    socket.on("connect", () => setSigConnected(true));
    socket.on("disconnect", () => setSigConnected(false));

    socket.on("peer:joined", ({ peerId }: { peerId: string }) => {
      toast(`Peer ${peerId.substring(0, 6)} joined`);
      const selfId = selfPeerIdRef.current!;
      const isImpolite = selfId < peerId;
      setupPeerConnection(peerId, isImpolite);
    });

    socket.on("peer:left", ({ peerId }: { peerId: string }) => {
      toast(`Peer ${peerId.substring(0, 6)} left`);
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

    socket.on("signal:offer", async ({ fromPeerId, data }: { fromPeerId: string; toPeerId: string; data: RTCSessionDescriptionInit }) => {
      let peer = peersRef.current.get(fromPeerId);
      if (!peer) {
        await setupPeerConnection(fromPeerId, false);
        peer = peersRef.current.get(fromPeerId)!;
      }
      const pc = peer.peerConnection!;
      await pc.setRemoteDescription(new RTCSessionDescription(data));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("signal:answer", {
        toPeerId: fromPeerId,
        data: { sdp: answer.sdp, type: answer.type },
      });
    });

    socket.on("signal:answer", async ({ fromPeerId, data }: { fromPeerId: string; toPeerId: string; data: RTCSessionDescriptionInit }) => {
      const peer = peersRef.current.get(fromPeerId);
      if (!peer) return;
      await peer.peerConnection!.setRemoteDescription(new RTCSessionDescription(data));
    });

    socket.on("signal:candidate", async ({ fromPeerId, data }: { fromPeerId: string; toPeerId: string; data: RTCIceCandidateInit }) => {
      const peer = peersRef.current.get(fromPeerId);
      if (!peer) return;
      try {
        await peer.peerConnection!.addIceCandidate(new RTCIceCandidate(data));
      } catch (e) {
        console.warn("Failed to add ICE candidate", e);
      }
    });

    socket.on("error", ({ code, message }: { code: string; message: string }) => {
      setRoomState((prev) => ({ ...prev, error: { code, message } }));
      toast.error(message);
    });
  }, [setupPeerConnection]);

  const create = useCallback(async () => {
    try {
      iceServersRef.current = await fetchIceServers();
      setupSignaling();
      const socket = getSocket();
      if (!socket.connected) socket.connect();
      
      // Wait for connection
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Connection timeout")), 10000);
        if (socket.connected) { clearTimeout(timeout); resolve(); return; }
        socket.once("connect", () => { clearTimeout(timeout); resolve(); });
        socket.once("connect_error", (err) => { clearTimeout(timeout); reject(err); });
      });

      const result = await sigCreateRoom();
      selfPeerIdRef.current = result.peerId;
      setRoomState((prev) => ({
        ...prev,
        roomCode: result.roomCode,
        selfPeerId: result.peerId,
        isConnected: true,
        error: null,
      }));
      return result.roomCode;
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      setRoomState((prev) => ({
        ...prev,
        error: { code: error.code || "UNKNOWN", message: error.message || "Failed to create room" },
      }));
      toast.error(error.message || "Failed to create room");
      throw err;
    }
  }, [setupSignaling]);

  const join = useCallback(async (roomCode: string) => {
    try {
      iceServersRef.current = await fetchIceServers();
      setupSignaling();
      const socket = getSocket();
      if (!socket.connected) socket.connect();
      
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Connection timeout")), 10000);
        if (socket.connected) { clearTimeout(timeout); resolve(); return; }
        socket.once("connect", () => { clearTimeout(timeout); resolve(); });
        socket.once("connect_error", (err) => { clearTimeout(timeout); reject(err); });
      });

      const result = await sigJoinRoom(roomCode);
      selfPeerIdRef.current = result.selfPeerId;
      setRoomState((prev) => ({
        ...prev,
        roomCode: result.roomCode,
        selfPeerId: result.selfPeerId,
        isConnected: true,
        error: null,
      }));

      // Connect to existing peers
      for (const existingPeerId of result.peers) {
        const isImpolite = result.selfPeerId < existingPeerId;
        await setupPeerConnection(existingPeerId, isImpolite);
      }
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      setRoomState((prev) => ({
        ...prev,
        error: { code: error.code || "UNKNOWN", message: error.message || "Failed to join room" },
      }));
      toast.error(error.message || "Failed to join room");
      throw err;
    }
  }, [setupSignaling, setupPeerConnection]);

  const leave = useCallback(() => {
    for (const [, peer] of peersRef.current) {
      peer.peerConnection?.close();
    }
    peersRef.current.clear();
    abortControllersRef.current.forEach((ac) => ac.abort());
    abortControllersRef.current.clear();
    disconnectSocket();
    setRoomState({
      roomCode: null,
      selfPeerId: null,
      peers: new Map(),
      isConnected: false,
      error: null,
    });
    setTransfers([]);
    setSigConnected(false);
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
      const peer = peersRef.current.get(peerId);
      if (peer) {
        peer.peerConnection?.close();
        peersRef.current.delete(peerId);
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
    sendFiles,
    cancelTransfer,
    retryPeer,
  };
}
