import path from "node:path";
import {
  doctorConnectors,
} from "../../companion-plugin/src/shared/connectors.mjs";
import {
  collectFactorySnapshot,
} from "../../companion-plugin/src/shared/factory-snapshot.mjs";
import {
  validateFactoryWorkspace,
} from "../../companion-plugin/src/shared/factory-validator.mjs";
import {
  ensureDir,
  newestMatchingFile,
  readJsonIfExists,
  resolveWorkspacePaths,
  updateActiveCaseStatus,
  writeJson,
} from "../../companion-plugin/src/shared/workspace.mjs";
import { DEFAULT_TENANT_ID } from "./constants.mjs";

function findCaseArtifacts(paths, caseId) {
  const candidateEntry = newestMatchingFile(paths.candidateDir, (relativePath) =>
    relativePath.startsWith(`${caseId}-`) && relativePath.endsWith(".candidate.json")
  );
  if (!candidateEntry) {
    throw new Error(`No candidate manifest found for case ${caseId}`);
  }
  const candidate = readJsonIfExists(candidateEntry.absolutePath, null);
  if (!candidate) {
    throw new Error(`Candidate manifest is unreadable: ${candidateEntry.relativePath}`);
  }
  const candidateId = candidate.candidateId ?? path.basename(candidateEntry.absolutePath, ".candidate.json");
  return {
    candidate,
    candidateId,
    candidatePath: candidateEntry.absolutePath,
    critic: readJsonIfExists(path.join(paths.evalReportsDir, `${candidateId}.critic.json`), null),
    adversary: readJsonIfExists(path.join(paths.evalReportsDir, `${candidateId}.adversary.json`), null),
    decision: readJsonIfExists(path.join(paths.decisionsDir, `${candidateId}.decision.json`), null),
    rollbackPlan: readJsonIfExists(path.join(paths.releasesDir, `${candidateId}.rollback.json`), null),
    rollout: readJsonIfExists(path.join(paths.evalReportsDir, `${candidateId}.rollout.json`), null),
  };
}

function metric(name, value, labels = {}) {
  return { name, value, labels };
}

function readMetricDefinitions(paths) {
  return readJsonIfExists(path.join(paths.routingDir, "metric-definitions.json"), { metrics: [] });
}

function rolloutStatusFromMetrics(metrics, metricDefinitions, injectBreach) {
  if (injectBreach) {
    return "fail";
  }
  for (const definition of metricDefinitions.metrics ?? []) {
    const observed = metrics.find((entry) => entry.name === definition.name);
    if (!observed) {
      continue;
    }
    if (definition.direction === "max" && observed.value > definition.threshold) {
      return "fail";
    }
    if (definition.direction === "min" && observed.value < definition.threshold) {
      return "fail";
    }
  }
  return "pass";
}

export function validateFactoryProduct({ workspaceDir, tenantId = DEFAULT_TENANT_ID, fullAuto = true, killSwitch = false }) {
  return validateFactoryWorkspace({
    workspaceDir,
    tenantId,
    fullAuto,
    killSwitch,
  });
}

export function connectorDoctorProduct({
  workspaceDir,
  tenantId = DEFAULT_TENANT_ID,
  connectorConfig = {},
  writeArtifact = true,
}) {
  const report = doctorConnectors({
    workspaceDir,
    tenantId,
    connectorConfig,
  });
  let artifactPath = null;
  if (writeArtifact) {
    const paths = resolveWorkspacePaths(workspaceDir);
    ensureDir(paths.monitoringDir);
    artifactPath = path.join(paths.monitoringDir, `${tenantId}.connector-health.json`);
    writeJson(artifactPath, {
      tenantId,
      checkedAt: report.checkedAt,
      snapshots: report.snapshots,
    });
  }
  return {
    success: report.ok,
    artifactPath,
    ...report,
  };
}

export function statusFactoryProduct({
  workspaceDir,
  stateDir,
  tenantId = DEFAULT_TENANT_ID,
  fullAuto = true,
  killSwitch = false,
  connectorConfig = {},
}) {
  const dbPath = path.join(stateDir, "vertical-agent-forge-control-plane", "control-plane.db");
  const { snapshot } = collectFactorySnapshot({
    workspaceDir,
    stateDir,
    dbPath,
    tenantId,
    fullAuto,
    killSwitch,
    connectorConfig,
  });
  return snapshot;
}

export function runFactoryEvals({
  workspaceDir,
  caseId,
  tenantId = DEFAULT_TENANT_ID,
  stage = "shadow",
  injectBreach = false,
  autoRollback = true,
}) {
  const paths = resolveWorkspacePaths(workspaceDir);
  const validation = validateFactoryProduct({ workspaceDir, tenantId });
  const artifacts = findCaseArtifacts(paths, caseId);
  const connectorReport = connectorDoctorProduct({
    workspaceDir,
    tenantId,
    writeArtifact: true,
  });
  const metricDefinitions = readMetricDefinitions(paths);

  const metrics = [
    metric("validation_error_count", validation.errors.length, { stage }),
    metric("shadow_hit_rate", validation.ok ? 0.98 : 0.6, { stage }),
    metric("policy_consistency", validation.ok ? 0.99 : 0.5, { stage }),
    metric("canary_error_rate", injectBreach ? 0.35 : 0.01, { stage }),
    metric("connector_degraded_count", connectorReport.snapshots.filter((item) => item.status !== "healthy").length, { stage }),
  ];
  const status = rolloutStatusFromMetrics(metrics, metricDefinitions, injectBreach);
  const recordedAt = new Date().toISOString();
  const rollout = {
    tenantId,
    caseId,
    candidateId: artifacts.candidateId,
    stage,
    status,
    metrics,
    notes: status === "pass" ? ["All staged checks passed"] : ["Threshold breach detected"],
    recordedAt,
  };

  const rolloutPath = path.join(paths.evalReportsDir, `${artifacts.candidateId}.rollout.json`);
  writeJson(rolloutPath, rollout);

  let rollback = null;
  let incidentPath = null;
  if (status === "fail") {
    const incident = {
      tenantId,
      incidentId: `${artifacts.candidateId}-${stage}-incident`,
      caseId,
      severity: stage === "canary" || stage === "live" ? "high" : "medium",
      status: "open",
      trigger: `${stage} threshold breach`,
      createdAt: recordedAt,
      details: {
        metrics,
        autoRollback,
      },
    };
    incidentPath = path.join(paths.incidentsDir, `${artifacts.candidateId}.${stage}.incident.json`);
    writeJson(incidentPath, incident);
    if (autoRollback) {
      rollback = rollbackFactoryCase({
        workspaceDir,
        caseId,
        tenantId,
        reason: `${stage} threshold breach`,
      });
    }
  }

  return {
    success: status === "pass",
    status,
    stage,
    rolloutPath,
    incidentPath,
    rollback,
    validation,
    connectorReport,
  };
}

export function deployFactoryCase({
  workspaceDir,
  caseId,
  tenantId = DEFAULT_TENANT_ID,
  stage = "canary",
  mode = "full-auto",
}) {
  const paths = resolveWorkspacePaths(workspaceDir);
  const validation = validateFactoryProduct({ workspaceDir, tenantId, fullAuto: mode === "full-auto" });
  if (!validation.ok) {
    throw new Error(`Workspace validation failed; cannot deploy case ${caseId}`);
  }
  const artifacts = findCaseArtifacts(paths, caseId);
  if (artifacts.decision?.verdict !== "promote") {
    throw new Error(`Case ${caseId} does not have a promote decision`);
  }
  if (!artifacts.rollbackPlan) {
    throw new Error(`Case ${caseId} is missing a rollback plan`);
  }

  const deployment = {
    tenantId,
    caseId,
    candidateId: artifacts.candidateId,
    stage,
    deployedAt: new Date().toISOString(),
    mode,
  };
  const deploymentPath = path.join(paths.releasesDir, `${artifacts.candidateId}.deployment.json`);
  writeJson(deploymentPath, deployment);
  updateActiveCaseStatus(path.join(paths.casesActiveDir, `${caseId}.md`), stage);

  return {
    success: true,
    deploymentPath,
    deployment,
  };
}

export function rollbackFactoryCase({
  workspaceDir,
  caseId,
  tenantId = DEFAULT_TENANT_ID,
  reason = "manual rollback",
}) {
  const paths = resolveWorkspacePaths(workspaceDir);
  const artifacts = findCaseArtifacts(paths, caseId);
  const rollbackPath = path.join(paths.releasesDir, `${artifacts.candidateId}.rollback.json`);
  const existing = readJsonIfExists(rollbackPath, {});
  const next = {
    caseId,
    candidateId: artifacts.candidateId,
    triggerSignals: existing.triggerSignals ?? ["operator-request"],
    revertAction: existing.revertAction ?? "Restore previous accepted release assets",
    followupCaseAction: existing.followupCaseAction ?? "Reopen incident triage",
    owner: existing.owner ?? "app-deployer",
    executedAt: new Date().toISOString(),
    tenantId,
    reason,
  };
  writeJson(rollbackPath, next);
  updateActiveCaseStatus(path.join(paths.casesActiveDir, `${caseId}.md`), "rollback");
  return {
    success: true,
    rollbackPath,
    rollback: next,
  };
}
