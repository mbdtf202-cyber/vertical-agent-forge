import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import JSON5 from "json5";

const PRODUCT_ID = "vertical-agent-forge";
const DEFAULT_WORKSPACE_SLUG = "vertical-agent-forge";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const kitDir = path.join(repoRoot, "kit");
const kitWorkspaceDir = path.join(kitDir, "workspace");
const kitConfigPath = path.join(kitDir, "openclaw.partial.json5");

function resolveStateDir(env = process.env) {
  return env.OPENCLAW_STATE_DIR?.trim() || path.join(os.homedir(), ".openclaw");
}

function resolveConfigPath(env = process.env) {
  return env.OPENCLAW_CONFIG_PATH?.trim() || path.join(resolveStateDir(env), "openclaw.json");
}

function resolveInstallPaths(env = process.env, workspaceSlug = DEFAULT_WORKSPACE_SLUG) {
  const stateDir = resolveStateDir(env);
  return {
    stateDir,
    configPath: resolveConfigPath(env),
    toolkitDir: path.join(stateDir, "toolkits", PRODUCT_ID),
    workspaceDir: path.join(stateDir, "workspaces", workspaceSlug),
  };
}

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function readJson5File(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  return JSON5.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function copyDirectory(src, dest) {
  ensureDir(dest);
  fs.cpSync(src, dest, {
    recursive: true,
    dereference: false,
    errorOnExist: false,
    force: false,
  });
}

function backupFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const backupPath = `${filePath}.bak.${Date.now()}`;
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

function upsertAgentList(existing = [], incoming = []) {
  const byId = new Map(existing.map((entry) => [entry.id, entry]));
  for (const entry of incoming) {
    const current = byId.get(entry.id) ?? {};
    byId.set(entry.id, { ...current, ...entry });
  }
  return [...byId.values()];
}

function mergeConfig(existing, incoming, workspaceDir) {
  const next = { ...existing };
  next.session = {
    ...(existing.session ?? {}),
    ...(incoming.session ?? {}),
  };

  next.tools = {
    ...(existing.tools ?? {}),
    ...(incoming.tools ?? {}),
    web: {
      ...(existing.tools?.web ?? {}),
      ...(incoming.tools?.web ?? {}),
    },
    sessions: {
      ...(existing.tools?.sessions ?? {}),
      ...(incoming.tools?.sessions ?? {}),
    },
    subagents: {
      ...(existing.tools?.subagents ?? {}),
      ...(incoming.tools?.subagents ?? {}),
    },
  };

  const existingDefaultModel = existing.agents?.defaults?.model;
  const existingSubagentModel = existing.agents?.defaults?.subagents?.model;
  const inheritedSubagentModel = existingSubagentModel ?? existingDefaultModel;

  next.agents = {
    ...(existing.agents ?? {}),
    ...(incoming.agents ?? {}),
    defaults: {
      ...(existing.agents?.defaults ?? {}),
      ...(incoming.agents?.defaults ?? {}),
      workspace: workspaceDir,
      subagents: {
        ...(existing.agents?.defaults?.subagents ?? {}),
        ...(incoming.agents?.defaults?.subagents ?? {}),
        model:
          incoming.agents?.defaults?.subagents?.model ??
          inheritedSubagentModel ??
          existing.agents?.defaults?.subagents?.model,
      },
    },
  };

  const incomingAgents = (incoming.agents?.list ?? []).map((entry) => ({
    ...entry,
    workspace: workspaceDir,
    subagents: entry.id === "app-forge"
      ? {
          ...(entry.subagents ?? {}),
          model:
            entry.subagents?.model ??
            inheritedSubagentModel ??
            existing.agents?.defaults?.subagents?.model,
        }
      : entry.subagents,
  }));
  next.agents.list = upsertAgentList(existing.agents?.list ?? [], incomingAgents);

  return next;
}

function runOpenClawConfigValidate(configPath, stateDir) {
  const result = spawnSync(
    "openclaw",
    ["config", "validate", "--json"],
    {
      env: {
        ...process.env,
        OPENCLAW_CONFIG_PATH: configPath,
        OPENCLAW_STATE_DIR: stateDir,
      },
      encoding: "utf8",
    },
  );
  if (result.error && result.error.code === "ENOENT") {
    return {
      status: null,
      stdout: "",
      stderr: "openclaw binary not found in PATH; skipped validation",
    };
  }
  return result;
}

export function installProduct(options = {}) {
  const workspaceSlug = options.workspaceSlug || DEFAULT_WORKSPACE_SLUG;
  const paths = resolveInstallPaths(process.env, workspaceSlug);
  ensureDir(paths.stateDir);
  ensureDir(path.dirname(paths.configPath));
  ensureDir(path.dirname(paths.workspaceDir));
  ensureDir(path.dirname(paths.toolkitDir));

  copyDirectory(kitWorkspaceDir, paths.workspaceDir);
  copyDirectory(kitDir, paths.toolkitDir);

  const existingConfig = readJson5File(paths.configPath, {});
  const partialConfig = readJson5File(kitConfigPath, {});
  const backupPath = backupFile(paths.configPath);
  const nextConfig = mergeConfig(existingConfig, partialConfig, paths.workspaceDir);
  writeJson(paths.configPath, nextConfig);

  const validate = runOpenClawConfigValidate(paths.configPath, paths.stateDir);

  return {
    productId: PRODUCT_ID,
    workspaceDir: paths.workspaceDir,
    toolkitDir: paths.toolkitDir,
    configPath: paths.configPath,
    backupPath,
    validation: {
      status: validate.status,
      stdout: validate.stdout?.trim() || "",
      stderr: validate.stderr?.trim() || "",
    },
  };
}

export function doctorProduct(options = {}) {
  const workspaceSlug = options.workspaceSlug || DEFAULT_WORKSPACE_SLUG;
  const paths = resolveInstallPaths(process.env, workspaceSlug);
  const partialConfig = readJson5File(kitConfigPath, {});
  const currentConfig = readJson5File(paths.configPath, {});

  const expectedAgents = new Set((partialConfig.agents?.list ?? []).map((entry) => entry.id));
  const installedAgents = new Set((currentConfig.agents?.list ?? []).map((entry) => entry.id));

  return {
    productId: PRODUCT_ID,
    configPath: paths.configPath,
    workspaceDir: paths.workspaceDir,
    toolkitDir: paths.toolkitDir,
    exists: {
      config: fs.existsSync(paths.configPath),
      workspace: fs.existsSync(paths.workspaceDir),
      toolkit: fs.existsSync(paths.toolkitDir),
    },
    agents: {
      expected: [...expectedAgents],
      installed: [...installedAgents],
      missing: [...expectedAgents].filter((id) => !installedAgents.has(id)),
    },
  };
}

function printUsage() {
  console.log(`Vertical Agent Forge

Usage:
  vertical-agent-forge install
  vertical-agent-forge doctor

Environment:
  OPENCLAW_CONFIG_PATH
  OPENCLAW_STATE_DIR
`);
}

export async function runCli(argv) {
  const [command] = argv;
  if (!command || command === "-h" || command === "--help") {
    printUsage();
    return;
  }
  if (command === "install") {
    const result = installProduct();
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (command === "doctor") {
    const result = doctorProduct();
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}
