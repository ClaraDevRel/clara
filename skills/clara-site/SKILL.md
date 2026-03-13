---
name: clara-site
description: Clara's tutorial site — create, publish, and deploy Stacks dev tutorials to Netlify, with auto cross-post to X
updated: 2026-03-13
tags:
  - publishing
  - blogging
  - netlify
  - devrel
---

# clara-site

Manages Clara's tutorial site — writing, publishing, and deploying Stacks developer content. Tutorials are stored in a GitHub repo under `ClaraDevRel/clara-site` and auto-deployed to Netlify on push.

## Content Pattern

```
content/YYYY/YYYY-MM-DD/[post-slug]/
  index.md      (frontmatter + tutorial content)
  assets/       (screenshots, diagrams, code snippets)
```

Tutorial frontmatter:
```yaml
---
title: "Tutorial Title"
date: 2026-03-13T00:00:00Z
updated: 2026-03-13T00:00:00Z
draft: false
difficulty: beginner|intermediate|advanced
stacks_version: "3.x"
prerequisites:
  - clarinet installed
  - basic Clarity knowledge
tags:
  - clarity
  - stacks
sample_repo: https://github.com/ClaraDevRel/my-sample-app
---
```

## CLI Commands

```
arc skills run --name clara-site -- create --title "Title" [--difficulty beginner|intermediate|advanced] [--tags tag1,tag2] [--sample-repo <url>]
arc skills run --name clara-site -- list [--status draft|published|scheduled]
arc skills run --name clara-site -- show --id <post-id>
arc skills run --name clara-site -- publish --id <post-id>
arc skills run --name clara-site -- deploy
arc skills run --name clara-site -- status
```

## Workflow

1. **create** — scaffold a draft tutorial with frontmatter
2. **Write** — fill in `index.md` with the tutorial content
3. **publish** — set `draft: false` and push to GitHub
4. **deploy** — trigger Netlify build (or auto-triggers on push)
5. **X cross-post** — auto-queues a task to post summary to X

## Netlify Deploy

- Credentials: `clara-netlify/token` from credential store
- Site: created on first deploy via `arc skills run --name clara-site -- deploy`
- Auto-deploy: Netlify rebuilds on every push to `ClaraDevRel/clara-site` main branch
- Site ID stored in `db/hook-state/clara-site.json` after first deploy

## Storage

Posts tracked in `db/hook-state/clara-site-posts.json`. Each entry:
```json
{
  "id": "2026-03-13-my-tutorial",
  "title": "My Tutorial",
  "path": "content/2026/2026-03-13/my-tutorial/index.md",
  "status": "published",
  "published_at": "2026-03-13T00:00:00Z",
  "sample_repo": "https://github.com/ClaraDevRel/my-tutorial"
}
```

## Sensor Behavior

- **Cadence:** 60 minutes
- Detects unpublished drafts older than 1 day → queues review/publish task (P6)
- Detects if no post in 5 days → queues content generation task (P5)

## When to Load

Load when: writing a new tutorial, publishing a draft, or deploying the site. Always pair with `stacks-dev` and `github-repos` when writing a tutorial for a new sample app. Pair with `social-x-posting` for cross-posting.
