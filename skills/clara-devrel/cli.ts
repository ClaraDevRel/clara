// skills/clara-devrel/cli.ts
// Clara's DevRel status and manual trigger CLI
// Usage: arc skills run --name clara-devrel -- <subcommand> [flags]

import { resolve } from "path";
import { existsSync } from "fs";
import { readHookState, writeHookState } from "../../src/sensors.ts";

function parseArgs(argv: string[]): { command: string; flags: Record<string, string> } {
  const args = argv.slice(2);
  const command = args[0] || "status";
  const flags: Record<string, string> = {};
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith("--") && i + 1 < args.length && !args[i + 1].startsWith("--")) {
      flags[args[i].slice(2)] = args[i + 1];
      i++;
    } else if (args[i].startsWith("--")) {
      flags[args[i].slice(2)] = "true";
    }
  }
  return { command, flags };
}

function hoursSince(iso: string | null): number {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60);
}

function nextIn(iso: string | null, cadenceHours: number): string {
  if (!iso) return "now";
  const nextAt = new Date(new Date(iso).getTime() + cadenceHours * 60 * 60 * 1000);
  const diffMs = nextAt.getTime() - Date.now();
  if (diffMs <= 0) return "now (overdue)";
  const h = Math.floor(diffMs / (1000 * 60 * 60));
  const m = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (h >= 24) return `in ${Math.floor(h / 24)}d ${h % 24}h`;
  return `in ${h}h ${m}m`;
}

async function status() {
  const state = await readHookState("clara-devrel");

  const cadences = [
    { name: "Build sample app", key: "last_build_task", hours: 48 },
    { name: "Weekly publish learnings", key: "last_weekly_task", hours: 168 },
    { name: "Monthly friction review", key: "last_monthly_task", hours: 720 },
  ];

  const schedule = cadences.map(c => ({
    task: c.name,
    last_run: state?.[c.key] as string | null ?? "never",
    next_run: nextIn(state?.[c.key] as string | null ?? null, c.hours),
    overdue: hoursSince(state?.[c.key] as string | null ?? null) >= c.hours,
  }));

  // Also check stacks-learning state
  const learningState = await readHookState("stacks-learning");
  const claraState = await readHookState("clara-site");

  console.log(JSON.stringify({
    success: true,
    clara_devrel: {
      last_sensor_run: state?.["last_ran"] ?? "never",
      schedule,
    },
    stacks_learning: {
      last_run: learningState?.["last_ran"] ?? "never",
      tracked_releases: Object.keys((learningState?.["last_releases"] as Record<string, string>) ?? {}).length,
    },
    clara_site: {
      last_run: claraState?.["last_ran"] ?? "never",
    },
  }, null, 2));
}

async function resetCadence(flags: Record<string, string>) {
  const type = flags["type"];
  const validTypes = ["build", "weekly", "monthly"];
  if (!type || !validTypes.includes(type)) {
    console.log(JSON.stringify({ success: false, error: `--type must be one of: ${validTypes.join(", ")}` }));
    return;
  }

  const keyMap: Record<string, string> = {
    build: "last_build_task",
    weekly: "last_weekly_task",
    monthly: "last_monthly_task",
  };

  const state = await readHookState("clara-devrel") ?? {
    last_ran: new Date().toISOString(),
    last_result: "ok" as const,
    version: 1,
    last_community_check: null,
    last_build_task: null,
    last_weekly_task: null,
    last_monthly_task: null,
  };

  const key = keyMap[type];
  state[key] = null;
  await writeHookState("clara-devrel", state);

  console.log(JSON.stringify({ success: true, reset: type, note: "Next sensor run will queue this task type" }));
}

function help() {
  console.log(`clara-devrel — DevRel loop management

Commands:
  status                    Show cadence schedule and next run times
  reset-cadence --type <t>  Force a task type to fire on next sensor run
                            Types: daily, build, weekly, monthly
`);
}

const { command, flags } = parseArgs(process.argv);
switch (command) {
  case "status": await status(); break;
  case "reset-cadence": await resetCadence(flags); break;
  default: help();
}
