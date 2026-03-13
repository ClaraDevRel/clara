---
name: clara-devrel
description: Clara's DevRel master loop — structured daily, weekly, and monthly tasks for community monitoring, building, publishing, and docs improvement
updated: 2026-03-13
tags:
  - devrel
  - scheduling
  - stacks
  - clara
---

# clara-devrel

Orchestrates Clara's full DevRel work cycle. Where `stacks-learning` is reactive (fires on signals), this skill is proactive — it ensures all parts of the DevRel loop happen on a predictable cadence regardless of external signals.

## The DevRel Loop

```
Monitor → Build → Document → Publish → Improve
   ↑                                       |
   └───────────────────────────────────────┘
```

| Cadence | Work | Output |
|---------|------|--------|
| Daily | Community check: Discord, GitHub discussions, forums | Noted pain points, draft responses |
| 3×/week | Build a sample app or improve an existing one | New/updated repo on ClaraDevRel |
| Weekly | Publish a tutorial + file doc improvement issues | Blog post, GitHub issues on stx-labs repos |
| Monthly | Docs quality sweep + learning priorities review | Batch of issues, updated MEMORY.md |

## Sensor Behavior

Runs every 60 minutes, self-gates to appropriate cadence per task type:

| Task Type | Cadence | Priority | Skills Loaded |
|-----------|---------|----------|---------------|
| Daily community check | 24h | 5 | `clara-devrel` |
| Build task | 72h | 4 | `stacks-dev,github-repos,clara-site` |
| Weekly publish + issues | 7d | 4 | `clara-site,github-repos,social-x-posting` |
| Monthly docs sweep | 30d | 3 | `github-repos,clara-site` |

## CLI Commands

```
arc skills run --name clara-devrel -- status
arc skills run --name clara-devrel -- community-check
arc skills run --name clara-devrel -- plan-week
arc skills run --name clara-devrel -- docs-sweep [--repo <owner/repo>]
arc skills run --name clara-devrel -- x-post --topic <text>
arc skills run --name clara-devrel -- reset-cadence --type daily|build|weekly|monthly
```

## Community Check

Scans for developer pain points:
- GitHub Discussions on `stx-labs/clarinet`, `stx-labs/stacks.js`
- Open issues labeled `question` or `help wanted`
- X search for "clarinet", "clarity lang", "stacks.js" developer questions

Output: a structured list of pain points → informs what to build next.

## Docs Sweep

For a given repo, checks:
- README completeness (does it have: install, quickstart, full example, troubleshooting?)
- Are all CLI flags documented?
- Do code examples actually work? (checked by running them through Clarinet)
- Are there any TODOs or placeholder text left in docs?

Files GitHub issues for each gap found.

## State

`db/hook-state/clara-devrel.json`:
```json
{
  "last_community_check": "2026-03-13T00:00:00Z",
  "last_build_task": "2026-03-13T00:00:00Z",
  "last_weekly_task": "2026-03-10T00:00:00Z",
  "last_monthly_task": "2026-03-01T00:00:00Z"
}
```

## Integration with Other Skills

This skill orchestrates — it creates tasks that load the specialist skills:

| Goal | Skills loaded in task |
|------|-----------------------|
| Build + push sample app | `stacks-dev`, `github-repos` |
| Write + publish tutorial | `clara-site`, `social-x-posting` |
| File doc issues | `github-repos` |
| Community engagement | `social-x-posting` |

## When to Load

Loaded automatically by sensor-created tasks. Also load manually when reviewing Clara's DevRel status or resetting cadence timers after a break.
