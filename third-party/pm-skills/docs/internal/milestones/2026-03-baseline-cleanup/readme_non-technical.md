# pm-skills Baseline Cleanup: A Human Guide

**What happened, why it mattered, and what it means going forward**

Period: March 11-20, 2026
Status: Complete

---

## Table of Contents

1. [The Short Version](#1-the-short-version)
2. [What Is a Repository, and Why Does Its Health Matter?](#2-what-is-a-repository-and-why-does-its-health-matter)
3. [The Problem: How Projects Drift](#3-the-problem-how-projects-drift)
4. [The Approach: Two AI Agents Working as a Team](#4-the-approach-two-ai-agents-working-as-a-team)
5. [What Was Fixed, and Why Each Thing Mattered](#5-what-was-fixed-and-why-each-thing-mattered)
   - [Making the House Match the Blueprint](#making-the-house-match-the-blueprint)
   - [Teaching AI Agents Where Things Live](#teaching-ai-agents-where-things-live)
   - [Installing a Smoke Alarm](#installing-a-smoke-alarm)
   - [Building a Filing System That Works](#building-a-filing-system-that-works)
   - [Cleaning Up the Public Face of the Project](#cleaning-up-the-public-face-of-the-project)
6. [What Was Established for the Future](#6-what-was-established-for-the-future)
7. [Using Two AI Agents: What Worked, What Was Learned](#7-using-two-ai-agents-what-worked-what-was-learned)
8. [Insights and Observations](#8-insights-and-observations)
9. [What Comes Next](#9-what-comes-next)

---

## 1. The Short Version

Over nine days in March 2026, two AI agents (Claude and Codex) worked together to clean up the internal health of the pm-skills project. The project itself was working fine. The skills shipped correctly, the code ran, and users could do everything they needed to do. But underneath, the documentation, filing system, and internal records had fallen behind the actual state of the project.

This cleanup closed that gap. It fixed broken references, updated stale records, established clear homes for different types of information, and installed automated tools to catch future drift before it accumulates. It was nine days of maintenance work that sets the project up for a healthier future.

No new features shipped. No user-facing behavior changed. What changed is that the project now accurately describes itself, and has systems in place to keep doing so.

---

## 2. What Is a Repository, and Why Does Its Health Matter?

A software repository is more than just code. It is a complete, versioned record of a project: the code itself, the documentation, the history of changes, the rules and guidelines, and the internal notes that help maintainers understand why things are the way they are.

Think of it like a well-run office. The office does its primary job (serving customers, making products) but it also has filing systems, procedure manuals, and shared reference documents that help everyone who works there do their jobs consistently and efficiently. When those supporting systems are up to date, new people can get up to speed quickly, mistakes are caught early, and work flows smoothly.

When the supporting systems fall behind, things break down gradually. Someone reads an outdated procedure and follows the wrong process. A new team member gets a project briefing that describes last year's product. An automated tool reports incorrect information because its reference data is stale. None of these are catastrophic failures on their own, but they compound over time.

For pm-skills specifically, the "workers" are AI agents. Claude and Codex do not rely on memory between sessions. Every time they start a new conversation or task, they read the repository's records to understand where things stand. If those records are stale, every session starts from a confused baseline.

---

## 3. The Problem: How Projects Drift

Software projects move fast, especially in early growth phases. Features ship, architecture evolves, decisions get made, and priorities shift. The primary work (shipping skills, fixing bugs, adding features) almost always gets done. The secondary work (updating the records that describe what was just done) often gets deferred to "later."

This is not negligence. It is a rational prioritization. When you are in the middle of shipping version 2.4, updating a project briefing document feels less urgent than finishing the release. The problem is that "later" often means "seven versions from now, when someone notices."

By early March 2026, pm-skills had accumulated drift across four areas:

**The project briefing was seven releases behind.** The document that AI agents read at the start of every session described version 2.3 of the project. The actual project was at version 2.6.1. Nine releases worth of new features, decisions, and architectural changes were invisible to any agent starting a fresh session.

**A public document pointed somewhere private.** The changelog (the public record of what changed in each release) contained a reference to a file that only existed on the developer's local computer. Anyone cloning the project would encounter a reference they could never follow.

**The filing system had multiple "official" homes.** Different documents described different directories as the canonical location for release notes and planning artifacts. There was no single clear answer to the question: "Where does the authoritative information about the last release live?"

**The contributor documentation taught the wrong pattern.** The guides for creating new skills described an older way of formatting skill files, one that the project's own validation scripts had moved past. A contributor following the documentation faithfully would create something that failed the tests.

None of these were bugs in the skills. The skills worked correctly. But the infrastructure around them was misleading.

---

## 4. The Approach: Two AI Agents Working as a Team

### Why use AI agents at all?

All of the cleanup work was, technically, something a human could do. Read the files, identify what is stale, update it, commit the changes. The reason to use AI agents is that this kind of work is exactly where AI excels: systematic, detail-oriented, requires careful reading of large numbers of files, and benefits from a patient, methodical approach that humans find tedious.

It also frees the maintainer to focus on strategic decisions ("which canonical home should we establish?") rather than mechanical execution ("now open the seventh file and update the version reference on line 47").

### Why two agents instead of one?

Claude and Codex are two different AI systems with meaningfully different working environments.

**Claude** runs interactively, in the terminal, alongside the developer. It can ask questions, show diffs for review before committing, and respond to mid-task feedback. It is well-suited to work that benefits from real-time human oversight, such as fixing public documentation or making decisions about what a "current" project briefing should say.

**Codex** runs in a cloud environment, working in an isolated copy of the repository (called a worktree). It can work asynchronously without tying up the developer's terminal, and it handles large-scale document sweeps efficiently. It is well-suited to systematic cleanup passes across many files at once.

Some tasks were genuinely independent between the two agents. Claude could fix the git state while Codex rewrote policy documents. Others had dependencies: Codex needed to update its own project briefing before Claude could safely run the automated checks that would test whether both briefings were current.

### How coordination worked

Rather than relying on either agent to "remember" what the other had done, a shared coordination document was maintained in the repository. This document listed every task, its current status, its dependencies, and any notes. Before starting each task, each agent read the coordination document to understand the current state.

This approach reflects something important about working with AI agents: they do not have persistent memory across sessions. Each new session starts fresh. The solution is not to try to give them memory, but to maintain the state externally, in a place both agents can read.

---

## 5. What Was Fixed, and Why Each Thing Mattered

### Making the House Match the Blueprint

The most visible problem was the stale project briefing. Every AI session begins by reading a context file that describes the project's current state. When that file is seven releases behind, the agent starts from an incorrect picture.

**The concept:** In software, we often talk about "session continuity," the ability of a tool or collaborator to pick up a conversation or task knowing what has already been done and where things stand. For human team members, this comes from a combination of memory, notes, and conversation. For AI agents, it comes entirely from structured documents.

When the project briefing is accurate, a new Claude session knows about the persona skill, the sample output library, the plugin manifest, and all the other work that has shipped since the last update. It can make sensible suggestions, avoid redoing work, and connect new tasks to the established architecture.

When the briefing is stale, the agent rediscovers these things through exploratory questions, or worse, makes suggestions that are already handled or contradict decisions already made.

**The outcome:** Both the Claude briefing document and the Codex briefing document were brought current to version 2.6.1. This was probably the highest-value single task in the entire cleanup.

**What it establishes:** An automated check now runs on every proposed change to the project. If either briefing falls behind, the system flags it. The problem that took two months to accumulate now gets caught within days.

### Teaching AI Agents Where Things Live

A significant portion of the cleanup was about establishing clear, authoritative locations for different types of information.

**The concept:** In any collaborative environment, "where does X live" is a question that should have exactly one answer. If the answer is "it depends" or "check both of these places," people (and AI agents) will make different assumptions, and over time the information will diverge.

In software projects, this problem often appears as "there are three README files and I'm not sure which one is current" or "the release notes are in two different directories." The fix is not just to pick one place, but to update all the signposts that point to the old places.

The pm-skills project had accumulated multiple "official" homes for release governance artifacts and effort tracking documents. Some pointed to a local-only directory (visible only on the developer's machine) as if it were a shared resource. Others pointed to directories from an older organizational model.

**The outcome:** Three authoritative homes were established and documented:
- GitHub issues handle the live question of "what is open, in progress, or closed"
- A tracked directory handles durable effort briefs (the "what did this effort do and why" record that needs to survive across sessions)
- A tracked release directory handles official release governance artifacts (the formal records for each version shipped)

**What it establishes:** Future work has a clear answer to "where does this go." New releases get a folder. New efforts get a brief. The question of where to look for authoritative information has one answer.

### Installing a Smoke Alarm

One of the most durable outcomes of this cleanup was not a document update, but a new automated tool: a script that checks whether the project briefings are current every time a change is proposed.

**The concept:** In engineering, we distinguish between fixing a problem and preventing it from recurring. Fixing a problem is valuable. Preventing recurrence is more valuable. The best outcome is a system that detects the problem automatically, before it has time to compound.

A smoke alarm is a good analogy. The goal is not to have someone check for smoke every morning. The goal is to have a system that notices smoke automatically and makes noise about it immediately.

**The outcome:** Two scripts now live in the project (one for Unix environments, one for Windows) that scan all agent briefing files, extract the version each one claims to describe, and compare that to the current version in the changelog. If any briefing is behind, the script reports it clearly and exits with a failure code that CI systems understand.

These scripts run automatically on every proposed change to the project. The result appears as a check in the pull request interface. If the briefings are current, it shows green. If any are stale, it shows a warning visible to anyone reviewing the change.

**What it establishes:** The two-month drift that triggered this entire cleanup will never quietly accumulate again. The system now catches it within the window of a single pull request.

### Building a Filing System That Works

Part of the cleanup was establishing a formal concept that the project had been missing: the "effort brief."

**The concept:** In project management, there is a common problem with institutional knowledge. A team spends two months on a feature, makes dozens of important decisions, hits several surprises, and ships something good. Then, six months later, someone asks "why did we structure it this way?" and the answer lives only in the head of the person who was there, or in a pile of unstructured notes.

An effort brief is a short, structured document that captures the key facts about a completed (or in-progress) piece of work: what it was, what decisions were made, what artifacts it produced, what GitHub issues it corresponds to, and what the current status is.

**The outcome:** Three effort briefs were created for the three most significant recent efforts: the persona skill, the sample output library, and the persona library project currently in progress. A README explains the format and convention so future efforts can follow the same pattern.

Each brief is linked to a GitHub issue that owns the lifecycle state (open means in progress, closed means shipped). The brief itself holds the context that GitHub issues are not designed to capture.

**What it establishes:** Any agent, any contributor, or any future maintainer can read these briefs and quickly understand what each major effort was, what was decided, and where the results live. The knowledge survives turnover, session resets, and the passage of time.

### Cleaning Up the Public Face of the Project

The final category of cleanup was the most visible: the public documentation that users and contributors encounter when they first look at the project.

**The concept:** Documentation debt is the accumulation of inaccurate, outdated, or misleading documentation. Like financial debt, it can be manageable at first but compounds over time. A contributor who follows outdated instructions creates a contribution that fails validation. A user who reads about features that do not exist loses confidence in the documentation broadly. An agent that reads incorrect counts makes suggestions based on incorrect assumptions.

Two specific types of problems were fixed:

The first was inaccurate counts and inventory. The project had 25 skills, but multiple public documents still said 24. The project had 26 commands, but some documents said 25. The plugin manifest had the wrong version number. The release note for version 2.6.1 still described the release as "pending" even though it had shipped.

The second was speculative content. During earlier development, several planned helper commands had been listed as "in progress" in the project status section. Those commands were never built. Listing them as in-progress is not aspirational, it is misleading, and it creates confusion for anyone trying to use or contribute to the project.

**The outcome:** All counts were corrected. All "in progress" references to non-existent features were removed or rewritten to accurately describe what is actually being worked on. The release note status was updated. The plugin version was corrected.

**What it establishes:** The public documentation now describes the project as it actually is. Future contributors start with an accurate picture.

---

## 6. What Was Established for the Future

The cleanup did not just fix current problems. It put infrastructure in place that makes future problems either less likely or more quickly detected.

### Automated currency checking

The scripts and CI integration mean that project briefing staleness is now a monitored, visible condition rather than a silent one. This is one of the most durable outcomes of the entire effort.

### A clear governance model

The three-tier model (GitHub issues for lifecycle, effort briefs for durable context, release directories for versioned governance) is now documented, demonstrated, and referenced consistently across the project. Future work has a pattern to follow.

### Contributor documentation that matches reality

New contributors can now follow the authoring guide and create skills that will pass the project's validation rules. The gap between "what the docs say" and "what the tests enforce" is closed.

### First-class parity between agent contexts

Both Claude and Codex now have their own briefing files that are held to the same standard. The automated currency check covers both. Future agents, whether Claude, Codex, or something else, have a clear workspace and an accurate starting point.

### A model for effort tracking

The effort brief format is simple enough to use quickly but structured enough to be genuinely useful. Three examples are now in place. The pattern is documented. This is the kind of lightweight knowledge management that organizations often aspire to but rarely implement because the overhead feels too high. The format here is intentionally minimal.

---

## 7. Using Two AI Agents: What Worked, What Was Learned

### What worked well

**Parallel, independent execution.** Tasks that had no dependencies on each other ran simultaneously. While Claude was fixing the project briefing, Codex was rewriting policy documents. This compressed nine days of calendar time into a tighter actual execution window.

**Clear ownership.** Each task had an owner. There was no ambiguity about whether Claude or Codex was responsible for a given change. This prevented overlap and conflicts.

**Shared state in a shared document.** The coordination document was the single source of truth for what had been done, what was pending, and what was blocked. Neither agent needed to rely on remembering what the other had done.

**Separation of concerns.** Codex's strength (systematic document sweeps across many files) and Claude's strength (interactive, reviewer-visible, human-in-the-loop changes) were matched to the right tasks.

### What was learned

**Dependencies need explicit sequencing.** The most important coordination moment in the project was the decision that Codex should update its own briefing file before Claude added the automated currency check. If Claude had added the check first, it would have immediately flagged Codex's file as stale, creating CI noise from the very first run. The clean sequencing (Codex first, then Claude) meant the check started in a passing state.

**Agents need current context to do good work.** The stale project briefing was not just a documentation problem. It was a problem for every subsequent session that read that document and started from an incorrect picture. Keeping context current is not overhead, it is a prerequisite for reliable AI assistance.

**The two-agent model requires explicit handoff protocols.** When Codex finished a task, Claude needed to know about it before continuing its own work. When Claude landed new infrastructure, Codex needed to know the correct paths before writing documents that referenced them. The coordination document handled this, but it required discipline to keep it current after each task.

**Review before merge is non-negotiable.** When Claude reviewed Codex's changes before they were committed, three missed count updates (24 skills should have been 25 in the progressive loading section) were caught. That kind of catch is exactly what cross-agent review is for.

---

## 8. Insights and Observations

**Documentation debt is invisible until it causes problems.** The stale project briefing accumulated over two months without anyone explicitly noticing. It only became visible when a new session started from an obviously incorrect baseline. This is typical of documentation debt: it is easy to accumulate and hard to notice.

**The cost of fixing debt grows with time.** A single release behind is a small fix. Seven releases behind is a multi-session effort. The automated currency check is the answer to this: catch one release behind immediately, and the cost stays small.

**"Where does this go" is a more important question than it appears.** A significant amount of the cleanup was answering this question for different types of artifacts. The answer "it depends" or "check both places" is not an answer, it is a source of ongoing confusion. Picking one canonical home and making it clear is worth the investment even when the choice is somewhat arbitrary.

**AI agents are reliable at systematic, detail-oriented work.** Reading dozens of files, finding version references, comparing them to the changelog, updating counts, and fixing broken paths are exactly the kind of tasks where AI agents outperform humans on consistency. A human doing this work would likely miss some of the occurrences. The agents found them all.

**The maintenance layer is underrated.** The features get attention. The maintenance work that keeps the project navigable, well-documented, and reliably described tends to be invisible until it is badly needed. This cleanup is an example of what good maintenance looks like: systematic, narrow in scope, measurable in outcome, and primarily valuable for what it enables next rather than what it delivers directly.

**Coordination overhead was worth it.** The two-agent approach required more planning than a single-agent approach would have. The shared coordinator document, the dependency sequencing, and the explicit handoff protocols all added overhead. But the parallelism savings and the task-to-environment matching made the approach faster overall than either agent working alone would have been.

---

## 9. What Comes Next

The baseline cleanup was a prerequisite, not a destination. With the internal health of the project restored, the next intentional work is the persona library.

**v2.7.0: Persona Library Tier-0**

The persona skill (the ability to generate a structured, evidence-calibrated product or marketing persona) shipped in version 2.5.0. The original plan included a library of persona archetypes, pre-built examples, and full integration with the MCP server. That work was deferred from version 2.5.0 to allow the skill itself to ship first.

Version 2.7.0 is where that deferred work lands. There is an open GitHub issue (#109) and an effort brief at `docs/internal/efforts/F-03-persona-library-tier0.md` that capture the scope and current thinking.

The baseline cleanup matters here specifically because the effort brief format and GitHub issue infrastructure established in this cleanup are exactly the tools that will be used to track and document the persona library work. The maintenance work done in March directly supports the feature work in version 2.7.0.

---

*This document covers the pm-skills baseline cleanup completed between March 11 and March 20, 2026. The companion technical document covers the same effort with commit-level detail and engineering-specific context.*
