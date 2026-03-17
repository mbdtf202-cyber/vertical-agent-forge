import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  activateProduct,
  bootstrapProduct,
  compileProduct,
  doctorProduct,
  initDomainTemplate,
  installProduct,
  rollbackProduct,
  runEvalsProduct,
  uninstallProduct,
  upgradeProduct,
  validateProduct,
} from "../scripts/install.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function createEnvRoot(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const stateDir = path.join(root, ".openclaw");
  const configPath = path.join(stateDir, "openclaw.json");
  fs.mkdirSync(stateDir, { recursive: true });
  return {
    root,
    stateDir,
    configPath,
    env: {
      OPENCLAW_STATE_DIR: stateDir,
      OPENCLAW_CONFIG_PATH: configPath,
    },
  };
}

function writeConfig(configPath, value) {
  fs.writeFileSync(configPath, `${JSON.stringify(value, null, 2)}\n`);
}

function createOpenClawStub(root, params = {}) {
  const stubPath = path.join(root, "openclaw-stub.sh");
  const configMode = params.configMode ?? "success";
  const gatewayMode = params.gatewayMode ?? "success";
  const pluginMode = params.pluginMode ?? "success";
  const script = `#!/bin/sh
if [ "$1" = "config" ] && [ "$2" = "validate" ]; then
  if [ "${configMode}" = "success" ]; then
    echo '{"valid":true}'
    exit 0
  fi
  echo '{"valid":false}' >&2
  exit 1
fi
if [ "$1" = "gateway" ] && [ "$2" = "health" ]; then
  if [ "${gatewayMode}" = "success" ]; then
    echo '{"ok":true}'
    exit 0
  fi
  echo 'gateway unavailable' >&2
  exit 1
fi
if [ "$1" = "gateway" ] && [ "$2" = "call" ] && [ "$3" = "vertical-agent-forge.snapshot" ]; then
  if [ "${pluginMode}" = "success" ]; then
    echo '{"available":true,"summary":{"ok":true}}'
    exit 0
  fi
  echo '{"available":false,"summary":{"ok":false}}' >&2
  exit 1
fi
if [ "$1" = "gateway" ] && [ "$2" = "call" ] && [ "$3" = "agent" ]; then
  echo '{"runId":"forge-run-1","status":"accepted"}'
  exit 0
fi
printf 'stubbed openclaw %s\\n' "$*"
exit 0
`;
  fs.writeFileSync(stubPath, script, "utf8");
  fs.chmodSync(stubPath, 0o755);
  return stubPath;
}

function createProductRoot(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  for (const entry of ["kit", "companion-plugin", "src"]) {
    fs.cpSync(path.join(repoRoot, entry), path.join(root, entry), {
      recursive: true,
      dereference: false,
      force: true,
    });
  }
  return root;
}

function seedBaseConfig(configPath) {
  writeConfig(configPath, {
    agents: {
      defaults: {
        model: { primary: "openai/gpt-5.4" },
      },
    },
  });
}

test("installProduct installs plugin wiring, workspace assets, and expanded agent set", async () => {
  const { root, configPath, env } = createEnvRoot("vertical-agent-forge-install-");
  seedBaseConfig(configPath);
  const openclawBin = createOpenClawStub(root);

  try {
    const installed = installProduct({ env, openclawBin });
    assert.equal(installed.success, true);
    assert.equal(fs.existsSync(installed.workspaceDir), true);
    assert.equal(fs.existsSync(installed.toolkitDir), true);
    assert.equal(fs.existsSync(installed.pluginDir), true);
    assert.equal(fs.existsSync(path.join(installed.pluginDir, "openclaw.plugin.json")), true);

    const manifest = JSON.parse(fs.readFileSync(installed.manifestPath, "utf8"));
    assert.deepEqual(
      manifest.managedAgentIds.sort(),
      [
        "app-adversary",
        "app-archivist",
        "app-critic",
        "app-deployer",
        "app-domain-compiler",
        "app-evaluator",
        "app-forge",
        "app-main",
        "app-observer",
        "app-promoter",
        "app-worker",
      ],
    );

    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    assert.equal(config.plugins.enabled, true);
    assert.equal(config.plugins.load.paths.includes(path.join(installed.toolkitDir, "plugins")), true);
    assert.equal(config.plugins.entries["vertical-agent-forge-control-plane"].enabled, true);

    const doctor = doctorProduct({ env });
    assert.equal(doctor.exists.plugin, true);
    assert.equal(doctor.plugin.configured, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("bootstrapProduct seeds saas-support sources, compiles outputs, validates, and activates", async () => {
  const { root, configPath, env } = createEnvRoot("vertical-agent-forge-bootstrap-");
  seedBaseConfig(configPath);
  const openclawBin = createOpenClawStub(root);

  try {
    const bootstrapped = bootstrapProduct({
      env,
      openclawBin,
      domainTemplate: "saas-support",
    });
    assert.equal(bootstrapped.success, true);
    assert.equal(fs.existsSync(path.join(bootstrapped.install.workspaceDir, "knowledge", "sources", "policies", "billing-policy.json")), true);
    assert.equal(fs.existsSync(path.join(bootstrapped.install.workspaceDir, "knowledge", "domain", "compiled", "domain-pack.json")), true);
    assert.equal(bootstrapped.validate.success, true);
    assert.equal(bootstrapped.activation.success, true);
    assert.match(bootstrapped.activation.activation.stdout, /forge-run-1/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("activateProduct is strict by default and fails when gateway is unavailable", async () => {
  const { root, configPath, env } = createEnvRoot("vertical-agent-forge-activate-strict-gateway-");
  seedBaseConfig(configPath);
  const openclawBin = createOpenClawStub(root, { gatewayMode: "fail" });

  try {
    const installed = installProduct({ env, openclawBin });
    assert.equal(installed.success, true);
    initDomainTemplate({ env, domainTemplate: "saas-support" });
    compileProduct({ env });

    const activated = activateProduct({ env, openclawBin, skipInstall: true });
    assert.equal(activated.success, false);
    assert.match(activated.activation.stderr, /strict activation failed/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("activateProduct is strict by default and fails when plugin snapshot is unavailable", async () => {
  const { root, configPath, env } = createEnvRoot("vertical-agent-forge-activate-strict-plugin-");
  seedBaseConfig(configPath);
  const openclawBin = createOpenClawStub(root, { pluginMode: "fail" });

  try {
    const installed = installProduct({ env, openclawBin });
    assert.equal(installed.success, true);
    initDomainTemplate({ env, domainTemplate: "saas-support" });
    compileProduct({ env });

    const activated = activateProduct({ env, openclawBin, skipInstall: true });
    assert.equal(activated.success, false);
    assert.match(JSON.stringify(activated.pluginSnapshot), /available/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("activateProduct supports best-effort mode for degraded environments", async () => {
  const { root, configPath, env } = createEnvRoot("vertical-agent-forge-activate-best-effort-");
  seedBaseConfig(configPath);
  const openclawBin = createOpenClawStub(root, { gatewayMode: "fail" });

  try {
    const installed = installProduct({ env, openclawBin });
    assert.equal(installed.success, true);
    initDomainTemplate({ env, domainTemplate: "saas-support" });
    compileProduct({ env });

    const activated = activateProduct({ env, openclawBin, skipInstall: true, bestEffort: true });
    assert.equal(activated.success, true);
    assert.equal(activated.activation.status, null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("runEvalsProduct writes rollout evidence and auto-rolls back on breach", async () => {
  const { root, configPath, env } = createEnvRoot("vertical-agent-forge-evals-");
  seedBaseConfig(configPath);
  const openclawBin = createOpenClawStub(root);

  try {
    const bootstrapped = bootstrapProduct({
      env,
      openclawBin,
      domainTemplate: "saas-support",
    });
    assert.equal(bootstrapped.success, true);

    const workspaceDir = bootstrapped.install.workspaceDir;
    fs.mkdirSync(path.join(workspaceDir, "forge", "cases", "active"), { recursive: true });
    fs.writeFileSync(
      path.join(workspaceDir, "forge", "cases", "active", "CASE-20260317-001.md"),
      `# Active Improvement Case

Case id: CASE-20260317-001
Owner task: forge-active-improvement-loop
Status: validating
Priority: high

Current hypothesis: tighten billing rules

Next action: canary monitor
Next wake: 2026-03-18T00:00:00.000Z
Stop condition: canary healthy
`,
      "utf8",
    );
    fs.writeFileSync(
      path.join(workspaceDir, "forge", "candidates", "CASE-20260317-001-v1.candidate.json"),
      JSON.stringify({
        caseId: "CASE-20260317-001",
        candidateId: "CASE-20260317-001-v1",
        hypothesis: "tighten billing rules",
        changes: ["knowledge/policies/policies.json"],
        expectedWin: "better billing accuracy",
        knownRisks: [],
      }, null, 2),
    );
    fs.writeFileSync(
      path.join(workspaceDir, "forge", "eval", "reports", "CASE-20260317-001-v1.critic.json"),
      JSON.stringify({
        caseId: "CASE-20260317-001",
        candidateId: "CASE-20260317-001-v1",
        scores: {
          taskSuccess: 5,
          clarity: 5,
          consistency: 5,
          regressionRisk: 4,
          safetyFit: 5,
          maintainability: 4,
        },
        summary: "strong",
        strongestEvidence: [],
        weakestPoints: [],
        shipBlockers: [],
      }, null, 2),
    );
    fs.writeFileSync(
      path.join(workspaceDir, "forge", "eval", "reports", "CASE-20260317-001-v1.adversary.json"),
      JSON.stringify({
        caseId: "CASE-20260317-001",
        candidateId: "CASE-20260317-001-v1",
        summary: "no critical break",
        findings: [],
      }, null, 2),
    );
    fs.writeFileSync(
      path.join(workspaceDir, "forge", "decisions", "CASE-20260317-001-v1.decision.json"),
      JSON.stringify({
        caseId: "CASE-20260317-001",
        candidateId: "CASE-20260317-001-v1",
        verdict: "promote",
        reason: "all checks passed",
        conditions: [],
      }, null, 2),
    );
    fs.writeFileSync(
      path.join(workspaceDir, "forge", "releases", "CASE-20260317-001-v1.rollback.json"),
      JSON.stringify({
        caseId: "CASE-20260317-001",
        candidateId: "CASE-20260317-001-v1",
        triggerSignals: ["canary breach"],
        revertAction: "restore last accepted artifacts",
        followupCaseAction: "reopen triage",
      }, null, 2),
    );
    compileProduct({ env });

    const evalResult = runEvalsProduct({
      env,
      caseId: "CASE-20260317-001",
      stage: "canary",
      injectBreach: true,
    });
    assert.equal(evalResult.success, false);
    assert.equal(fs.existsSync(evalResult.rolloutPath), true);
    assert.equal(fs.existsSync(evalResult.incidentPath), true);
    assert.equal(fs.existsSync(evalResult.rollback.rollbackPath), true);

    const rollback = rollbackProduct({
      env,
      caseId: "CASE-20260317-001",
      reason: "post-breach cleanup",
    });
    assert.equal(rollback.success, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("upgradeProduct overwrites managed assets and preserves user runtime files", async () => {
  const { root, configPath, env } = createEnvRoot("vertical-agent-forge-upgrade-");
  seedBaseConfig(configPath);
  const openclawBin = createOpenClawStub(root);
  const productV1 = createProductRoot("vertical-agent-forge-product-v1-");
  const productV2 = createProductRoot("vertical-agent-forge-product-v2-");
  const relativeManagedFile = path.join("kit", "workspace", "skills", "forge-worker", "SKILL.md");
  fs.writeFileSync(path.join(productV1, relativeManagedFile), "worker skill v1\n");
  fs.writeFileSync(path.join(productV2, relativeManagedFile), "worker skill v2\n");

  try {
    const initial = installProduct({ env, openclawBin, productRoot: productV1 });
    assert.equal(initial.success, true);

    const runtimeDomainFile = path.join(initial.workspaceDir, "knowledge", "sources", "custom.md");
    const runtimeMemoryFile = path.join(initial.workspaceDir, "forge", "memory", "lesson.md");
    fs.writeFileSync(runtimeDomainFile, "user source\n");
    fs.writeFileSync(runtimeMemoryFile, "runtime memory\n");

    const managedTarget = path.join(initial.workspaceDir, "skills", "forge-worker", "SKILL.md");
    assert.equal(fs.readFileSync(managedTarget, "utf8"), "worker skill v1\n");

    const upgraded = upgradeProduct({ env, openclawBin, productRoot: productV2 });
    assert.equal(upgraded.success, true);
    assert.equal(fs.readFileSync(managedTarget, "utf8"), "worker skill v2\n");
    assert.equal(fs.readFileSync(runtimeDomainFile, "utf8"), "user source\n");
    assert.equal(fs.readFileSync(runtimeMemoryFile, "utf8"), "runtime memory\n");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(productV1, { recursive: true, force: true });
    fs.rmSync(productV2, { recursive: true, force: true });
  }
});

test("installProduct rolls back config and managed files when validation fails", async () => {
  const { root, stateDir, configPath, env } = createEnvRoot("vertical-agent-forge-rollback-");
  const originalConfig = {
    plugins: {
      enabled: false,
    },
    agents: {
      defaults: {
        model: { primary: "openai/gpt-5.4" },
      },
    },
  };
  writeConfig(configPath, originalConfig);

  const workspaceDir = path.join(stateDir, "workspaces", "vertical-agent-forge");
  const toolkitDir = path.join(stateDir, "toolkits", "vertical-agent-forge");
  fs.mkdirSync(path.join(workspaceDir, "skills", "forge-worker"), { recursive: true });
  fs.writeFileSync(path.join(workspaceDir, "skills", "forge-worker", "SKILL.md"), "old managed content\n");
  fs.mkdirSync(toolkitDir, { recursive: true });
  fs.writeFileSync(path.join(toolkitDir, "marker.txt"), "old toolkit\n");

  const openclawBin = createOpenClawStub(root, { configMode: "fail" });
  const productRoot = createProductRoot("vertical-agent-forge-product-fail-");
  fs.writeFileSync(
    path.join(productRoot, "kit", "workspace", "skills", "forge-worker", "SKILL.md"),
    "new managed content\n",
  );

  try {
    const installed = installProduct({ env, openclawBin, productRoot });
    assert.equal(installed.success, false);
    assert.equal(installed.rolledBack, true);

    const restoredConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
    assert.deepEqual(restoredConfig, originalConfig);
    assert.equal(
      fs.readFileSync(path.join(workspaceDir, "skills", "forge-worker", "SKILL.md"), "utf8"),
      "old managed content\n",
    );
    assert.equal(fs.readFileSync(path.join(toolkitDir, "marker.txt"), "utf8"), "old toolkit\n");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(productRoot, { recursive: true, force: true });
  }
});

test("uninstallProduct preserves workspace by default, restores config, and honors purge", async () => {
  const { root, configPath, env } = createEnvRoot("vertical-agent-forge-uninstall-");
  const initialConfig = {
    tools: {
      web: {
        search: {
          enabled: false,
          provider: "duck",
        },
      },
    },
    agents: {
      defaults: {
        model: { primary: "openai/gpt-5.4" },
      },
      list: [
        {
          id: "app-main",
          tools: { allow: ["read"] },
          identity: { name: "Original Main" },
        },
      ],
    },
  };
  writeConfig(configPath, initialConfig);
  const openclawBin = createOpenClawStub(root);

  try {
    const installed = installProduct({ env, openclawBin });
    assert.equal(installed.success, true);

    const configAfterInstall = JSON.parse(fs.readFileSync(configPath, "utf8"));
    configAfterInstall.tools.web.search.provider = "custom";
    writeConfig(configPath, configAfterInstall);

    const runtimeFile = path.join(installed.workspaceDir, "knowledge", "sources", "user-notes.md");
    fs.writeFileSync(runtimeFile, "keep me\n");

    const removed = uninstallProduct({ env, openclawBin });
    assert.equal(removed.success, true);
    assert.equal(removed.removedToolkit, true);
    assert.equal(removed.removedWorkspace, false);
    assert.equal(fs.existsSync(runtimeFile), true);
    assert.equal(removed.preservedConfigPaths.includes("tools.web"), true);

    const finalConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const restoredMain = finalConfig.agents.list.find((entry) => entry.id === "app-main");
    assert.equal(restoredMain.identity.name, "Original Main");
    assert.equal(finalConfig.tools.web.search.provider, "custom");
    assert.equal(finalConfig.plugins?.entries?.["vertical-agent-forge-control-plane"], undefined);

    const purged = uninstallProduct({ env, openclawBin, purgeWorkspace: true });
    assert.equal(purged.success, true);
    assert.equal(purged.removedWorkspace, true);
    assert.equal(fs.existsSync(installed.workspaceDir), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
