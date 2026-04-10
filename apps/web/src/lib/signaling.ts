import { io, Socket } from "socket.io-client";
import { SIGNALING_URL } from "./config";

const log = (...args: unknown[]) => console.log("[signaling-client]", ...args);
const warn = (...args: unknown[]) => console.warn("[signaling-client]", ...args);

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    log("getSocket: creating new socket, url=", SIGNALING_URL);
    socket = io(SIGNALING_URL, {
      transports: ["websocket"],
      auth: { protocolVersion: 1 },
      autoConnect: false,
    });
    socket.on("connect", () => log("socket connected, id=", socket?.id));
    socket.on("disconnect", (reason) => log("socket disconnected, reason=", reason));
    socket.on("connect_error", (err) => warn("socket connect_error:", err.message));
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    log("disconnectSocket: disconnecting, id=", socket.id);
    socket.disconnect();
    socket = null;
  }
}

export interface CreateRoomResult {
  roomCode: string;
  peerId: string;
  hasPin: boolean;
}

export interface JoinRoomResult {
  roomCode: string;
  peers: string[];
  selfPeerId: string;
}

export function createRoom(pin?: string): Promise<CreateRoomResult> {
  return new Promise((resolve, reject) => {
    const s = getSocket();
    if (!s.connected) s.connect();
    log("createRoom: emitting room:create, pin=", pin ? "yes" : "no");
    const cb = (response: CreateRoomResult & { error?: { code: string; message: string } }) => {
      if (response.error) {
        warn("createRoom: server returned error", response.error);
        reject(response.error);
      } else {
        log("createRoom: success, roomCode=", response.roomCode, "peerId=", response.peerId.substring(0, 6));
        resolve(response);
      }
    };
    if (pin) {
      s.emit("room:create", { pin }, cb);
    } else {
      s.emit("room:create", cb);
    }
  });
}

export function joinRoom(roomCode: string, pin?: string): Promise<JoinRoomResult> {
  return new Promise((resolve, reject) => {
    const s = getSocket();
    if (!s.connected) s.connect();
    const payload: { roomCode: string; pin?: string } = { roomCode };
    if (pin) {
      payload.pin = pin;
    }
    log("joinRoom: emitting room:join, roomCode=", roomCode, "pin=", pin ? "yes" : "no");
    s.emit("room:join", payload, (response: JoinRoomResult & { error?: { code: string; message: string } }) => {
      if (response.error) {
        warn("joinRoom: server returned error", response.error);
        reject(response.error);
      } else {
        log("joinRoom: success, selfPeerId=", response.selfPeerId.substring(0, 6), "peers=", response.peers.map(p => p.substring(0, 6)));
        resolve(response);
      }
    });
  });
}

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export async function fetchIceServers(): Promise<RTCIceServer[]> {
  try {
    const url = `${SIGNALING_URL}/api/ice`;
    log("fetchIceServers: fetching from", url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ICE servers: ${res.status}`);
    const data = await res.json();
    const servers: RTCIceServer[] = data.iceServers ?? [];
    log("fetchIceServers: got", servers.length, "servers:", JSON.stringify(servers.map((s: RTCIceServer) => s.urls)));
    if (servers.length === 0) {
      log("fetchIceServers: server returned empty ICE config, using default STUN");
      return DEFAULT_ICE_SERVERS;
    }
    return servers;
  } catch (e) {
    warn("fetchIceServers: FAILED, falling back to default STUN", e);
    return DEFAULT_ICE_SERVERS;
  }
}
