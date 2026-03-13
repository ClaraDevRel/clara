// skills/clara-devrel/sensor.ts
// Clara's DevRel master loop — proactive scheduling of community, build, publish, and docs work.
// Uses the arc-starter scheduled_for system to create tasks at the right cadence.

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

// Cadence thresholds in hours
const CADENCE = {
  community: 24,       // daily community check
  build: 72,           // build something every 3 days
  weekly: 7 * 24,      // weekly publish + doc issues
  monthly: 30 * 24,    // monthly docs sweep
} as const;

interface DevRelState {
  last_ran: string;
  last_result: "ok" | "error" | "skip";
  version: number;
  last_community_check: string | null;
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
  // ISO week — just use year + week-of-year approximation
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
      last_community_check: null,
      last_build_task: null,
      last_weekly_task: null,
      last_monthly_task: null,
      ...(raw ?? {}),
    };

    let tasksCreated = 0;

    // ── 1. Daily community check ──────────────────────────────────────────
    if (hoursSince(state.last_community_check) >= CADENCE.community) {
      const source = `sensor:clara-devrel:community:${todayKey()}`;
      if (!pendingTaskExistsForSource(source)) {
        insertTaskIfNew(source, {
          subject: `[DevRel] Daily community check — find developer pain points`,
          description: [
            "Scan for Stacks developer questions and pain points across:",
            "",
            "1. GitHub Discussions:",
            "   gh api repos/stx-labs/clarinet/discussions --jq '[.[] | select(.answer_chosen_at == null)] | .[0:5]'",
            "   gh api repos/stx-labs/stacks.js/discussions --jq '[.[] | select(.answer_chosen_at == null)] | .[0:5]'",
            "",
            "2. Open issues labeled 'question' or 'help wanted':",
            "   gh api 'repos/stx-labs/clarinet/issues?labels=question&state=open' --jq '.[0:10] | .[].title'",
            "   gh api 'repos/stx-labs/stacks.js/issues?labels=question&state=open' --jq '.[0:10] | .[].title'",
            "",
            "3. X search (via social-x-posting skill):",
            "   arc skills run --name social-x-posting -- search --query 'clarinet stacks developer' --limit 20",
            "   arc skills run --name social-x-posting -- search --query 'clarity lang help' --limit 20",
            "",
            "Output:",
            "- List the top 3 most common pain points you found",
            "- For each: note the source, the question, and whether there's existing documentation",
            "- If any pain point has no existing sample app or tutorial → create a follow-up task:",
            "  arc tasks add --subject '[DevRel] Build: <topic>' --priority 4 --skills stacks-dev,github-repos,clara-site",
            "",
            "Close this task with a 1-paragraph summary of what developers are struggling with today.",
          ].join("\n"),
          skills: JSON.stringify(["clara-devrel", "social-x-posting"]),
          priority: 5,
          source,
        }, "any");

        state.last_community_check = new Date().toISOString();
        tasksCreated++;
        log("queued: daily community check");
      }
    }

    // ── 2. Build cadence — every 3 days ──────────────────────────────────
    if (hoursSince(state.last_build_task) >= CADENCE.build) {
      const source = `sensor:clara-devrel:build:${todayKey()}`;
      if (!pendingTaskExistsForSource(source)) {
        insertTaskIfNew(source, {
          subject: `[DevRel] Build a Stacks sample app`,
          description: [
            "Time to ship a new sample app. Choose based on what developers are asking about",
            "(check recent community-check task results) or pick something from the latest stx-labs releases.",
            "",
            "Workflow:",
            "1. Pick a topic — something useful, something developers actually need",
            "2. Scaffold: arc skills run --name stacks-dev -- scaffold --name <app-name> --template clarity",
            "3. Build it — write Clarity contracts, write tests, make it work",
            "4. Check: arc skills run --name stacks-dev -- check --project ~/clara-projects/<app-name>",
            "5. Test: arc skills run --name stacks-dev -- test --project ~/clara-projects/<app-name>",
            "6. Create GitHub repo: arc skills run --name github-repos -- create --name <app-name> --description '...'",
            "7. Push: arc skills run --name github-repos -- push --name <app-name> --project ~/clara-projects/<app-name>",
            "8. Queue a tutorial task:",
            "   arc tasks add --subject '[DevRel] Write tutorial for <app-name>' --priority 4 --skills clara-site,social-x-posting",
            "",
            "The sample app should be:",
            "- Self-contained (clone → clarinet test works with no extra setup)",
            "- Well-commented Clarity code",
            "- Focused on ONE concept, not a kitchen sink",
            "- Something a developer could actually build on top of",
          ].join("\n"),
          skills: JSON.stringify(["stacks-dev", "github-repos", "clara-site"]),
          priority: 4,
          source,
        }, "any");

        state.last_build_task = new Date().toISOString();
        tasksCreated++;
        log("queued: build task");
      }
    }

    // ── 3. Weekly publish + doc issues ───────────────────────────────────
    if (hoursSince(state.last_weekly_task) >= CADENCE.weekly) {
      const source = `sensor:clara-devrel:weekly:${weekKey()}`;
      if (!pendingTaskExistsForSource(source)) {
        insertTaskIfNew(source, {
          subject: `[DevRel] Weekly: publish tutorial + file docs issues`,
          description: [
            "Two things this week:",
            "",
            "## 1. Publish a Tutorial",
            "Check for unpublished drafts: arc skills run --name clara-site -- list --status draft",
            "Pick the most complete draft and publish it:",
            "  arc skills run --name clara-site -- publish --id <post-id>",
            "Cross-post to X — write a thread (3-5 posts) explaining the key insight:",
            "  arc skills run --name social-x-posting -- post --text '...'",
            "",
            "If no draft is ready, write a short 'TIL' post about something discovered this week.",
            "",
            "## 2. File Documentation Issues",
            "Review recent sample apps Clara built. For each one, check whether the corresponding",
            "stx-labs docs are clear, complete, and have a working example.",
            "",
            "For each gap found:",
            "  arc skills run --name github-repos -- open-issue \\",
            "    --repo stx-labs/<repo> \\",
            "    --title 'docs: missing example for <topic>' \\",
            "    --body 'Description of what is missing and a suggestion for fixing it.'",
            "",
            "Aim to file at least 1 substantive docs issue per week.",
            "",
            "Close this task with: # tutorials published, # issues filed, links to each.",
          ].join("\n"),
          skills: JSON.stringify(["clara-site", "github-repos", "social-x-posting"]),
          priority: 4,
          source,
        }, "any");

        state.last_weekly_task = new Date().toISOString();
        tasksCreated++;
        log("queued: weekly task");
      }
    }

    // ── 4. Monthly docs quality sweep ────────────────────────────────────
    if (hoursSince(state.last_monthly_task) >= CADENCE.monthly) {
      const source = `sensor:clara-devrel:monthly:${monthKey()}`;
      if (!pendingTaskExistsForSource(source)) {
        insertTaskIfNew(source, {
          subject: `[DevRel] Monthly docs quality sweep`,
          description: [
            "Full review of stx-labs documentation quality. Rotate through repos each month.",
            "",
            "Repos to sweep (rotate — do 1-2 per month):",
            "- stx-labs/clarinet (README, docs/, CHANGELOG)",
            "- stx-labs/stacks.js (packages/*/README.md)",
            "- stx-labs/clarity-starter (README, contracts, tests)",
            "- stx-labs/stacks.js-starters (each template's README)",
            "",
            "For each doc page reviewed, check:",
            "1. Install instructions — do they actually work?",
            "2. Quickstart — can a new developer follow it in <10 minutes?",
            "3. Full example — is there one? Does it run?",
            "4. Troubleshooting — are common errors documented?",
            "5. Stale content — any references to old APIs, deprecated flags, or wrong versions?",
            "",
            "For each issue found, file a GitHub issue with:",
            "- Exact location (file, line if possible)",
            "- What's missing or wrong",
            "- A concrete suggestion for fixing it",
            "- Label: 'documentation'",
            "",
            "Also update Clara's MEMORY.md with any patterns found:",
            "- 'The stx-labs docs consistently lack X'",
            "- 'Developers are always confused about Y'",
            "",
            "Close this task with: repos reviewed, issues filed, patterns noted.",
          ].join("\n"),
          skills: JSON.stringify(["github-repos", "clara-devrel"]),
          priority: 3,
          source,
        }, "any");

        state.last_monthly_task = new Date().toISOString();
        tasksCreated++;
        log("queued: monthly docs sweep");
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
