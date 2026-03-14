// skills/stacks-learning/sensor.ts
// Watches stx-labs repos for new releases and queues exploration tasks.
// Release monitoring only — Clara generates her own friction signal by building,
// rather than scanning community issues.

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
const log = createSensorLogger(SENSOR_NAME);

const RELEASE_REPOS = [
  "stx-labs/clarinet",
  "stx-labs/stacks.js",
  "stx-labs/connect",
  "stx-labs/vitest-environment-clarinet",
] as const;

interface GitHubRelease {
  tag_name: string;
  name: string;
  published_at: string;
  html_url: string;
  body: string;
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

export default async function stacksLearningSensor(): Promise<string> {
  try {
    const claimed = await claimSensorRun(SENSOR_NAME, INTERVAL_MINUTES);
    if (!claimed) return "skip";

    const raw = await readHookState(SENSOR_NAME);
    const state = {
      last_ran: new Date().toISOString(),
      last_result: "ok" as const,
      version: 1,
      last_releases: {} as Record<string, string>,
      ...(raw ?? {}),
    };

    const lastReleases = (state["last_releases"] as Record<string, string>) ?? {};
    let tasksCreated = 0;

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
        subject: `[stacks-learning] Explore ${repoShort} ${release.tag_name}`,
        description: [
          `New release: ${repo} ${release.tag_name}`,
          `URL: ${release.html_url}`,
          `Published: ${release.published_at}`,
          "",
          "## Instructions",
          "",
          `1. Read the release notes: ${release.html_url}`,
          "2. Identify the most interesting change for Stacks developers",
          "3. Build a sample app that exercises the new feature:",
          "   arc skills run --name stacks-dev -- scaffold --name <app-name>",
          "4. Document any friction you hit during the build",
          "5. File issues on stacks-network/docs for anything that was unclear:",
          "   arc skills run --name github-repos -- open-issue --repo stacks-network/docs --title 'docs: ...' --body '...'",
          "6. Push the sample app to GitHub:",
          "   arc skills run --name github-repos -- create --name <app-name>",
          "   arc skills run --name github-repos -- push --name <app-name> --project ~/clara-projects/<app-name>",
          "7. Queue a tutorial:",
          "   arc tasks add --subject '[DevRel] Write tutorial: <app-name>' --priority 4 --skills clara-site,social-x-posting",
        ].join("\n"),
        skills: JSON.stringify(["stacks-dev", "github-repos", "clara-site", "social-x-posting"]),
        priority: 3,
        source,
      }, "any");

      lastReleases[repo] = release.tag_name;
      tasksCreated++;
      log(`new release: ${repo} ${release.tag_name}`);
    }

    state["last_releases"] = lastReleases;
    state["last_ran"] = new Date().toISOString();
    state["last_result"] = "ok";
    await writeHookState(SENSOR_NAME, state);

    if (tasksCreated > 0) log(`created ${tasksCreated} task(s)`);
    return "ok";
  } catch (e) {
    const error = e as Error;
    log(`error: ${error.message}`);
    return "error";
  }
}
