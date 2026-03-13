// skills/stacks-dev/cli.ts
// Clara's Stacks developer workbench CLI
// Usage: arc skills run --name stacks-dev -- <subcommand> [flags]

import { resolve, join } from "path";
import { existsSync, mkdirSync } from "fs";

const PROJECTS_DIR = resolve(process.env.HOME || "/root", "clara-projects");
const STACKS_API = "https://api.testnet.hiro.so"; // testnet node for faucet

function log(msg: string) {
  console.error(`[stacks-dev] ${msg}`);
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

async function runCommand(cmd: string, cwd?: string): Promise<{ stdout: string; stderr: string; ok: boolean }> {
  const proc = Bun.spawn(cmd.split(" "), {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exit = await proc.exited;
  return { stdout: stdout.trim(), stderr: stderr.trim(), ok: exit === 0 };
}

async function scaffold(flags: Record<string, string>) {
  const name = flags["name"];
  if (!name) {
    console.log(JSON.stringify({ success: false, error: "Missing --name" }));
    return;
  }
  const template = flags["template"] || "clarity";
  const description = flags["description"] || `${name} — a Stacks sample app by Clara`;
  const projectPath = join(PROJECTS_DIR, name);

  if (existsSync(projectPath)) {
    console.log(JSON.stringify({ success: false, error: `Project already exists: ${projectPath}` }));
    return;
  }

  mkdirSync(PROJECTS_DIR, { recursive: true });

  log(`Scaffolding '${name}' with template '${template}'...`);

  const templateMap: Record<string, { repo: string; subdir?: string }> = {
    "clarity": { repo: "stx-labs/clarity-starter" },
    "nextjs": { repo: "stx-labs/stacks.js-starters", subdir: "templates/template-react-nextjs-ts" },
    "react-vite": { repo: "stx-labs/stacks.js-starters", subdir: "templates/template-react-vite-ts" },
    "sveltekit": { repo: "stx-labs/stacks.js-starters", subdir: "templates/template-sveltekit-ts" },
  };

  const tmpl = templateMap[template];
  if (!tmpl) {
    console.log(JSON.stringify({ success: false, error: `Unknown template '${template}'. Options: clarity, nextjs, react-vite, sveltekit` }));
    return;
  }

  // Clone the template repo
  const tmpDir = `/tmp/stacks-dev-scaffold-${Date.now()}`;
  const clone = await runCommand(`git clone --depth 1 https://github.com/${tmpl.repo}.git ${tmpDir}`);
  if (!clone.ok) {
    console.log(JSON.stringify({ success: false, error: `Failed to clone template: ${clone.stderr}` }));
    return;
  }

  const sourceDir = tmpl.subdir ? join(tmpDir, tmpl.subdir) : tmpDir;

  // Copy to projects dir
  const cp = await runCommand(`cp -r ${sourceDir} ${projectPath}`);
  if (!cp.ok) {
    console.log(JSON.stringify({ success: false, error: `Failed to copy template: ${cp.stderr}` }));
    return;
  }

  // Remove the cloned .git so it's a fresh repo
  await runCommand(`rm -rf ${projectPath}/.git`);
  await runCommand(`rm -rf ${tmpDir}`);

  // Init fresh git repo
  await runCommand(`git init`, projectPath);
  await runCommand(`git add .`, projectPath);

  // Write README stub
  const readme = `# ${name}

${description}

Built with [Clarinet](https://github.com/stx-labs/clarinet) and [Stacks.js](https://github.com/stx-labs/stacks.js).

## Getting Started

\`\`\`bash
clarinet check
clarinet test
\`\`\`

## Deploy to Testnet

\`\`\`bash
arc skills run --name stacks-dev -- deploy --project ~/clara-projects/${name} --contract ${name} --network testnet
\`\`\`
`;
  await Bun.write(join(projectPath, "README.md"), readme);

  console.log(JSON.stringify({
    success: true,
    project: name,
    path: projectPath,
    template,
    next_steps: [
      `cd ${projectPath}`,
      `clarinet check`,
      `clarinet test`,
      `arc skills run --name github-repos -- create --name ${name}`,
    ]
  }));
}

async function check(flags: Record<string, string>) {
  const project = flags["project"];
  if (!project) { console.log(JSON.stringify({ success: false, error: "Missing --project" })); return; }
  const projectPath = resolve(project.replace("~", process.env.HOME || "/root"));
  if (!existsSync(projectPath)) { console.log(JSON.stringify({ success: false, error: `Project not found: ${projectPath}` })); return; }

  log(`Running clarinet check in ${projectPath}...`);
  const result = await runCommand("clarinet check", projectPath);
  console.log(JSON.stringify({ success: result.ok, stdout: result.stdout, stderr: result.stderr }));
}

async function test(flags: Record<string, string>) {
  const project = flags["project"];
  if (!project) { console.log(JSON.stringify({ success: false, error: "Missing --project" })); return; }
  const projectPath = resolve(project.replace("~", process.env.HOME || "/root"));
  if (!existsSync(projectPath)) { console.log(JSON.stringify({ success: false, error: `Project not found: ${projectPath}` })); return; }

  log(`Running clarinet test in ${projectPath}...`);
  const result = await runCommand("clarinet test", projectPath);
  console.log(JSON.stringify({ success: result.ok, stdout: result.stdout, stderr: result.stderr }));
}

async function deploy(flags: Record<string, string>) {
  const project = flags["project"];
  const contract = flags["contract"];
  const network = flags["network"] || "testnet";
  if (!project || !contract) {
    console.log(JSON.stringify({ success: false, error: "Missing --project or --contract" }));
    return;
  }
  const projectPath = resolve(project.replace("~", process.env.HOME || "/root"));
  if (!existsSync(projectPath)) { console.log(JSON.stringify({ success: false, error: `Project not found: ${projectPath}` })); return; }

  log(`Deploying contract '${contract}' to ${network}...`);
  const cmd = `clarinet deployments apply --manifest deployments/default.${network}-plan.yaml`;
  const result = await runCommand(cmd, projectPath);
  console.log(JSON.stringify({ success: result.ok, network, contract, stdout: result.stdout, stderr: result.stderr }));
}

async function faucet(flags: Record<string, string>) {
  const address = flags["address"];
  if (!address) { console.log(JSON.stringify({ success: false, error: "Missing --address" })); return; }

  log(`Requesting testnet STX for ${address}...`);
  const res = await fetch(`${STACKS_API}/extended/v1/faucets/stx?address=${address}&stacking=false`, {
    method: "POST",
  });
  const data = await res.json() as Record<string, unknown>;
  console.log(JSON.stringify({ success: res.ok, status: res.status, ...data }));
}

async function listProjects() {
  if (!existsSync(PROJECTS_DIR)) {
    console.log(JSON.stringify({ success: true, projects: [] }));
    return;
  }
  const entries = await Bun.file(PROJECTS_DIR).exists()
    ? (await import("fs")).readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
    : [];
  console.log(JSON.stringify({ success: true, projects_dir: PROJECTS_DIR, projects: entries }));
}

async function newContract(flags: Record<string, string>) {
  const project = flags["project"];
  const name = flags["name"];
  if (!project || !name) { console.log(JSON.stringify({ success: false, error: "Missing --project or --name" })); return; }
  const projectPath = resolve(project.replace("~", process.env.HOME || "/root"));
  const contractPath = join(projectPath, "contracts", `${name}.clar`);

  const stub = `;; ${name}.clar
;; Clara DevRel — sample contract

(define-read-only (get-info)
  (ok { name: "${name}", author: "Clara" })
)
`;
  await Bun.write(contractPath, stub);
  console.log(JSON.stringify({ success: true, contract: contractPath }));
}

async function info(flags: Record<string, string>) {
  const project = flags["project"];
  if (!project) { console.log(JSON.stringify({ success: false, error: "Missing --project" })); return; }
  const projectPath = resolve(project.replace("~", process.env.HOME || "/root"));
  const tomlPath = join(projectPath, "Clarinet.toml");
  if (!existsSync(tomlPath)) { console.log(JSON.stringify({ success: false, error: `No Clarinet.toml found in ${projectPath}` })); return; }
  const toml = await Bun.file(tomlPath).text();
  console.log(JSON.stringify({ success: true, path: projectPath, clarinet_toml: toml }));
}

function help() {
  console.log(`stacks-dev — Clara's Stacks developer workbench

Commands:
  scaffold --name <name> [--template clarity|nextjs|react-vite|sveltekit] [--description <text>]
  check --project <path>
  test --project <path>
  deploy --project <path> --contract <name> --network testnet|mainnet
  faucet --address <stx-address>
  new-contract --project <path> --name <contract-name>
  list-projects
  info --project <path>
`);
}

const { command, flags } = parseArgs(process.argv);

switch (command) {
  case "scaffold": await scaffold(flags); break;
  case "check": await check(flags); break;
  case "test": await test(flags); break;
  case "deploy": await deploy(flags); break;
  case "faucet": await faucet(flags); break;
  case "new-contract": await newContract(flags); break;
  case "list-projects": await listProjects(); break;
  case "info": await info(flags); break;
  default: help();
}
