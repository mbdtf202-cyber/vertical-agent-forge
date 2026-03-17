import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return result;
}

test("npm package includes companion plugin assets and supports bootstrap from an unpacked tarball", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vertical-agent-forge-pack-"));
  const tarballDir = path.join(root, "tarballs");
  const unpackDir = path.join(root, "unpacked");
  const stateDir = path.join(root, ".openclaw");
  const configPath = path.join(stateDir, "openclaw.json");
  const binDir = path.join(root, "bin");
  const stubPath = path.join(binDir, "openclaw");
  fs.mkdirSync(tarballDir, { recursive: true });
  fs.mkdirSync(unpackDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });
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
  fs.writeFileSync(
    stubPath,
    `#!/bin/sh
if [ "$1" = "config" ] && [ "$2" = "validate" ]; then
  echo '{"valid":true}'
  exit 0
fi
if [ "$1" = "gateway" ] && [ "$2" = "health" ]; then
  echo '{"ok":true}'
  exit 0
fi
if [ "$1" = "gateway" ] && [ "$2" = "call" ] && [ "$3" = "vertical-agent-forge.snapshot" ]; then
  echo '{"available":true,"summary":{"ok":true}}'
  exit 0
fi
if [ "$1" = "gateway" ] && [ "$2" = "call" ] && [ "$3" = "agent" ]; then
  echo '{"runId":"forge-run-1","status":"accepted"}'
  exit 0
fi
exit 0
`,
    "utf8",
  );
  fs.chmodSync(stubPath, 0o755);

  try {
    const packResult = run(
      "npm",
      ["pack", "--json", "--pack-destination", tarballDir],
      { cwd: repoRoot },
    );
    const [{ filename }] = JSON.parse(packResult.stdout);
    const tarballPath = path.join(tarballDir, filename);

    run("tar", ["-xzf", tarballPath, "-C", unpackDir]);

    const packageRoot = path.join(unpackDir, "package");
    assert.equal(
      fs.existsSync(path.join(packageRoot, "kit", "domain-templates", "saas-support", "domain", "product.md")),
      true,
    );
    assert.equal(
      fs.existsSync(
        path.join(packageRoot, "kit", "workspace", "knowledge", "playbooks", "stall-recovery.md"),
      ),
      true,
    );
    assert.equal(fs.existsSync(path.join(packageRoot, "src", "factory", "compiler.mjs")), true);
    assert.equal(fs.existsSync(path.join(packageRoot, "companion-plugin", "openclaw.plugin.json")), true);

    run("npm", ["install"], { cwd: packageRoot });

    const bootstrapResult = run(
      "node",
      ["./bin/vertical-agent-forge.mjs", "bootstrap", "--domain", "saas-support"],
      {
        cwd: packageRoot,
        env: {
          ...process.env,
          OPENCLAW_STATE_DIR: stateDir,
          OPENCLAW_CONFIG_PATH: configPath,
          PATH: `${binDir}:${process.env.PATH}`,
        },
      },
    );
    const parsed = JSON.parse(bootstrapResult.stdout);
    assert.equal(parsed.success, true);
    assert.equal(
      fs.existsSync(path.join(stateDir, "workspaces", "vertical-agent-forge", "knowledge", "sources", "policies", "billing-policy.json")),
      true,
    );
    assert.equal(
      fs.existsSync(path.join(stateDir, "workspaces", "vertical-agent-forge", "knowledge", "domain", "compiled", "domain-pack.json")),
      true,
    );
    assert.equal(
      fs.existsSync(path.join(stateDir, "toolkits", "vertical-agent-forge", "plugins", "vertical-agent-forge-control-plane", "openclaw.plugin.json")),
      true,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
