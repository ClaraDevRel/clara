// skills/stacks-learning/sensor.ts
// Clara's autonomous learning loop.
// Watches stx-labs repos for new releases, detects open doc issues,
// and queues build/tutorial tasks when Clara hasn't shipped in a while.

import {
  claimSensorRun,
  createSensorLogger,
  insertTaskIfNew,
  readHookState,
  writeHookState,
} from "../../src/sensors.ts";
import { taskExistsForSource } from "../../src/db.ts";

const SENSOR_NAME = "stacks-learning";
const INTERVAL_MINUTES = 60;
const BUILD_CADENCE_DAYS = 3;
const log = createSensorLogger(SENSOR_NAME);

// stx-labs repos to watch for releases
const RELEASE_REPOS = [
  "stx-labs/clarinet",
  "stx-labs/stacks.js",
  "stx-labs/vitest-environment-clarinet",
] as const;

// stx-labs repos to watch for open issues
const ISSUE_REPOS = [
  "stx-labs/clarinet",
  "stx-labs/stacks.js",
  "stx-labs/clarity-starter",
  "stx-labs/stacks.js-starters",
] as const;

interface GitHubRelease {
  tag_name: string;
  name: string;
  published_at: string;
  html_url: string;
}

interface GitHubIssue {
  number: number;
  title: string;
  html_url: string;
  user: { login: string };
  created_at: string;
}

function gh(args: string[]): { ok: boolean; stdout: string } {
  const result = Bun.spawnSync(["gh", ...args], { timeout: 15_000 });
  return {
    ok: result.exitCode === 0,
    stdout: result.stdout.toString().trim(),
  };
}

function getLatestRelease(repo: string): GitHubRelease | null {
  const result = gh(["api", `/repos/${repo}/releases/latest`]);
  if (!result.ok || !result.stdout) return null;
  try {
    return JSON.parse(result.stdout) as GitHubRelease;
  } catch {
    return null;
  }
}

function getRecentIssues(repo: string): GitHubIssue[] {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const result = gh([
    "api", `/repos/${repo}/issues`,
    "--method", "GET",
    "-f", "state=open",
    "-f", "per_page=10",
    "-f", "sort=created",
    "-f", `since=${since}`,
  ]);
  if (!result.ok || !result.stdout) return [];
  try {
    const all = JSON.parse(result.stdout) as Array<GitHubIssue & { pull_request?: unknown }>;
    return all.filter(i => !i.pull_request);
  } catch {
    return [];
  }
}

export default async function stacksLearningSensor(): Promise<string> {
  try {
    const claimed = await claimSensorRun(SENSOR_NAME, INTERVAL_MINUTES);
    if (!claimed) return "skip";

    const state = await readHookState(SENSOR_NAME) ?? {
      last_ran: new Date().toISOString(),
      last_result: "ok" as const,
      version: 1,
      last_releases: {} as Record<string, string>,
      last_build_task_at: null as string | null,
      seen_issues: [] as string[],
    };

    const lastReleases = (state["last_releases"] as Record<string, string>) ?? {};
    const seenIssues = (state["seen_issues"] as string[]) ?? [];
    let tasksCreated = 0;

    // ── 1. Check for new releases ──────────────────────────────────────────
    for (const repo of RELEASE_REPOS) {
      const release = getLatestRelease(repo);
      if (!release) continue;

      const knownVersion = lastReleases[repo];
      if (release.tag_name === knownVersion) continue;

      const source = `sensor:stacks-learning:release:${repo}@${release.tag_name}`;
      if (taskExistsForSource(source)) {
        lastReleases[repo] = release.tag_name;
        continue;
      }

      const repoShort = repo.split("/")[1];
      insertTaskIfNew(source, {
        subject: `[stacks-learning] Explore ${repoShort} ${release.tag_name} — build sample app`,
        description: [
          `New release detected: ${repo} ${release.tag_name}`,
          `Release URL: ${release.html_url}`,
          `Published: ${release.published_at}`,
          "",
          "Instructions:",
          `1. Read the release notes at ${release.html_url}`,
          "2. Identify the most interesting new feature or change for developers",
          "3. Build a sample app demonstrating it: arc skills run --name stacks-dev -- scaffold --name <app-name>",
          "4. Push to GitHub: arc skills run --name github-repos -- create + push",
          "5. Write a tutorial post: arc skills run --name clara-site -- create",
          "6. Post to X: arc skills run --name social-x-posting -- post --text '...'",
        ].join("\n"),
        skills: JSON.stringify(["stacks-dev", "github-repos", "clara-site", "social-x-posting"]),
        priority: 3,
        source,
      }, "any");

      lastReleases[repo] = release.tag_name;
      tasksCreated++;
      log(`new release task: ${repo} ${release.tag_name}`);
    }

    // ── 2. Check for open documentation issues ────────────────────────────
    for (const repo of ISSUE_REPOS) {
      const issues = getRecentIssues(repo);
      for (const issue of issues) {
        const issueKey = `${repo}#${issue.number}`;
        if (seenIssues.includes(issueKey)) continue;

        const source = `sensor:stacks-learning:issue:${issueKey}`;
        if (taskExistsForSource(source)) {
          seenIssues.push(issueKey);
          continue;
        }

        insertTaskIfNew(source, {
          subject: `[stacks-learning] Address docs issue: ${issue.title}`,
          description: [
            `Open issue in ${repo} by ${issue.user.login}`,
            `URL: ${issue.html_url}`,
            `Created: ${issue.created_at}`,
            "",
            "Instructions:",
            `1. Read the issue: gh issue view --repo ${repo} ${issue.number}`,
            "2. If it's a docs gap: write the missing content and open a PR or comment with a solution",
            "3. If it's a bug: reproduce it, create a sample app showing the fix via stacks-dev",
            "4. Close with a comment linking to your fix or sample app",
          ].join("\n"),
          skills: JSON.stringify(["github-repos", "stacks-dev"]),
          priority: 4,
          source,
        }, "any");

        seenIssues.push(issueKey);
        tasksCreated++;
        log(`doc issue task: ${issueKey}`);
      }
    }

    // ── 3. Build cadence — if no new sample app in BUILD_CADENCE_DAYS days ─
    const lastBuildAt = state["last_build_task_at"] as string | null;
    const daysSinceLastBuild = lastBuildAt
      ? (Date.now() - new Date(lastBuildAt).getTime()) / (1000 * 60 * 60 * 24)
      : BUILD_CADENCE_DAYS + 1;

    if (daysSinceLastBuild >= BUILD_CADENCE_DAYS) {
      const cadenceSource = `sensor:stacks-learning:cadence:${new Date().toISOString().slice(0, 10)}`;
      if (!taskExistsForSource(cadenceSource)) {
        insertTaskIfNew(cadenceSource, {
          subject: `[stacks-learning] Build something new on Stacks`,
          description: [
            "It's been a few days since Clara shipped a new sample app. Time to build something.",
            "",
            "Instructions:",
            "1. Check what's been built recently: arc skills run --name stacks-dev -- list-projects",
            "2. Check recent stx-labs activity for inspiration: gh api repos/stx-labs/clarinet/commits --jq '.[0:5][].commit.message'",
            "3. Pick something interesting and unexplored — a DeFi interaction, a new Clarity pattern, a real-world use case",
            "4. Scaffold: arc skills run --name stacks-dev -- scaffold --name <app-name>",
            "5. Build, test, push to GitHub, write tutorial, post to X",
          ].join("\n"),
          skills: JSON.stringify(["stacks-dev", "github-repos", "clara-site", "social-x-posting"]),
          priority: 5,
          source: cadenceSource,
        }, "any");

        state["last_build_task_at"] = new Date().toISOString();
        tasksCreated++;
        log("cadence: queued build task");
      }
    }

    // Trim seen_issues to last 200 to avoid unbounded growth
    state["seen_issues"] = seenIssues.slice(-200);
    state["last_releases"] = lastReleases;
    state["last_ran"] = new Date().toISOString();
    state["last_result"] = "ok";
    await writeHookState(SENSOR_NAME, state);

    log(`done — ${tasksCreated} task(s) created`);
    return "ok";
  } catch (e) {
    const error = e as Error;
    log(`error: ${error.message}`);
    return "error";
  }
}
