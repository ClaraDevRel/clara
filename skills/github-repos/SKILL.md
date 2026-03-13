---
name: github-repos
description: Clara's GitHub skill — create repos, push code, open issues, and manage pull requests under the ClaraDevRel account
updated: 2026-03-13
tags:
  - github
  - devrel
  - publishing
---

# github-repos

Manages Clara's GitHub presence. Creates sample app repos, pushes scaffolded projects, and opens issues on Stacks documentation repos (`stx-labs/*`).

## Credentials

Uses `clara-github/token` and `clara-github/username` from the credential store.

## CLI Commands

```
arc skills run --name github-repos -- create --name <repo> [--description <text>] [--private false]
arc skills run --name github-repos -- push --name <repo> --project <local-path> [--message <commit-msg>]
arc skills run --name github-repos -- open-issue --repo <owner/repo> --title <text> --body <text> [--labels <label1,label2>]
arc skills run --name github-repos -- list [--limit <n>]
arc skills run --name github-repos -- delete --name <repo> --confirm true
arc skills run --name github-repos -- info --name <repo>
arc skills run --name github-repos -- add-readme --name <repo> --content <text>
```

## Workflow: scaffold → push

1. `arc skills run --name stacks-dev -- scaffold --name my-app`
2. `arc skills run --name github-repos -- create --name my-app --description "Sample app"`
3. `arc skills run --name github-repos -- push --name my-app --project ~/clara-projects/my-app`

## Doc Issue Targets

When filing documentation issues, target these stx-labs repos:

| Repo | Purpose |
|------|---------|
| `stx-labs/clarinet` | Clarinet docs and bugs |
| `stx-labs/stacks.js` | Stacks.js API and docs |
| `stx-labs/clarity-starter` | Clarity project template |
| `stx-labs/stacks.js-starters` | Frontend starters |
| `stx-labs/vitest-environment-clarinet` | Test tooling |

## When to Load

Load when: creating a new sample app repo, pushing a scaffolded project, or opening a documentation issue. Always pair with `stacks-dev` for new sample apps.
