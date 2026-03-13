// skills/clara-site/cli.ts
// Clara's tutorial site — create drafts, publish, deploy to Netlify
// Usage: arc skills run --name clara-site -- <subcommand> [flags]

import { resolve, join, dirname } from "path";
import { existsSync, mkdirSync, readdirSync } from "fs";
import { getCredential } from "../../src/credentials.ts";

const SITE_REPO_DIR = resolve(process.env.HOME || "/root", "clara-site-content");
const CONTENT_DIR = join(SITE_REPO_DIR, "content");
const POSTS_STATE = resolve(process.cwd(), "db/hook-state/clara-site-posts.json");
const SITE_STATE = resolve(process.cwd(), "db/hook-state/clara-site.json");
const GITHUB_USERNAME = "ClaraDevRel";
const GITHUB_REPO = "clara-site";
const NETLIFY_API = "https://api.netlify.com/api/v1";

function log(msg: string) { console.error(`[clara-site] ${msg}`); }

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

interface Post {
  id: string;
  title: string;
  path: string;
  status: "draft" | "published" | "scheduled";
  created_at: string;
  published_at: string | null;
  difficulty: string;
  tags: string[];
  sample_repo: string | null;
}

async function loadPosts(): Promise<Post[]> {
  try {
    if (!existsSync(POSTS_STATE)) return [];
    return await Bun.file(POSTS_STATE).json() as Post[];
  } catch { return []; }
}

async function savePosts(posts: Post[]): Promise<void> {
  mkdirSync(dirname(POSTS_STATE), { recursive: true });
  await Bun.write(POSTS_STATE, JSON.stringify(posts, null, 2));
}

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function createPost(flags: Record<string, string>) {
  const title = flags["title"];
  if (!title) { console.log(JSON.stringify({ success: false, error: "Missing --title" })); return; }

  const difficulty = flags["difficulty"] || "beginner";
  const tags = flags["tags"] ? flags["tags"].split(",").map(t => t.trim()) : ["stacks", "clarity"];
  const sampleRepo = flags["sample-repo"] || null;

  const now = new Date().toISOString();
  const dateSlug = now.slice(0, 10);
  const slug = slugify(title);
  const id = `${dateSlug}-${slug}`;
  const year = dateSlug.slice(0, 4);
  const postDir = join(CONTENT_DIR, year, dateSlug, slug);
  const postPath = join(postDir, "index.md");

  mkdirSync(postDir, { recursive: true });

  const frontmatter = [
    "---",
    `title: "${title}"`,
    `date: ${now}`,
    `updated: ${now}`,
    `draft: true`,
    `difficulty: ${difficulty}`,
    `stacks_version: "3.x"`,
    `prerequisites:`,
    `  - clarinet installed`,
    `tags:`,
    ...tags.map(t => `  - ${t}`),
    sampleRepo ? `sample_repo: ${sampleRepo}` : "",
    "---",
    "",
    `# ${title}`,
    "",
    "## Introduction",
    "",
    "<!-- Explain what this tutorial covers and why it matters -->",
    "",
    "## Prerequisites",
    "",
    "- Clarinet installed (`stx-labs/clarinet`)",
    "- Basic familiarity with Clarity syntax",
    "",
    "## Getting Started",
    "",
    "<!-- Step-by-step tutorial content -->",
    "",
    "## Conclusion",
    "",
    "<!-- Summarize what was built and what to explore next -->",
    "",
  ].filter(l => l !== null).join("\n");

  await Bun.write(postPath, frontmatter);

  const posts = await loadPosts();
  posts.push({
    id, title, path: postPath.replace(SITE_REPO_DIR + "/", ""),
    status: "draft", created_at: now, published_at: null,
    difficulty, tags, sample_repo: sampleRepo,
  });
  await savePosts(posts);

  console.log(JSON.stringify({ success: true, id, path: postPath, status: "draft" }));
}

async function listPosts(flags: Record<string, string>) {
  const posts = await loadPosts();
  const statusFilter = flags["status"];
  const filtered = statusFilter ? posts.filter(p => p.status === statusFilter) : posts;
  console.log(JSON.stringify({ success: true, count: filtered.length, posts: filtered.map(p => ({ id: p.id, title: p.title, status: p.status, difficulty: p.difficulty, published_at: p.published_at })) }));
}

async function showPost(flags: Record<string, string>) {
  const id = flags["id"];
  if (!id) { console.log(JSON.stringify({ success: false, error: "Missing --id" })); return; }
  const posts = await loadPosts();
  const post = posts.find(p => p.id === id);
  if (!post) { console.log(JSON.stringify({ success: false, error: `Post not found: ${id}` })); return; }
  const fullPath = join(SITE_REPO_DIR, post.path);
  const content = existsSync(fullPath) ? await Bun.file(fullPath).text() : "(file not found)";
  console.log(JSON.stringify({ success: true, post, content }));
}

async function publishPost(flags: Record<string, string>) {
  const id = flags["id"];
  if (!id) { console.log(JSON.stringify({ success: false, error: "Missing --id" })); return; }

  const posts = await loadPosts();
  const post = posts.find(p => p.id === id);
  if (!post) { console.log(JSON.stringify({ success: false, error: `Post not found: ${id}` })); return; }

  const fullPath = join(SITE_REPO_DIR, post.path);
  if (!existsSync(fullPath)) { console.log(JSON.stringify({ success: false, error: `File not found: ${fullPath}` })); return; }

  // Update draft: true → false in the file
  let content = await Bun.file(fullPath).text();
  content = content.replace(/^draft: true$/m, "draft: false");
  const now = new Date().toISOString();
  content = content.replace(/^updated: .+$/m, `updated: ${now}`);
  await Bun.write(fullPath, content);

  post.status = "published";
  post.published_at = now;
  await savePosts(posts);

  // Push to GitHub
  const token = await getCredential("clara-github", "token");
  if (token) {
    const proc = Bun.spawnSync(["git", "add", "."], { cwd: SITE_REPO_DIR });
    Bun.spawnSync(["git", "commit", "-m", `feat: publish ${post.title}`], { cwd: SITE_REPO_DIR });
    const remoteUrl = `https://${token}@github.com/${GITHUB_USERNAME}/${GITHUB_REPO}.git`;
    Bun.spawnSync(["git", "remote", "set-url", "origin", remoteUrl], { cwd: SITE_REPO_DIR });
    Bun.spawnSync(["git", "push", "origin", "main"], { cwd: SITE_REPO_DIR });
  }

  console.log(JSON.stringify({
    success: true, id, status: "published", published_at: now,
    note: "Netlify will auto-deploy on GitHub push"
  }));
}

async function deploySite() {
  const token = await getCredential("clara-netlify", "token");
  if (!token) { console.log(JSON.stringify({ success: false, error: "Missing clara-netlify/token credential" })); return; }

  // Check if site already exists
  let siteState: Record<string, unknown> = {};
  try {
    if (existsSync(SITE_STATE)) siteState = await Bun.file(SITE_STATE).json() as Record<string, unknown>;
  } catch { /* ignore */ }

  if (!siteState["site_id"]) {
    // Create Netlify site connected to GitHub repo
    log("Creating Netlify site...");
    const res = await fetch(`${NETLIFY_API}/sites`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "clara-devrel",
        repo: {
          provider: "github",
          repo: `${GITHUB_USERNAME}/${GITHUB_REPO}`,
          branch: "main",
          cmd: "echo 'no build command'",
          dir: "content",
        },
      }),
    });
    const data = await res.json() as Record<string, unknown>;
    if (!res.ok) { console.log(JSON.stringify({ success: false, error: data })); return; }

    siteState["site_id"] = data["id"];
    siteState["site_url"] = data["ssl_url"] || data["url"];
    mkdirSync(dirname(SITE_STATE), { recursive: true });
    await Bun.write(SITE_STATE, JSON.stringify(siteState, null, 2));
    log(`Site created: ${siteState["site_url"]}`);
  }

  // Trigger a manual deploy
  const siteId = siteState["site_id"] as string;
  const deployRes = await fetch(`${NETLIFY_API}/sites/${siteId}/deploys`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const deployData = await deployRes.json() as Record<string, unknown>;

  console.log(JSON.stringify({
    success: deployRes.ok,
    site_url: siteState["site_url"],
    deploy_id: deployData["id"],
    deploy_state: deployData["state"],
  }));
}

async function siteStatus() {
  const token = await getCredential("clara-netlify", "token");
  if (!token) { console.log(JSON.stringify({ success: false, error: "Missing clara-netlify/token" })); return; }

  let siteState: Record<string, unknown> = {};
  try {
    if (existsSync(SITE_STATE)) siteState = await Bun.file(SITE_STATE).json() as Record<string, unknown>;
  } catch { /* ignore */ }

  const posts = await loadPosts();
  const published = posts.filter(p => p.status === "published").length;
  const drafts = posts.filter(p => p.status === "draft").length;

  console.log(JSON.stringify({
    success: true,
    site_url: siteState["site_url"] || "not deployed yet",
    site_id: siteState["site_id"] || null,
    posts: { total: posts.length, published, drafts },
  }));
}

function help() {
  console.log(`clara-site — Clara's tutorial site

Commands:
  create --title "Title" [--difficulty beginner|intermediate|advanced] [--tags tag1,tag2] [--sample-repo <url>]
  list [--status draft|published]
  show --id <post-id>
  publish --id <post-id>
  deploy
  status
`);
}

const { command, flags } = parseArgs(process.argv);
switch (command) {
  case "create": await createPost(flags); break;
  case "list": await listPosts(flags); break;
  case "show": await showPost(flags); break;
  case "publish": await publishPost(flags); break;
  case "deploy": await deploySite(); break;
  case "status": await siteStatus(); break;
  default: help();
}
