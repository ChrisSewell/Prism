export type PeerConnectionState = "connecting" | "connected" | "failed" | "disconnected";

export type RelayType = "direct" | "relayed" | "unknown";

export interface PeerState {
  peerId: string;
  username?: string;
  connectionState: PeerConnectionState;
  relayType?: RelayType;
  peerConnection: RTCPeerConnection | null;
  dataChannel: RTCDataChannel | null;
  outgoingTransfers: Map<string, TransferState>;
  incomingTransfers: Map<string, TransferState>;
}

export type TransferStatus = "pending" | "transferring" | "completed" | "failed" | "cancelled";
export type TransferDirection = "sending" | "receiving";

export interface TransferState {
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  bytesTransferred: number;
  status: TransferStatus;
  direction: TransferDirection;
  peerId: string;
  peerLabel: string;
  blobUrl?: string;
  startTime: number;
  lastProgressTime?: number;
  file?: File; // for outgoing
  chunks?: Uint8Array[]; // for incoming
}

export interface RoomState {
  roomCode: string | null;
  selfPeerId: string | null;
  selfUsername?: string | null;
  peers: Map<string, PeerState>;
  isConnected: boolean;
  error: { code: string; message: string } | null;
}

export interface IceServersResponse {
  iceServers: RTCIceServer[];
}
