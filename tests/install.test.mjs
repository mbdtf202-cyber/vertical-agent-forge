import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  activateProduct,
  doctorProduct,
  installProduct,
  uninstallProduct,
  upgradeProduct,
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

function createOpenClawStub(root, mode = "success") {
  const stubPath = path.join(root, "openclaw-stub.sh");
  const script = `#!/bin/sh
if [ "$1" = "config" ] && [ "$2" = "validate" ]; then
  if [ "${mode}" = "success" ]; then
    echo '{"valid":true}'
    exit 0
  fi
  echo '{"valid":false}' >&2
  exit 1
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
  fs.cpSync(path.join(repoRoot, "kit"), path.join(root, "kit"), {
    recursive: true,
    dereference: false,
    force: true,
  });
  return root;
}

test("installProduct installs managed assets, writes manifest, and exposes packaged templates", async () => {
  const { root, configPath, env } = createEnvRoot("vertical-agent-forge-install-");
  writeConfig(configPath, {
    agents: {
      defaults: {
        model: { primary: "openai/gpt-5.4" },
      },
    },
  });
  const openclawBin = createOpenClawStub(root, "success");

  try {
    const installed = installProduct({ env, openclawBin });
    assert.equal(installed.success, true);
    assert.equal(fs.existsSync(installed.workspaceDir), true);
    assert.equal(fs.existsSync(installed.toolkitDir), true);
    assert.equal(fs.existsSync(installed.manifestPath), true);

    const manifest = JSON.parse(fs.readFileSync(installed.manifestPath, "utf8"));
    assert.deepEqual(
      manifest.managedAgentIds.sort(),
      ["app-adversary", "app-archivist", "app-critic", "app-forge", "app-main", "app-promoter", "app-worker"],
    );

    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const agentIds = new Set((config.agents?.list ?? []).map((entry) => entry.id));
    assert.equal(agentIds.has("app-main"), true);
    assert.equal(agentIds.has("app-forge"), true);
    assert.deepEqual(config.agents.defaults.subagents.model, { primary: "openai/gpt-5.4" });

    const doctor = doctorProduct({ env });
    assert.equal(doctor.exists.manifest, true);
    assert.deepEqual(doctor.domainTemplates, ["research-ops", "saas-support", "travel-concierge"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("activateProduct installs and skips runtime bootstrap when openclaw is unavailable", async () => {
  const { root, configPath, env } = createEnvRoot("vertical-agent-forge-activate-");
  writeConfig(configPath, {
    agents: {
      defaults: {
        model: { primary: "openai/gpt-5.4" },
      },
    },
  });

  try {
    const activated = activateProduct({ env, openclawBin: "__missing_openclaw__" });
    assert.equal(activated.success, true);
    assert.equal(fs.existsSync(activated.install.workspaceDir), true);
    assert.equal(activated.activation.status, null);
    assert.match(activated.activation.stderr, /(openclaw binary not found|ENOTDIR|ENOENT)/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("upgradeProduct overwrites managed assets and preserves user runtime files", async () => {
  const { root, configPath, env } = createEnvRoot("vertical-agent-forge-upgrade-");
  writeConfig(configPath, {
    agents: {
      defaults: {
        model: { primary: "openai/gpt-5.4" },
      },
    },
  });
  const openclawBin = createOpenClawStub(root, "success");
  const productV1 = createProductRoot("vertical-agent-forge-product-v1-");
  const productV2 = createProductRoot("vertical-agent-forge-product-v2-");
  const relativeManagedFile = path.join("kit", "workspace", "skills", "forge-worker", "SKILL.md");
  fs.writeFileSync(path.join(productV1, relativeManagedFile), "worker skill v1\n");
  fs.writeFileSync(path.join(productV2, relativeManagedFile), "worker skill v2\n");

  try {
    const initial = installProduct({ env, openclawBin, productRoot: productV1 });
    assert.equal(initial.success, true);

    const runtimeDomainFile = path.join(initial.workspaceDir, "knowledge", "domain", "custom.md");
    const runtimeMemoryFile = path.join(initial.workspaceDir, "forge", "memory", "lesson.md");
    fs.writeFileSync(runtimeDomainFile, "user domain\n");
    fs.writeFileSync(runtimeMemoryFile, "runtime memory\n");

    const managedTarget = path.join(initial.workspaceDir, "skills", "forge-worker", "SKILL.md");
    assert.equal(fs.readFileSync(managedTarget, "utf8"), "worker skill v1\n");

    const upgraded = upgradeProduct({ env, openclawBin, productRoot: productV2 });
    assert.equal(upgraded.success, true);
    assert.equal(fs.readFileSync(managedTarget, "utf8"), "worker skill v2\n");
    assert.equal(fs.readFileSync(runtimeDomainFile, "utf8"), "user domain\n");
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
    },
  };
  writeConfig(configPath, originalConfig);

  const workspaceDir = path.join(stateDir, "workspaces", "vertical-agent-forge");
  const toolkitDir = path.join(stateDir, "toolkits", "vertical-agent-forge");
  fs.mkdirSync(path.join(workspaceDir, "skills", "forge-worker"), { recursive: true });
  fs.writeFileSync(path.join(workspaceDir, "skills", "forge-worker", "SKILL.md"), "old managed content\n");
  fs.mkdirSync(toolkitDir, { recursive: true });
  fs.writeFileSync(path.join(toolkitDir, "marker.txt"), "old toolkit\n");

  const openclawBin = createOpenClawStub(root, "fail");
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
  const openclawBin = createOpenClawStub(root, "success");

  try {
    const installed = installProduct({ env, openclawBin });
    assert.equal(installed.success, true);

    const configAfterInstall = JSON.parse(fs.readFileSync(configPath, "utf8"));
    configAfterInstall.tools.web.search.provider = "custom";
    writeConfig(configPath, configAfterInstall);

    const runtimeFile = path.join(installed.workspaceDir, "knowledge", "domain", "user-notes.md");
    fs.writeFileSync(runtimeFile, "keep me\n");

    const removed = uninstallProduct({ env, openclawBin });
    assert.equal(removed.success, true);
    assert.equal(removed.removedToolkit, true);
    assert.equal(removed.removedWorkspace, false);
    assert.equal(fs.existsSync(runtimeFile), true);
    assert.deepEqual(removed.preservedConfigPaths, ["tools.web"]);

    const finalConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const restoredMain = finalConfig.agents.list.find((entry) => entry.id === "app-main");
    assert.equal(restoredMain.identity.name, "Original Main");
    assert.equal(finalConfig.tools.web.search.provider, "custom");
    assert.equal(finalConfig.tools.sessions, undefined);
    assert.equal(finalConfig.agents.defaults.workspace, undefined);

    const purged = uninstallProduct({ env, openclawBin, purgeWorkspace: true });
    assert.equal(purged.success, true);
    assert.equal(purged.removedWorkspace, true);
    assert.equal(fs.existsSync(installed.workspaceDir), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
