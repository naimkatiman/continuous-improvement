# X Thread: The 7 Laws of AI Agent Discipline (v3.1.0)

> Copy-paste ready. Each section = 1 tweet. Thread of 9.
> Updated: 2026-04-11

---

**Tweet 1 (Hook)**

Your AI agent is lying to you.

It says "Done!" — but it didn't test anything.
It says "I'll add that" — but it never researched what already exists.
It says "This should work" — but it never verified.

I built 7 laws to fix this. Open source. Zero dependencies. Works everywhere.

npx continuous-improvement install

github.com/naimkatiman/continuous-improvement

---

**Tweet 2 (The Problem)**

Here's what happens WITHOUT discipline:

You: "Add rate limiting to /api/users"

Agent: "Done! I added express-rate-limit."
You: "We already had a rate limiter..."
Agent: "Oh. Let me fix that."
You: "Did you test it?"
Agent: "...the tests are failing."

4 rounds. Duplicate code. Broken endpoint. Sound familiar?

---

**Tweet 3 (The Solution)**

Same task WITH the 7 Laws:

Agent:
-> [Law 1: Research] Found existing rate limiter in middleware/
-> [Law 2: Plan] WILL extend it. WILL NOT create new one.
-> [Law 3: Execute] One file changed, +1 line.
-> [Law 4: Verify] Tests pass. curl confirms 429 after 100 reqs.

Done in 2 minutes. Correct on first attempt.

---

**Tweet 4 (The 7 Laws)**

The 7 Laws of AI Agent Discipline:

1. Research Before Executing — stop reinventing
2. Plan Is Sacred — no scope creep
3. One Thing at a Time — no stacking
4. Verify Before Reporting — no false "done"
5. Reflect After Sessions — no repeat failures
6. Iterate One Change — no debugging 5 things
7. Learn From Every Session — no lost knowledge

---

**Tweet 5 (Mulahazah)**

The secret weapon: Mulahazah (Arabic for "observation")

Your agent builds INSTINCTS over time:

- Install -> hooks capture every tool call silently
- ~20 sessions -> patterns detected, instincts created
- ~50 sessions -> agent starts suggesting behaviors
- ~100 sessions -> agent auto-applies what it learned

Wrong instincts decay. Corrections weaken them. It self-corrects.

---

**Tweet 6 (v3.1 — What's New)**

v3.1.0 just shipped:

- MCP server with beginner/expert modes (10 tools)
- Starter instinct packs for React, Python, Go
- GitHub Action transcript linter (score 0-100)
- CodeQL security scanning in CI
- 104 tests, zero dependencies, Node 18+

This isn't a prompt wrapper. It's infrastructure.

---

**Tweet 7 (Platform Support)**

Works with every major AI coding tool:

- Claude Code (full: skill + hooks + MCP + instincts)
- Claude Desktop / Cursor / Zed / Windsurf / VS Code (MCP server)
- Codex / Gemini CLI / OpenClaw (skill-only mode)
- Any LLM (paste SKILL.md into system prompt)

One install. Every platform.

---

**Tweet 8 (Install)**

Install in 10 seconds:

npx continuous-improvement install

Pick your mode:
--mode beginner (default, 3 tools)
--mode expert (10 tools + import/export)
--mode mcp (editors without Claude Code hooks)

Zero dependencies. MIT licensed. 104 tests passing.

---

**Tweet 9 (CTA)**

Every skill in the ecosystem adds capabilities.

This is the only one that fixes HOW your agent thinks.

Star it. Try it. Tell me which law saves you the most time.

github.com/naimkatiman/continuous-improvement

---

## Hashtags (pick 3-4 per tweet)

#ClaudeCode #AIAgent #CodingWithAI #DevTools #OpenSource #Cursor #Codex #GeminiCLI #AIDiscipline #BuildInPublic #MCP #MCPServer
