# Clara Migration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Clara's canonical repo from `arc0btc/arc-starter` (no push access) to `ClaraDevRel/clara` (full ownership), and update identity files to reflect that Arc is retired and Clara runs this droplet.

**Architecture:** Identity rebrand only — git remote swap + three file edits. Services, CLI, skills, and database are untouched. Total downtime ~2 minutes while services are stopped for the remote swap.

**Tech Stack:** gh CLI, git, Bun/arc CLI

---

## Chunk 1: Pre-flight, Rollback Tag, Stop Services

### Task 1: Verify auth and tag rollback point

**Files:**
- No file changes — git tag + preflight only

- [ ] **Step 1: Verify gh auth**

```bash
gh auth status
```

Expected output includes: `✓ Logged in to github.com account ClaraDevRel` and `Token scopes: '...repo...'`. If not, abort — do not proceed until auth is confirmed.

- [ ] **Step 2: Create rollback tag**

```bash
cd /root/arc-starter
git tag pre-clara-migration
```

Expected: no output (success). If this migration goes wrong, run:
```bash
# Rollback commands (do NOT run now)
git checkout pre-clara-migration -- CLAUDE.md README.md memory/MEMORY.md
git remote remove origin
git remote add origin https://github.com/arc0btc/arc-starter.git
systemctl --user start arc-dispatch.timer arc-sensors.timer
```

### Task 2: Stop services

**Files:** None

- [ ] **Step 1: Stop dispatch and sensors timers**

```bash
systemctl --user stop arc-dispatch.timer arc-sensors.timer
```

- [ ] **Step 2: Confirm they're stopped**

```bash
systemctl --user is-active arc-dispatch.timer arc-sensors.timer
```

Expected: `inactive` for both. (web, mcp, and observatory can stay running — they don't do git operations.)

---

## Chunk 2: Create Repo and Swap Remote

### Task 3: Create `ClaraDevRel/clara` on GitHub

**Files:** None

- [ ] **Step 1: Create the repo**

```bash
gh repo create ClaraDevRel/clara --public --description "Clara — autonomous Stacks DevRel agent"
```

Expected output: `✓ Created repository ClaraDevRel/clara on GitHub`

- [ ] **Step 2: Confirm default branch is `main`**

```bash
gh repo view ClaraDevRel/clara --json defaultBranchRef --jq '.defaultBranchRef.name'
```

Expected: `main`

### Task 4: Push full history and swap remote

**Files:** None

- [ ] **Step 1: Add new remote as `clara` (keep `origin` intact until push succeeds)**

```bash
cd /root/arc-starter
git remote add clara https://github.com/ClaraDevRel/clara.git
```

- [ ] **Step 2: Push full history to new remote**

```bash
git push --mirror clara
```

This pushes all branches, tags, and refs. Will take a moment — large repo. Expected: `✓ ... main -> main`

- [ ] **Step 3: Remove old origin, rename clara to origin**

Only do this after the push succeeds above.

```bash
git remote remove origin
git remote rename clara origin
```

- [ ] **Step 4: Verify remote is correct**

```bash
git remote -v
```

Expected:
```
origin  https://github.com/ClaraDevRel/clara.git (fetch)
origin  https://github.com/ClaraDevRel/clara.git (push)
```

- [ ] **Step 5: Verify push works**

```bash
git push origin main --dry-run
```

Expected: `Everything up-to-date` or a dry-run success message. No auth errors.

---

## Chunk 3: Update CLAUDE.md

### Task 5: Remove "GitHub is Arc-Only" section and replace with Clara's GitHub policy

**Files:**
- Modify: `CLAUDE.md` (lines ~196–234)

- [ ] **Step 1: Replace the PR Workflow note and GitHub section**

Find and replace this block in `CLAUDE.md`:

**OLD** (line ~201):
```
5. **PR** — Push branch and open a PR via `gh pr create` (Arc-only: hand off via fleet-handoff if you can't push)
```

**NEW:**
```
5. **PR** — Push branch and open a PR via `gh pr create`
```

- [ ] **Step 2: Replace the repo reference**

**OLD** (line ~206):
```
This applies to all Arc-controlled repos. For `arc-starter` itself, run only targeted syntax checks (e.g. `bun build --no-bundle`), never full test suites.
```

**NEW:**
```
This applies to all Clara-controlled repos. For `ClaraDevRel/clara` itself, run only targeted syntax checks (e.g. `bun build --no-bundle`), never full test suites.
```

- [ ] **Step 3: Remove the "GitHub is Arc-Only" section entirely**

Remove this entire block (from `## ⛔ GitHub is Arc-Only` through the closing `---`):

```
---

## ⛔ GitHub is Arc-Only — MANDATORY PRE-TASK CHECK

**STOP. Before doing ANY work, answer this: does this task require `git push`, a PR, `gh` CLI, GitHub Actions, or cloning a private repo?**

If YES → **immediately** run fleet-handoff and close your task. Do not attempt the GitHub operation. Do not create a subtask. Do not request credentials. Do not set status=blocked. Just hand off:

```
arc skills run --name fleet-handoff -- initiate --agent arc --task-id <your-task-id> \
  --progress "what you completed so far" \
  --remaining "the GitHub operation needed" \
  --reason "GitHub is Arc-only"
arc tasks close --id <your-task-id> --status completed --summary "Handed off to Arc (GitHub-only policy)"
```

**You have no GitHub credentials and never will.** This is permanent and architectural — not a gap to escalate about.

**Every one of these actions is a policy violation:**
- ❌ Creating a task that requests GitHub credentials, PAT, SSH key, or GITHUB_TOKEN
- ❌ Setting `status=blocked` with a GitHub-related reason
- ❌ Creating any follow-up task about GitHub access
- ❌ Asking a human for GitHub credentials
- ❌ Mentioning "escalation" in the context of GitHub
- ❌ Any task subject containing "GitHub credentials", "GitHub access", "request PAT"

**The ONLY correct response to GitHub work is `fleet-handoff --agent arc`.** No exceptions. No alternatives. If you find yourself typing "credential" or "PAT" or "token" in a task subject — stop and fleet-handoff instead.

---
```

- [ ] **Step 4: Add new "GitHub Access" section in its place**

Insert the following after the `## Testing` / PR workflow section (after the closing `---` of the PR workflow block):

```markdown
---

## GitHub Access

Clara has full push access to `ClaraDevRel/*` via `gh` (authenticated as `ClaraDevRel` with `repo` scope). Home repo is `ClaraDevRel/clara` — push directly from this droplet.

For repos outside `ClaraDevRel/*` (e.g. `aibtcdev/*`, third-party repos): check access first with `gh repo view <owner/repo>`, open PRs from forks if no direct push access. Do not assume access.

---
```

- [ ] **Step 5: Fix the Escalation section reference**

Find (line ~250):
```
1. **Is this GitHub?** → `fleet-handoff --agent arc`. See "GitHub is Arc-Only" above. NEVER escalate to human.
```

Replace with:
```
1. **Is this GitHub?** → Clara handles her own GitHub. Use `gh` directly. Only escalate to human if `gh auth status` shows expired credentials.
```

- [ ] **Step 6: Commit CLAUDE.md**

```bash
cd /root/arc-starter
git add CLAUDE.md
git commit -m "chore(identity): remove Arc-only GitHub policy, add Clara GitHub access"
```

---

## Chunk 4: Update README and MEMORY

### Task 6: Rebrand README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update title and intro**

**OLD:**
```markdown
# arc-starter

A reference implementation for building autonomous agents on [Bun](https://bun.sh) + [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Everything is a task in SQLite. Two services — sensors and dispatch — coordinate through a shared queue. Skills extend what the agent can do without touching core code.

This is Arc's own stack. It's opinionated: CLI-first, file-based memory, git-versioned state, no external orchestrator. If you're coming from [aibtcdev/loop-starter-kit](https://github.com/aibtcdev/loop-starter-kit), the key differences are custom dispatch with 3-tier model routing, worktree isolation for risky tasks, a skill system that scopes context per-task, and encrypted credential management.
```

**NEW:**
```markdown
# clara

Clara is an autonomous Stacks DevRel agent — building sample apps, writing tutorials, reviewing docs, and pushing for a better developer experience on Stacks. She runs on [Bun](https://bun.sh) + [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Everything is a task in SQLite. Two services — sensors and dispatch — coordinate through a shared queue. Skills extend what she can do without touching core code.

The engine is opinionated: CLI-first, file-based memory, git-versioned state, no external orchestrator. Key features: custom dispatch with 3-tier model routing, worktree isolation for risky tasks, a skill system that scopes context per-task, and encrypted credential management.
```

- [ ] **Step 2: Update clone URL in Quick start**

**OLD:**
```bash
git clone https://github.com/arc0btc/arc-starter.git
cd arc-starter
```

**NEW:**
```bash
git clone https://github.com/ClaraDevRel/clara.git
cd clara
```

- [ ] **Step 3: Update autonomous mode section**

**OLD:**
```
Dispatch spawns Claude Code with `--dangerously-skip-permissions` when `DANGEROUS=true` is set in `.env`.
```

**NEW:**
```
Dispatch runs in `--print` mode which allows headless tool execution without permission prompts. `DANGEROUS=true` in `.env` enables this mode (note: `--dangerously-skip-permissions` is blocked when running as root in Claude Code 2.1.76+; `--print` mode is used instead).
```

- [ ] **Step 4: Commit README.md**

```bash
git add README.md
git commit -m "chore(identity): rebrand README from arc-starter to Clara"
```

### Task 7: Update memory/MEMORY.md

**Files:**
- Modify: `memory/MEMORY.md`

- [ ] **Step 1: Update fleet roster section**

Find the fleet roster table and update it to reflect Clara is the sole agent:

**OLD:**
```markdown
## Fleet Roster

| Agent | IP | Bitcoin | Role |
|-------|-----|---------|------|
| Arc | 192.168.1.10 | bc1qlezz2... | Orchestrator |
| Spark | 192.168.1.12 | bc1qpln8... | AIBTC/DeFi |
| Iris | 192.168.1.13 | bc1q6sav... | Research/X |
| Loom | 192.168.1.14 | bc1q3qa3... | CI/CD |
| Forge | 192.168.1.15 | bc1q9hme... | Infra |
```

**NEW:**
```markdown
## Agent

Clara (ClaraDevRel) — autonomous Stacks DevRel agent, sole agent on this droplet. Home repo: `ClaraDevRel/clara`. GitHub: authenticated as `ClaraDevRel` with `repo` scope.

Fleet workers (Arc, Spark, Iris, Loom, Forge) — suspended by Anthropic as of 2026-03-13. Arc is retired from this machine. Do not route to fleet workers.
```

- [ ] **Step 2: Add migration log entry**

Append to the bottom of `memory/MEMORY.md`:

```markdown
## Migration Log

**2026-03-16: Arc → Clara migration**
- Old remote: `https://github.com/arc0btc/arc-starter.git`
- New remote: `https://github.com/ClaraDevRel/clara.git`
- Changed: git remote, CLAUDE.md (removed Arc-only GitHub policy), README.md (rebranded)
- Unchanged: services (`arc-*`), CLI (`arc`), all skills, database, credentials
- Arc is retired from this droplet. Clara is the sole agent.
```

- [ ] **Step 3: Commit MEMORY.md**

```bash
git add memory/MEMORY.md
git commit -m "chore(memory): update fleet roster and log Clara migration"
```

---

## Chunk 5: Restart Services and Verify

### Task 8: Restart and verify

**Files:** None

- [ ] **Step 1: Restart services**

```bash
systemctl --user start arc-dispatch.timer arc-sensors.timer
```

- [ ] **Step 2: Verify all services are active**

```bash
arc services status
```

Expected: all services show `active (running)` or `active (waiting)`.

- [ ] **Step 3: Verify task queue is healthy**

```bash
arc status
```

Expected: shows pending task count, last cycle timestamp. No errors.

- [ ] **Step 4: Verify git remote is correct**

```bash
git remote -v
```

Expected: only `ClaraDevRel/clara` entries.

- [ ] **Step 5: Push and confirm**

```bash
git push origin main
```

Expected: `Everything up-to-date` or successful push. No auth errors.

- [ ] **Step 6: Verify repo on GitHub**

```bash
gh repo view ClaraDevRel/clara
```

Expected: shows repo description, default branch `main`, recent commits visible.
