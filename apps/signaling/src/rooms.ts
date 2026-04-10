import crypto from "node:crypto";
import type { Config } from "./config.js";

const MAX_USERNAME_LENGTH = 30;

function sanitizeUsername(raw?: string): string {
  if (!raw || typeof raw !== "string") return "";
  return raw.trim().slice(0, MAX_USERNAME_LENGTH);
}

export interface Peer {
  peerId: string;
  socketId: string;
  joinedAt: number;
  username?: string;
}

export interface Room {
  code: string;
  peers: Map<string, Peer>;
  creatorPeerId: string;
  createdAt: number;
  lastActivityAt: number;
  pinHash?: string;
}

export class RoomManager {
  private rooms = new Map<string, Room>();
  private socketToRoom = new Map<string, { roomCode: string; peerId: string }>();
  private globalPeerCount = 0;
  private ttlTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private config: Config) {}

  get stats() {
    return {
      rooms: this.rooms.size,
      globalPeers: this.globalPeerCount,
    };
  }

  startTtlSweep(): void {
    this.ttlTimer = setInterval(() => this.sweepExpired(), 30000);
  }

  stopTtlSweep(): void {
    if (this.ttlTimer) {
      clearInterval(this.ttlTimer);
      this.ttlTimer = null;
    }
  }

  sweepExpired(): string[] {
    const now = Date.now();
    const expired: string[] = [];
    for (const [code, room] of this.rooms) {
      if (now - room.lastActivityAt > this.config.roomTtlMs) {
        this.globalPeerCount -= room.peers.size;
        for (const peer of room.peers.values()) {
          this.socketToRoom.delete(peer.socketId);
        }
        this.rooms.delete(code);
        expired.push(code);
      }
    }
    return expired;
  }

  createRoom(socketId: string, pin?: string, username?: string): {
    ok: true;
    roomCode: string;
    peerId: string;
    hasPin: boolean;
  } | { ok: false; code: string; message: string } {
    if (this.globalPeerCount >= this.config.maxGlobalPeers) {
      return {
        ok: false,
        code: "GLOBAL_PEER_LIMIT",
        message: "Server peer limit reached",
      };
    }

    const roomCode = this.generateRoomCode();
    const peerId = crypto.randomUUID();
    const now = Date.now();
    const sanitized = sanitizeUsername(username);

    const peer: Peer = { peerId, socketId, joinedAt: now, username: sanitized || undefined };
    const room: Room = {
      code: roomCode,
      peers: new Map([[peerId, peer]]),
      creatorPeerId: peerId,
      createdAt: now,
      lastActivityAt: now,
    };

    if (pin) {
      room.pinHash = this.hashPin(pin);
    }

    this.rooms.set(roomCode, room);
    this.socketToRoom.set(socketId, { roomCode, peerId });
    this.globalPeerCount++;

    return { ok: true, roomCode, peerId, hasPin: !!pin };
  }

  joinRoom(
    socketId: string,
    roomCode: string,
    pin?: string,
    username?: string,
  ): {
    ok: true;
    peerId: string;
    username?: string;
    existingPeers: Array<{ peerId: string; username?: string }>;
  } | { ok: false; code: string; message: string } {
    const room = this.rooms.get(roomCode);
    if (!room) {
      return { ok: false, code: "ROOM_NOT_FOUND", message: "Room not found" };
    }

    if (room.pinHash) {
      if (!pin || this.hashPin(pin) !== room.pinHash) {
        return { ok: false, code: "INVALID_PIN", message: "Incorrect room PIN" };
      }
    }

    if (room.peers.size >= this.config.maxPeersPerRoom) {
      return { ok: false, code: "ROOM_FULL", message: "Room is full" };
    }

    if (this.globalPeerCount >= this.config.maxGlobalPeers) {
      return {
        ok: false,
        code: "GLOBAL_PEER_LIMIT",
        message: "Server peer limit reached",
      };
    }

    const peerId = crypto.randomUUID();
    const sanitized = sanitizeUsername(username);
    const peer: Peer = { peerId, socketId, joinedAt: Date.now(), username: sanitized || undefined };
    const existingPeers = Array.from(room.peers.values()).map((p) => ({
      peerId: p.peerId,
      username: p.username,
    }));

    room.peers.set(peerId, peer);
    room.lastActivityAt = Date.now();
    this.socketToRoom.set(socketId, { roomCode, peerId });
    this.globalPeerCount++;

    return { ok: true, peerId, username: sanitized || undefined, existingPeers };
  }

  removePeer(socketId: string): {
    roomCode: string;
    peerId: string;
    remainingPeers: string[];
    roomDeleted: boolean;
  } | null {
    const mapping = this.socketToRoom.get(socketId);
    if (!mapping) return null;

    const { roomCode, peerId } = mapping;
    const room = this.rooms.get(roomCode);
    if (!room) {
      this.socketToRoom.delete(socketId);
      return null;
    }

    room.peers.delete(peerId);
    this.socketToRoom.delete(socketId);
    this.globalPeerCount--;

    let roomDeleted = false;
    if (room.peers.size === 0) {
      this.rooms.delete(roomCode);
      roomDeleted = true;
    } else {
      room.lastActivityAt = Date.now();
    }

    return {
      roomCode,
      peerId,
      remainingPeers: Array.from(room.peers.keys()),
      roomDeleted,
    };
  }

  getPeerMapping(socketId: string): { roomCode: string; peerId: string } | undefined {
    return this.socketToRoom.get(socketId);
  }

  getRoom(roomCode: string): Room | undefined {
    return this.rooms.get(roomCode);
  }

  isPeerInRoom(roomCode: string, peerId: string): boolean {
    const room = this.rooms.get(roomCode);
    return room ? room.peers.has(peerId) : false;
  }

  getSocketIdForPeer(roomCode: string, peerId: string): string | undefined {
    const room = this.rooms.get(roomCode);
    if (!room) return undefined;
    return room.peers.get(peerId)?.socketId;
  }

  touchRoom(roomCode: string): void {
    const room = this.rooms.get(roomCode);
    if (room) {
      room.lastActivityAt = Date.now();
    }
  }

  updatePeerName(socketId: string, username?: string): {
    ok: true;
    roomCode: string;
    peerId: string;
    username?: string;
  } | { ok: false; code: string; message: string } {
    const mapping = this.socketToRoom.get(socketId);
    if (!mapping) {
      return { ok: false, code: "NOT_IN_ROOM", message: "You are not in a room" };
    }
    const room = this.rooms.get(mapping.roomCode);
    if (!room) {
      return { ok: false, code: "NOT_IN_ROOM", message: "You are not in a room" };
    }
    const peer = room.peers.get(mapping.peerId);
    if (!peer) {
      return { ok: false, code: "NOT_IN_ROOM", message: "You are not in a room" };
    }
    const sanitized = sanitizeUsername(username);
    peer.username = sanitized || undefined;
    room.lastActivityAt = Date.now();
    return { ok: true, roomCode: mapping.roomCode, peerId: mapping.peerId, username: peer.username };
  }

  roomHasPin(roomCode: string): boolean {
    const room = this.rooms.get(roomCode);
    return room ? !!room.pinHash : false;
  }

  private hashPin(pin: string): string {
    return crypto.createHash("sha256").update(pin).digest("hex");
  }

  private generateRoomCode(): string {
    const bytes = crypto.randomBytes(6);
    return bytes.toString("base64url").slice(0, 8);
  }
}
