import express from "express";
import crypto from "node:crypto";
import cors from "cors";
import http from "node:http";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { Server as SocketIOServer } from "socket.io";
import type { Config } from "./config.js";
import { setupSignaling } from "./signaling.js";
import type { RoomManager } from "./rooms.js";
import type { IceConfig } from "@prism/protocol";

const MAX_SOCKET_PAYLOAD = 16 * 1024;
const TURN_CREDENTIAL_TTL = 86400;

export interface AppContext {
  app: express.Express;
  server: http.Server;
  io: SocketIOServer;
  rooms: RoomManager;
  config: Config;
}

export function createApp(config: Config): AppContext {
  const app = express();

  app.use(helmet());
  app.disable("x-powered-by");

  const corsOrigins =
    config.allowedOrigins.length > 0 ? config.allowedOrigins : false;

  if (corsOrigins) {
    app.use(
      cors({
        origin: corsOrigins,
        methods: ["GET", "OPTIONS"],
        credentials: false,
      }),
    );
  }

  const limiter = rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitMaxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "RATE_LIMITED", message: "Too many requests" },
  });

  app.use(limiter);

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/ice", (_req, res) => {
    const iceConfig: IceConfig = { iceServers: [] };

    if (config.stunUrls.length > 0) {
      iceConfig.iceServers.push({ urls: config.stunUrls });
    }

    if (config.turnUrls.length > 0 && config.turnSecret && !config.turnUsername) {
      const expiry = Math.floor(Date.now() / 1000) + TURN_CREDENTIAL_TTL;
      const username = `${expiry}:${crypto.randomUUID()}`;
      const credential = crypto
        .createHmac("sha1", config.turnSecret)
        .update(username)
        .digest("base64");
      iceConfig.iceServers.push({
        urls: config.turnUrls,
        username,
        credential,
      });
    } else if (config.turnUrls.length > 0) {
      iceConfig.iceServers.push({
        urls: config.turnUrls,
        ...(config.turnUsername && { username: config.turnUsername }),
        ...(config.turnCredential && { credential: config.turnCredential }),
      });
    }

    res.json(iceConfig);
  });

  const server = http.createServer(app);

  const io = new SocketIOServer(server, {
    cors: {
      origin: corsOrigins,
      methods: ["GET", "POST"],
    },
    maxHttpBufferSize: MAX_SOCKET_PAYLOAD,
    pingTimeout: 20000,
    pingInterval: 25000,
    allowRequest: corsOrigins
      ? (req, callback) => {
          const origin = req.headers.origin;
          if (origin && !(config.allowedOrigins as string[]).includes(origin)) {
            callback("Origin not allowed", false);
          } else {
            callback(null, true);
          }
        }
      : undefined,
  });

  const rooms = setupSignaling(io, config);

  if (config.metricsEnabled) {
    app.get("/metrics", (req, res) => {
      if (
        config.metricsBearerToken &&
        req.headers.authorization !== `Bearer ${config.metricsBearerToken}`
      ) {
        res.status(401).json({ error: "unauthorized", message: "Unauthorized" });
        return;
      }

      const { rooms: roomCount, globalPeers } = rooms.stats;
      const socketCount = io.engine.clientsCount;

      const lines = [
        "# HELP prism_rooms_active Number of active rooms",
        "# TYPE prism_rooms_active gauge",
        `prism_rooms_active ${roomCount}`,
        "",
        "# HELP prism_peers_connected Number of connected peers across all rooms",
        "# TYPE prism_peers_connected gauge",
        `prism_peers_connected ${globalPeers}`,
        "",
        "# HELP prism_sockets_connected Number of connected WebSocket clients",
        "# TYPE prism_sockets_connected gauge",
        `prism_sockets_connected ${socketCount}`,
        "",
      ];

      res.type("text/plain").send(lines.join("\n"));
    });
  }

  app.use((_req: express.Request, res: express.Response) => {
    res.status(404).json({ error: "not_found", message: "Not found" });
  });

  app.use(
    (
      _err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res
        .status(500)
        .json({ error: "internal_error", message: "Internal server error" });
    },
  );

  return { app, server, io, rooms, config };
}
