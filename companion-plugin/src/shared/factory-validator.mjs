import fs from "node:fs";
import path from "node:path";
import { validateSchema } from "./json-schema-lite.mjs";
import {
  ACTIVE_CASE_STATUSES,
  listFilesRecursive,
  parseActiveCaseFile,
  readJsonIfExists,
  resolveWorkspacePaths,
} from "./workspace.mjs";

const ARTIFACT_SUFFIX_TO_SCHEMA = new Map([
  [".candidate.json", "candidate-manifest.schema.json"],
  [".critic.json", "critic-scorecard.schema.json"],
  [".adversary.json", "adversary-report.schema.json"],
  [".decision.json", "promotion-decision.schema.json"],
  [".rollback.json", "rollback-plan.schema.json"],
  [".distill.json", "distillation-record.schema.json"],
  [".deployment.json", "deployment-manifest.schema.json"],
  [".rollout.json", "rollout-report.schema.json"],
  [".connector-health.json", "connector-health.schema.json"],
  [".incident.json", "incident-record.schema.json"],
]);

const STATUS_REQUIREMENTS = {
  triage: ["improvement-case"],
  building: ["improvement-case", "candidate-manifest"],
  validating: ["improvement-case", "candidate-manifest", "critic-scorecard", "adversary-report", "rollback-plan"],
  shadow: ["improvement-case", "candidate-manifest", "critic-scorecard", "adversary-report", "rollback-plan", "rollout-report"],
  canary: [
    "improvement-case",
    "candidate-manifest",
    "critic-scorecard",
    "adversary-report",
    "rollback-plan",
    "rollout-report",
    "deployment-manifest",
    "connector-health",
  ],
  live: [
    "improvement-case",
    "candidate-manifest",
    "critic-scorecard",
    "adversary-report",
    "rollback-plan",
    "rollout-report",
    "deployment-manifest",
    "connector-health",
  ],
  archived: ["promotion-decision", "distillation-record"],
  hold: ["improvement-case"],
  reject: ["promotion-decision"],
  rollback: ["rollback-plan", "incident-record"],
  incident: ["incident-record"],
};

function normalizeArtifactType(relativePath) {
  if (relativePath.startsWith("forge/cases/inbox/") && relativePath.endsWith(".json")) {
    return "improvement-case";
  }
  for (const [suffix] of ARTIFACT_SUFFIX_TO_SCHEMA.entries()) {
    if (relativePath.endsWith(suffix)) {
      if (suffix === ".connector-health.json") {
        return "connector-health";
      }
      if (suffix === ".incident.json") {
        return "incident-record";
      }
      return suffix
        .replace(/^\./, "")
        .replace(/\.json$/, "")
        .replace(/-/g, "-");
    }
  }
  return null;
}

function schemaFileForArtifact(relativePath) {
  if (relativePath.startsWith("forge/cases/inbox/") && relativePath.endsWith(".json")) {
    return "improvement-case.schema.json";
  }
  for (const [suffix, schemaFile] of ARTIFACT_SUFFIX_TO_SCHEMA.entries()) {
    if (relativePath.endsWith(suffix)) {
      return schemaFile;
    }
  }
  return null;
}

function canonicalArtifactType(relativePath) {
  if (relativePath.startsWith("forge/cases/inbox/") && relativePath.endsWith(".json")) {
    return "improvement-case";
  }
  if (relativePath.endsWith(".candidate.json")) {
    return "candidate-manifest";
  }
  if (relativePath.endsWith(".critic.json")) {
    return "critic-scorecard";
  }
  if (relativePath.endsWith(".adversary.json")) {
    return "adversary-report";
  }
  if (relativePath.endsWith(".decision.json")) {
    return "promotion-decision";
  }
  if (relativePath.endsWith(".rollback.json")) {
    return "rollback-plan";
  }
  if (relativePath.endsWith(".distill.json")) {
    return "distillation-record";
  }
  if (relativePath.endsWith(".deployment.json")) {
    return "deployment-manifest";
  }
  if (relativePath.endsWith(".rollout.json")) {
    return "rollout-report";
  }
  if (relativePath.endsWith(".connector-health.json")) {
    return "connector-health";
  }
  if (relativePath.endsWith(".incident.json")) {
    return "incident-record";
  }
  return normalizeArtifactType(relativePath);
}

function caseIdFromArtifact(value, relativePath) {
  if (value && typeof value === "object" && typeof value.caseId === "string") {
    return value.caseId;
  }
  const match = /^(CASE-[A-Za-z0-9-]+)/.exec(path.basename(relativePath));
  return match?.[1];
}

function collectArtifacts(paths) {
  const relativeFiles = listFilesRecursive(paths.workspaceDir);
  const artifacts = [];
  for (const relativePath of relativeFiles) {
    const schemaFile = schemaFileForArtifact(relativePath);
    if (!schemaFile) {
      continue;
    }
    const absolutePath = path.join(paths.workspaceDir, relativePath);
    const schema = readJsonIfExists(path.join(paths.schemaDir, schemaFile), null);
    const value = readJsonIfExists(absolutePath, null);
    const errors = schema && value ? validateSchema(schema, value) : [{ path: "$", message: "Missing schema or unreadable artifact" }];
    artifacts.push({
      relativePath,
      absolutePath,
      type: canonicalArtifactType(relativePath),
      caseId: caseIdFromArtifact(value, relativePath),
      ok: errors.length === 0,
      errors,
      value,
    });
  }
  return artifacts;
}

function buildArtifactIndex(artifacts) {
  const index = new Map();
  for (const artifact of artifacts) {
    if (!artifact.caseId) {
      continue;
    }
    const bucket = index.get(artifact.caseId) ?? new Map();
    bucket.set(artifact.type, artifact);
    index.set(artifact.caseId, bucket);
  }
  return index;
}

function hasGlobalArtifact(artifacts, type) {
  return artifacts.some((artifact) => artifact.type === type && artifact.ok);
}

function validateCompiledOutputs(paths, diagnostics) {
  const requiredOutputs = [
    path.join(paths.compiledDomainDir, "domain-pack.json"),
    path.join(paths.compiledDomainDir, "source-index.json"),
    path.join(paths.policiesDir, "policies.json"),
    path.join(paths.glossaryDir, "glossary.json"),
    path.join(paths.actionCatalogDir, "actions.json"),
    path.join(paths.evalDir, "regression-seeds.json"),
    path.join(paths.evalDir, "adversarial-seeds.json"),
    path.join(paths.evalDir, "shadow-fixtures.json"),
    path.join(paths.routingDir, "case-taxonomy.json"),
    path.join(paths.routingDir, "escalation-policy.json"),
    path.join(paths.routingDir, "metric-definitions.json"),
  ];

  for (const outputPath of requiredOutputs) {
    if (!fs.existsSync(outputPath)) {
      diagnostics.errors.push({
        code: "missing-compiled-output",
        path: path.relative(paths.workspaceDir, outputPath),
        message: "Missing required compiled factory output",
      });
    }
  }
}

function validateActiveCases(paths, artifacts, artifactIndex, diagnostics) {
  const activeFiles = listFilesRecursive(paths.casesActiveDir).filter((relativePath) =>
    relativePath.endsWith(".md") && !relativePath.startsWith("_template")
  );

  for (const relativePath of activeFiles) {
    const absolutePath = path.join(paths.casesActiveDir, relativePath);
    const activeCase = parseActiveCaseFile(absolutePath);
    const caseDiagnostics = {
      caseId: activeCase.caseId ?? path.basename(relativePath, ".md"),
      file: path.relative(paths.workspaceDir, absolutePath),
      status: activeCase.status ?? "unknown",
      ok: true,
      missingArtifacts: [],
      warnings: [],
    };

    if (!activeCase.caseId) {
      caseDiagnostics.ok = false;
      diagnostics.errors.push({
        code: "active-case-missing-id",
        path: caseDiagnostics.file,
        message: "Active case file is missing `Case id:`",
      });
      diagnostics.cases.push(caseDiagnostics);
      continue;
    }
    if (!ACTIVE_CASE_STATUSES.includes(activeCase.status ?? "")) {
      caseDiagnostics.ok = false;
      diagnostics.errors.push({
        code: "active-case-invalid-status",
        path: caseDiagnostics.file,
        message: `Unsupported case status: ${String(activeCase.status)}`,
      });
      diagnostics.cases.push(caseDiagnostics);
      continue;
    }

    const artifacts = artifactIndex.get(activeCase.caseId) ?? new Map();
    const requiredArtifacts = STATUS_REQUIREMENTS[activeCase.status] ?? [];
    for (const artifactType of requiredArtifacts) {
      const present =
        artifacts.has(artifactType) ||
        ((artifactType === "connector-health" || artifactType === "incident-record") &&
          hasGlobalArtifact(diagnostics.artifactsRaw, artifactType));
      if (!present) {
        caseDiagnostics.ok = false;
        caseDiagnostics.missingArtifacts.push(artifactType);
        diagnostics.errors.push({
          code: "missing-required-artifact",
          path: caseDiagnostics.file,
          message: `Missing required artifact \`${artifactType}\` for status \`${activeCase.status}\``,
        });
      }
    }

    const decision = artifacts.get("promotion-decision")?.value;
    if (activeCase.status === "live" && decision?.verdict !== "promote") {
      caseDiagnostics.ok = false;
      diagnostics.errors.push({
        code: "live-without-promote",
        path: caseDiagnostics.file,
        message: "Live cases require a promote decision artifact",
      });
    }

    const rollout = artifacts.get("rollout-report")?.value;
    if ((activeCase.status === "canary" || activeCase.status === "live") && rollout?.status !== "pass") {
      caseDiagnostics.ok = false;
      diagnostics.errors.push({
        code: "rollout-not-passing",
        path: caseDiagnostics.file,
        message: "Canary/live cases require a passing rollout report",
      });
    }

    diagnostics.cases.push(caseDiagnostics);
  }
}

export function validateFactoryWorkspace({ workspaceDir, tenantId = "default", fullAuto = true, killSwitch = false }) {
  const paths = resolveWorkspacePaths(workspaceDir);
  const diagnostics = {
    tenantId,
    fullAuto,
    killSwitch,
    generatedAt: new Date().toISOString(),
    ok: true,
    errors: [],
    warnings: [],
    cases: [],
    artifacts: [],
  };

  validateCompiledOutputs(paths, diagnostics);

  const artifacts = collectArtifacts(paths);
  diagnostics.artifactsRaw = artifacts;
  diagnostics.artifacts = artifacts.map((artifact) => ({
    path: artifact.relativePath,
    caseId: artifact.caseId,
    type: artifact.type,
    ok: artifact.ok,
    errors: artifact.errors,
  }));

  for (const artifact of artifacts) {
    if (!artifact.ok) {
      diagnostics.errors.push({
        code: "artifact-schema-invalid",
        path: artifact.relativePath,
        message: `${artifact.type} failed schema validation`,
        details: artifact.errors,
      });
    }
  }

  validateActiveCases(paths, artifacts, buildArtifactIndex(artifacts), diagnostics);

  if (killSwitch) {
    diagnostics.warnings.push({
      code: "kill-switch-active",
      path: "plugins.entries.vertical-agent-forge-control-plane.config.killSwitch",
      message: "Kill switch is active; auto-promotion must remain blocked.",
    });
  }

  diagnostics.ok = diagnostics.errors.length === 0;
  delete diagnostics.artifactsRaw;
  return diagnostics;
}
