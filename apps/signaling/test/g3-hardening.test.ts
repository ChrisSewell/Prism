import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import type { Socket as ClientSocket } from "socket.io-client";
import type { AppContext } from "../src/server.js";
import {
  startServer,
  createClient,
  connectClient,
  stopServer,
  waitForEvent,
} from "./helpers.js";

describe("G3 — hardening", () => {
  const clients: ClientSocket[] = [];

  function makeClient(baseUrl: string, version?: number) {
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

  describe("MAX_PEERS_PER_ROOM", () => {
    let ctx: AppContext;
    let baseUrl: string;

    beforeAll(async () => {
      ({ ctx, baseUrl } = await startServer({ maxPeersPerRoom: 2 }));
    });

    afterAll(async () => {
      await stopServer(ctx);
    });

    it("rejects (MAX_PEERS+1)th join", async () => {
      const a = makeClient(baseUrl);
      const b = makeClient(baseUrl);
      const c = makeClient(baseUrl);
      await Promise.all([connectClient(a), connectClient(b), connectClient(c)]);

      const createRes = await new Promise<Record<string, unknown>>((r) =>
        a.emit("room:create", r),
      );
      const roomCode = createRes.roomCode as string;

      await new Promise<Record<string, unknown>>((r) =>
        b.emit("room:join", { roomCode }, r),
      );

      const res = await new Promise<Record<string, unknown>>((r) =>
        c.emit("room:join", { roomCode }, r),
      );

      expect(res.error).toBeDefined();
      expect((res.error as Record<string, string>).code).toBe("ROOM_FULL");
    });
  });

  describe("GLOBAL_PEER_LIMIT", () => {
    let ctx: AppContext;
    let baseUrl: string;

    beforeAll(async () => {
      ({ ctx, baseUrl } = await startServer({
        maxPeersPerRoom: 10,
        maxGlobalPeers: 3,
      }));
    });

    afterAll(async () => {
      await stopServer(ctx);
    });

    it("rejects join when global cap is reached across rooms", async () => {
      const a = makeClient(baseUrl);
      const b = makeClient(baseUrl);
      const c = makeClient(baseUrl);
      const d = makeClient(baseUrl);
      await Promise.all([
        connectClient(a),
        connectClient(b),
        connectClient(c),
        connectClient(d),
      ]);

      await new Promise<Record<string, unknown>>((r) =>
        a.emit("room:create", r),
      );

      const createRes2 = await new Promise<Record<string, unknown>>((r) =>
        b.emit("room:create", r),
      );

      await new Promise<Record<string, unknown>>((r) =>
        c.emit("room:join", { roomCode: createRes2.roomCode }, r),
      );

      const res = await new Promise<Record<string, unknown>>((r) =>
        d.emit("room:create", r),
      );

      expect(res.error).toBeDefined();
      expect((res.error as Record<string, string>).code).toBe(
        "GLOBAL_PEER_LIMIT",
      );
    });
  });

  describe("TTL eviction", () => {
    let ctx: AppContext;
    let baseUrl: string;

    beforeAll(async () => {
      ({ ctx, baseUrl } = await startServer({ roomTtlMs: 100 }));
    });

    afterAll(async () => {
      await stopServer(ctx);
    });

    it("evicts stale rooms after TTL", async () => {
      const a = makeClient(baseUrl);
      await connectClient(a);

      const createRes = await new Promise<Record<string, unknown>>((r) =>
        a.emit("room:create", r),
      );
      const roomCode = createRes.roomCode as string;

      expect(ctx.rooms.getRoom(roomCode)).toBeDefined();

      a.disconnect();
      await new Promise((r) => setTimeout(r, 200));

      ctx.rooms.sweepExpired();

      expect(ctx.rooms.getRoom(roomCode)).toBeUndefined();
    });
  });

  describe("peer leave", () => {
    let ctx: AppContext;
    let baseUrl: string;

    beforeAll(async () => {
      ({ ctx, baseUrl } = await startServer());
    });

    afterAll(async () => {
      await stopServer(ctx);
    });

    it("relay to departed peer fails cleanly", async () => {
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

      b.disconnect();
      await new Promise((r) => setTimeout(r, 100));

      const errPromise = waitForEvent<{ code: string }>(a, "error");
      a.emit("signal:offer", {
        toPeerId: peerIdB,
        data: { sdp: "mock" },
      });

      const err = await errPromise;
      expect(err.code).toBe("PEER_NOT_FOUND");
    });
  });

  describe("invalid payloads", () => {
    let ctx: AppContext;
    let baseUrl: string;

    beforeAll(async () => {
      ({ ctx, baseUrl } = await startServer());
    });

    afterAll(async () => {
      await stopServer(ctx);
    });

    it("join with missing roomCode returns error", async () => {
      const a = makeClient(baseUrl);
      await connectClient(a);

      const res = await new Promise<Record<string, unknown>>((r) =>
        a.emit("room:join", {}, r),
      );

      expect(res.error).toBeDefined();
      expect((res.error as Record<string, string>).code).toBe(
        "INVALID_PAYLOAD",
      );
    });

    it("signal with missing toPeerId returns error", async () => {
      const a = makeClient(baseUrl);
      await connectClient(a);

      await new Promise<Record<string, unknown>>((r) =>
        a.emit("room:create", r),
      );

      const errPromise = waitForEvent<{ code: string }>(a, "error");
      a.emit("signal:offer", { data: { sdp: "mock" } });

      const err = await errPromise;
      expect(err.code).toBe("INVALID_PAYLOAD");
    });

    it("signal when not in a room returns error", async () => {
      const a = makeClient(baseUrl);
      await connectClient(a);

      const errPromise = waitForEvent<{ code: string }>(a, "error");
      a.emit("signal:offer", {
        toPeerId: "nonexistent",
        data: { sdp: "mock" },
      });

      const err = await errPromise;
      expect(err.code).toBe("NOT_IN_ROOM");
    });
  });

  describe("room code entropy", () => {
    let ctx: AppContext;
    let baseUrl: string;

    beforeAll(async () => {
      ({ ctx, baseUrl } = await startServer());
    });

    afterAll(async () => {
      await stopServer(ctx);
    });

    it("room codes are unique and high entropy", async () => {
      const codes = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const c = makeClient(baseUrl);
        await connectClient(c);
        const res = await new Promise<Record<string, unknown>>((r) =>
          c.emit("room:create", r),
        );
        const code = res.roomCode as string;
        expect(code.length).toBeGreaterThanOrEqual(6);
        codes.add(code);
        c.disconnect();
      }
      expect(codes.size).toBe(20);
    });
  });
});
