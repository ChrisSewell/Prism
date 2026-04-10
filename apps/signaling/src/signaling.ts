import type { Server as SocketIOServer, Socket } from "socket.io";
import { SIGNALING_VERSION } from "@prism/protocol";
import { RoomManager } from "./rooms.js";
import type { Config } from "./config.js";

const log = (...args: unknown[]) => console.log("[signaling]", ...args);
const warn = (...args: unknown[]) => console.warn("[signaling]", ...args);

export function setupSignaling(
  io: SocketIOServer,
  config: Config,
): RoomManager {
  const rooms = new RoomManager(config);

  io.use((socket, next) => {
    const version = Number(socket.handshake.auth?.protocolVersion);
    log(`middleware: socket=${socket.id} protocolVersion=${version} expected=${SIGNALING_VERSION}`);
    if (!version || Math.floor(version) !== SIGNALING_VERSION) {
      warn(`middleware: rejecting socket=${socket.id}, bad protocolVersion=${version}`);
      return next(
        new Error(
          `Unsupported protocol version: ${version} (expected ${SIGNALING_VERSION})`,
        ),
      );
    }
    next();
  });

  io.on("connection", (socket: Socket) => {
    log(`connection: socket=${socket.id} connected`);

    socket.on("room:create", (dataOrCb?: { pin?: string } | ((res: unknown) => void), callback?: (res: unknown) => void) => {
      let data: { pin?: string } | undefined;
      let cb: ((res: unknown) => void) | undefined;
      if (typeof dataOrCb === "function") {
        cb = dataOrCb;
      } else {
        data = dataOrCb;
        cb = callback;
      }

      const pin = data?.pin;
      log(`room:create: socket=${socket.id} pin=${pin ? "yes" : "no"}`);

      if (pin !== undefined) {
        if (typeof pin !== "string" || !/^\d{4,8}$/.test(pin)) {
          const err = { code: "INVALID_PAYLOAD", message: "PIN must be 4-8 digits" };
          warn(`room:create: invalid PIN from socket=${socket.id}`);
          if (typeof cb === "function") return cb({ error: err });
          socket.emit("error", err);
          return;
        }
      }

      const result = rooms.createRoom(socket.id, pin);
      if (!result.ok) {
        warn(`room:create: FAILED for socket=${socket.id}, code=${result.code}, message=${result.message}`);
        const errPayload = { code: result.code, message: result.message };
        if (typeof cb === "function") return cb({ error: errPayload });
        socket.emit("error", errPayload);
        return;
      }

      socket.join(result.roomCode);
      log(`room:create: SUCCESS socket=${socket.id} roomCode=${result.roomCode} peerId=${result.peerId.substring(0, 6)}`);
      const payload = { roomCode: result.roomCode, peerId: result.peerId, hasPin: result.hasPin };
      if (typeof cb === "function") return cb(payload);
      socket.emit("room:created", payload);
    });

    socket.on(
      "room:join",
      (data: { roomCode?: string; pin?: string }, callback?: (res: unknown) => void) => {
        log(`room:join: socket=${socket.id} roomCode=${data?.roomCode} pin=${data?.pin ? "yes" : "no"}`);

        if (!data?.roomCode || typeof data.roomCode !== "string") {
          const err = { code: "INVALID_PAYLOAD", message: "roomCode required" };
          warn(`room:join: missing roomCode from socket=${socket.id}`);
          if (typeof callback === "function") return callback({ error: err });
          socket.emit("error", err);
          return;
        }

        if (data.pin !== undefined && (typeof data.pin !== "string" || !/^\d{4,8}$/.test(data.pin))) {
          const err = { code: "INVALID_PAYLOAD", message: "PIN must be 4-8 digits" };
          warn(`room:join: invalid PIN from socket=${socket.id}`);
          if (typeof callback === "function") return callback({ error: err });
          socket.emit("error", err);
          return;
        }

        const result = rooms.joinRoom(socket.id, data.roomCode, data.pin);
        if (!result.ok) {
          warn(`room:join: FAILED for socket=${socket.id}, code=${result.code}, message=${result.message}`);
          const errPayload = { code: result.code, message: result.message };
          if (typeof callback === "function") return callback({ error: errPayload });
          socket.emit("error", errPayload);
          return;
        }

        socket.join(data.roomCode);
        log(`room:join: SUCCESS socket=${socket.id} roomCode=${data.roomCode} peerId=${result.peerId.substring(0, 6)} existingPeers=[${result.existingPeers.map((p: string) => p.substring(0, 6)).join(", ")}]`);

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
        log(`room:join: emitted peer:joined to room ${data.roomCode} for peerId=${result.peerId.substring(0, 6)}`);
      },
    );

    socket.on(
      "signal:offer",
      (data: { toPeerId?: string; data?: unknown }) => {
        log(`signal:offer: from socket=${socket.id} toPeerId=${data?.toPeerId?.substring(0, 6)}`);
        relaySignal(socket, rooms, "signal:offer", data);
      },
    );

    socket.on(
      "signal:answer",
      (data: { toPeerId?: string; data?: unknown }) => {
        log(`signal:answer: from socket=${socket.id} toPeerId=${data?.toPeerId?.substring(0, 6)}`);
        relaySignal(socket, rooms, "signal:answer", data);
      },
    );

    socket.on(
      "signal:candidate",
      (data: { toPeerId?: string; data?: unknown }) => {
        log(`signal:candidate: from socket=${socket.id} toPeerId=${data?.toPeerId?.substring(0, 6)}`);
        relaySignal(socket, rooms, "signal:candidate", data);
      },
    );

    socket.on("disconnect", (reason) => {
      log(`disconnect: socket=${socket.id} reason=${reason}`);
      const result = rooms.removePeer(socket.id);
      if (result) {
        log(`disconnect: removed peerId=${result.peerId.substring(0, 6)} from room=${result.roomCode}, roomDeleted=${result.roomDeleted}`);
        if (!result.roomDeleted) {
          socket.to(result.roomCode).emit("peer:left", {
            peerId: result.peerId,
          });
        }
      } else {
        log(`disconnect: socket=${socket.id} was not in any room`);
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
    warn(`relaySignal(${event}): missing toPeerId from socket=${socket.id}`);
    socket.emit("error", {
      code: "INVALID_PAYLOAD",
      message: "toPeerId required",
    });
    return;
  }

  const mapping = rooms.getPeerMapping(socket.id);
  if (!mapping) {
    warn(`relaySignal(${event}): socket=${socket.id} NOT_IN_ROOM`);
    socket.emit("error", {
      code: "NOT_IN_ROOM",
      message: "You are not in a room",
    });
    return;
  }

  if (!rooms.isPeerInRoom(mapping.roomCode, data.toPeerId)) {
    warn(`relaySignal(${event}): target peerId=${data.toPeerId.substring(0, 6)} PEER_NOT_FOUND in room=${mapping.roomCode}`);
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
  if (!targetSocketId) {
    warn(`relaySignal(${event}): no socketId found for peerId=${data.toPeerId.substring(0, 6)}`);
    return;
  }

  rooms.touchRoom(mapping.roomCode);

  log(`relaySignal(${event}): ${mapping.peerId.substring(0, 6)} -> ${data.toPeerId.substring(0, 6)} (socket ${socket.id} -> ${targetSocketId})`);
  socket.to(targetSocketId).emit(event, {
    fromPeerId: mapping.peerId,
    toPeerId: data.toPeerId,
    data: data.data,
  });
}
