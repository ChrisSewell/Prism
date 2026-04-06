import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AppContext } from "../../src/server.js";
import { startServer, stopServer } from "../helpers.js";
import type { Socket as ClientSocket } from "socket.io-client";
import { io as ioClient } from "socket.io-client";
import { SIGNALING_VERSION } from "@prism/protocol";

describe("S3 — Origin / CORS (HTTP + WebSocket)", () => {
  const ALLOWED = "http://allowed.example.com";
  const DENIED = "http://evil.example.com";
  let ctx: AppContext;
  let baseUrl: string;
  const clients: ClientSocket[] = [];

  beforeAll(async () => {
    ({ ctx, baseUrl } = await startServer({
      allowedOrigins: [ALLOWED],
      turnSecret: "SUPER_SECRET_VALUE",
      turnCredential: "TURN_CRED_VALUE",
    }));
  });

  afterAll(async () => {
    for (const c of clients) {
      if (c.connected) c.disconnect();
    }
    await stopServer(ctx);
  });

  it("GET /api/ice from allowed origin succeeds", async () => {
    const res = await fetch(`${baseUrl}/api/ice`, {
      headers: { Origin: ALLOWED },
    });
    expect(res.status).toBe(200);
    const acao = res.headers.get("access-control-allow-origin");
    expect(acao).toBe(ALLOWED);
  });

  it("GET /api/ice from disallowed origin has no ACAO header", async () => {
    const res = await fetch(`${baseUrl}/api/ice`, {
      headers: { Origin: DENIED },
    });
    const acao = res.headers.get("access-control-allow-origin");
    expect(acao).toBeNull();
  });

  it("OPTIONS preflight from disallowed origin has no ACAO", async () => {
    const res = await fetch(`${baseUrl}/api/ice`, {
      method: "OPTIONS",
      headers: {
        Origin: DENIED,
        "Access-Control-Request-Method": "GET",
      },
    });
    const acao = res.headers.get("access-control-allow-origin");
    expect(acao).toBeNull();
  });

  it("error bodies do not contain TURN secrets", async () => {
    const res = await fetch(`${baseUrl}/nonexistent`);
    const text = await res.text();
    expect(text).not.toContain("SUPER_SECRET_VALUE");
    expect(text).not.toContain("TURN_CRED_VALUE");
  });

  it("/api/ice response does not contain TURN_SECRET env value", async () => {
    const res = await fetch(`${baseUrl}/api/ice`);
    const text = await res.text();
    expect(text).not.toContain("SUPER_SECRET_VALUE");
  });

  it("Socket.IO from disallowed origin is rejected", async () => {
    const bad = ioClient(baseUrl, {
      autoConnect: false,
      forceNew: true,
      transports: ["websocket"],
      reconnection: false,
      auth: { protocolVersion: SIGNALING_VERSION },
      extraHeaders: { Origin: DENIED },
    });
    clients.push(bad);

    await expect(
      new Promise<void>((resolve, reject) => {
        bad.on("connect", () => resolve());
        bad.on("connect_error", (err) => reject(err));
        bad.connect();
      }),
    ).rejects.toThrow();
  });
});
