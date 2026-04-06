import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { Socket as ClientSocket } from "socket.io-client";
import { SIGNALING_VERSION } from "@prism/protocol";
import type { AppContext } from "../../src/server.js";
import {
  startServer,
  createClient,
  connectClient,
  stopServer,
  waitForEvent,
} from "../helpers.js";

describe("S2 — signaling abuse", () => {
  const clients: ClientSocket[] = [];

  function makeClient(
    baseUrl: string,
    version: number = SIGNALING_VERSION,
  ) {
    const c = createClient(baseUrl, version);
    clients.push(c);
    return c;
  }

  afterEach(() => {
    for (const c of clients) {
      if (c.connected) c.disconnect();
    }
    clients.length = 0;
  });

  describe("protocolVersion", () => {
    let ctx: AppContext;
    let baseUrl: string;

    beforeAll(async () => {
      ({ ctx, baseUrl } = await startServer());
    });

    afterAll(async () => {
      await stopServer(ctx);
    });

    it("rejects unknown protocolVersion without crash", async () => {
      const bad = makeClient(baseUrl, 999);
      await expect(connectClient(bad)).rejects.toThrow();
    });

    it("rejects version 0", async () => {
      const bad = makeClient(baseUrl, 0);
      await expect(connectClient(bad)).rejects.toThrow();
    });

    it("rejects missing protocolVersion", async () => {
      const bad = createClient(baseUrl);
      // Override auth to remove protocolVersion
      (bad as unknown as { auth: Record<string, unknown> }).auth = {};
      clients.push(bad);
      await expect(connectClient(bad)).rejects.toThrow();
    });
  });

  describe("cross-room relay", () => {
    let ctx: AppContext;
    let baseUrl: string;

    beforeAll(async () => {
      ({ ctx, baseUrl } = await startServer());
    });

    afterAll(async () => {
      await stopServer(ctx);
    });

    it("cannot relay to a peer not in the same room", async () => {
      const a = makeClient(baseUrl);
      const b = makeClient(baseUrl);
      await Promise.all([connectClient(a), connectClient(b)]);

      await new Promise<Record<string, unknown>>((r) =>
        a.emit("room:create", r),
      );

      const bRoom = await new Promise<Record<string, unknown>>((r) =>
        b.emit("room:create", r),
      );
      const peerIdB = bRoom.peerId as string;

      const errPromise = waitForEvent<{ code: string }>(a, "error");
      a.emit("signal:offer", {
        toPeerId: peerIdB,
        data: { sdp: "cross-room" },
      });

      const err = await errPromise;
      expect(err.code).toBe("PEER_NOT_FOUND");
    });
  });

  describe("fromPeerId spoofing", () => {
    let ctx: AppContext;
    let baseUrl: string;

    beforeAll(async () => {
      ({ ctx, baseUrl } = await startServer());
    });

    afterAll(async () => {
      await stopServer(ctx);
    });

    it("server overwrites spoofed fromPeerId", async () => {
      const a = makeClient(baseUrl);
      const b = makeClient(baseUrl);
      await Promise.all([connectClient(a), connectClient(b)]);

      const createRes = await new Promise<Record<string, unknown>>((r) =>
        a.emit("room:create", r),
      );
      const roomCode = createRes.roomCode as string;
      const peerIdA = createRes.peerId as string;

      const joinResB = await new Promise<Record<string, unknown>>((r) =>
        b.emit("room:join", { roomCode }, r),
      );
      const peerIdB = joinResB.selfPeerId as string;

      const candidatePromise = waitForEvent<{
        fromPeerId: string;
      }>(clientB_ref(), "signal:candidate");

      function clientB_ref() {
        return b;
      }

      a.emit("signal:candidate", {
        toPeerId: peerIdB,
        fromPeerId: "SPOOFED",
        data: { candidate: "mock" },
      });

      const received = await candidatePromise;
      expect(received.fromPeerId).toBe(peerIdA);
      expect(received.fromPeerId).not.toBe("SPOOFED");
    });
  });

  describe("flood protection", () => {
    let ctx: AppContext;
    let baseUrl: string;

    beforeAll(async () => {
      ({ ctx, baseUrl } = await startServer());
    });

    afterAll(async () => {
      await stopServer(ctx);
    });

    it("burst of candidates does not crash the server", async () => {
      const a = makeClient(baseUrl);
      const b = makeClient(baseUrl);
      await Promise.all([connectClient(a), connectClient(b)]);

      const createRes = await new Promise<Record<string, unknown>>((r) =>
        a.emit("room:create", r),
      );
      const roomCode = createRes.roomCode as string;

      const joinResB = await new Promise<Record<string, unknown>>((r) =>
        b.emit("room:join", { roomCode }, r),
      );
      const peerIdB = joinResB.selfPeerId as string;

      for (let i = 0; i < 100; i++) {
        a.emit("signal:candidate", {
          toPeerId: peerIdB,
          data: { candidate: `candidate-${i}` },
        });
      }

      await new Promise((r) => setTimeout(r, 200));
      expect(ctx.rooms.stats.rooms).toBeGreaterThanOrEqual(1);
    });
  });
});
