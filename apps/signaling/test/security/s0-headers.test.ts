import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AppContext } from "../../src/server.js";
import { startServer, stopServer } from "../helpers.js";

describe("S0 — HTTP hardening", () => {
  let ctx: AppContext;
  let baseUrl: string;

  beforeAll(async () => {
    ({ ctx, baseUrl } = await startServer());
  });

  afterAll(async () => {
    await stopServer(ctx);
  });

  it("sets X-Content-Type-Options header", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("sets X-Frame-Options or CSP frame-ancestors", async () => {
    const res = await fetch(`${baseUrl}/health`);
    const xfo = res.headers.get("x-frame-options");
    const csp = res.headers.get("content-security-policy");
    expect(xfo || csp).toBeTruthy();
  });

  it("does not include X-Powered-By header", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.headers.get("x-powered-by")).toBeNull();
  });

  it("404 error does not include stack traces", async () => {
    const res = await fetch(`${baseUrl}/nonexistent`);
    const text = await res.text();
    expect(text).not.toContain("Error:");
    expect(text).not.toContain("at ");
    expect(text).not.toContain(".ts:");
    expect(text).not.toContain(".js:");
    expect(text).not.toContain("node_modules");
  });

  it("404 error does not include internal paths", async () => {
    const res = await fetch(`${baseUrl}/nonexistent`);
    const text = await res.text();
    expect(text).not.toContain("/Users/");
    expect(text).not.toContain("/home/");
    expect(text).not.toContain("apps/signaling");
  });
});
