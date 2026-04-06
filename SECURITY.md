# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly.

**Do not open a public issue.**

Use GitHub's **Private Vulnerability Reporting** feature on this repository:

1. Go to the **Security** tab of the repository
2. Click **Report a vulnerability**
3. Include a description of the vulnerability, steps to reproduce (if applicable), and an impact assessment

We will acknowledge receipt within 48 hours and aim to provide a fix or mitigation within 7 days for critical issues.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |

## Scope

This policy covers the signaling server (`apps/signaling`), the protocol library (`packages/protocol`), the web UI (`apps/web`), and the Docker Compose deployment templates. It does not cover third-party dependencies, coturn itself, or the reverse proxy configuration — operators are responsible for keeping those updated.
