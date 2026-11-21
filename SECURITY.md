# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 3.x     | Yes       |
| 2.x     | Security fixes only |
| 1.x     | No        |

## Security Model

continuous-improvement operates with these security properties:

- **No network access** — hooks and MCP server are fully local
- **Secrets redacted at write time, not guaranteed absent** — the observer stores the head of every tool call locally (up to 500 characters of the command or other input, 200 of the output) in `~/.claude/instincts/<hash>/observations.jsonl` and transmits nothing; common secret shapes (AWS access keys, bearer tokens, JWTs, `X_KEY=...` / `X_SECRET=...` / `X_TOKEN=...` / `X_PASSWORD=...` style assignments, long hex strings) are redacted before a row is written, but the match is pattern-based and can miss one, and rows written by earlier versions were not redacted, so review that file before sharing it. Upgrading does not rewrite those earlier rows: delete `~/.claude/instincts/<hash>/observations.jsonl` and the rotated `observations.<timestamp>.jsonl` archives beside it to remove them, or rotate any credential they may hold
- **Read-only hooks** — `observe.sh` only appends to local JSONL files, never modifies code
- **No code execution** — instincts are text suggestions, never executed as code
- **Project isolation** — instincts are scoped per-project by SHA-256 hash

## What We Consider Vulnerabilities

- Hook injection (malicious tool_input causing shell execution)
- Path traversal in observation writing
- MCP server accepting malicious JSON-RPC payloads
- Instinct import leading to file writes outside `~/.claude/instincts/`

## Reporting a Vulnerability

**Do not open a public issue for security vulnerabilities.**

Instead, email the maintainer or open a private security advisory on GitHub:
1. Go to the repository's Security tab
2. Click "Report a vulnerability"
3. Provide details and reproduction steps

We will respond within 72 hours and aim to release a fix within 7 days for critical issues.

## Best Practices for Users

- Review imported instinct packs before loading (`ci_import`)
- Don't share `observations.jsonl` files — they may contain file paths and project structure
- Keep your `~/.claude/instincts/` directory permissions restricted (`chmod 700`)
