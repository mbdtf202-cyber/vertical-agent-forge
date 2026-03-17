import fs from "node:fs";
import path from "node:path";
import {
  ensureDir,
  listFilesRecursive,
  readJsonIfExists,
  readTextIfExists,
  resolveWorkspacePaths,
  writeJson,
} from "../../companion-plugin/src/shared/workspace.mjs";

function readStructuredSource(filePath) {
  if (filePath.endsWith(".json")) {
    return readJsonIfExists(filePath, null);
  }
  return {
    body: readTextIfExists(filePath, ""),
  };
}

function toSummary(text, maxLength = 240) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function collectSourcesByKind(sourceDir) {
  const grouped = new Map();
  for (const relativePath of listFilesRecursive(sourceDir)) {
    const absolutePath = path.join(sourceDir, relativePath);
    const [kind = "misc"] = relativePath.split(path.sep);
    const entry = {
      kind,
      relativePath,
      absolutePath,
      value: readStructuredSource(absolutePath),
    };
    const bucket = grouped.get(kind) ?? [];
    bucket.push(entry);
    grouped.set(kind, bucket);
  }
  return grouped;
}

function flattenArraySources(entries) {
  const flattened = [];
  for (const entry of entries ?? []) {
    if (Array.isArray(entry.value)) {
      flattened.push(...entry.value);
      continue;
    }
    if (entry.value && Array.isArray(entry.value.items)) {
      flattened.push(...entry.value.items);
      continue;
    }
    if (entry.value && typeof entry.value === "object" && Array.isArray(entry.value.entries)) {
      flattened.push(...entry.value.entries);
      continue;
    }
    if (entry.value && typeof entry.value === "object") {
      flattened.push({
        sourcePath: entry.relativePath,
        ...entry.value,
      });
      continue;
    }
    flattened.push({
      sourcePath: entry.relativePath,
      body: String(entry.value ?? ""),
    });
  }
  return flattened;
}

function compileDomainPack(params) {
  const domainDocs = listFilesRecursive(path.join(params.workspaceDir, "knowledge", "domain"))
    .filter((relativePath) => !relativePath.startsWith(`compiled${path.sep}`))
    .map((relativePath) => {
      const absolutePath = path.join(params.workspaceDir, "knowledge", "domain", relativePath);
      return {
        relativePath: path.join("knowledge", "domain", relativePath),
        body: readTextIfExists(absolutePath, ""),
      };
    });

  return {
    tenantId: params.tenantId,
    compiledAt: new Date().toISOString(),
    documents: domainDocs.map((entry) => ({
      path: entry.relativePath,
      summary: toSummary(entry.body),
    })),
    sourceKinds: [...params.sources.keys()].sort(),
  };
}

function compileSourceIndex(params) {
  const files = [];
  for (const [kind, entries] of params.sources.entries()) {
    for (const entry of entries) {
      const text =
        typeof entry.value?.body === "string"
          ? entry.value.body
          : JSON.stringify(entry.value);
      files.push({
        kind,
        path: entry.relativePath,
        summary: toSummary(text),
      });
    }
  }
  return {
    tenantId: params.tenantId,
    compiledAt: new Date().toISOString(),
    files,
  };
}

export function compileFactoryWorkspace({ workspaceDir, tenantId = "default" }) {
  const paths = resolveWorkspacePaths(workspaceDir);
  ensureDir(paths.compiledDomainDir);
  ensureDir(paths.policiesDir);
  ensureDir(paths.glossaryDir);
  ensureDir(paths.actionCatalogDir);
  ensureDir(paths.evalDir);
  ensureDir(paths.routingDir);

  const sources = collectSourcesByKind(paths.sourceDir);
  const policies = flattenArraySources(sources.get("policies"));
  const glossary = flattenArraySources(sources.get("glossary"));
  const actions = flattenArraySources(sources.get("actions"));
  const evalSeeds = flattenArraySources(sources.get("evals"));
  const routing = flattenArraySources(sources.get("routing"));

  const regressionSeeds = evalSeeds.filter((entry) => entry.type === "regression" || entry.kind === "regression");
  const adversarialSeeds = evalSeeds.filter((entry) => entry.type === "adversarial" || entry.kind === "adversarial");
  const shadowFixtures = evalSeeds.filter((entry) => entry.type === "shadow" || entry.kind === "shadow");
  const caseTaxonomy = routing.find((entry) => Array.isArray(entry.categories)) ?? { categories: [] };
  const escalationPolicy = routing.find((entry) => Array.isArray(entry.rules) || Array.isArray(entry.escalations)) ?? { rules: [] };
  const metricDefinitions = routing.find((entry) => Array.isArray(entry.metrics)) ?? { metrics: [] };

  const outputs = {
    "knowledge/domain/compiled/domain-pack.json": compileDomainPack({ workspaceDir, tenantId, sources }),
    "knowledge/domain/compiled/source-index.json": compileSourceIndex({ tenantId, sources }),
    "knowledge/policies/policies.json": {
      tenantId,
      compiledAt: new Date().toISOString(),
      policies,
    },
    "knowledge/glossary/glossary.json": {
      tenantId,
      compiledAt: new Date().toISOString(),
      terms: glossary,
    },
    "knowledge/action-catalog/actions.json": {
      tenantId,
      compiledAt: new Date().toISOString(),
      actions,
    },
    "knowledge/evals/regression-seeds.json": {
      tenantId,
      compiledAt: new Date().toISOString(),
      cases: regressionSeeds,
    },
    "knowledge/evals/adversarial-seeds.json": {
      tenantId,
      compiledAt: new Date().toISOString(),
      cases: adversarialSeeds,
    },
    "knowledge/evals/shadow-fixtures.json": {
      tenantId,
      compiledAt: new Date().toISOString(),
      cases: shadowFixtures,
    },
    "knowledge/routing/case-taxonomy.json": {
      tenantId,
      compiledAt: new Date().toISOString(),
      categories: caseTaxonomy.categories ?? [],
    },
    "knowledge/routing/escalation-policy.json": {
      tenantId,
      compiledAt: new Date().toISOString(),
      rules: escalationPolicy.rules ?? escalationPolicy.escalations ?? [],
    },
    "knowledge/routing/metric-definitions.json": {
      tenantId,
      compiledAt: new Date().toISOString(),
      metrics: metricDefinitions.metrics ?? [],
    },
  };

  for (const [relativePath, value] of Object.entries(outputs)) {
    writeJson(path.join(workspaceDir, relativePath), value);
  }

  return {
    success: true,
    tenantId,
    workspaceDir,
    outputs: Object.keys(outputs).sort(),
    sourceKinds: [...sources.keys()].sort(),
  };
}

export function ingestFactorySources({ workspaceDir, fromPath, kind }) {
  const paths = resolveWorkspacePaths(workspaceDir);
  if (!fromPath || !fs.existsSync(fromPath)) {
    throw new Error(`ingest requires an existing --from path: ${String(fromPath)}`);
  }
  ensureDir(paths.sourceDir);

  const sourceStat = fs.statSync(fromPath);
  const targetRoot = kind ? path.join(paths.sourceDir, kind) : paths.sourceDir;
  ensureDir(targetRoot);
  const targetPath = path.join(targetRoot, path.basename(fromPath));

  fs.cpSync(fromPath, targetPath, {
    recursive: sourceStat.isDirectory(),
    dereference: false,
    force: true,
  });

  return {
    success: true,
    workspaceDir,
    ingestedFrom: fromPath,
    ingestedTo: targetPath,
    kind: kind ?? null,
  };
}
