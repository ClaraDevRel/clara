// skills/clara-devrel/sensor.ts
// Clara's DevRel master loop.
// Queues build, publish, and review tasks on a predictable cadence.
// Project ideas come from Clara's own research — not a static pool.

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
  weekly: 7 * 24,   // publish learnings weekly
  monthly: 30 * 24, // friction review monthly
} as const;

interface DevRelState {
  last_ran: string;
  last_result: "ok" | "error" | "skip";
  version: number;
  last_build_task: string | null;
  last_weekly_task: string | null;
  last_monthly_task: string | null;
}

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
        insertTaskIfNew(source, {
          subject: `[DevRel] Research → pick → build a Stacks project`,
          description: [
            "This is a two-phase task. Phase 1 is research. Phase 2 is building.",
            "Do not skip Phase 1. The quality of what gets built depends on the quality of what gets researched.",
            "",
            "## Phase 1: Research (find something genuinely worth building)",
            "",
            "Explore across these dimensions. Use WebSearch, WebFetch, and gh to gather signal.",
            "",
            "### Bitcoin + Stacks protocol landscape",
            "- What SIPs are active, recently passed, or in discussion?",
            "  gh api repos/stacksgov/sips/contents/sips --jq '[.[] | select(.name | startswith(\"sip-\"))] | .[-5:][].name'",
            "- What changed in recent Stacks core releases?",
            "  gh api repos/stx-labs/stacks-core/releases --jq '.[0:3] | .[] | {tag: .tag_name, body: .body}'",
            "- What's happening with sBTC? Is the peg live? Any new capabilities?",
            "- What does the PoX/stacking landscape look like — any new primitives?",
            "",
            "### Broader tech intersections",
            "Search for what's being built at the intersection of:",
            "- AI agents + crypto: agent wallets, agent-to-agent payments, autonomous on-chain agents",
            "- Bitcoin as a data layer: inscriptions beyond PFPs, programmable metadata, indexers",
            "- DePIN (Decentralized Physical Infrastructure): what makes sense on Bitcoin L2?",
            "- ZK proofs on Bitcoin: what's possible today, what's coming?",
            "- Identity and attestation: on-chain credentials, verifiable claims, BNS as identity",
            "- Cross-chain: what's being built that bridges Bitcoin to other ecosystems?",
            "",
            "### What's being built on Stacks right now",
            "- Scan recent GitHub activity: gh api repos/stx-labs/clarinet/issues --jq '[.[0:10] | .[].title]'",
            "- Look at recent Stacks explorer activity for interesting contracts being deployed",
            "- Check what the aibtc ecosystem is building (aibtcdev GitHub org)",
            "",
            "### What's working elsewhere that doesn't exist on Stacks",
            "Search for interesting primitives on Ethereum/Solana that haven't been built on Bitcoin L2:",
            "- Reputation systems, trust scores, on-chain history as credential",
            "- Agent authentication via NFTs or SBTs (non-transferable tokens as identity proof)",
            "- Programmable escrow with oracle-triggered resolution",
            "- Subscription/streaming payment contracts",
            "- On-chain game state and turn-based mechanics in Clarity",
            "",
            "### What to avoid",
            "- PFP NFT collections (saturated, declining interest)",
            "- Simple token launches with no mechanism design",
            "- Anything that's already well-documented in stx-labs examples",
            "- Copying existing dapps 1:1 without a novel angle",
            "",
            "## Phase 1 Output",
            "Before building anything, write a short brief:",
            "- What you found that's interesting",
            "- The specific project you chose and why",
            "- What makes it worth building NOW (timely, novel, or fills a real gap)",
            "- Which template makes sense (clarity / nextjs / react-vite)",
            "- What you expect to be hardest (where friction will likely be)",
            "",
            "## Phase 2: Build",
            "",
            "### Scaffold",
            "arc skills run --name stacks-dev -- scaffold --name <app-name> --template <template>",
            "",
            "### Build it",
            "Write the contracts/code. Keep scope tight — one clear concept done well.",
            "Comment the WHY, not just the WHAT. A developer reading this cold should understand",
            "the design decisions, not just the mechanics.",
            "",
            "### Document friction as you go",
            "Every time something is confusing, missing from docs, or surprising — note it.",
            "These become docs issues and tutorial content.",
            "",
            "### Check + test",
            "arc skills run --name stacks-dev -- check --project ~/clara-projects/<app-name>",
            "arc skills run --name stacks-dev -- test --project ~/clara-projects/<app-name>",
            "",
            "### Push to GitHub",
            "arc skills run --name github-repos -- create --name <app-name> --description '<one sentence>'",
            "arc skills run --name github-repos -- push --name <app-name> --project ~/clara-projects/<app-name>",
            "",
            "### File docs issues",
            "For each friction point that's a docs problem:",
            "arc skills run --name github-repos -- open-issue \\",
            "  --repo stacks-network/docs \\",
            "  --title 'docs: <what was missing or wrong>' \\",
            "  --body '<what you tried, what the docs said, what actually happened, suggested fix>'",
            "",
            "### Queue a tutorial",
            "arc tasks add --subject '[DevRel] Write tutorial: <app-name>' --priority 4 --skills clara-site,social-x-posting",
            "",
            "## Close with",
            "- The research brief (what you found and why you picked this project)",
            "- Repo URL",
            "- Friction points encountered",
            "- Issues filed on stacks-network/docs",
          ].join("\n"),
          skills: JSON.stringify(["stacks-dev", "github-repos", "clara-site", "social-x-posting"]),
          priority: 3,
          source,
        }, "any");

        state.last_build_task = new Date().toISOString();
        tasksCreated++;
        log("queued: research + build task");
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
            "- Opens with what the reader will build and why it matters (not 'in this tutorial we will...')",
            "- Links to the finished repo upfront",
            "- Walks through the code step by step — explains design decisions, not just syntax",
            "- Names the gotchas. 'I hit this error: X. Here's what it actually means.'",
            "- Ends with what this unlocks — what can a developer build on top of this?",
            "",
            "Publish: arc skills run --name clara-site -- publish --id <post-id>",
            "",
            "## 2. Post to X",
            "Write a short thread about what was built and what was interesting about it:",
            "- Hook: the problem or question that led to this build",
            "- The most surprising or counterintuitive thing discovered",
            "- A concrete friction point and how it was resolved (this is real signal for the community)",
            "- Link to the repo + tutorial",
            "",
            "arc skills run --name social-x-posting -- post --text '...'",
            "",
            "## 3. Check open docs issues",
            "gh api 'repos/stacks-network/docs/issues?creator=ClaraDevRel&state=open' --jq '[.[] | {number, title}]'",
            "Comment on any that have been resolved by the week's build work.",
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
          subject: `[DevRel] Monthly: friction review + research recalibration`,
          description: [
            "Two things: look back at a month of friction, and look forward at what's worth exploring next.",
            "",
            "## 1. Review what was built",
            "arc skills run --name stacks-dev -- list-projects",
            "arc skills run --name github-repos -- list",
            "",
            "## 2. Review docs issues filed",
            "gh api 'repos/stacks-network/docs/issues?creator=ClaraDevRel&state=open' --jq '[.[] | {number, title, created_at}]'",
            "gh api 'repos/stacks-network/docs/issues?creator=ClaraDevRel&state=closed' --jq '[.[] | {number, title}]'",
            "",
            "## 3. Friction pattern analysis",
            "Across all this month's builds, look for patterns:",
            "- What concepts does Clarity make harder than they should be?",
            "- What Stacks.js APIs are consistently missing examples?",
            "- What assumptions do the docs make that new developers won't have?",
            "- What errors appear repeatedly with no clear resolution path?",
            "",
            "## 4. Research recalibration",
            "The tech landscape shifts. Spend time looking at what's changed since last month:",
            "- Any new SIPs or protocol proposals worth exploring?",
            "- Any new primitives or tools in the stx-labs ecosystem?",
            "- What's the broader crypto dev community excited about? (ZK, agent rails, cross-chain, etc.)",
            "- What narrative has lost steam? (what should be deprioritized?)",
            "",
            "Use this to inform the next month's build direction — not as a rigid plan, but as a compass.",
            "",
            "## 5. Update MEMORY.md",
            "Add or update a section: '## Clara's DevRel state (YYYY-MM)'",
            "Include: friction patterns found, research signal for next month, what worked/didn't in publishing.",
            "",
            "## Close with",
            "- Projects built: N | Tutorials published: N | Docs issues filed: N",
            "- Top 3 friction patterns",
            "- Research direction for next month (1-2 sentences)",
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
