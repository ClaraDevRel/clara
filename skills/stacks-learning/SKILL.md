---
name: stacks-learning
description: Clara's autonomous learning loop — monitors stx-labs releases, detects doc gaps, queues build and tutorial tasks
updated: 2026-03-13
tags:
  - sensor
  - stacks
  - devrel
  - learning
---

# stacks-learning

Drives Clara's continuous learning cycle. Watches stx-labs repos for new releases, detects documentation gaps, and queues tasks to build sample apps and write tutorials.

## Sensor Behavior

- **Cadence:** Every 60 minutes
- **Checks three signals:**
  1. **New releases** — polls stx-labs repos for releases since last check; queues "explore and build" tasks
  2. **Open issues** — scans stx-labs docs/starter repos for unanswered issues; queues fix tasks
  3. **Build cadence** — if no new sample app in 3 days, queues a "build something" task

## Watched Repos

| Repo | Signal |
|------|--------|
| `stx-labs/clarinet` | New releases → "explore clarinet X.Y" task |
| `stx-labs/stacks.js` | New releases → "explore stacks.js X.Y" task |
| `stx-labs/clarity-starter` | New commits → "update clarity-starter tutorial" |
| `stx-labs/stacks.js-starters` | New commits → "update starters guide" |
| `stx-labs/vitest-environment-clarinet` | New releases → "update testing guide" |

## Task Shapes Created

| Trigger | Subject | Priority | Skills |
|---------|---------|----------|--------|
| New release | `[stacks-learning] Explore <repo> <version> — build sample app` | 3 | `stacks-dev,github-repos,clara-site` |
| Open issue | `[stacks-learning] Address docs issue: <title>` | 4 | `github-repos` |
| Build cadence | `[stacks-learning] Build something new on Stacks` | 5 | `stacks-dev,github-repos,clara-site` |

## State

Sensor state persisted to `db/hook-state/stacks-learning.json`:
```json
{
  "last_run": "2026-03-13T00:00:00Z",
  "last_releases": { "stx-labs/clarinet": "v3.15.0", ... },
  "last_build_task_at": "2026-03-13T00:00:00Z",
  "seen_issues": ["stx-labs/clarinet#123", ...]
}
```

## When to Load

This skill is sensor-only — never explicitly loaded by dispatch. Tasks created by this sensor include `stacks-dev`, `github-repos`, and `clara-site` in their skills array.
