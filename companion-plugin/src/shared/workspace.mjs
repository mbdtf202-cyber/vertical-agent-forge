import fs from "node:fs";
import path from "node:path";

export const PLUGIN_ID = "vertical-agent-forge-control-plane";
export const ACTIVE_CASE_STATUSES = [
  "triage",
  "building",
  "validating",
  "shadow",
  "canary",
  "live",
  "archived",
  "hold",
  "reject",
  "rollback",
  "incident",
];

export function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

export function fileExists(target) {
  return fs.existsSync(target);
}

export function readJsonIfExists(filePath, fallback = null) {
  if (!fileExists(filePath)) {
    return fallback;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function readTextIfExists(filePath, fallback = "") {
  if (!fileExists(filePath)) {
    return fallback;
  }
  return fs.readFileSync(filePath, "utf8");
}

export function listFilesRecursive(rootDir, currentDir = rootDir) {
  if (!fileExists(currentDir)) {
    return [];
  }
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === ".DS_Store" || entry.name.startsWith("._")) {
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

export function parseActiveCaseFile(filePath) {
  const text = readTextIfExists(filePath);
  const result = {
    filePath,
    caseId: undefined,
    ownerTask: undefined,
    status: undefined,
    priority: undefined,
    currentHypothesis: undefined,
    nextAction: undefined,
    nextWake: undefined,
    stopCondition: undefined,
  };

  let currentKey = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      continue;
    }
    const match = /^([A-Za-z ]+):\s*(.*)$/.exec(line);
    if (match) {
      const key = match[1].trim().toLowerCase();
      const value = match[2].trim();
      currentKey = key;
      if (key === "case id") {
        result.caseId = value;
      } else if (key === "owner task") {
        result.ownerTask = value;
      } else if (key === "status") {
        result.status = value;
      } else if (key === "priority") {
        result.priority = value;
      } else if (key === "current hypothesis") {
        result.currentHypothesis = value;
      } else if (key === "next action") {
        result.nextAction = value;
      } else if (key === "next wake") {
        result.nextWake = value;
      } else if (key === "stop condition") {
        result.stopCondition = value;
      }
      continue;
    }
    if (currentKey === "current hypothesis" && !result.currentHypothesis) {
      result.currentHypothesis = line.trim();
    }
  }

  return result;
}

export function updateActiveCaseStatus(filePath, nextStatus, extra = {}) {
  const existing = readTextIfExists(filePath);
  const lines = existing ? existing.split(/\r?\n/) : [];
  const replacements = new Map([
    ["Status:", `Status: ${nextStatus}`],
    ...(extra.nextAction ? [["Next action:", `Next action: ${extra.nextAction}`]] : []),
    ...(extra.nextWake ? [["Next wake:", `Next wake: ${extra.nextWake}`]] : []),
    ...(extra.currentHypothesis
      ? [["Current hypothesis:", `Current hypothesis: ${extra.currentHypothesis}`]]
      : []),
  ]);

  const seen = new Set();
  const nextLines = lines.map((line) => {
    for (const [prefix, replacement] of replacements.entries()) {
      if (line.startsWith(prefix)) {
        seen.add(prefix);
        return replacement;
      }
    }
    return line;
  });
  for (const [prefix, replacement] of replacements.entries()) {
    if (!seen.has(prefix)) {
      nextLines.push(replacement);
    }
  }
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${nextLines.join("\n").trimEnd()}\n`, "utf8");
}

export function newestMatchingFile(rootDir, predicate) {
  const matches = listFilesRecursive(rootDir)
    .map((relativePath) => {
      const absolutePath = path.join(rootDir, relativePath);
      return {
        relativePath,
        absolutePath,
        stat: fs.statSync(absolutePath),
      };
    })
    .filter((entry) => predicate(entry.relativePath));
  matches.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  return matches[0] ?? null;
}

export function resolveWorkspacePaths(workspaceDir) {
  return {
    workspaceDir,
    knowledgeDir: path.join(workspaceDir, "knowledge"),
    sourceDir: path.join(workspaceDir, "knowledge", "sources"),
    compiledDomainDir: path.join(workspaceDir, "knowledge", "domain", "compiled"),
    policiesDir: path.join(workspaceDir, "knowledge", "policies"),
    glossaryDir: path.join(workspaceDir, "knowledge", "glossary"),
    actionCatalogDir: path.join(workspaceDir, "knowledge", "action-catalog"),
    evalDir: path.join(workspaceDir, "knowledge", "evals"),
    routingDir: path.join(workspaceDir, "knowledge", "routing"),
    schemaDir: path.join(workspaceDir, "knowledge", "schemas"),
    forgeDir: path.join(workspaceDir, "forge"),
    casesActiveDir: path.join(workspaceDir, "forge", "cases", "active"),
    casesInboxDir: path.join(workspaceDir, "forge", "cases", "inbox"),
    candidateDir: path.join(workspaceDir, "forge", "candidates"),
    evalReportsDir: path.join(workspaceDir, "forge", "eval", "reports"),
    decisionsDir: path.join(workspaceDir, "forge", "decisions"),
    releasesDir: path.join(workspaceDir, "forge", "releases"),
    incidentsDir: path.join(workspaceDir, "forge", "incidents"),
    monitoringDir: path.join(workspaceDir, "forge", "monitoring"),
  };
}
