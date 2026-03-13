// skills/github-repos/cli.ts
// Clara's GitHub skill — create repos, push code, open issues
// Usage: arc skills run --name github-repos -- <subcommand> [flags]

import { resolve, join } from "path";
import { existsSync } from "fs";
import { getCredential } from "../../src/credentials.ts";

const GH_API = "https://api.github.com";

function log(msg: string) {
  console.error(`[github-repos] ${msg}`);
}

function parseArgs(argv: string[]): { command: string; flags: Record<string, string> } {
  const args = argv.slice(2);
  const command = args[0] || "help";
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

async function getAuth(): Promise<{ token: string; username: string } | null> {
  const token = await getCredential("clara-github", "token");
  const username = await getCredential("clara-github", "username");
  if (!token || !username) {
    console.log(JSON.stringify({ success: false, error: "Missing clara-github credentials. Run: arc creds set --service clara-github --key token --value <token>" }));
    return null;
  }
  return { token, username };
}

async function ghFetch(path: string, token: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${GH_API}${path}`, {
    ...options,
    headers: {
      "Authorization": `token ${token}`,
      "Accept": "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      "User-Agent": "ClaraDevRel-Arc-Agent",
      ...(options.headers || {}),
    },
  });
}

async function runCommand(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string; ok: boolean }> {
  const proc = Bun.spawn(args, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exit = await proc.exited;
  return { stdout: stdout.trim(), stderr: stderr.trim(), ok: exit === 0 };
}

async function createRepo(flags: Record<string, string>) {
  const auth = await getAuth();
  if (!auth) return;

  const name = flags["name"];
  if (!name) { console.log(JSON.stringify({ success: false, error: "Missing --name" })); return; }

  const description = flags["description"] || `${name} — Stacks sample app by Clara`;
  const isPrivate = flags["private"] === "true";

  log(`Creating repo ${auth.username}/${name}...`);
  const res = await ghFetch("/user/repos", auth.token, {
    method: "POST",
    body: JSON.stringify({
      name,
      description,
      private: isPrivate,
      auto_init: false,
      has_issues: true,
      has_projects: false,
      has_wiki: false,
    }),
  });

  const data = await res.json() as Record<string, unknown>;
  if (!res.ok) {
    console.log(JSON.stringify({ success: false, status: res.status, error: data }));
    return;
  }

  console.log(JSON.stringify({
    success: true,
    repo: `${auth.username}/${name}`,
    url: data["html_url"],
    clone_url: data["clone_url"],
    ssh_url: data["ssh_url"],
  }));
}

async function pushRepo(flags: Record<string, string>) {
  const auth = await getAuth();
  if (!auth) return;

  const name = flags["name"];
  const projectFlag = flags["project"];
  const message = flags["message"] || "feat: initial commit by Clara";

  if (!name || !projectFlag) {
    console.log(JSON.stringify({ success: false, error: "Missing --name or --project" }));
    return;
  }

  const projectPath = resolve(projectFlag.replace("~", process.env.HOME || "/root"));
  if (!existsSync(projectPath)) {
    console.log(JSON.stringify({ success: false, error: `Project path not found: ${projectPath}` }));
    return;
  }

  const remoteUrl = `https://${auth.token}@github.com/${auth.username}/${name}.git`;

  // Ensure git is initialized
  if (!existsSync(join(projectPath, ".git"))) {
    await runCommand(["git", "init"], projectPath);
  }

  // Configure git identity for this repo
  await runCommand(["git", "config", "user.email", "clara@claradevrel.dev"], projectPath);
  await runCommand(["git", "config", "user.name", "ClaraDevRel"], projectPath);

  // Stage, commit, set remote, push
  await runCommand(["git", "add", "."], projectPath);
  const commit = await runCommand(["git", "commit", "-m", message], projectPath);
  if (!commit.ok && !commit.stdout.includes("nothing to commit")) {
    console.log(JSON.stringify({ success: false, error: `Commit failed: ${commit.stderr}` }));
    return;
  }

  // Set or update remote
  const remoteCheck = await runCommand(["git", "remote", "get-url", "origin"], projectPath);
  if (remoteCheck.ok) {
    await runCommand(["git", "remote", "set-url", "origin", remoteUrl], projectPath);
  } else {
    await runCommand(["git", "remote", "add", "origin", remoteUrl], projectPath);
  }

  const push = await runCommand(["git", "push", "-u", "origin", "main", "--force"], projectPath);
  if (!push.ok) {
    // Try pushing as master then renaming
    const pushMaster = await runCommand(["git", "push", "-u", "origin", "HEAD:main", "--force"], projectPath);
    if (!pushMaster.ok) {
      console.log(JSON.stringify({ success: false, error: `Push failed: ${push.stderr}` }));
      return;
    }
  }

  console.log(JSON.stringify({
    success: true,
    repo: `${auth.username}/${name}`,
    url: `https://github.com/${auth.username}/${name}`,
    commit: commit.stdout.split("\n")[0],
  }));
}

async function openIssue(flags: Record<string, string>) {
  const auth = await getAuth();
  if (!auth) return;

  const repo = flags["repo"];
  const title = flags["title"];
  const body = flags["body"];
  const labelsStr = flags["labels"];

  if (!repo || !title || !body) {
    console.log(JSON.stringify({ success: false, error: "Missing --repo, --title, or --body" }));
    return;
  }

  const labels = labelsStr ? labelsStr.split(",").map(l => l.trim()) : [];

  log(`Opening issue on ${repo}...`);
  const res = await ghFetch(`/repos/${repo}/issues`, auth.token, {
    method: "POST",
    body: JSON.stringify({ title, body, labels }),
  });

  const data = await res.json() as Record<string, unknown>;
  if (!res.ok) {
    console.log(JSON.stringify({ success: false, status: res.status, error: data }));
    return;
  }

  console.log(JSON.stringify({
    success: true,
    issue: data["number"],
    url: data["html_url"],
    title,
    repo,
  }));
}

async function listRepos(flags: Record<string, string>) {
  const auth = await getAuth();
  if (!auth) return;

  const limit = parseInt(flags["limit"] || "20");
  const res = await ghFetch(`/users/${auth.username}/repos?sort=updated&per_page=${limit}`, auth.token);
  const data = await res.json() as Array<Record<string, unknown>>;

  if (!res.ok) {
    console.log(JSON.stringify({ success: false, error: data }));
    return;
  }

  const repos = data.map(r => ({
    name: r["name"],
    description: r["description"],
    url: r["html_url"],
    updated_at: r["updated_at"],
    stars: r["stargazers_count"],
  }));

  console.log(JSON.stringify({ success: true, count: repos.length, repos }));
}

async function deleteRepo(flags: Record<string, string>) {
  const auth = await getAuth();
  if (!auth) return;

  const name = flags["name"];
  const confirm = flags["confirm"];
  if (!name || confirm !== "true") {
    console.log(JSON.stringify({ success: false, error: "Missing --name or --confirm true" }));
    return;
  }

  const res = await ghFetch(`/repos/${auth.username}/${name}`, auth.token, { method: "DELETE" });
  if (res.status === 204) {
    console.log(JSON.stringify({ success: true, deleted: `${auth.username}/${name}` }));
  } else {
    const data = await res.json() as Record<string, unknown>;
    console.log(JSON.stringify({ success: false, status: res.status, error: data }));
  }
}

async function repoInfo(flags: Record<string, string>) {
  const auth = await getAuth();
  if (!auth) return;

  const name = flags["name"];
  if (!name) { console.log(JSON.stringify({ success: false, error: "Missing --name" })); return; }

  const res = await ghFetch(`/repos/${auth.username}/${name}`, auth.token);
  const data = await res.json() as Record<string, unknown>;

  if (!res.ok) {
    console.log(JSON.stringify({ success: false, status: res.status, error: data }));
    return;
  }

  console.log(JSON.stringify({
    success: true,
    name: data["name"],
    description: data["description"],
    url: data["html_url"],
    stars: data["stargazers_count"],
    forks: data["forks_count"],
    open_issues: data["open_issues_count"],
    default_branch: data["default_branch"],
    created_at: data["created_at"],
    updated_at: data["updated_at"],
  }));
}

function help() {
  console.log(`github-repos — Clara's GitHub skill

Commands:
  create --name <repo> [--description <text>] [--private false]
  push --name <repo> --project <local-path> [--message <commit-msg>]
  open-issue --repo <owner/repo> --title <text> --body <text> [--labels <label1,label2>]
  list [--limit <n>]
  delete --name <repo> --confirm true
  info --name <repo>
`);
}

const { command, flags } = parseArgs(process.argv);

switch (command) {
  case "create": await createRepo(flags); break;
  case "push": await pushRepo(flags); break;
  case "open-issue": await openIssue(flags); break;
  case "list": await listRepos(flags); break;
  case "delete": await deleteRepo(flags); break;
  case "info": await repoInfo(flags); break;
  default: help();
}
