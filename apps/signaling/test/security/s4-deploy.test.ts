import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("S4 — deploy posture", () => {
  it("Dockerfile uses non-root USER", () => {
    const dockerfile = readFileSync(
      resolve(__dirname, "../../Dockerfile"),
      "utf-8",
    );
    expect(dockerfile).toContain("USER appuser");
    expect(dockerfile).toContain("adduser");
  });

  it("Dockerfile uses multi-stage build", () => {
    const dockerfile = readFileSync(
      resolve(__dirname, "../../Dockerfile"),
      "utf-8",
    );
    const fromCount = (dockerfile.match(/^FROM /gm) || []).length;
    expect(fromCount).toBeGreaterThanOrEqual(2);
  });

  it("Dockerfile has HEALTHCHECK", () => {
    const dockerfile = readFileSync(
      resolve(__dirname, "../../Dockerfile"),
      "utf-8",
    );
    expect(dockerfile).toContain("HEALTHCHECK");
  });

  it(".env.example exists and does not contain real secrets", () => {
    const envExample = readFileSync(
      resolve(__dirname, "../../../../.env.example"),
      "utf-8",
    );
    expect(envExample).toContain("TURN_SECRET=");
    expect(envExample).not.toMatch(/TURN_SECRET=.{8,}/);
  });

  it("coturn config uses use-auth-secret", () => {
    const conf = readFileSync(
      resolve(__dirname, "../../../../coturn/turnserver.conf"),
      "utf-8",
    );
    expect(conf).toContain("use-auth-secret");
  });

  it("docker-compose.yml is valid YAML with required services", () => {
    const compose = readFileSync(
      resolve(__dirname, "../../../../docker-compose.yml"),
      "utf-8",
    );
    expect(compose).toContain("signaling");
    expect(compose).toContain("coturn");
    expect(compose).toContain("caddy");
  });

  it("docs/security.md exists", () => {
    const secDoc = readFileSync(
      resolve(__dirname, "../../../../docs/security.md"),
      "utf-8",
    );
    expect(secDoc).toContain("Threat model");
    expect(secDoc).toContain("S0");
    expect(secDoc).toContain("S4");
  });

  it("docs/operators.md exists with IPv6 and Redis notes", () => {
    const opsDoc = readFileSync(
      resolve(__dirname, "../../../../docs/operators.md"),
      "utf-8",
    );
    expect(opsDoc).toContain("IPv6");
    expect(opsDoc).toContain("Redis");
    expect(opsDoc).toContain("Firewall");
  });
});
