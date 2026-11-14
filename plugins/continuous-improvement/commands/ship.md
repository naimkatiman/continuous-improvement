---
name: ship
description: "Compatibility entry point for the native ship skill. Passes one defect request through unchanged."
argument-hint: "[one-line defect description]"
---

# /ship

Invoke the native `ship` skill with this complete defect request:

$ARGUMENTS

The native skill is the one continuous-improvement installs: `skills/ship.md` in the plugin, or `~/.claude/skills/ship/SKILL.md` from the npm installer. If the current project defines its own `.claude/skills/ship`, that is a different workflow with its own merge and deploy rules, and a bare `ship` resolves to it. In that case stop and ask the operator which workflow they meant before doing anything.

Follow that skill exactly. Do not reconstruct or duplicate its Git, worktree, TDD, return, cleanup, merge, or deploy rules here. If the native skill is unavailable, stop and tell the operator to update or reinstall `continuous-improvement`.
