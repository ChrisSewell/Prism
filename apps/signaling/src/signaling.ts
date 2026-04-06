import type { Server as SocketIOServer, Socket } from "socket.io";
import { SIGNALING_VERSION } from "@prism/protocol";
import { RoomManager } from "./rooms.js";
import type { Config } from "./config.js";

export function setupSignaling(
  io: SocketIOServer,
  config: Config,
): RoomManager {
  const rooms = new RoomManager(config);

  io.use((socket, next) => {
    const version = Number(socket.handshake.auth?.protocolVersion);
    if (!version || Math.floor(version) !== SIGNALING_VERSION) {
      return next(
        new Error(
          `Unsupported protocol version: ${version} (expected ${SIGNALING_VERSION})`,
        ),
      );
    }
    next();
  });

  io.on("connection", (socket: Socket) => {
    socket.on("room:create", (callback?: (res: unknown) => void) => {
      const result = rooms.createRoom(socket.id);
      if (!result.ok) {
        const errPayload = { code: result.code, message: result.message };
        if (typeof callback === "function") return callback({ error: errPayload });
        socket.emit("error", errPayload);
        return;
      }

      socket.join(result.roomCode);
      const payload = { roomCode: result.roomCode, peerId: result.peerId };
      if (typeof callback === "function") return callback(payload);
      socket.emit("room:created", payload);
    });

    socket.on(
      "room:join",
      (data: { roomCode?: string }, callback?: (res: unknown) => void) => {
        if (!data?.roomCode || typeof data.roomCode !== "string") {
          const err = { code: "INVALID_PAYLOAD", message: "roomCode required" };
          if (typeof callback === "function") return callback({ error: err });
          socket.emit("error", err);
          return;
        }

        const result = rooms.joinRoom(socket.id, data.roomCode);
        if (!result.ok) {
          const errPayload = { code: result.code, message: result.message };
          if (typeof callback === "function") return callback({ error: errPayload });
          socket.emit("error", errPayload);
          return;
        }

        socket.join(data.roomCode);

        const rosterPayload = {
          roomCode: data.roomCode,
          peers: result.existingPeers,
          selfPeerId: result.peerId,
        };
        if (typeof callback === "function") callback(rosterPayload);
        else socket.emit("room:roster", rosterPayload);

        socket.to(data.roomCode).emit("peer:joined", {
          peerId: result.peerId,
        });
      },
    );

    socket.on(
      "signal:offer",
      (data: { toPeerId?: string; data?: unknown }) => {
        relaySignal(socket, rooms, "signal:offer", data);
      },
    );

    socket.on(
      "signal:answer",
      (data: { toPeerId?: string; data?: unknown }) => {
        relaySignal(socket, rooms, "signal:answer", data);
      },
    );

    socket.on(
      "signal:candidate",
      (data: { toPeerId?: string; data?: unknown }) => {
        relaySignal(socket, rooms, "signal:candidate", data);
      },
    );

    socket.on("disconnect", () => {
      const result = rooms.removePeer(socket.id);
      if (result && !result.roomDeleted) {
        socket.to(result.roomCode).emit("peer:left", {
          peerId: result.peerId,
        });
      }
    });
  });

  return rooms;
}

function relaySignal(
  socket: Socket,
  rooms: RoomManager,
  event: string,
  data: { toPeerId?: string; data?: unknown },
): void {
  if (!data?.toPeerId || typeof data.toPeerId !== "string") {
    socket.emit("error", {
      code: "INVALID_PAYLOAD",
      message: "toPeerId required",
    });
    return;
  }

  const mapping = rooms.getPeerMapping(socket.id);
  if (!mapping) {
    socket.emit("error", {
      code: "NOT_IN_ROOM",
      message: "You are not in a room",
    });
    return;
  }

  if (!rooms.isPeerInRoom(mapping.roomCode, data.toPeerId)) {
    socket.emit("error", {
      code: "PEER_NOT_FOUND",
      message: "Target peer is not in this room",
    });
    return;
  }

  const targetSocketId = rooms.getSocketIdForPeer(
    mapping.roomCode,
    data.toPeerId,
  );
  if (!targetSocketId) return;

  rooms.touchRoom(mapping.roomCode);

  socket.to(targetSocketId).emit(event, {
    fromPeerId: mapping.peerId,
    toPeerId: data.toPeerId,
    data: data.data,
  });
}
