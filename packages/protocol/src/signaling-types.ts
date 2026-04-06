/** Signaling protocol version — distinct from framing PROTOCOL_VERSION */
export const SIGNALING_VERSION = 1;

export type SignalingEvent =
  | "room:create"
  | "room:join"
  | "room:created"
  | "room:roster"
  | "peer:joined"
  | "peer:left"
  | "peer:kicked"
  | "signal:offer"
  | "signal:answer"
  | "signal:candidate"
  | "error";

export interface RoomCreatePayload {
  pin?: string;
}

export interface RoomCreatedPayload {
  roomCode: string;
  peerId: string;
  hasPin: boolean;
}

export interface RoomJoinPayload {
  roomCode: string;
  pin?: string;
}

export interface RosterPayload {
  roomCode: string;
  peers: string[];
  selfPeerId: string;
}

export interface PeerJoinedPayload {
  peerId: string;
}

export interface PeerLeftPayload {
  peerId: string;
}

export interface SignalPayload {
  toPeerId: string;
  fromPeerId?: string;
  data: Record<string, unknown>;
}

export interface ErrorPayload {
  code: string;
  message: string;
}

export interface IceConfig {
  iceServers: Array<{
    urls: string | string[];
    username?: string;
    credential?: string;
  }>;
}
