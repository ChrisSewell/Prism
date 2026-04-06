import { io as ioClient, Socket as ClientSocket } from "socket.io-client";
import { createApp } from "../src/server.js";
import type { AppContext } from "../src/server.js";
import type { Config } from "../src/config.js";
import { SIGNALING_VERSION } from "@prism/protocol";

export function testConfig(overrides?: Partial<Config>): Config {
  return {
    port: 0,
    nodeEnv: "test",
    allowedOrigins: [],
    maxPeersPerRoom: 8,
    maxGlobalPeers: 100,
    roomTtlMs: 3600000,
    rateLimitWindowMs: 60000,
    rateLimitMaxRequests: 60,
    stunUrls: [],
    turnUrls: [],
    turnUsername: "",
    turnCredential: "",
    turnSecret: "",
    metricsEnabled: false,
    metricsBearerToken: "",
    ...overrides,
  };
}

export async function startServer(
  overrides?: Partial<Config>,
): Promise<{ ctx: AppContext; baseUrl: string }> {
  const ctx = createApp(testConfig(overrides));
  await new Promise<void>((resolve) => {
    ctx.server.listen(0, () => resolve());
  });
  const addr = ctx.server.address();
  if (!addr || typeof addr === "string") throw new Error("bad address");
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  return { ctx, baseUrl };
}

export function createClient(
  baseUrl: string,
  protocolVersion = SIGNALING_VERSION,
): ClientSocket {
  return ioClient(baseUrl, {
    autoConnect: false,
    forceNew: true,
    transports: ["websocket"],
    reconnection: false,
    auth: { protocolVersion },
  });
}

export async function connectClient(client: ClientSocket): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    client.on("connect", () => resolve());
    client.on("connect_error", (err) => reject(err));
    client.connect();
  });
}

export async function stopServer(ctx: AppContext): Promise<void> {
  ctx.io.close();
  await new Promise<void>((resolve) => ctx.server.close(() => resolve()));
}

export function waitForEvent<T = unknown>(
  socket: ClientSocket,
  event: string,
  timeoutMs = 2000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout waiting for "${event}"`)),
      timeoutMs,
    );
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}
