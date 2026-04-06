import { io, Socket } from "socket.io-client";
import { SIGNALING_URL } from "./config";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SIGNALING_URL, {
      transports: ["websocket"],
      auth: { protocolVersion: 1 },
      autoConnect: false,
    });
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
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
    const cb = (response: CreateRoomResult & { error?: { code: string; message: string } }) => {
      if (response.error) {
        reject(response.error);
      } else {
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
    s.emit("room:join", payload, (response: JoinRoomResult & { error?: { code: string; message: string } }) => {
      if (response.error) {
        reject(response.error);
      } else {
        resolve(response);
      }
    });
  });
}

export async function fetchIceServers(): Promise<RTCIceServer[]> {
  try {
    const res = await fetch(`${SIGNALING_URL}/api/ice`);
    if (!res.ok) throw new Error("Failed to fetch ICE servers");
    const data = await res.json();
    return data.iceServers;
  } catch {
    return [{ urls: "stun:stun.l.google.com:19302" }];
  }
}
