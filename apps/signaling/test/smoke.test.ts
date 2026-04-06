import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AppContext } from "../src/server.js";
import { startServer, stopServer } from "./helpers.js";

describe("G0 — smoke tests", () => {
  let ctx: AppContext;
  let baseUrl: string;

  beforeAll(async () => {
    ({ ctx, baseUrl } = await startServer());
  });

  afterAll(async () => {
    await stopServer(ctx);
  });

  it("GET /health returns 200 with status ok", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
  });

  it("unknown routes return 404 JSON", async () => {
    const res = await fetch(`${baseUrl}/nonexistent`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
  });
});
