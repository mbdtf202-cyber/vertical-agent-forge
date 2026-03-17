import path from "node:path";
import {
  listConnectorSnapshots,
  listIncidents,
  listJobs,
  listMetrics,
  openControlPlaneDb,
  writeControlPlaneSnapshot,
} from "./control-plane-db.mjs";
import { doctorConnectors } from "./connectors.mjs";
import { validateFactoryWorkspace } from "./factory-validator.mjs";
import { listFilesRecursive, parseActiveCaseFile, readJsonIfExists, resolveWorkspacePaths } from "./workspace.mjs";

function buildJobs(paths, validatorReport) {
  const activeFiles = listFilesRecursive(paths.casesActiveDir).filter((relativePath) =>
    relativePath.endsWith(".md") && !relativePath.startsWith("_template")
  );
  return activeFiles.map((relativePath) => {
    const absolutePath = path.join(paths.casesActiveDir, relativePath);
    const activeCase = parseActiveCaseFile(absolutePath);
    return {
      jobId: `${validatorReport.tenantId}:${activeCase.caseId ?? relativePath}:${activeCase.status ?? "unknown"}`,
      caseId: activeCase.caseId,
      stage: activeCase.status ?? "unknown",
      status: activeCase.status === "incident" ? "degraded" : "ready",
      updatedAt: new Date().toISOString(),
      file: path.relative(paths.workspaceDir, absolutePath),
      nextWake: activeCase.nextWake,
    };
  });
}

function readRolloutMetrics(paths) {
  const rolloutFiles = listFilesRecursive(paths.evalReportsDir).filter((relativePath) =>
    relativePath.endsWith(".rollout.json")
  );
  const metrics = [];
  const canaries = [];
  for (const relativePath of rolloutFiles) {
    const value = readJsonIfExists(path.join(paths.evalReportsDir, relativePath), null);
    if (!value || typeof value !== "object") {
      continue;
    }
    const recordedAt = typeof value.recordedAt === "string" ? value.recordedAt : new Date().toISOString();
    const baseLabels = {
      caseId: value.caseId ?? "unknown",
      candidateId: value.candidateId ?? "unknown",
      stage: value.stage ?? "unknown",
    };
    if (Array.isArray(value.metrics)) {
      for (const metric of value.metrics) {
        metrics.push({
          metricId: `${baseLabels.caseId}:${metric.name}:${recordedAt}`,
          name: metric.name,
          value: Number(metric.value ?? 0),
          labels: { ...baseLabels, ...(metric.labels ?? {}) },
          recordedAt,
        });
      }
    }
    if (value.stage === "canary" || value.stage === "live") {
      canaries.push({
        releaseId: `${value.caseId}:${value.candidateId}:${value.stage}`,
        caseId: value.caseId,
        status: value.status,
        metrics: Array.isArray(value.metrics) ? value.metrics : [],
        observedAt: recordedAt,
      });
    }
  }
  return { metrics, canaries };
}

function readIncidents(paths) {
  const incidentFiles = listFilesRecursive(paths.incidentsDir).filter((relativePath) =>
    relativePath.endsWith(".incident.json")
  );
  return incidentFiles
    .map((relativePath) => readJsonIfExists(path.join(paths.incidentsDir, relativePath), null))
    .filter(Boolean);
}

export function collectFactorySnapshot(params) {
  const validatorReport = validateFactoryWorkspace({
    workspaceDir: params.workspaceDir,
    tenantId: params.tenantId,
    fullAuto: params.fullAuto,
    killSwitch: params.killSwitch,
  });
  const connectorReport = doctorConnectors({
    workspaceDir: params.workspaceDir,
    tenantId: params.tenantId,
    connectorConfig: params.connectorConfig,
    env: params.env,
  });
  const paths = resolveWorkspacePaths(params.workspaceDir);
  const { metrics, canaries } = readRolloutMetrics(paths);
  const incidents = readIncidents(paths);
  const snapshot = {
    available: true,
    tenantId: params.tenantId,
    workspaceDir: params.workspaceDir,
    stateDir: params.stateDir,
    dbPath: params.dbPath,
    fullAuto: params.fullAuto,
    killSwitch: params.killSwitch,
    generatedAt: new Date().toISOString(),
    validator: validatorReport,
    connectors: connectorReport.snapshots,
    jobs: buildJobs(paths, validatorReport),
    metrics,
    incidents,
    canaries,
    summary: {
      ok: validatorReport.ok && connectorReport.ok && !params.killSwitch,
      errorCount: validatorReport.errors.length,
      warningCount: validatorReport.warnings.length,
      connectorDegradedCount: connectorReport.snapshots.filter((item) => item.status !== "healthy").length,
      incidentCount: incidents.length,
      canaryCount: canaries.length,
    },
  };

  const db = openControlPlaneDb(params.dbPath);
  writeControlPlaneSnapshot(db, snapshot);
  return {
    snapshot,
    db,
  };
}

export function readControlPlaneViews({ dbPath, tenantId }) {
  const db = openControlPlaneDb(dbPath);
  return {
    jobs: listJobs(db, tenantId),
    metrics: listMetrics(db, tenantId),
    connectors: listConnectorSnapshots(db, tenantId),
    incidents: listIncidents(db, tenantId),
  };
}
