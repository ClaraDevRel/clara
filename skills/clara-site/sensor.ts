// skills/clara-site/sensor.ts
// Detects stale drafts and post cadence gaps; queues publish/generation tasks.

import { claimSensorRun, createSensorLogger, insertTaskIfNew } from "../../src/sensors.ts";
import { pendingTaskExistsForSource } from "../../src/db.ts";
import { existsSync } from "fs";
import { resolve } from "path";

const SENSOR_NAME = "clara-site";
const INTERVAL_MINUTES = 60;
const STALE_DRAFT_DAYS = 1;
const POST_CADENCE_DAYS = 5;
const log = createSensorLogger(SENSOR_NAME);

const POSTS_STATE = resolve(process.cwd(), "db/hook-state/clara-site-posts.json");

interface Post {
  id: string;
  title: string;
  status: "draft" | "published" | "scheduled";
  created_at: string;
  published_at: string | null;
}

export default async function claraSiteSensor(): Promise<string> {
  try {
    const claimed = await claimSensorRun(SENSOR_NAME, INTERVAL_MINUTES);
    if (!claimed) return "skip";

    let posts: Post[] = [];
    if (existsSync(POSTS_STATE)) {
      try { posts = await Bun.file(POSTS_STATE).json() as Post[]; } catch { /* ignore */ }
    }

    let tasksCreated = 0;
    const now = Date.now();

    // ── 1. Stale drafts ──────────────────────────────────────────────────
    const staleDrafts = posts.filter(p => {
      if (p.status !== "draft") return false;
      const age = (now - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24);
      return age >= STALE_DRAFT_DAYS;
    });

    for (const draft of staleDrafts) {
      const source = `sensor:clara-site:stale-draft:${draft.id}`;
      if (pendingTaskExistsForSource(source)) continue;

      insertTaskIfNew(source, {
        subject: `[clara-site] Review and publish draft: ${draft.title}`,
        description: [
          `Draft tutorial "${draft.title}" has been sitting unpublished.`,
          `Post ID: ${draft.id}`,
          "",
          "Instructions:",
          `1. Review: arc skills run --name clara-site -- show --id ${draft.id}`,
          "2. If ready: arc skills run --name clara-site -- publish --id " + draft.id,
          "3. Cross-post to X with a short summary thread",
        ].join("\n"),
        skills: JSON.stringify(["clara-site", "social-x-posting"]),
        priority: 6,
        source,
      }, "any");

      tasksCreated++;
      log(`stale draft task: ${draft.id}`);
    }

    // ── 2. Post cadence ───────────────────────────────────────────────────
    const published = posts.filter(p => p.status === "published");
    const lastPublishedAt = published.length > 0
      ? Math.max(...published.map(p => new Date(p.published_at!).getTime()))
      : 0;
    const daysSinceLast = lastPublishedAt
      ? (now - lastPublishedAt) / (1000 * 60 * 60 * 24)
      : POST_CADENCE_DAYS + 1;

    if (daysSinceLast >= POST_CADENCE_DAYS) {
      const source = `sensor:clara-site:cadence:${new Date().toISOString().slice(0, 10)}`;
      if (!pendingTaskExistsForSource(source)) {
        insertTaskIfNew(source, {
          subject: `[clara-site] Time to write a new tutorial`,
          description: [
            `It's been ${Math.floor(daysSinceLast)} day(s) since the last published tutorial.`,
            "",
            "Instructions:",
            "1. Check what's been built recently: arc skills run --name stacks-dev -- list-projects",
            "2. Pick the most recent sample app that doesn't have a tutorial yet",
            "3. Create a tutorial: arc skills run --name clara-site -- create --title '...'",
            "4. Write it up, publish, cross-post to X",
          ].join("\n"),
          skills: JSON.stringify(["clara-site", "stacks-dev", "social-x-posting"]),
          priority: 5,
          source,
        }, "any");

        tasksCreated++;
        log("cadence: queued tutorial task");
      }
    }

    if (tasksCreated > 0) log(`created ${tasksCreated} task(s)`);
    return "ok";
  } catch (e) {
    const error = e as Error;
    log(`error: ${error.message}`);
    return "error";
  }
}
