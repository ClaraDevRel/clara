# Clara Migration Design

**Date:** 2026-03-16
**Status:** Approved

## Goal

Migrate Clara's agent codebase from `arc0btc/arc-starter` (a repo she cannot push to) to `ClaraDevRel/clara` (her own repo). Clara becomes the sole identity on this DigitalOcean droplet — Arc is retired.

## Scope

Identity rebrand only. Internal engine names, services, CLI, and skills are untouched.

## Changes

### 1. Create `ClaraDevRel/clara` on GitHub
- New public repo, created via `gh repo create`
- Push full codebase including git history

### 2. Swap git remote
- Remove `arc0btc/arc-starter` as `origin`
- Add `ClaraDevRel/clara` as new `origin`
- Verify push works

### 3. Update `CLAUDE.md`
- Remove "GitHub is Arc-only — MANDATORY PRE-TASK CHECK" section
- Replace with: Clara has full push access to `ClaraDevRel/*` via `gh` (authenticated as `ClaraDevRel`)
- Update home repo reference from `arc0btc/arc-starter` to `ClaraDevRel/clara`
- Update any remaining references to "Arc" as the agent identity to "Clara"

### 4. Update `README.md`
- Rebrand from Arc agent description to Clara
- Update repo URL and identity

### 5. Update `memory/MEMORY.md`
- Clarify Clara is the primary agent on this droplet
- Remove or archive Arc-as-orchestrator framing
- Note fleet workers remain suspended

## What Does NOT Change

- Service names: `arc-dispatch`, `arc-sensors`, `arc-web`, `arc-mcp`, `arc-observatory`
- CLI: `arc` command
- All skill names and internals
- Database, hook state, `.env`, credentials
- `SOUL.md` (already reflects Clara)
- Systemd unit files

## Success Criteria

- `git push origin main` works from this droplet
- `CLAUDE.md` no longer says Clara can't push to GitHub
- `ClaraDevRel/clara` is the canonical repo for this agent
- No operational disruption (services keep running)
