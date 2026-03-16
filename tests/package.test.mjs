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

test("npm package includes packaged templates and supports init from an unpacked tarball", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vertical-agent-forge-pack-"));
  const tarballDir = path.join(root, "tarballs");
  const unpackDir = path.join(root, "unpacked");
  const stateDir = path.join(root, ".openclaw");
  const configPath = path.join(stateDir, "openclaw.json");
  fs.mkdirSync(tarballDir, { recursive: true });
  fs.mkdirSync(unpackDir, { recursive: true });
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
      fs.existsSync(path.join(packageRoot, "kit", "domain-templates", "saas-support", "product.md")),
      true,
    );
    assert.equal(
      fs.existsSync(
        path.join(packageRoot, "kit", "workspace", "knowledge", "playbooks", "stall-recovery.md"),
      ),
      true,
    );
    assert.equal(fs.existsSync(path.join(packageRoot, "examples", "templates")), false);

    run("npm", ["install"], { cwd: packageRoot });

    const initResult = run(
      "node",
      ["./bin/vertical-agent-forge.mjs", "init", "--domain", "saas-support"],
      {
        cwd: packageRoot,
        env: {
          ...process.env,
          OPENCLAW_STATE_DIR: stateDir,
          OPENCLAW_CONFIG_PATH: configPath,
        },
      },
    );
    const parsed = JSON.parse(initResult.stdout);
    assert.equal(parsed.success, true);
    assert.equal(
      fs.existsSync(path.join(stateDir, "workspaces", "vertical-agent-forge", "knowledge", "domain", "product.md")),
      true,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
