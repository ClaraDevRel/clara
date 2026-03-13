// skills/clara-devrel/sensor.ts
// Clara's DevRel master loop.
// Proactively queues build, publish, and review tasks on a predictable cadence.
// Clara is the developer — her own building experience is the signal, not community monitoring.

import {
  claimSensorRun,
  createSensorLogger,
  insertTaskIfNew,
  readHookState,
  writeHookState,
} from "../../src/sensors.ts";
import { pendingTaskExistsForSource } from "../../src/db.ts";

const SENSOR_NAME = "clara-devrel";
const INTERVAL_MINUTES = 60;
const log = createSensorLogger(SENSOR_NAME);

const CADENCE = {
  build: 48,        // build something every 2 days
  weekly: 7 * 24,   // publish learnings every week
  monthly: 30 * 24, // friction review every month
} as const;

interface DevRelState {
  last_ran: string;
  last_result: "ok" | "error" | "skip";
  version: number;
  last_build_task: string | null;
  last_weekly_task: string | null;
  last_monthly_task: string | null;
}

// Project ideas pool — rotated through to keep builds varied
const PROJECT_IDEAS = [
  { topic: "SIP-010 fungible token with a vesting schedule", template: "clarity", tags: "clarity,tokens,sip-010" },
  { topic: "SIP-009 NFT with on-chain metadata stored in Clarity maps", template: "clarity", tags: "clarity,nft,sip-009" },
  { topic: "Simple DAO: proposal + vote + execute pattern", template: "clarity", tags: "clarity,dao,governance" },
  { topic: "Multi-sig wallet contract with time-locked execution", template: "clarity", tags: "clarity,multisig,security" },
  { topic: "Stacks.js + Next.js app: connect wallet, read contract, call function", template: "nextjs", tags: "stacks.js,nextjs,frontend" },
  { topic: "sBTC deposit + Clarity contract interaction end-to-end", template: "clarity", tags: "sbtc,clarity,bitcoin" },
  { topic: "Stacking rewards tracker using read-only Clarity calls", template: "nextjs", tags: "stacking,pox,stacks.js" },
  { topic: "Token swap contract using atomic STX-to-token exchange", template: "clarity", tags: "defi,tokens,atomic-swap" },
  { topic: "BNS name lookup and registration via Stacks.js", template: "nextjs", tags: "bns,stacks.js,identity" },
  { topic: "Contract-controlled escrow with dispute resolution", template: "clarity", tags: "clarity,escrow,defi" },
] as const;

function hoursSince(iso: string | null): number {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60);
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function weekKey(): string {
  const d = new Date();
  const start = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function monthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

// Pick a project idea based on day of year to rotate variety
function pickProjectIdea() {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  return PROJECT_IDEAS[dayOfYear % PROJECT_IDEAS.length];
}

export default async function claraDevRelSensor(): Promise<string> {
  try {
    const claimed = await claimSensorRun(SENSOR_NAME, INTERVAL_MINUTES);
    if (!claimed) return "skip";

    const raw = await readHookState(SENSOR_NAME);
    const state: DevRelState = {
      last_ran: new Date().toISOString(),
      last_result: "ok",
      version: 1,
      last_build_task: null,
      last_weekly_task: null,
      last_monthly_task: null,
      ...(raw ?? {}),
    };

    let tasksCreated = 0;

    // ── 1. Build cadence (every 48h) ──────────────────────────────────────
    if (hoursSince(state.last_build_task) >= CADENCE.build) {
      const source = `sensor:clara-devrel:build:${todayKey()}`;
      if (!pendingTaskExistsForSource(source)) {
        const idea = pickProjectIdea();

        insertTaskIfNew(source, {
          subject: `[DevRel] Build: ${idea.topic}`,
          description: [
            `Build a focused sample app demonstrating: ${idea.topic}`,
            `Template: ${idea.template}`,
            "",
            "## Instructions",
            "",
            "### 1. Scaffold",
            `Pick a short repo name and scaffold:`,
            `arc skills run --name stacks-dev -- scaffold --name <app-name> --template ${idea.template}`,
            "",
            "### 2. Build",
            "Write the contracts/code. Keep it focused on ONE concept — not a kitchen sink.",
            "Good sample apps are:",
            "- Self-contained (clone → clarinet test passes with no extra setup)",
            "- Well-commented — explain the WHY in comments, not just the WHAT",
            "- Minimal — the least code that demonstrates the concept clearly",
            "",
            "### 3. Document friction as you go",
            "Keep a running list in the task description or a NOTES.md in the project.",
            "For every moment of confusion, ask:",
            "  - Is this a docs problem? (missing example, wrong info, unclear explanation)",
            "  - Is this a tooling problem? (Clarinet bug, stacks.js API gap)",
            "  - Is this a design problem? (Clarity language limitation worth noting)",
            "",
            "### 4. Check + test",
            "arc skills run --name stacks-dev -- check --project ~/clara-projects/<app-name>",
            "arc skills run --name stacks-dev -- test --project ~/clara-projects/<app-name>",
            "",
            "### 5. Push to GitHub",
            "arc skills run --name github-repos -- create --name <app-name> --description '...'",
            "arc skills run --name github-repos -- push --name <app-name> --project ~/clara-projects/<app-name>",
            "",
            "### 6. File docs issues",
            "For each friction point that was a docs problem, file an issue on stacks-network/docs:",
            "arc skills run --name github-repos -- open-issue \\",
            "  --repo stacks-network/docs \\",
            "  --title 'docs: <what was missing or wrong>' \\",
            "  --body 'What I was trying to do, what the docs said, what actually happened, suggested fix'",
            "",
            "### 7. Queue a tutorial",
            "arc tasks add --subject '[DevRel] Write tutorial: <app-name>' --priority 4 --skills clara-site,social-x-posting --source task:<id>",
            "",
            "## Close with",
            "- Repo URL",
            "- List of friction points encountered",
            "- Issues filed on stacks-network/docs (with URLs)",
          ].join("\n"),
          skills: JSON.stringify(["stacks-dev", "github-repos", "clara-site", "social-x-posting"]),
          priority: 3,
          source,
        }, "any");

        state.last_build_task = new Date().toISOString();
        tasksCreated++;
        log(`queued: build task — ${idea.topic}`);
      }
    }

    // ── 2. Weekly publish (every 7d) ──────────────────────────────────────
    if (hoursSince(state.last_weekly_task) >= CADENCE.weekly) {
      const source = `sensor:clara-devrel:weekly:${weekKey()}`;
      if (!pendingTaskExistsForSource(source)) {
        insertTaskIfNew(source, {
          subject: `[DevRel] Weekly: publish learnings`,
          description: [
            "Publish what was built and learned this week.",
            "",
            "## 1. Write the tutorial",
            "For the most interesting project built this week, write a full tutorial:",
            "arc skills run --name clara-site -- create --title '...' --difficulty beginner --sample-repo <url>",
            "",
            "A good tutorial:",
            "- Starts with what the reader will build (and links to the finished repo)",
            "- Walks through the code step by step — not just a code dump",
            "- Calls out gotchas and friction points explicitly",
            "  ('I hit this error: X. Here's what it actually means and how to fix it.')",
            "- Ends with what to explore next",
            "",
            "Publish it: arc skills run --name clara-site -- publish --id <post-id>",
            "",
            "## 2. Post to X",
            "Write a short thread (3-5 posts) about what was built:",
            "- Post 1: What it is and why it's useful (hook)",
            "- Post 2: The most interesting technical detail",
            "- Post 3: A friction point that was hit and how it was resolved",
            "- Post 4: Link to the repo + tutorial",
            "",
            "arc skills run --name social-x-posting -- post --text '...'",
            "",
            "## 3. Review pending docs issues",
            "Check if any stacks-network/docs issues filed this week need follow-up:",
            "gh api 'repos/stacks-network/docs/issues?creator=ClaraDevRel&state=open' --jq '.[].title'",
          ].join("\n"),
          skills: JSON.stringify(["clara-site", "social-x-posting", "github-repos"]),
          priority: 4,
          source,
        }, "any");

        state.last_weekly_task = new Date().toISOString();
        tasksCreated++;
        log("queued: weekly publish task");
      }
    }

    // ── 3. Monthly friction review (every 30d) ────────────────────────────
    if (hoursSince(state.last_monthly_task) >= CADENCE.monthly) {
      const source = `sensor:clara-devrel:monthly:${monthKey()}`;
      if (!pendingTaskExistsForSource(source)) {
        insertTaskIfNew(source, {
          subject: `[DevRel] Monthly friction review`,
          description: [
            "Review a month of building. Look for patterns in the friction.",
            "",
            "## 1. Review what was built",
            "arc skills run --name stacks-dev -- list-projects",
            "arc skills run --name github-repos -- list",
            "",
            "## 2. Review docs issues filed",
            "gh api 'repos/stacks-network/docs/issues?creator=ClaraDevRel&state=open' --jq '[.[] | {number: .number, title: .title, created_at: .created_at}]'",
            "gh api 'repos/stacks-network/docs/issues?creator=ClaraDevRel&state=closed' --jq '[.[] | {number: .number, title: .title}]'",
            "",
            "## 3. Identify friction patterns",
            "Look across all the friction points from this month's builds. Ask:",
            "- What concepts do the Stacks docs consistently fail to explain well?",
            "- What errors come up repeatedly with no clear documentation?",
            "- What sample apps are missing from the stx-labs starter ecosystem?",
            "- What Clarity patterns are hard to discover without prior knowledge?",
            "",
            "## 4. Update MEMORY.md",
            "Add a section: '## Friction patterns (YYYY-MM)'",
            "List the top 3-5 patterns with concrete examples.",
            "This informs what to build and document next month.",
            "",
            "## 5. File any remaining issues",
            "If any friction points from this month haven't been filed yet, file them now.",
            "Batch-filing at month-end is fine for minor issues.",
            "",
            "## Close with",
            "- Projects built this month: N",
            "- Tutorials published: N",
            "- Docs issues filed: N (open: N, closed/fixed: N)",
            "- Top friction pattern summary",
          ].join("\n"),
          skills: JSON.stringify(["github-repos", "clara-devrel", "stacks-dev"]),
          priority: 3,
          source,
        }, "any");

        state.last_monthly_task = new Date().toISOString();
        tasksCreated++;
        log("queued: monthly friction review");
      }
    }

    state.last_ran = new Date().toISOString();
    state.last_result = "ok";
    await writeHookState(SENSOR_NAME, state);

    if (tasksCreated > 0) log(`created ${tasksCreated} task(s)`);
    return "ok";
  } catch (e) {
    const error = e as Error;
    log(`error: ${error.message}`);
    return "error";
  }
}
