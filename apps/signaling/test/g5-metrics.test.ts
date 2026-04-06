import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AppContext } from "../src/server.js";
import { startServer, stopServer, createClient, connectClient } from "./helpers.js";

describe("G5 — metrics endpoint", () => {
  describe("disabled by default", () => {
    let ctx: AppContext;
    let baseUrl: string;

    beforeAll(async () => {
      ({ ctx, baseUrl } = await startServer({ metricsEnabled: false }));
    });

    afterAll(async () => {
      await stopServer(ctx);
    });

    it("returns 404 when metricsEnabled is false", async () => {
      const res = await fetch(`${baseUrl}/metrics`);
      expect(res.status).toBe(404);
    });
  });

  describe("enabled without bearer token", () => {
    let ctx: AppContext;
    let baseUrl: string;

    beforeAll(async () => {
      ({ ctx, baseUrl } = await startServer({ metricsEnabled: true }));
    });

    afterAll(async () => {
      await stopServer(ctx);
    });

    it("returns 200 with text/plain content type", async () => {
      const res = await fetch(`${baseUrl}/metrics`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/plain");
    });

    it("contains prism_rooms_active gauge", async () => {
      const res = await fetch(`${baseUrl}/metrics`);
      const text = await res.text();
      expect(text).toContain("# TYPE prism_rooms_active gauge");
      expect(text).toMatch(/prism_rooms_active \d+/);
    });

    it("contains prism_peers_connected gauge", async () => {
      const res = await fetch(`${baseUrl}/metrics`);
      const text = await res.text();
      expect(text).toContain("# TYPE prism_peers_connected gauge");
      expect(text).toMatch(/prism_peers_connected \d+/);
    });

    it("contains prism_sockets_connected gauge", async () => {
      const res = await fetch(`${baseUrl}/metrics`);
      const text = await res.text();
      expect(text).toContain("# TYPE prism_sockets_connected gauge");
      expect(text).toMatch(/prism_sockets_connected \d+/);
    });

    it("values update after creating a room", async () => {
      const resBefore = await fetch(`${baseUrl}/metrics`);
      const before = await resBefore.text();
      const roomsBefore = parseInt(before.match(/prism_rooms_active (\d+)/)![1]);
      const peersBefore = parseInt(before.match(/prism_peers_connected (\d+)/)![1]);

      const client = createClient(baseUrl);
      await connectClient(client);

      await new Promise<void>((resolve, reject) => {
        client.emit("room:create", (res: { roomCode?: string; error?: unknown }) => {
          if (res.error) reject(new Error("room:create failed"));
          else resolve();
        });
      });

      const resAfter = await fetch(`${baseUrl}/metrics`);
      const after = await resAfter.text();
      const roomsAfter = parseInt(after.match(/prism_rooms_active (\d+)/)![1]);
      const peersAfter = parseInt(after.match(/prism_peers_connected (\d+)/)![1]);

      expect(roomsAfter).toBe(roomsBefore + 1);
      expect(peersAfter).toBe(peersBefore + 1);

      client.disconnect();
    });
  });

  describe("bearer token auth", () => {
    let ctx: AppContext;
    let baseUrl: string;
    const TOKEN = "test-metrics-token";

    beforeAll(async () => {
      ({ ctx, baseUrl } = await startServer({
        metricsEnabled: true,
        metricsBearerToken: TOKEN,
      }));
    });

    afterAll(async () => {
      await stopServer(ctx);
    });

    it("returns 401 with no Authorization header", async () => {
      const res = await fetch(`${baseUrl}/metrics`);
      expect(res.status).toBe(401);
    });

    it("returns 401 with wrong token", async () => {
      const res = await fetch(`${baseUrl}/metrics`, {
        headers: { Authorization: "Bearer wrong-token" },
      });
      expect(res.status).toBe(401);
    });

    it("returns 200 with valid token", async () => {
      const res = await fetch(`${baseUrl}/metrics`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("prism_rooms_active");
    });
  });
});
