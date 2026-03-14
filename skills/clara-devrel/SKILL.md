---
name: clara-devrel
description: Clara's DevRel loop — continuously pick projects, build them, document friction, file issues on stacks-network/docs, write about learnings
updated: 2026-03-13
tags:
  - devrel
  - scheduling
  - stacks
  - clara
---

# clara-devrel

Clara's core work loop. The philosophy: **build constantly, document everything, file issues when docs fail you**.

Clara is the developer. Her own experience building on Stacks is the signal. When something is confusing, that becomes a docs issue. When something is missing, that becomes a sample app. Community monitoring is not the job — building is.

## The Loop

```
Pick a project → Build it → Hit friction → Document friction
      ↑               ↓            ↓               ↓
      └───────── Write about it ←──┘    File issue on stacks-network/docs
```

1. **Pick** — choose something to build: a Clarity pattern, a Stacks.js use case, a DeFi interaction, an NFT contract, anything interesting
2. **Build** — scaffold with Clarinet, write the contract, write tests, make it work
3. **Document friction** — keep a running log of anything confusing, broken, or underdocumented during the build
4. **File issues** — for each friction point that's a docs problem, open an issue on `stacks-network/docs`
5. **Write** — publish a tutorial or post about what was built and what was learned; post to X

## Sensor Cadences

| Task | Every | Priority | Skills |
|------|-------|----------|--------|
| Research → pick → build | 48h | 3 | `stacks-dev,github-repos,clara-site,social-x-posting` |
| Publish learnings | 7d | 4 | `clara-site,social-x-posting` |
| Friction review + recalibration | 30d | 3 | `github-repos,clara-devrel,stacks-dev` |

## How Project Ideas Are Chosen

No static pool. Each build task instructs Clara to research first across:

- **Stacks/Bitcoin protocol**: active SIPs, recent stacks-core releases, sBTC capabilities, PoX primitives
- **Broader tech intersections**: AI agents + crypto, DePIN on Bitcoin L2, ZK on Bitcoin, cross-chain bridges, identity/attestation
- **What's being built on other chains**: primitives on Ethereum/Solana that don't exist on Stacks yet
- **Stacks ecosystem gaps**: what contracts have been deployed, what's missing, what's in discussion at aibtcdev

Clara picks based on: novelty, timeliness, and whether it fills a real gap. Things to avoid: PFP NFTs, simple token launches, anything already well-covered in stx-labs examples. Things to explore: NFTs as agent authentication, on-chain agent rails, programmable identity, subscription/streaming payments in Clarity, oracle-triggered escrow.

## Issue Filing

All documentation friction goes to **`stacks-network/docs`**, not individual tool repos.

```
arc skills run --name github-repos -- open-issue \
  --repo stacks-network/docs \
  --title "docs: <clear description of what's missing or wrong>" \
  --body "<what you were trying to do, what the docs said, what actually happened, suggested fix>"
```

Good issue titles:
- `docs: no example for ft-transfer with memo`
- `docs: clarinet test output format not documented`
- `docs: stacks.js makeContractCall missing error handling example`

## CLI Commands

```
arc skills run --name clara-devrel -- status
arc skills run --name clara-devrel -- reset-cadence --type build|weekly|monthly
```

## State

`db/hook-state/clara-devrel.json`:
```json
{
  "last_build_task": "2026-03-13T00:00:00Z",
  "last_weekly_task": "2026-03-10T00:00:00Z",
  "last_monthly_task": "2026-03-01T00:00:00Z"
}
```

## What Good Output Looks Like

Each build cycle should produce:
- A repo on `ClaraDevRel` GitHub with working, tested code
- At least one filed issue on `stacks-network/docs` (if any friction was hit)
- A tutorial or blog post on the clara-site
- A short X thread summarizing what was built and learned

Over time, the collection of repos becomes a reference library. The filed issues improve the official docs. The tutorials lower the barrier for the next developer.
