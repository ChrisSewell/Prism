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
  | "peer:update-name"
  | "signal:offer"
  | "signal:answer"
  | "signal:candidate"
  | "error";

export interface RoomCreatePayload {
  pin?: string;
  username?: string;
}

export interface RoomCreatedPayload {
  roomCode: string;
  peerId: string;
  hasPin: boolean;
}

export interface RoomJoinPayload {
  roomCode: string;
  pin?: string;
  username?: string;
}

export interface RosterPeer {
  peerId: string;
  username?: string;
}

export interface RosterPayload {
  roomCode: string;
  peers: RosterPeer[];
  selfPeerId: string;
}

export interface PeerJoinedPayload {
  peerId: string;
  username?: string;
}

export interface PeerUpdateNamePayload {
  peerId: string;
  username?: string;
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
