import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";
import JSON5 from "json5";
import {
  compileFactoryWorkspace,
  ingestFactorySources,
} from "../src/factory/compiler.mjs";
import {
  COMPANION_PLUGIN_DIRNAME,
  COMPANION_PLUGIN_ID,
  DEFAULT_DOMAIN_TEMPLATE,
  DEFAULT_TENANT_ID,
} from "../src/factory/constants.mjs";
import {
  connectorDoctorProduct,
  deployFactoryCase,
  rollbackFactoryCase,
  runFactoryEvals,
  statusFactoryProduct,
  validateFactoryProduct,
} from "../src/factory/ops.mjs";

const PRODUCT_ID = "vertical-agent-forge";
const DEFAULT_WORKSPACE_SLUG = "vertical-agent-forge";
const MANIFEST_FILE_NAME = "install-manifest.json";
const ABSENT_SENTINEL = "__vafAbsent";
const DEFAULT_ACTIVATE_MESSAGE =
  "Read HEARTBEAT.md, initialize any missing runtime tasks, and move the platform into continuous-worker mode.";
const IGNORED_PACKAGED_FILE_NAMES = new Set([".DS_Store", "Thumbs.db"]);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(__dirname, "..");
const PACKAGE_VERSION = JSON.parse(
  fs.readFileSync(path.join(DEFAULT_REPO_ROOT, "package.json"), "utf8"),
).version;

const ROOT_CONTRACT_FILES = new Set([
  "AGENTS.md",
  "CLAUDE.md",
  "HEARTBEAT.md",
  "IDENTITY.md",
  "SOUL.md",
  "TOOLS.md",
  "USER.md",
]);

const RUNTIME_DIRS = [
  "knowledge/domain",
  "knowledge/sources",
  "knowledge/policies",
  "knowledge/glossary",
  "knowledge/action-catalog",
  "knowledge/evals",
  "knowledge/routing",
  "forge/cases/accepted",
  "forge/cases/active",
  "forge/cases/inbox",
  "forge/cases/rejected",
  "forge/candidates",
  "forge/decisions",
  "forge/eval/adversarial",
  "forge/eval/regression",
  "forge/eval/reports",
  "forge/incidents",
  "forge/memory",
  "forge/monitoring",
  "forge/releases",
];

const MANAGED_CONFIG_PATHS = [
  ["plugins", "enabled"],
  ["plugins", "load", "paths"],
  ["plugins", "entries", COMPANION_PLUGIN_ID],
  ["tools", "web"],
  ["tools", "sessions"],
  ["tools", "subagents"],
  ["agents", "defaults", "workspace"],
  ["agents", "defaults", "maxConcurrent"],
  ["agents", "defaults", "timeoutSeconds"],
  ["agents", "defaults", "subagents"],
];

function resolveProductLayout(options = {}) {
  const repoRoot = options.productRoot?.trim?.() || DEFAULT_REPO_ROOT;
  const kitDir = path.join(repoRoot, "kit");
  return {
    repoRoot,
    kitDir,
    companionPluginDir: path.join(repoRoot, "companion-plugin"),
    kitWorkspaceDir: path.join(kitDir, "workspace"),
    kitConfigPath: path.join(kitDir, "openclaw.partial.json5"),
    domainTemplatesDir: path.join(kitDir, "domain-templates"),
  };
}

function resolveStateDir(env = process.env) {
  return env.OPENCLAW_STATE_DIR?.trim() || path.join(os.homedir(), ".openclaw");
}

function resolveConfigPath(env = process.env) {
  return env.OPENCLAW_CONFIG_PATH?.trim() || path.join(resolveStateDir(env), "openclaw.json");
}

function resolveInstallPaths(env = process.env, workspaceSlug = DEFAULT_WORKSPACE_SLUG) {
  const stateDir = resolveStateDir(env);
  const toolkitDir = path.join(stateDir, "toolkits", PRODUCT_ID);
  const pluginLoadRoot = path.join(toolkitDir, "plugins");
  return {
    stateDir,
    configPath: resolveConfigPath(env),
    toolkitDir,
    pluginLoadRoot,
    pluginDir: path.join(pluginLoadRoot, COMPANION_PLUGIN_DIRNAME),
    workspaceDir: path.join(stateDir, "workspaces", workspaceSlug),
  };
}

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function fileExists(target) {
  return fs.existsSync(target);
}

function shouldIgnorePackagedFile(entryName) {
  return IGNORED_PACKAGED_FILE_NAMES.has(entryName) || entryName.startsWith("._");
}

function cloneValue(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function readJson5File(filePath, fallback) {
  if (!fileExists(filePath)) {
    return fallback;
  }
  return JSON5.parse(fs.readFileSync(filePath, "utf8"));
}

function readJsonFile(filePath, fallback) {
  if (!fileExists(filePath)) {
    return fallback;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function backupFile(filePath) {
  if (!fileExists(filePath)) {
    return null;
  }
  const backupPath = `${filePath}.bak.${Date.now()}`;
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

function restoreFileFromBackup(filePath, backupPath) {
  if (backupPath && fileExists(backupPath)) {
    ensureDir(path.dirname(filePath));
    fs.copyFileSync(backupPath, filePath);
    return;
  }
  removeIfExists(filePath);
}

function removeIfExists(target) {
  if (!fileExists(target)) {
    return false;
  }
  try {
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  } catch (error) {
    if (process.platform !== "win32") {
      const fallback = spawnSync("rm", ["-rf", target], { encoding: "utf8" });
      if (fallback.status !== 0) {
        throw error;
      }
    } else {
      throw error;
    }
  }
  return true;
}

function listFilesRecursive(rootDir, currentDir = rootDir) {
  if (!fileExists(currentDir)) {
    return [];
  }
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (shouldIgnorePackagedFile(entry.name)) {
      continue;
    }
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(rootDir, absolutePath));
      continue;
    }
    files.push(path.relative(rootDir, absolutePath));
  }
  return files.sort();
}

function classifyWorkspaceFile(relativePath) {
  if (ROOT_CONTRACT_FILES.has(relativePath)) {
    return "overwrite";
  }
  if (relativePath === "knowledge/README.md") {
    return "overwrite";
  }
  if (relativePath === "knowledge/domain/README.md") {
    return "seed";
  }
  if (
    relativePath === "knowledge/sources/README.md" ||
    relativePath === "knowledge/policies/README.md" ||
    relativePath === "knowledge/glossary/README.md" ||
    relativePath === "knowledge/action-catalog/README.md" ||
    relativePath === "knowledge/evals/README.md" ||
    relativePath === "knowledge/routing/README.md"
  ) {
    return "overwrite";
  }
  if (relativePath.startsWith("skills/")) {
    return "overwrite";
  }
  if (relativePath.startsWith("knowledge/playbooks/")) {
    return "overwrite";
  }
  if (relativePath.startsWith("knowledge/schemas/")) {
    return "overwrite";
  }
  if (relativePath.startsWith("forge/templates/")) {
    return "overwrite";
  }
  if (relativePath.startsWith("forge/")) {
    const baseName = path.basename(relativePath);
    if (baseName === "README.md" || baseName.startsWith("_template")) {
      return "overwrite";
    }
  }
  return null;
}

function buildWorkspacePlan(kitWorkspaceDir) {
  const overwriteFiles = [];
  const seedFiles = [];
  for (const relativePath of listFilesRecursive(kitWorkspaceDir)) {
    const classification = classifyWorkspaceFile(relativePath);
    if (classification === "overwrite") {
      overwriteFiles.push(relativePath);
      continue;
    }
    if (classification === "seed") {
      seedFiles.push(relativePath);
      continue;
    }
    throw new Error(`Unclassified workspace asset: ${relativePath}`);
  }
  return {
    overwriteFiles,
    seedFiles,
  };
}

function ensureRuntimeWorkspaceDirs(workspaceDir) {
  ensureDir(workspaceDir);
  for (const relativeDir of RUNTIME_DIRS) {
    ensureDir(path.join(workspaceDir, relativeDir));
  }
}

function createDirectorySnapshot(target, tempRoot, name) {
  if (!fileExists(target)) {
    return {
      existed: false,
      backupPath: null,
    };
  }
  const backupPath = path.join(tempRoot, name);
  fs.cpSync(target, backupPath, {
    recursive: true,
    dereference: false,
    force: true,
  });
  return {
    existed: true,
    backupPath,
  };
}

function restoreDirectorySnapshot(target, snapshot) {
  removeIfExists(target);
  if (!snapshot.existed || !snapshot.backupPath || !fileExists(snapshot.backupPath)) {
    return;
  }
  fs.cpSync(snapshot.backupPath, target, {
    recursive: true,
    dereference: false,
    force: true,
  });
}

function createManagedWorkspaceSnapshot(workspaceDir, relativePaths, tempRoot) {
  const backupRoot = path.join(tempRoot, "workspace");
  const entries = [];
  for (const relativePath of [...relativePaths].sort()) {
    const currentPath = path.join(workspaceDir, relativePath);
    if (!fileExists(currentPath)) {
      entries.push({
        relativePath,
        existed: false,
      });
      continue;
    }
    const backupPath = path.join(backupRoot, relativePath);
    ensureDir(path.dirname(backupPath));
    fs.cpSync(currentPath, backupPath, {
      recursive: false,
      dereference: false,
      force: true,
    });
    entries.push({
      relativePath,
      existed: true,
    });
  }
  return {
    backupRoot,
    entries,
  };
}

function pruneEmptyDirectories(startDir, stopDir) {
  let currentDir = startDir;
  while (currentDir.startsWith(stopDir) && currentDir !== stopDir) {
    if (!fileExists(currentDir)) {
      currentDir = path.dirname(currentDir);
      continue;
    }
    const entries = fs.readdirSync(currentDir);
    if (entries.length > 0) {
      break;
    }
    fs.rmdirSync(currentDir);
    currentDir = path.dirname(currentDir);
  }
}

function restoreManagedWorkspaceSnapshot(workspaceDir, snapshot) {
  for (const entry of snapshot.entries) {
    const targetPath = path.join(workspaceDir, entry.relativePath);
    if (!entry.existed) {
      removeIfExists(targetPath);
      pruneEmptyDirectories(path.dirname(targetPath), workspaceDir);
      continue;
    }
    const backupPath = path.join(snapshot.backupRoot, entry.relativePath);
    ensureDir(path.dirname(targetPath));
    fs.cpSync(backupPath, targetPath, {
      recursive: false,
      dereference: false,
      force: true,
    });
  }
}

function copyFileWithParents(sourcePath, targetPath) {
  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
}

function replaceToolkitDirectory(sourceDir, targetDir) {
  removeIfExists(targetDir);
  fs.cpSync(sourceDir, targetDir, {
    recursive: true,
    dereference: false,
    force: true,
  });
}

function installCompanionPlugin(sourceDir, targetDir) {
  if (!fileExists(sourceDir)) {
    throw new Error(`Companion plugin source is missing: ${sourceDir}`);
  }
  removeIfExists(targetDir);
  fs.cpSync(sourceDir, targetDir, {
    recursive: true,
    dereference: false,
    force: true,
    filter: (src) => {
      const baseName = path.basename(src);
      return ![
        ".git",
        "node_modules",
        "dist",
        ".DS_Store",
        "tsconfig.json",
        "vitest.config.ts",
        "index.ts",
        "index.test.ts",
      ].includes(baseName);
    },
  });
}

function syncManagedWorkspace(kitWorkspaceDir, workspaceDir, workspacePlan, previousManifest) {
  ensureRuntimeWorkspaceDirs(workspaceDir);

  const previousManagedFiles = new Set(previousManifest?.managedWorkspaceFiles ?? []);
  const currentManagedFiles = new Set(workspacePlan.overwriteFiles);

  for (const relativePath of previousManagedFiles) {
    if (currentManagedFiles.has(relativePath)) {
      continue;
    }
    const targetPath = path.join(workspaceDir, relativePath);
    removeIfExists(targetPath);
    pruneEmptyDirectories(path.dirname(targetPath), workspaceDir);
  }

  for (const relativePath of workspacePlan.overwriteFiles) {
    copyFileWithParents(
      path.join(kitWorkspaceDir, relativePath),
      path.join(workspaceDir, relativePath),
    );
  }

  for (const relativePath of workspacePlan.seedFiles) {
    const targetPath = path.join(workspaceDir, relativePath);
    if (fileExists(targetPath)) {
      continue;
    }
    copyFileWithParents(path.join(kitWorkspaceDir, relativePath), targetPath);
  }
}

function listDomainTemplates(options = {}) {
  const { domainTemplatesDir } = resolveProductLayout(options);
  if (!fileExists(domainTemplatesDir)) {
    return [];
  }
  return fs
    .readdirSync(domainTemplatesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function upsertAgentList(existing = [], incoming = []) {
  const byId = new Map(existing.map((entry) => [entry.id, entry]));
  for (const entry of incoming) {
    const current = byId.get(entry.id) ?? {};
    byId.set(entry.id, { ...current, ...entry });
  }
  return [...byId.values()];
}

function removeManagedAgents(existing = [], managedIds = new Set()) {
  return existing.filter((entry) => !managedIds.has(entry.id));
}

function dedupeStrings(values = []) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim().length > 0))];
}

function mergeConfig(existing, incoming, workspaceDir, paths) {
  const next = {
    ...(existing ?? {}),
  };

  if (incoming.session || existing.session) {
    const mergedSession = {
      ...(existing.session ?? {}),
      ...(incoming.session ?? {}),
    };
    if (Object.keys(mergedSession).length > 0) {
      next.session = mergedSession;
    } else {
      delete next.session;
    }
  }

  const mergedTools = {
    ...(existing.tools ?? {}),
    ...(incoming.tools ?? {}),
  };
  if (incoming.tools?.web || existing.tools?.web) {
    mergedTools.web = {
      ...(existing.tools?.web ?? {}),
      ...(incoming.tools?.web ?? {}),
    };
  }
  if (incoming.tools?.sessions || existing.tools?.sessions) {
    mergedTools.sessions = {
      ...(existing.tools?.sessions ?? {}),
      ...(incoming.tools?.sessions ?? {}),
    };
  }
  if (incoming.tools?.subagents || existing.tools?.subagents) {
    mergedTools.subagents = {
      ...(existing.tools?.subagents ?? {}),
      ...(incoming.tools?.subagents ?? {}),
    };
  }
  if (Object.keys(mergedTools).length > 0) {
    next.tools = mergedTools;
  } else {
    delete next.tools;
  }

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

  const existingPlugins = existing.plugins ?? {};
  const existingEntries =
    existingPlugins.entries && typeof existingPlugins.entries === "object" && !Array.isArray(existingPlugins.entries)
      ? existingPlugins.entries
      : {};
  const existingLoadPaths = Array.isArray(existingPlugins.load?.paths) ? existingPlugins.load.paths : [];
  next.plugins = {
    ...existingPlugins,
    enabled: true,
    load: {
      ...(existingPlugins.load ?? {}),
      paths: dedupeStrings([...existingLoadPaths, paths.pluginLoadRoot]),
    },
    entries: {
      ...existingEntries,
      [COMPANION_PLUGIN_ID]: {
        ...(existingEntries[COMPANION_PLUGIN_ID] ?? {}),
        enabled: true,
        config: {
          ...((existingEntries[COMPANION_PLUGIN_ID] ?? {}).config ?? {}),
          tenantId: DEFAULT_TENANT_ID,
          workspaceDir,
          fullAuto: true,
          killSwitch: false,
          connectors: {
            zendesk: { mode: "simulate" },
            stripe: { mode: "simulate" },
            filesystem: { mode: "simulate" },
          },
        },
      },
    },
  };

  return next;
}

function getPathValue(value, pathParts) {
  let current = value;
  for (const part of pathParts) {
    if (!current || typeof current !== "object" || !(part in current)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

function deletePathValue(target, pathParts) {
  if (pathParts.length === 0) {
    return;
  }
  if (pathParts.length === 1) {
    delete target[pathParts[0]];
    return;
  }
  const parent = getPathValue(target, pathParts.slice(0, -1));
  if (!parent || typeof parent !== "object") {
    return;
  }
  delete parent[pathParts.at(-1)];
  for (let index = pathParts.length - 1; index > 0; index -= 1) {
    const ancestorPath = pathParts.slice(0, index);
    const ancestor = getPathValue(target, ancestorPath);
    if (!ancestor || typeof ancestor !== "object" || Array.isArray(ancestor)) {
      continue;
    }
    if (Object.keys(ancestor).length > 0) {
      break;
    }
    deletePathValue(target, pathParts.slice(0, index));
  }
}

function setPathValue(target, pathParts, value) {
  if (value === undefined) {
    deletePathValue(target, pathParts);
    return;
  }
  let current = target;
  for (let index = 0; index < pathParts.length - 1; index += 1) {
    const part = pathParts[index];
    if (!current[part] || typeof current[part] !== "object" || Array.isArray(current[part])) {
      current[part] = {};
    }
    current = current[part];
  }
  current[pathParts.at(-1)] = cloneValue(value);
}

function encodeManifestValue(value) {
  if (value === undefined) {
    return {
      [ABSENT_SENTINEL]: true,
    };
  }
  return value;
}

function decodeManifestValue(value) {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    value[ABSENT_SENTINEL] === true &&
    Object.keys(value).length === 1
  ) {
    return undefined;
  }
  return value;
}

function buildManagedConfigChanges(existingConfig, nextConfig, partialConfig) {
  const managedPaths = [...MANAGED_CONFIG_PATHS];
  if (partialConfig.session && Object.keys(partialConfig.session).length > 0) {
    managedPaths.unshift(["session"]);
  }
  return managedPaths.flatMap((pathParts) => {
    const previousValue = cloneValue(getPathValue(existingConfig, pathParts));
    const nextValue = cloneValue(getPathValue(nextConfig, pathParts));
    if (isDeepStrictEqual(previousValue, nextValue)) {
      return [];
    }
    return [{
      path: pathParts,
      previous: encodeManifestValue(previousValue),
      next: encodeManifestValue(nextValue),
    }];
  });
}

function buildLegacyFallbackManifest(partialConfig, paths, workspacePlan) {
  const baseline = {};
  const installed = mergeConfig(baseline, partialConfig, paths.workspaceDir, paths);
  return {
    productId: PRODUCT_ID,
    version: PACKAGE_VERSION,
    workspaceDir: paths.workspaceDir,
    managedAgentIds: (partialConfig.agents?.list ?? []).map((entry) => entry.id),
    previousManagedAgents: [],
    managedConfigChanges: buildManagedConfigChanges(baseline, installed, partialConfig),
    managedWorkspaceFiles: workspacePlan.overwriteFiles,
  };
}

function writeInstallManifest(toolkitDir, manifest) {
  writeJson(path.join(toolkitDir, MANIFEST_FILE_NAME), manifest);
}

function readInstallManifest(toolkitDir) {
  return readJsonFile(path.join(toolkitDir, MANIFEST_FILE_NAME), null);
}

function normalizeValidationResult(result) {
  return {
    status: result.status ?? null,
    stdout: result.stdout?.trim?.() || "",
    stderr: result.stderr?.trim?.() || "",
    skipped: result.status == null,
  };
}

function isValidationFailure(validation) {
  return typeof validation.status === "number" && validation.status !== 0;
}

function runOpenClawCommand(
  args,
  configPath,
  stateDir,
  env,
  openclawBin = "openclaw",
  options = {},
) {
  const result = spawnSync(
    openclawBin,
    args,
    {
      env: {
        ...process.env,
        ...env,
        OPENCLAW_CONFIG_PATH: configPath,
        OPENCLAW_STATE_DIR: stateDir,
      },
      encoding: "utf8",
      timeout: options.timeoutMs,
    },
  );
  if (result.error && result.error.code === "ENOENT") {
    return {
      status: null,
      stdout: "",
      stderr: `openclaw binary not found in PATH; skipped command: ${args.join(" ")}`,
    };
  }
  if (result.error && result.error.code === "ETIMEDOUT") {
    return {
      status: null,
      stdout: result.stdout?.trim?.() || "",
      stderr: `openclaw command timed out; skipped command: ${args.join(" ")}`,
    };
  }
  if (result.error) {
    return {
      status: null,
      stdout: result.stdout?.trim?.() || "",
      stderr: result.error.message || `openclaw command failed: ${args.join(" ")}`,
    };
  }
  return result;
}

function runOpenClawConfigValidate(configPath, stateDir, env, openclawBin) {
  return runOpenClawCommand(
    ["config", "validate", "--json"],
    configPath,
    stateDir,
    env,
    openclawBin,
  );
}

function runOpenClawGatewayHealth(configPath, stateDir, env, openclawBin) {
  return runOpenClawCommand(
    ["gateway", "health", "--json"],
    configPath,
    stateDir,
    env,
    openclawBin,
  );
}

function runOpenClawGatewayMethod(configPath, stateDir, env, openclawBin, method, params, options = {}) {
  return runOpenClawCommand(
    [
      "gateway",
      "call",
      method,
      "--json",
      "--params",
      JSON.stringify(params ?? {}),
    ],
    configPath,
    stateDir,
    env,
    openclawBin,
    options,
  );
}

function parseJsonStdout(result) {
  try {
    return result.stdout ? JSON.parse(result.stdout) : null;
  } catch {
    return null;
  }
}

function runCompanionPluginSnapshot(paths, env, openclawBin, params = {}, options = {}) {
  const result = runOpenClawGatewayMethod(
    paths.configPath,
    paths.stateDir,
    env,
    openclawBin,
    "vertical-agent-forge.snapshot",
    params,
    options,
  );
  return {
    command: normalizeValidationResult(result),
    payload: parseJsonStdout(result),
  };
}

function preflightCompanionPlugin(pluginDir) {
  const requiredFiles = [
    "package.json",
    "openclaw.plugin.json",
    "index.mjs",
    path.join("src", "runtime.mjs"),
  ];
  const missingFiles = requiredFiles.filter((relativePath) => !fileExists(path.join(pluginDir, relativePath)));
  return {
    ok: missingFiles.length === 0,
    missingFiles,
  };
}

function sleepMs(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return;
  }
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, durationMs);
}

function waitForGatewayReady(
  configPath,
  stateDir,
  env,
  openclawBin,
  attempts = 10,
  intervalMs = 500,
) {
  let last = normalizeValidationResult(
    runOpenClawGatewayHealth(configPath, stateDir, env, openclawBin),
  );
  for (let index = 1; index < attempts && last.status !== 0; index += 1) {
    sleepMs(intervalMs);
    last = normalizeValidationResult(
      runOpenClawGatewayHealth(configPath, stateDir, env, openclawBin),
    );
  }
  return last;
}

function restoreManagedConfig(currentConfig, manifest) {
  const nextConfig = cloneValue(currentConfig) ?? {};
  const managedAgentIds = new Set(manifest.managedAgentIds ?? []);
  const previousManagedAgents = manifest.previousManagedAgents ?? [];
  const currentAgentList = nextConfig.agents?.list ?? [];
  const filteredAgents = removeManagedAgents(currentAgentList, managedAgentIds);
  const restoredAgents = upsertAgentList(filteredAgents, previousManagedAgents);

  if (nextConfig.agents || restoredAgents.length > 0) {
    nextConfig.agents = {
      ...(nextConfig.agents ?? {}),
    };
    if (restoredAgents.length > 0) {
      nextConfig.agents.list = restoredAgents;
    } else {
      delete nextConfig.agents.list;
    }
    if (Object.keys(nextConfig.agents).length === 0) {
      delete nextConfig.agents;
    }
  }

  const preservedConfigPaths = [];
  for (const change of manifest.managedConfigChanges ?? []) {
    const currentValue = cloneValue(getPathValue(nextConfig, change.path));
    const installedValue = cloneValue(decodeManifestValue(change.next));
    const previousValue = cloneValue(decodeManifestValue(change.previous));
    if (isDeepStrictEqual(currentValue, installedValue)) {
      setPathValue(nextConfig, change.path, previousValue);
      continue;
    }
    if (!isDeepStrictEqual(currentValue, previousValue)) {
      preservedConfigPaths.push(change.path.join("."));
    }
  }

  for (const key of ["agents", "tools", "session", "plugins"]) {
    const value = nextConfig[key];
    if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) {
      delete nextConfig[key];
    }
  }

  return {
    nextConfig,
    preservedConfigPaths: [...new Set(preservedConfigPaths)],
  };
}

function buildInstallManifest(existingConfig, nextConfig, partialConfig, paths, workspacePlan) {
  const managedAgentIds = (partialConfig.agents?.list ?? []).map((entry) => entry.id);
  const previousManagedAgents = (existingConfig.agents?.list ?? []).filter((entry) =>
    managedAgentIds.includes(entry.id)
  );
  return {
    productId: PRODUCT_ID,
    version: PACKAGE_VERSION,
    installedAt: new Date().toISOString(),
    workspaceSlug: path.basename(paths.workspaceDir),
    workspaceDir: paths.workspaceDir,
    toolkitDir: paths.toolkitDir,
    pluginDir: paths.pluginDir,
    managedAgentIds,
    previousManagedAgents,
    managedConfigChanges: buildManagedConfigChanges(existingConfig, nextConfig, partialConfig),
    managedWorkspaceFiles: workspacePlan.overwriteFiles,
  };
}

export function installProduct(options = {}) {
  const env = options.env ?? process.env;
  const workspaceSlug = options.workspaceSlug || DEFAULT_WORKSPACE_SLUG;
  const layout = resolveProductLayout(options);
  const paths = resolveInstallPaths(env, workspaceSlug);
  const partialConfig = readJson5File(layout.kitConfigPath, {});
  const existingConfig = readJson5File(paths.configPath, {});
  const previousManifest = readInstallManifest(paths.toolkitDir);
  const workspacePlan = buildWorkspacePlan(layout.kitWorkspaceDir);
  const pluginPreflight = preflightCompanionPlugin(layout.companionPluginDir);
  if (!pluginPreflight.ok) {
    return {
      productId: PRODUCT_ID,
      success: false,
      error: `Companion plugin is incomplete: ${pluginPreflight.missingFiles.join(", ")}`,
      pluginPreflight,
    };
  }
  const nextConfig = mergeConfig(existingConfig, partialConfig, paths.workspaceDir, paths);
  const manifest = buildInstallManifest(
    existingConfig,
    nextConfig,
    partialConfig,
    paths,
    workspacePlan,
  );

  ensureDir(paths.stateDir);
  ensureDir(path.dirname(paths.configPath));
  ensureDir(path.dirname(paths.workspaceDir));
  ensureDir(path.dirname(paths.toolkitDir));

  const backupPath = backupFile(paths.configPath);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `${PRODUCT_ID}-install-`));
  const toolkitSnapshot = createDirectorySnapshot(paths.toolkitDir, tempRoot, "toolkit");
  const workspaceSnapshot = createManagedWorkspaceSnapshot(
    paths.workspaceDir,
    new Set([
      ...workspacePlan.overwriteFiles,
      ...(previousManifest?.managedWorkspaceFiles ?? []),
    ]),
    tempRoot,
  );

  try {
    replaceToolkitDirectory(layout.kitDir, paths.toolkitDir);
    installCompanionPlugin(layout.companionPluginDir, paths.pluginDir);
    syncManagedWorkspace(layout.kitWorkspaceDir, paths.workspaceDir, workspacePlan, previousManifest);
    writeJson(paths.configPath, nextConfig);
    writeInstallManifest(paths.toolkitDir, manifest);

    const validation = normalizeValidationResult(
      runOpenClawConfigValidate(paths.configPath, paths.stateDir, env, options.openclawBin),
    );
    if (isValidationFailure(validation)) {
      restoreFileFromBackup(paths.configPath, backupPath);
      restoreDirectorySnapshot(paths.toolkitDir, toolkitSnapshot);
      restoreManagedWorkspaceSnapshot(paths.workspaceDir, workspaceSnapshot);
      return {
        productId: PRODUCT_ID,
        success: false,
        rolledBack: true,
        workspaceDir: paths.workspaceDir,
        toolkitDir: paths.toolkitDir,
        pluginDir: paths.pluginDir,
        configPath: paths.configPath,
        backupPath,
        manifestPath: path.join(paths.toolkitDir, MANIFEST_FILE_NAME),
        validation,
        error: "openclaw config validate failed; restored previous state",
      };
    }

    return {
      productId: PRODUCT_ID,
      success: true,
      workspaceDir: paths.workspaceDir,
      toolkitDir: paths.toolkitDir,
      pluginDir: paths.pluginDir,
      configPath: paths.configPath,
      backupPath,
      manifestPath: path.join(paths.toolkitDir, MANIFEST_FILE_NAME),
      domainTemplates: listDomainTemplates(options),
      pluginPreflight,
      validation,
    };
  } finally {
    removeIfExists(tempRoot);
  }
}

export function upgradeProduct(options = {}) {
  const install = installProduct(options);
  return {
    productId: PRODUCT_ID,
    success: install.success,
    upgraded: install.success,
    install,
  };
}

export function initDomainTemplate(options = {}) {
  const env = options.env ?? process.env;
  const layout = resolveProductLayout(options);
  const templateName = options.domainTemplate;
  if (!templateName) {
    throw new Error("init requires --domain <template>");
  }

  const templateRoot = path.join(layout.domainTemplatesDir, templateName);
  if (!fileExists(templateRoot)) {
    throw new Error(`unknown domain template: ${templateName}`);
  }

  const workspaceSlug = options.workspaceSlug || DEFAULT_WORKSPACE_SLUG;
  const paths = resolveInstallPaths(env, workspaceSlug);
  const domainDir = path.join(paths.workspaceDir, "knowledge", "domain");
  const sourceDir = path.join(paths.workspaceDir, "knowledge", "sources");
  const templateDomainDir = path.join(templateRoot, "domain");
  const templateSourcesDir = path.join(templateRoot, "sources");

  ensureDir(domainDir);
  ensureDir(sourceDir);

  if (fileExists(templateDomainDir)) {
    fs.cpSync(templateDomainDir, domainDir, {
      recursive: true,
      dereference: false,
      force: true,
    });
  } else {
    fs.cpSync(templateRoot, domainDir, {
      recursive: true,
      dereference: false,
      force: true,
    });
  }
  if (fileExists(templateSourcesDir)) {
    fs.cpSync(templateSourcesDir, sourceDir, {
      recursive: true,
      dereference: false,
      force: true,
    });
  }

  return {
    productId: PRODUCT_ID,
    success: true,
    domainTemplate: templateName,
    domainDir,
    sourceDir,
    copiedFrom: templateRoot,
  };
}

export function activateProduct(options = {}) {
  const env = options.env ?? process.env;
  const install = options.skipInstall ? { success: true } : installProduct(options);
  if (!install.success) {
    return {
      productId: PRODUCT_ID,
      success: false,
      install,
      activation: null,
    };
  }

  const workspaceSlug = options.workspaceSlug || DEFAULT_WORKSPACE_SLUG;
  const paths = resolveInstallPaths(env, workspaceSlug);
  const strict = options.bestEffort !== true;
  const gatewayHealth = waitForGatewayReady(
    paths.configPath,
    paths.stateDir,
    env,
    options.openclawBin,
    options.gatewayWaitAttempts,
    options.gatewayWaitIntervalMs,
  );
  if (gatewayHealth.status !== 0) {
    if (strict) {
      return {
        productId: PRODUCT_ID,
        success: false,
        install,
        activation: {
          status: null,
          stdout: gatewayHealth.stdout,
          stderr: gatewayHealth.stderr
            ? `gateway unavailable; strict activation failed\n${gatewayHealth.stderr}`
            : "gateway unavailable; strict activation failed",
        },
      };
    }
    return {
      productId: PRODUCT_ID,
      success: true,
      install,
      activation: {
        status: null,
        stdout: gatewayHealth.stdout,
        stderr: gatewayHealth.stderr
          ? `gateway unavailable; skipped initial forge bootstrap turn\n${gatewayHealth.stderr}`
          : "gateway unavailable; skipped initial forge bootstrap turn",
      },
    };
  }

  const pluginSnapshot = runCompanionPluginSnapshot(
    paths,
    env,
    options.openclawBin,
    { force: true },
    { timeoutMs: options.activationTimeoutMs ?? 20_000 },
  );
  const localValidation = validateFactoryProduct({
    workspaceDir: paths.workspaceDir,
    tenantId: DEFAULT_TENANT_ID,
    fullAuto: true,
    killSwitch: false,
  });
  const connectorPreflight = connectorDoctorProduct({
    workspaceDir: paths.workspaceDir,
    tenantId: DEFAULT_TENANT_ID,
    writeArtifact: true,
  });
  const pluginAvailable = pluginSnapshot.command.status === 0 && pluginSnapshot.payload?.available !== false;
  if (strict && (!pluginAvailable || !localValidation.ok || !connectorPreflight.ok)) {
    return {
      productId: PRODUCT_ID,
      success: false,
      install,
      activation: {
        status: null,
        stdout: pluginSnapshot.command.stdout,
        stderr: pluginSnapshot.command.stderr || "control plane preflight failed",
      },
      pluginSnapshot,
      localValidation,
      connectorPreflight,
    };
  }

  const command = runOpenClawCommand(
    [
      "gateway",
      "call",
      "agent",
      "--json",
      "--params",
      JSON.stringify({
        agentId: "app-forge",
        message: options.message || DEFAULT_ACTIVATE_MESSAGE,
        idempotencyKey: `vertical-agent-forge-activate-${Date.now()}`,
      }),
    ],
    paths.configPath,
    paths.stateDir,
    env,
    options.openclawBin,
    { timeoutMs: options.activationTimeoutMs ?? 20_000 },
  );

  return {
    productId: PRODUCT_ID,
    success: strict ? command.status === 0 : true,
    install,
    activation: {
      status: command.status,
      stdout: command.stdout?.trim?.() || "",
      stderr: command.stderr?.trim?.() || "",
    },
    pluginSnapshot,
    localValidation,
    connectorPreflight,
  };
}

export function doctorProduct(options = {}) {
  const env = options.env ?? process.env;
  const layout = resolveProductLayout(options);
  const workspaceSlug = options.workspaceSlug || DEFAULT_WORKSPACE_SLUG;
  const paths = resolveInstallPaths(env, workspaceSlug);
  const partialConfig = readJson5File(layout.kitConfigPath, {});
  const currentConfig = readJson5File(paths.configPath, {});

  const expectedAgents = new Set((partialConfig.agents?.list ?? []).map((entry) => entry.id));
  const installedAgents = new Set((currentConfig.agents?.list ?? []).map((entry) => entry.id));
  const pluginEntry = currentConfig.plugins?.entries?.[COMPANION_PLUGIN_ID];
  const pluginLoadPaths = Array.isArray(currentConfig.plugins?.load?.paths) ? currentConfig.plugins.load.paths : [];

  const result = {
    productId: PRODUCT_ID,
    success: true,
    configPath: paths.configPath,
    workspaceDir: paths.workspaceDir,
    toolkitDir: paths.toolkitDir,
    pluginDir: paths.pluginDir,
    manifestPath: path.join(paths.toolkitDir, MANIFEST_FILE_NAME),
    exists: {
      config: fileExists(paths.configPath),
      workspace: fileExists(paths.workspaceDir),
      toolkit: fileExists(paths.toolkitDir),
      plugin: fileExists(paths.pluginDir),
      manifest: fileExists(path.join(paths.toolkitDir, MANIFEST_FILE_NAME)),
    },
    agents: {
      expected: [...expectedAgents],
      installed: [...installedAgents],
      missing: [...expectedAgents].filter((id) => !installedAgents.has(id)),
    },
    plugin: {
      id: COMPANION_PLUGIN_ID,
      configured: Boolean(pluginEntry),
      enabled: pluginEntry?.enabled !== false,
      loadPaths: pluginLoadPaths,
      presentInLoadPaths: pluginLoadPaths.includes(paths.pluginLoadRoot),
      preflight: preflightCompanionPlugin(paths.pluginDir),
    },
    domainTemplates: listDomainTemplates(options),
  };

  if (!options.deep) {
    return result;
  }

  const validation = normalizeValidationResult(
    runOpenClawConfigValidate(paths.configPath, paths.stateDir, env, options.openclawBin),
  );
  const gatewayHealth = normalizeValidationResult(
    runOpenClawGatewayHealth(paths.configPath, paths.stateDir, env, options.openclawBin),
  );
  const pluginSnapshot = gatewayHealth.status === 0
    ? runCompanionPluginSnapshot(paths, env, options.openclawBin, { force: true })
    : {
        command: gatewayHealth,
        payload: null,
      };
  const localValidation = fileExists(paths.workspaceDir)
    ? validateFactoryProduct({
        workspaceDir: paths.workspaceDir,
        tenantId: DEFAULT_TENANT_ID,
        fullAuto: true,
        killSwitch: false,
      })
    : null;
  const connectorPreflight = fileExists(paths.workspaceDir)
    ? connectorDoctorProduct({
        workspaceDir: paths.workspaceDir,
        tenantId: DEFAULT_TENANT_ID,
        writeArtifact: false,
      })
    : null;

  result.deep = {
    validation,
    gatewayHealth,
    pluginSnapshot,
    localValidation,
    connectorPreflight,
  };
  result.success =
    result.exists.config &&
    result.exists.workspace &&
    result.exists.toolkit &&
    result.exists.plugin &&
    result.plugin.configured &&
    result.plugin.presentInLoadPaths &&
    result.plugin.preflight.ok &&
    validation.status === 0 &&
    gatewayHealth.status === 0 &&
    pluginSnapshot.command.status === 0 &&
    pluginSnapshot.payload?.available !== false &&
    (localValidation?.ok ?? false) &&
    (connectorPreflight?.ok ?? false);

  return result;
}

export function uninstallProduct(options = {}) {
  const env = options.env ?? process.env;
  const workspaceSlug = options.workspaceSlug || DEFAULT_WORKSPACE_SLUG;
  const layout = resolveProductLayout(options);
  const paths = resolveInstallPaths(env, workspaceSlug);
  const partialConfig = readJson5File(layout.kitConfigPath, {});
  const currentConfig = readJson5File(paths.configPath, {});
  const workspacePlan = buildWorkspacePlan(layout.kitWorkspaceDir);
  const manifest = readInstallManifest(paths.toolkitDir) ?? buildLegacyFallbackManifest(
    partialConfig,
    paths,
    workspacePlan,
  );
  const backupPath = backupFile(paths.configPath);
  const { nextConfig, preservedConfigPaths } = restoreManagedConfig(currentConfig, manifest);

  writeJson(paths.configPath, nextConfig);
  const validation = normalizeValidationResult(
    runOpenClawConfigValidate(paths.configPath, paths.stateDir, env, options.openclawBin),
  );
  if (isValidationFailure(validation)) {
    restoreFileFromBackup(paths.configPath, backupPath);
    return {
      productId: PRODUCT_ID,
      success: false,
      rolledBack: true,
      configPath: paths.configPath,
      backupPath,
      removedToolkit: false,
      removedWorkspace: false,
      preservedConfigPaths,
      validation,
      error: "openclaw config validate failed; restored previous config",
    };
  }

  const removedToolkit = removeIfExists(paths.toolkitDir);
  const removedWorkspace = options.purgeWorkspace === true ? removeIfExists(paths.workspaceDir) : false;

  return {
    productId: PRODUCT_ID,
    success: true,
    configPath: paths.configPath,
    backupPath,
    removedToolkit,
    removedWorkspace,
    preservedConfigPaths,
    validation,
  };
}

export function ingestProduct(options = {}) {
  const env = options.env ?? process.env;
  const paths = resolveInstallPaths(env, options.workspaceSlug || DEFAULT_WORKSPACE_SLUG);
  const ingested = ingestFactorySources({
    workspaceDir: paths.workspaceDir,
    fromPath: options.fromPath,
    kind: options.kind,
  });
  return {
    productId: PRODUCT_ID,
    ...ingested,
  };
}

export function compileProduct(options = {}) {
  const env = options.env ?? process.env;
  const paths = resolveInstallPaths(env, options.workspaceSlug || DEFAULT_WORKSPACE_SLUG);
  return {
    productId: PRODUCT_ID,
    ...compileFactoryWorkspace({
      workspaceDir: paths.workspaceDir,
      tenantId: DEFAULT_TENANT_ID,
    }),
  };
}

export function validateProduct(options = {}) {
  const env = options.env ?? process.env;
  const paths = resolveInstallPaths(env, options.workspaceSlug || DEFAULT_WORKSPACE_SLUG);
  const validation = validateFactoryProduct({
    workspaceDir: paths.workspaceDir,
    tenantId: DEFAULT_TENANT_ID,
    fullAuto: true,
    killSwitch: false,
  });
  return {
    productId: PRODUCT_ID,
    success: validation.ok,
    workspaceDir: paths.workspaceDir,
    validation,
  };
}

export function connectorDoctorCliProduct(options = {}) {
  const env = options.env ?? process.env;
  const paths = resolveInstallPaths(env, options.workspaceSlug || DEFAULT_WORKSPACE_SLUG);
  const report = connectorDoctorProduct({
    workspaceDir: paths.workspaceDir,
    tenantId: DEFAULT_TENANT_ID,
    writeArtifact: options.writeArtifact !== false,
  });
  return {
    productId: PRODUCT_ID,
    success: report.ok,
    workspaceDir: paths.workspaceDir,
    ...report,
  };
}

export function statusProduct(options = {}) {
  const env = options.env ?? process.env;
  const paths = resolveInstallPaths(env, options.workspaceSlug || DEFAULT_WORKSPACE_SLUG);
  const localSnapshot = statusFactoryProduct({
    workspaceDir: paths.workspaceDir,
    stateDir: paths.stateDir,
    tenantId: DEFAULT_TENANT_ID,
    fullAuto: true,
    killSwitch: false,
  });
  if (!options.deep) {
    return {
      productId: PRODUCT_ID,
      success: localSnapshot.summary.ok,
      snapshot: localSnapshot,
    };
  }

  const remoteCommand = runOpenClawGatewayMethod(
    paths.configPath,
    paths.stateDir,
    env,
    options.openclawBin,
    "vertical-agent-forge.snapshot",
    { force: true },
  );
  const remoteSnapshot = normalizeValidationResult(remoteCommand);
  return {
    productId: PRODUCT_ID,
    success: localSnapshot.summary.ok && (remoteSnapshot.status === 0 || options.bestEffort === true),
    snapshot: localSnapshot,
    remoteSnapshot: {
      command: remoteSnapshot,
      payload: parseJsonStdout(remoteCommand),
    },
  };
}

export function runEvalsProduct(options = {}) {
  const env = options.env ?? process.env;
  const paths = resolveInstallPaths(env, options.workspaceSlug || DEFAULT_WORKSPACE_SLUG);
  const result = runFactoryEvals({
    workspaceDir: paths.workspaceDir,
    caseId: options.caseId,
    tenantId: DEFAULT_TENANT_ID,
    stage: options.stage || "shadow",
    injectBreach: options.injectBreach === true,
    autoRollback: options.autoRollback !== false,
  });
  return {
    productId: PRODUCT_ID,
    ...result,
  };
}

export function deployProduct(options = {}) {
  const env = options.env ?? process.env;
  const paths = resolveInstallPaths(env, options.workspaceSlug || DEFAULT_WORKSPACE_SLUG);
  const result = deployFactoryCase({
    workspaceDir: paths.workspaceDir,
    caseId: options.caseId,
    tenantId: DEFAULT_TENANT_ID,
    stage: options.stage || "canary",
    mode: options.bestEffort === true ? "best-effort" : "full-auto",
  });
  return {
    productId: PRODUCT_ID,
    ...result,
  };
}

export function rollbackProduct(options = {}) {
  const env = options.env ?? process.env;
  const paths = resolveInstallPaths(env, options.workspaceSlug || DEFAULT_WORKSPACE_SLUG);
  const result = rollbackFactoryCase({
    workspaceDir: paths.workspaceDir,
    caseId: options.caseId,
    tenantId: DEFAULT_TENANT_ID,
    reason: options.reason || "manual rollback",
  });
  return {
    productId: PRODUCT_ID,
    ...result,
  };
}

export function bootstrapProduct(options = {}) {
  const env = options.env ?? process.env;
  const install = installProduct(options);
  if (!install.success) {
    return {
      productId: PRODUCT_ID,
      success: false,
      install,
    };
  }

  const paths = resolveInstallPaths(env, options.workspaceSlug || DEFAULT_WORKSPACE_SLUG);
  const sourceRoot = path.join(paths.workspaceDir, "knowledge", "sources");
  const hasSeedSources =
    fileExists(sourceRoot) &&
    listFilesRecursive(sourceRoot).some((relativePath) => path.basename(relativePath) !== "README.md");
  const init = !hasSeedSources || options.forceInit === true
    ? initDomainTemplate({
        ...options,
        domainTemplate: options.domainTemplate || DEFAULT_DOMAIN_TEMPLATE,
      })
    : null;
  const compile = compileProduct(options);
  const validate = validateProduct(options);
  if (!validate.success && options.bestEffort !== true) {
    return {
      productId: PRODUCT_ID,
      success: false,
      install,
      init,
      compile,
      validate,
    };
  }
  const activation = activateProduct({
    ...options,
    skipInstall: true,
  });
  return {
    productId: PRODUCT_ID,
    success: install.success && (validate.success || options.bestEffort === true) && activation.success,
    install,
    init,
    compile,
    validate,
    activation,
  };
}

function printUsage() {
  console.log(`Vertical Agent Forge

Usage:
  vertical-agent-forge install
  vertical-agent-forge activate [--best-effort]
  vertical-agent-forge bootstrap [--domain <template>] [--best-effort]
  vertical-agent-forge doctor [--deep]
  vertical-agent-forge status [--deep]
  vertical-agent-forge ingest --from <path> [--kind <kind>]
  vertical-agent-forge compile
  vertical-agent-forge validate
  vertical-agent-forge connector-doctor
  vertical-agent-forge run-evals --case <caseId> [--stage <shadow|canary|live>] [--inject-breach]
  vertical-agent-forge deploy --case <caseId> [--stage <canary|live>]
  vertical-agent-forge rollback --case <caseId> [--reason <text>]
  vertical-agent-forge init --domain <template>
  vertical-agent-forge upgrade
  vertical-agent-forge uninstall [--purge-workspace]

Environment:
  OPENCLAW_CONFIG_PATH
  OPENCLAW_STATE_DIR
`);
}

function readOption(args, name) {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return args[index + 1];
}

function hasFlag(args, name) {
  return args.includes(name);
}

function emitResult(result) {
  console.log(JSON.stringify(result, null, 2));
  if (result && typeof result === "object" && "success" in result && result.success === false) {
    process.exitCode = 1;
  }
}

export async function runCli(argv) {
  const [command] = argv;
  const args = argv.slice(1);
  if (!command || command === "-h" || command === "--help") {
    printUsage();
    return;
  }

  if (command === "install") {
    emitResult(installProduct());
    return;
  }
  if (command === "bootstrap") {
    emitResult(bootstrapProduct({
      domainTemplate: readOption(args, "--domain"),
      bestEffort: hasFlag(args, "--best-effort"),
    }));
    return;
  }
  if (command === "doctor") {
    emitResult(doctorProduct({
      deep: hasFlag(args, "--deep"),
    }));
    return;
  }
  if (command === "status") {
    emitResult(statusProduct({
      deep: hasFlag(args, "--deep"),
      bestEffort: hasFlag(args, "--best-effort"),
    }));
    return;
  }
  if (command === "ingest") {
    emitResult(ingestProduct({
      fromPath: readOption(args, "--from"),
      kind: readOption(args, "--kind"),
    }));
    return;
  }
  if (command === "compile") {
    emitResult(compileProduct());
    return;
  }
  if (command === "validate") {
    emitResult(validateProduct());
    return;
  }
  if (command === "connector-doctor") {
    emitResult(connectorDoctorCliProduct());
    return;
  }
  if (command === "run-evals") {
    emitResult(runEvalsProduct({
      caseId: readOption(args, "--case"),
      stage: readOption(args, "--stage"),
      injectBreach: hasFlag(args, "--inject-breach"),
      autoRollback: !hasFlag(args, "--no-auto-rollback"),
    }));
    return;
  }
  if (command === "init") {
    emitResult(initDomainTemplate({
      domainTemplate: readOption(args, "--domain"),
    }));
    return;
  }
  if (command === "upgrade") {
    emitResult(upgradeProduct());
    return;
  }
  if (command === "activate") {
    emitResult(activateProduct({
      bestEffort: hasFlag(args, "--best-effort"),
    }));
    return;
  }
  if (command === "deploy") {
    emitResult(deployProduct({
      caseId: readOption(args, "--case"),
      stage: readOption(args, "--stage"),
      bestEffort: hasFlag(args, "--best-effort"),
    }));
    return;
  }
  if (command === "rollback") {
    emitResult(rollbackProduct({
      caseId: readOption(args, "--case"),
      reason: readOption(args, "--reason"),
    }));
    return;
  }
  if (command === "uninstall") {
    emitResult(uninstallProduct({
      purgeWorkspace: hasFlag(args, "--purge-workspace"),
    }));
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}
