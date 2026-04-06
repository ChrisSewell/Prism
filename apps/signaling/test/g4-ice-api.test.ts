import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AppContext } from "../src/server.js";
import { startServer, stopServer } from "./helpers.js";

describe("G4 — ICE config HTTP API", () => {
  let ctx: AppContext;
  let baseUrl: string;

  beforeAll(async () => {
    ({ ctx, baseUrl } = await startServer({
      stunUrls: ["stun:stun.example.com:3478"],
      turnUrls: ["turn:turn.example.com:3478"],
      turnUsername: "testuser",
      turnCredential: "testpass",
    }));
  });

  afterAll(async () => {
    await stopServer(ctx);
  });

  it("GET /api/ice returns valid IceConfig shape", async () => {
    const res = await fetch(`${baseUrl}/api/ice`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("iceServers");
    expect(Array.isArray(body.iceServers)).toBe(true);
  });

  it("includes STUN server", async () => {
    const res = await fetch(`${baseUrl}/api/ice`);
    const body = await res.json();
    const stun = body.iceServers.find((s: { urls: string[] }) =>
      s.urls.some((u: string) => u.startsWith("stun:")),
    );
    expect(stun).toBeDefined();
  });

  it("includes TURN server with credentials", async () => {
    const res = await fetch(`${baseUrl}/api/ice`);
    const body = await res.json();
    const turn = body.iceServers.find((s: { urls: string[] }) =>
      s.urls.some((u: string) => u.startsWith("turn:")),
    );
    expect(turn).toBeDefined();
    expect(turn.username).toBe("testuser");
    expect(turn.credential).toBe("testpass");
  });

  it("returns empty iceServers when no ICE env is set", async () => {
    const { ctx: emptyCtx, baseUrl: emptyUrl } = await startServer({
      stunUrls: [],
      turnUrls: [],
    });
    const res = await fetch(`${emptyUrl}/api/ice`);
    const body = await res.json();
    expect(body.iceServers).toEqual([]);
    await stopServer(emptyCtx);
  });

  it("error bodies do not contain credentials", async () => {
    const res = await fetch(`${baseUrl}/nonexistent`);
    const text = await res.text();
    expect(text).not.toContain("testpass");
    expect(text).not.toContain("testuser");
  });
});

describe("G4 — per-peer short-lived TURN credentials", () => {
  const SECRET = "test-turn-shared-secret";
  let ctx: AppContext;
  let baseUrl: string;

  beforeAll(async () => {
    ({ ctx, baseUrl } = await startServer({
      turnUrls: ["turn:turn.example.com:3478"],
      turnSecret: SECRET,
      turnUsername: "",
      turnCredential: "",
    }));
  });

  afterAll(async () => {
    await stopServer(ctx);
  });

  it("returns TURN entry with generated username and credential", async () => {
    const res = await fetch(`${baseUrl}/api/ice`);
    const body = await res.json();
    const turn = body.iceServers.find((s: { urls: string[] }) =>
      s.urls.some((u: string) => u.startsWith("turn:")),
    );
    expect(turn).toBeDefined();
    expect(turn.username).toBeDefined();
    expect(turn.credential).toBeDefined();
  });

  it("username contains a future Unix timestamp", async () => {
    const res = await fetch(`${baseUrl}/api/ice`);
    const body = await res.json();
    const turn = body.iceServers.find((s: { urls: string[] }) =>
      s.urls.some((u: string) => u.startsWith("turn:")),
    );
    const expiry = parseInt(turn.username.split(":")[0], 10);
    const now = Math.floor(Date.now() / 1000);
    expect(expiry).toBeGreaterThan(now);
  });

  it("credential is a valid Base64 string", async () => {
    const res = await fetch(`${baseUrl}/api/ice`);
    const body = await res.json();
    const turn = body.iceServers.find((s: { urls: string[] }) =>
      s.urls.some((u: string) => u.startsWith("turn:")),
    );
    expect(() => Buffer.from(turn.credential, "base64")).not.toThrow();
    expect(Buffer.from(turn.credential, "base64").length).toBeGreaterThan(0);
  });

  it("two requests return different usernames", async () => {
    const res1 = await fetch(`${baseUrl}/api/ice`);
    const body1 = await res1.json();
    const res2 = await fetch(`${baseUrl}/api/ice`);
    const body2 = await res2.json();
    const turn1 = body1.iceServers.find((s: { urls: string[] }) =>
      s.urls.some((u: string) => u.startsWith("turn:")),
    );
    const turn2 = body2.iceServers.find((s: { urls: string[] }) =>
      s.urls.some((u: string) => u.startsWith("turn:")),
    );
    expect(turn1.username).not.toBe(turn2.username);
  });

  it("static credentials take precedence when turnUsername is also set", async () => {
    const { ctx: staticCtx, baseUrl: staticUrl } = await startServer({
      turnUrls: ["turn:turn.example.com:3478"],
      turnSecret: SECRET,
      turnUsername: "static-user",
      turnCredential: "static-pass",
    });
    const res = await fetch(`${staticUrl}/api/ice`);
    const body = await res.json();
    const turn = body.iceServers.find((s: { urls: string[] }) =>
      s.urls.some((u: string) => u.startsWith("turn:")),
    );
    expect(turn.username).toBe("static-user");
    expect(turn.credential).toBe("static-pass");
    await stopServer(staticCtx);
  });

  it("error bodies do not contain turnSecret", async () => {
    const res = await fetch(`${baseUrl}/nonexistent`);
    const text = await res.text();
    expect(text).not.toContain(SECRET);
  });
});
