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

describe("G2 — rooms + pairwise signaling relay (mesh baseline)", () => {
  let ctx: AppContext;
  let baseUrl: string;
  const clients: ClientSocket[] = [];

  beforeAll(async () => {
    ({ ctx, baseUrl } = await startServer());
  });

  afterEach(() => {
    for (const c of clients) {
      if (c.connected) c.disconnect();
    }
    clients.length = 0;
  });

  afterAll(async () => {
    await stopServer(ctx);
  });

  function makeClient() {
    const c = createClient(baseUrl);
    clients.push(c);
    return c;
  }

  it("creates a room and returns roomCode + peerId", async () => {
    const clientA = makeClient();
    await connectClient(clientA);

    const res = await new Promise<Record<string, unknown>>((resolve) => {
      clientA.emit("room:create", resolve);
    });

    expect(res.roomCode).toBeDefined();
    expect(typeof res.roomCode).toBe("string");
    expect((res.roomCode as string).length).toBeGreaterThanOrEqual(6);
    expect(res.peerId).toBeDefined();
  });

  it("peer B joins room created by A and gets roster", async () => {
    const clientA = makeClient();
    const clientB = makeClient();
    await connectClient(clientA);
    await connectClient(clientB);

    const createRes = await new Promise<Record<string, unknown>>((resolve) => {
      clientA.emit("room:create", resolve);
    });
    const roomCode = createRes.roomCode as string;
    const peerIdA = createRes.peerId as string;

    const joinPromise = waitForEvent<{ peerId: string }>(
      clientA,
      "peer:joined",
    );

    const joinRes = await new Promise<Record<string, unknown>>((resolve) => {
      clientB.emit("room:join", { roomCode }, resolve);
    });

    expect(joinRes.selfPeerId).toBeDefined();
    const peers = joinRes.peers as Array<{ peerId: string; username?: string }>;
    expect(peers.map((p) => p.peerId)).toEqual([peerIdA]);

    const joined = await joinPromise;
    expect(joined.peerId).toBe(joinRes.selfPeerId);
  });

  it("three peers: A creates, B and C join", async () => {
    const clientA = makeClient();
    const clientB = makeClient();
    const clientC = makeClient();
    await Promise.all([
      connectClient(clientA),
      connectClient(clientB),
      connectClient(clientC),
    ]);

    const createRes = await new Promise<Record<string, unknown>>((resolve) => {
      clientA.emit("room:create", resolve);
    });
    const roomCode = createRes.roomCode as string;

    await new Promise<Record<string, unknown>>((resolve) => {
      clientB.emit("room:join", { roomCode }, resolve);
    });

    const cJoinRes = await new Promise<Record<string, unknown>>((resolve) => {
      clientC.emit("room:join", { roomCode }, resolve);
    });

    const peers = cJoinRes.peers as string[];
    expect(peers.length).toBe(2);
  });

  it("directed offer from A→B is delivered only to B", async () => {
    const clientA = makeClient();
    const clientB = makeClient();
    const clientC = makeClient();
    await Promise.all([
      connectClient(clientA),
      connectClient(clientB),
      connectClient(clientC),
    ]);

    const createRes = await new Promise<Record<string, unknown>>((resolve) => {
      clientA.emit("room:create", resolve);
    });
    const roomCode = createRes.roomCode as string;
    const peerIdA = createRes.peerId as string;

    const joinResB = await new Promise<Record<string, unknown>>((resolve) => {
      clientB.emit("room:join", { roomCode }, resolve);
    });
    const peerIdB = joinResB.selfPeerId as string;

    await new Promise<Record<string, unknown>>((resolve) => {
      clientC.emit("room:join", { roomCode }, resolve);
    });

    let cReceivedOffer = false;
    clientC.on("signal:offer", () => {
      cReceivedOffer = true;
    });

    const offerPromise = waitForEvent<{
      fromPeerId: string;
      toPeerId: string;
      data: unknown;
    }>(clientB, "signal:offer");

    clientA.emit("signal:offer", {
      toPeerId: peerIdB,
      data: { sdp: "mock-offer" },
    });

    const offer = await offerPromise;
    expect(offer.fromPeerId).toBe(peerIdA);
    expect(offer.toPeerId).toBe(peerIdB);
    expect(offer.data).toEqual({ sdp: "mock-offer" });

    await new Promise((r) => setTimeout(r, 100));
    expect(cReceivedOffer).toBe(false);
  });

  it("server injects correct fromPeerId (client cannot spoof)", async () => {
    const clientA = makeClient();
    const clientB = makeClient();
    await Promise.all([connectClient(clientA), connectClient(clientB)]);

    const createRes = await new Promise<Record<string, unknown>>((resolve) => {
      clientA.emit("room:create", resolve);
    });
    const roomCode = createRes.roomCode as string;
    const peerIdA = createRes.peerId as string;

    const joinResB = await new Promise<Record<string, unknown>>((resolve) => {
      clientB.emit("room:join", { roomCode }, resolve);
    });
    const peerIdB = joinResB.selfPeerId as string;

    const answerPromise = waitForEvent<{
      fromPeerId: string;
    }>(clientA, "signal:answer");

    clientB.emit("signal:answer", {
      toPeerId: peerIdA,
      fromPeerId: "FAKE-PEER-ID",
      data: { sdp: "mock-answer" },
    });

    const answer = await answerPromise;
    expect(answer.fromPeerId).toBe(peerIdB);
    expect(answer.fromPeerId).not.toBe("FAKE-PEER-ID");
  });

  it("peer:left is broadcast when a peer disconnects", async () => {
    const clientA = makeClient();
    const clientB = makeClient();
    await Promise.all([connectClient(clientA), connectClient(clientB)]);

    const createRes = await new Promise<Record<string, unknown>>((resolve) => {
      clientA.emit("room:create", resolve);
    });
    const roomCode = createRes.roomCode as string;

    const joinResB = await new Promise<Record<string, unknown>>((resolve) => {
      clientB.emit("room:join", { roomCode }, resolve);
    });
    const peerIdB = joinResB.selfPeerId as string;

    const leftPromise = waitForEvent<{ peerId: string }>(
      clientA,
      "peer:left",
    );

    clientB.disconnect();

    const left = await leftPromise;
    expect(left.peerId).toBe(peerIdB);
  });

  it("roster events are consistent with room state", async () => {
    const clientA = makeClient();
    const clientB = makeClient();
    const clientC = makeClient();
    await Promise.all([
      connectClient(clientA),
      connectClient(clientB),
      connectClient(clientC),
    ]);

    const createRes = await new Promise<Record<string, unknown>>((resolve) => {
      clientA.emit("room:create", resolve);
    });
    const roomCode = createRes.roomCode as string;
    const peerIdA = createRes.peerId as string;

    const joinResB = await new Promise<Record<string, unknown>>((resolve) => {
      clientB.emit("room:join", { roomCode }, resolve);
    });
    const peerIdB = joinResB.selfPeerId as string;
    const peersB = (joinResB.peers as Array<{ peerId: string }>).map((p) => p.peerId);
    expect(peersB).toContain(peerIdA);

    const joinResC = await new Promise<Record<string, unknown>>((resolve) => {
      clientC.emit("room:join", { roomCode }, resolve);
    });
    const peersSeenByC = (joinResC.peers as Array<{ peerId: string }>).map((p) => p.peerId);
    expect(peersSeenByC).toContain(peerIdA);
    expect(peersSeenByC).toContain(peerIdB);
  });

  it("joining nonexistent room returns error", async () => {
    const client = makeClient();
    await connectClient(client);

    const res = await new Promise<Record<string, unknown>>((resolve) => {
      client.emit("room:join", { roomCode: "NONEXISTENT" }, resolve);
    });

    expect(res.error).toBeDefined();
    expect((res.error as Record<string, string>).code).toBe("ROOM_NOT_FOUND");
  });
});
