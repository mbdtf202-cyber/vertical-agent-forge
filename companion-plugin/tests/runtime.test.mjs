import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createControlPlaneRuntime } from "../src/runtime.mjs";
import { resolveControlPlanePluginConfig } from "../src/config.mjs";

function createWorkspaceRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vaf-control-plane-"));
  const workspaceDir = path.join(root, "workspace");
  const stateDir = path.join(root, "state");
  fs.mkdirSync(path.join(workspaceDir, "knowledge", "schemas"), { recursive: true });
  fs.mkdirSync(path.join(workspaceDir, "knowledge", "domain", "compiled"), { recursive: true });
  fs.mkdirSync(path.join(workspaceDir, "knowledge", "policies"), { recursive: true });
  fs.mkdirSync(path.join(workspaceDir, "knowledge", "glossary"), { recursive: true });
  fs.mkdirSync(path.join(workspaceDir, "knowledge", "action-catalog"), { recursive: true });
  fs.mkdirSync(path.join(workspaceDir, "knowledge", "evals"), { recursive: true });
  fs.mkdirSync(path.join(workspaceDir, "knowledge", "routing"), { recursive: true });
  fs.mkdirSync(path.join(workspaceDir, "knowledge", "sources", "tickets"), { recursive: true });
  fs.mkdirSync(path.join(workspaceDir, "knowledge", "sources", "catalog"), { recursive: true });
  fs.mkdirSync(path.join(workspaceDir, "forge", "cases", "active"), { recursive: true });
  fs.mkdirSync(path.join(workspaceDir, "forge", "cases", "inbox"), { recursive: true });
  fs.mkdirSync(path.join(workspaceDir, "forge", "candidates"), { recursive: true });
  fs.mkdirSync(path.join(workspaceDir, "forge", "eval", "reports"), { recursive: true });
  fs.mkdirSync(path.join(workspaceDir, "forge", "releases"), { recursive: true });
  fs.mkdirSync(path.join(workspaceDir, "forge", "decisions"), { recursive: true });
  fs.mkdirSync(path.join(workspaceDir, "forge", "incidents"), { recursive: true });
  fs.mkdirSync(path.join(workspaceDir, "forge", "monitoring"), { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
  return { root, workspaceDir, stateDir };
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function seedSchemas(workspaceDir) {
  const schemaDir = path.join(workspaceDir, "knowledge", "schemas");
  const schemas = {
    "improvement-case.schema.json": {
      type: "object",
      required: ["caseId", "title", "severity", "source", "expectedBehavior", "observedBehavior", "impact"],
      additionalProperties: false,
      properties: {
        caseId: { type: "string" },
        title: { type: "string" },
        severity: { enum: ["low", "medium", "high", "critical"] },
        source: { enum: ["user", "operator", "monitor", "regression", "adversary"] },
        expectedBehavior: { type: "string" },
        observedBehavior: { type: "string" },
        impact: { type: "string" }
      }
    },
    "candidate-manifest.schema.json": {
      type: "object",
      required: ["caseId", "candidateId", "hypothesis", "changes", "expectedWin", "knownRisks"],
      additionalProperties: false,
      properties: {
        caseId: { type: "string" },
        candidateId: { type: "string" },
        hypothesis: { type: "string" },
        changes: { type: "array", items: { type: "string" } },
        expectedWin: { type: "string" },
        knownRisks: { type: "array", items: { type: "string" } }
      }
    },
    "critic-scorecard.schema.json": {
      type: "object",
      required: ["caseId", "candidateId", "scores", "summary", "shipBlockers"],
      additionalProperties: false,
      properties: {
        caseId: { type: "string" },
        candidateId: { type: "string" },
        scores: {
          type: "object",
          required: ["taskSuccess", "clarity", "consistency", "regressionRisk", "safetyFit", "maintainability"],
          additionalProperties: false,
          properties: {
            taskSuccess: { type: "integer", minimum: 1, maximum: 5 },
            clarity: { type: "integer", minimum: 1, maximum: 5 },
            consistency: { type: "integer", minimum: 1, maximum: 5 },
            regressionRisk: { type: "integer", minimum: 1, maximum: 5 },
            safetyFit: { type: "integer", minimum: 1, maximum: 5 },
            maintainability: { type: "integer", minimum: 1, maximum: 5 }
          }
        },
        summary: { type: "string" },
        shipBlockers: { type: "array", items: { type: "string" } }
      }
    },
    "adversary-report.schema.json": {
      type: "object",
      required: ["caseId", "candidateId", "summary", "findings"],
      additionalProperties: false,
      properties: {
        caseId: { type: "string" },
        candidateId: { type: "string" },
        summary: { type: "string" },
        findings: { type: "array", items: { type: "object" } }
      }
    },
    "promotion-decision.schema.json": {
      type: "object",
      required: ["caseId", "candidateId", "verdict", "reason", "conditions"],
      additionalProperties: false,
      properties: {
        caseId: { type: "string" },
        candidateId: { type: "string" },
        verdict: { enum: ["promote", "hold", "reject", "rollback"] },
        reason: { type: "string" },
        conditions: { type: "array", items: { type: "string" } }
      }
    },
    "rollback-plan.schema.json": {
      type: "object",
      required: ["caseId", "candidateId", "triggerSignals", "revertAction", "followupCaseAction"],
      additionalProperties: false,
      properties: {
        caseId: { type: "string" },
        candidateId: { type: "string" },
        triggerSignals: { type: "array", items: { type: "string" } },
        revertAction: { type: "string" },
        followupCaseAction: { type: "string" }
      }
    },
    "distillation-record.schema.json": {
      type: "object",
      required: ["caseId", "candidateId", "assetsUpdated", "summary"],
      additionalProperties: false,
      properties: {
        caseId: { type: "string" },
        candidateId: { type: "string" },
        assetsUpdated: { type: "array", items: { type: "string" } },
        summary: { type: "string" }
      }
    },
    "deployment-manifest.schema.json": {
      type: "object",
      required: ["tenantId", "caseId", "candidateId", "stage", "deployedAt", "mode"],
      additionalProperties: false,
      properties: {
        tenantId: { type: "string" },
        caseId: { type: "string" },
        candidateId: { type: "string" },
        stage: { enum: ["shadow", "canary", "live", "rollback"] },
        deployedAt: { type: "string" },
        mode: { enum: ["full-auto", "best-effort"] }
      }
    },
    "rollout-report.schema.json": {
      type: "object",
      required: ["tenantId", "caseId", "candidateId", "stage", "status", "metrics", "recordedAt"],
      additionalProperties: false,
      properties: {
        tenantId: { type: "string" },
        caseId: { type: "string" },
        candidateId: { type: "string" },
        stage: { enum: ["shadow", "canary", "live"] },
        status: { enum: ["pass", "fail"] },
        metrics: { type: "array", items: { type: "object" } },
        recordedAt: { type: "string" }
      }
    },
    "connector-health.schema.json": {
      type: "object",
      required: ["tenantId", "checkedAt", "snapshots"],
      additionalProperties: false,
      properties: {
        tenantId: { type: "string" },
        checkedAt: { type: "string" },
        snapshots: { type: "array", items: { type: "object" } }
      }
    },
    "incident-record.schema.json": {
      type: "object",
      required: ["tenantId", "incidentId", "caseId", "severity", "status", "trigger", "createdAt"],
      additionalProperties: false,
      properties: {
        tenantId: { type: "string" },
        incidentId: { type: "string" },
        caseId: { type: "string" },
        severity: { enum: ["low", "medium", "high", "critical"] },
        status: { enum: ["open", "resolved"] },
        trigger: { type: "string" },
        createdAt: { type: "string" }
      }
    }
  };
  for (const [name, schema] of Object.entries(schemas)) {
    writeJson(path.join(schemaDir, name), schema);
  }
}

function seedCompiledOutputs(workspaceDir) {
  writeJson(path.join(workspaceDir, "knowledge", "domain", "compiled", "domain-pack.json"), { tenantId: "default" });
  writeJson(path.join(workspaceDir, "knowledge", "domain", "compiled", "source-index.json"), { files: [] });
  writeJson(path.join(workspaceDir, "knowledge", "policies", "policies.json"), { policies: [] });
  writeJson(path.join(workspaceDir, "knowledge", "glossary", "glossary.json"), { terms: [] });
  writeJson(path.join(workspaceDir, "knowledge", "action-catalog", "actions.json"), { actions: [] });
  writeJson(path.join(workspaceDir, "knowledge", "evals", "regression-seeds.json"), { cases: [] });
  writeJson(path.join(workspaceDir, "knowledge", "evals", "adversarial-seeds.json"), { cases: [] });
  writeJson(path.join(workspaceDir, "knowledge", "evals", "shadow-fixtures.json"), { cases: [] });
  writeJson(path.join(workspaceDir, "knowledge", "routing", "case-taxonomy.json"), { categories: [] });
  writeJson(path.join(workspaceDir, "knowledge", "routing", "escalation-policy.json"), { rules: [] });
  writeJson(path.join(workspaceDir, "knowledge", "routing", "metric-definitions.json"), { metrics: [] });
}

function seedValidWorkspace(workspaceDir) {
  seedSchemas(workspaceDir);
  seedCompiledOutputs(workspaceDir);
  writeJson(path.join(workspaceDir, "knowledge", "sources", "tickets", "historical-tickets.json"), []);
  writeJson(path.join(workspaceDir, "knowledge", "sources", "catalog", "plans.json"), { plans: [] });
  writeJson(path.join(workspaceDir, "forge", "cases", "inbox", "CASE-20260317-001.case.json"), {
    caseId: "CASE-20260317-001",
    title: "Billing mismatch",
    severity: "high",
    source: "user",
    expectedBehavior: "Return accurate plan change explanation",
    observedBehavior: "Returned stale billing explanation",
    impact: "User confusion"
  });
  fs.writeFileSync(
    path.join(workspaceDir, "forge", "cases", "active", "CASE-20260317-001.md"),
    `# Active Improvement Case

Case id: CASE-20260317-001
Owner task: forge-active-improvement-loop
Status: live
Priority: high

Current hypothesis: tighten billing explanation and plan lookup

Next action: observe canary
Next wake: 2026-03-18T00:00:00.000Z
Stop condition: live metrics stay healthy
`,
    "utf8",
  );
  writeJson(path.join(workspaceDir, "forge", "candidates", "CASE-20260317-001-v1.candidate.json"), {
    caseId: "CASE-20260317-001",
    candidateId: "CASE-20260317-001-v1",
    hypothesis: "Compile billing rules and expose plan lookup",
    changes: ["knowledge/policies/policies.json", "knowledge/action-catalog/actions.json"],
    expectedWin: "Lower billing explanation errors",
    knownRisks: ["Needs plan table freshness"]
  });
  writeJson(path.join(workspaceDir, "forge", "eval", "reports", "CASE-20260317-001-v1.critic.json"), {
    caseId: "CASE-20260317-001",
    candidateId: "CASE-20260317-001-v1",
    scores: {
      taskSuccess: 5,
      clarity: 4,
      consistency: 5,
      regressionRisk: 4,
      safetyFit: 5,
      maintainability: 4
    },
    summary: "Strong candidate",
    shipBlockers: []
  });
  writeJson(path.join(workspaceDir, "forge", "eval", "reports", "CASE-20260317-001-v1.adversary.json"), {
    caseId: "CASE-20260317-001",
    candidateId: "CASE-20260317-001-v1",
    summary: "No critical breaks",
    findings: []
  });
  writeJson(path.join(workspaceDir, "forge", "decisions", "CASE-20260317-001-v1.decision.json"), {
    caseId: "CASE-20260317-001",
    candidateId: "CASE-20260317-001-v1",
    verdict: "promote",
    reason: "All gates passed",
    conditions: []
  });
  writeJson(path.join(workspaceDir, "forge", "releases", "CASE-20260317-001-v1.rollback.json"), {
    caseId: "CASE-20260317-001",
    candidateId: "CASE-20260317-001-v1",
    triggerSignals: ["canary error spike"],
    revertAction: "Restore prior skill bundle",
    followupCaseAction: "Reopen billing accuracy case"
  });
  writeJson(path.join(workspaceDir, "forge", "releases", "CASE-20260317-001-v1.distill.json"), {
    caseId: "CASE-20260317-001",
    candidateId: "CASE-20260317-001-v1",
    assetsUpdated: ["knowledge/policies/policies.json"],
    summary: "Persisted billing fix"
  });
  writeJson(path.join(workspaceDir, "forge", "releases", "CASE-20260317-001-v1.deployment.json"), {
    tenantId: "default",
    caseId: "CASE-20260317-001",
    candidateId: "CASE-20260317-001-v1",
    stage: "live",
    deployedAt: "2026-03-17T00:00:00.000Z",
    mode: "full-auto"
  });
  writeJson(path.join(workspaceDir, "forge", "eval", "reports", "CASE-20260317-001-v1.rollout.json"), {
    tenantId: "default",
    caseId: "CASE-20260317-001",
    candidateId: "CASE-20260317-001-v1",
    stage: "live",
    status: "pass",
    metrics: [
      { name: "shadow_hit_rate", value: 0.98, labels: { cohort: "billing" } },
      { name: "canary_error_rate", value: 0.01, labels: { cohort: "billing" } }
    ],
    recordedAt: "2026-03-17T00:10:00.000Z"
  });
  writeJson(path.join(workspaceDir, "forge", "monitoring", "default.connector-health.json"), {
    tenantId: "default",
    checkedAt: "2026-03-17T00:10:00.000Z",
    snapshots: []
  });
}

test("control-plane runtime returns snapshot, jobs, metrics, connectors, and incidents", async () => {
  const { root, workspaceDir, stateDir } = createWorkspaceRoot();
  seedValidWorkspace(workspaceDir);

  const runtime = createControlPlaneRuntime({
    config: resolveControlPlanePluginConfig({
      tenantId: "default",
      workspaceDir,
      fullAuto: true,
      refreshIntervalMs: 0,
    }),
    logger: {},
    pluginId: "vertical-agent-forge-control-plane",
    pluginVersion: "0.2.0",
  });

  try {
    await runtime.service.start({ workspaceDir, stateDir });

    const responses = {};
    for (const method of [
      "vertical-agent-forge.snapshot",
      "vertical-agent-forge.jobs",
      "vertical-agent-forge.metrics",
      "vertical-agent-forge.connectors",
      "vertical-agent-forge.incidents",
    ]) {
      await runtime.gatewayMethods[method]({
        respond(ok, payload, error) {
          responses[method] = { ok, payload, error };
        },
      });
    }

    assert.equal(responses["vertical-agent-forge.snapshot"].ok, true);
    assert.equal(responses["vertical-agent-forge.snapshot"].payload.summary.ok, true);
    assert.equal(responses["vertical-agent-forge.jobs"].payload.length, 1);
    assert.equal(responses["vertical-agent-forge.metrics"].payload.length, 2);
    assert.equal(responses["vertical-agent-forge.connectors"].payload.length, 3);
    assert.equal(Array.isArray(responses["vertical-agent-forge.incidents"].payload), true);
  } finally {
    await runtime.service.stop?.({ workspaceDir, stateDir });
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("control-plane validation fails when compiled outputs are missing", async () => {
  const { root, workspaceDir, stateDir } = createWorkspaceRoot();
  seedSchemas(workspaceDir);

  const runtime = createControlPlaneRuntime({
    config: resolveControlPlanePluginConfig({
      tenantId: "default",
      workspaceDir,
      fullAuto: true,
      refreshIntervalMs: 0,
    }),
    logger: {},
    pluginId: "vertical-agent-forge-control-plane",
    pluginVersion: "0.2.0",
  });

  try {
    await runtime.service.start({ workspaceDir, stateDir });
    let response = null;
    await runtime.gatewayMethods["vertical-agent-forge.validate"]({
      respond(ok, payload, error) {
        response = { ok, payload, error };
      },
    });
    assert.equal(response.ok, true);
    assert.equal(response.payload.ok, false);
    assert.match(JSON.stringify(response.payload.errors), /missing-compiled-output/);
  } finally {
    await runtime.service.stop?.({ workspaceDir, stateDir });
    fs.rmSync(root, { recursive: true, force: true });
  }
});
