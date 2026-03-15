import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { installProduct, doctorProduct } from "../scripts/install.mjs";

test("installProduct installs workspace and merges config", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vertical-agent-forge-test-"));
  const stateDir = path.join(root, ".openclaw");
  const configPath = path.join(stateDir, "openclaw.json");
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      agents: {
        defaults: {
          model: { primary: "openai/gpt-5.4" },
        },
      },
    }),
  );

  const previousConfig = process.env.OPENCLAW_CONFIG_PATH;
  const previousState = process.env.OPENCLAW_STATE_DIR;
  process.env.OPENCLAW_CONFIG_PATH = configPath;
  process.env.OPENCLAW_STATE_DIR = stateDir;

  try {
    const installed = installProduct();
    assert.equal(fs.existsSync(installed.workspaceDir), true);
    assert.equal(fs.existsSync(installed.toolkitDir), true);

    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const agentIds = new Set((config.agents?.list ?? []).map((entry) => entry.id));
    assert.equal(agentIds.has("app-main"), true);
    assert.equal(agentIds.has("app-forge"), true);
    assert.deepEqual(config.agents.defaults.subagents.model, { primary: "openai/gpt-5.4" });

    const doctor = doctorProduct();
    assert.equal(doctor.exists.workspace, true);
    assert.equal(doctor.agents.missing.length, 0);
  } finally {
    if (previousConfig === undefined) delete process.env.OPENCLAW_CONFIG_PATH;
    else process.env.OPENCLAW_CONFIG_PATH = previousConfig;
    if (previousState === undefined) delete process.env.OPENCLAW_STATE_DIR;
    else process.env.OPENCLAW_STATE_DIR = previousState;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
