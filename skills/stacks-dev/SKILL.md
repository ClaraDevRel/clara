---
name: stacks-dev
description: Clara's Stacks developer workbench — scaffold sample apps, check/test Clarity contracts, deploy to testnet/mainnet, and request testnet STX
updated: 2026-03-13
tags:
  - stacks
  - clarity
  - development
  - devrel
---

# stacks-dev

Clara's primary development skill. Wraps Clarinet for Clarity contract development and scaffolds opinionated sample app repos that demonstrate Stacks features clearly and correctly.

All tooling references stx-labs repos:
- Clarinet: `stx-labs/clarinet`
- Stacks.js: `stx-labs/stacks.js` (npm: `@stacks/*`)
- Clarity starter template: `stx-labs/clarity-starter`
- Frontend starters: `stx-labs/stacks.js-starters`
- Vitest integration: `stx-labs/vitest-environment-clarinet`

## CLI Commands

```
arc skills run --name stacks-dev -- scaffold --name <app-name> [--description <text>] [--template <clarity|nextjs|react-vite|sveltekit>]
arc skills run --name stacks-dev -- check --project <path>
arc skills run --name stacks-dev -- test --project <path>
arc skills run --name stacks-dev -- deploy --project <path> --contract <name> --network testnet|mainnet
arc skills run --name stacks-dev -- faucet --address <stx-address>
arc skills run --name stacks-dev -- new-contract --project <path> --name <contract-name>
arc skills run --name stacks-dev -- list-projects
arc skills run --name stacks-dev -- info --project <path>
```

## Templates

| Template | Base | What it scaffolds |
|----------|------|------------------|
| `clarity` | `stx-labs/clarity-starter` | Pure Clarity contracts + vitest tests (default) |
| `nextjs` | `stx-labs/stacks.js-starters` template-react-nextjs-ts | Next.js + Stacks.js + wallet connect |
| `react-vite` | `stx-labs/stacks.js-starters` template-react-vite-ts | Vite + React + Stacks.js |
| `sveltekit` | `stx-labs/stacks.js-starters` template-sveltekit-ts | SvelteKit + Stacks.js |

## Project Layout

Scaffolded projects live under `~/clara-projects/<app-name>/`:

```
<app-name>/
  Clarinet.toml
  contracts/
    <app-name>.clar
  tests/
    <app-name>.test.ts
  README.md              # Auto-generated tutorial stub
  .gitignore
```

## Workflow

1. **scaffold** — clone template from stx-labs, customize for the app
2. **check** — static analysis (`clarinet check`)
3. **test** — run unit tests (`clarinet test`)
4. **deploy** — broadcast contract to testnet or mainnet
5. **push to GitHub** — use `github-repos` skill to create repo and push

## Faucet

Requests testnet STX from the Stacks testnet faucet. STX arrives within ~1 block. Limited to 1 request per address per day.

## @stacks/connect v8

All frontend scaffolds use `@stacks/connect` v8. Key API changes from v7:

```ts
// Connect to wallet (replaces showConnect / authenticate)
import { connect, disconnect, isConnected, request } from '@stacks/connect';
await connect();

// Contract call (replaces openContractCall / doContractCall)
await request('stx_callContract', { contract: 'SP...foo', functionName: 'bar', functionArgs: [] });

// Deploy (replaces openContractDeploy)
await request('stx_deployContract', { name: 'my-contract', clarityCode: '...' });

// Sign message (replaces openSignMessage)
await request('stx_signMessage', { message: 'hello' });
```

Deprecated and must NOT be used: `UserSession`, `AppConfig`, `showConnect`, `openXyz`, `doXyz`,
`onFinish`/`onCancel` callbacks, `@stacks/connect-react`.

Reference: `stx-labs/connect` (current: v8.2.6)

## Dependencies

- `clarinet` binary (v3.15.0, from `stx-labs/clarinet`) — installed at `/usr/local/bin/clarinet`
- `github-repos` skill — for pushing scaffolded projects to GitHub

## When to Load

Load when: scaffolding a new sample app, checking or testing Clarity contracts, deploying to testnet, or debugging a contract. Pair with `github-repos` to push the result and `clara-site` to publish a tutorial.
