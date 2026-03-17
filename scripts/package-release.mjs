import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const distDir = path.join(repoRoot, "dist");
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const version = process.env.RELEASE_VERSION || packageJson.version;
const tag = process.env.RELEASE_TAG || `v${version}`;
const repo = process.env.RELEASE_REPO || "<owner>/<repo>";
const archiveName = "vertical-agent-forge-kit.tar.gz";
const archivePath = path.join(distDir, archiveName);
const shaPath = `${archivePath}.sha256`;
const companionArchiveName = "vertical-agent-forge-control-plane.tgz";
const companionArchivePath = path.join(distDir, companionArchiveName);
const companionShaPath = `${companionArchivePath}.sha256`;
const readmePath = path.join(distDir, "vertical-agent-forge-kit.README.md");
const readmeZhPath = path.join(distDir, "vertical-agent-forge-kit.README.zh-CN.md");

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function computeSha256(filePath) {
  const result = spawnSync("shasum", ["-a", "256", filePath], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || "failed to compute sha256");
  }
  return result.stdout.trim().split(/\s+/)[0];
}

function renderTemplate(templatePath, outputPath, replacements) {
  let content = fs.readFileSync(templatePath, "utf8");
  for (const [key, value] of Object.entries(replacements)) {
    content = content.replaceAll(key, value);
  }
  fs.writeFileSync(outputPath, content, "utf8");
}

ensureDir(distDir);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vertical-agent-forge-package-"));
const stagingDir = path.join(tempRoot, "vertical-agent-forge");
fs.cpSync(repoRoot, stagingDir, {
  recursive: true,
  dereference: false,
  filter: (src) => {
    const relative = path.relative(repoRoot, src);
    if (!relative) {
      return true;
    }
    const top = relative.split(path.sep)[0];
    if ([".git", "dist", "node_modules"].includes(top)) {
      return false;
    }
    return true;
  },
});

const tar = spawnSync("tar", ["-C", tempRoot, "-czf", archivePath, "vertical-agent-forge"], {
  encoding: "utf8",
});
if (tar.status !== 0) {
  throw new Error(tar.stderr || "failed to create release archive");
}

const sha = computeSha256(archivePath);
fs.writeFileSync(shaPath, `${sha}  ${archiveName}\n`, "utf8");

const companionPack = spawnSync(
  "npm",
  ["pack", "--json", "--pack-destination", distDir],
  {
    cwd: path.join(repoRoot, "companion-plugin"),
    encoding: "utf8",
  },
);
if (companionPack.status !== 0) {
  throw new Error(companionPack.stderr || "failed to package companion plugin");
}
const [{ filename: companionPackedFile }] = JSON.parse(companionPack.stdout);
const companionPackedPath = path.join(distDir, companionPackedFile);
if (companionPackedPath !== companionArchivePath) {
  fs.rmSync(companionArchivePath, { force: true });
  fs.renameSync(companionPackedPath, companionArchivePath);
}
const companionSha = computeSha256(companionArchivePath);
fs.writeFileSync(companionShaPath, `${companionSha}  ${companionArchiveName}\n`, "utf8");

const archiveUrl = `https://github.com/${repo}/releases/download/${tag}/${archiveName}`;
const releaseCommand = `RELEASE_REPO=${repo} RELEASE_TAG=${tag} RELEASE_VERSION=${version} npm run package`;

renderTemplate(path.join(repoRoot, "templates", "release-readme.en.md"), readmePath, {
  "__ARCHIVE_FILE__": archiveName,
  "__ARCHIVE_SHA256__": sha,
  "__ARCHIVE_URL__": archiveUrl,
  "__VERSION__": version,
  "__TAG__": tag,
  "__RELEASE_COMMAND__": releaseCommand,
});

renderTemplate(path.join(repoRoot, "templates", "release-readme.zh-CN.md"), readmeZhPath, {
  "__ARCHIVE_FILE__": archiveName,
  "__ARCHIVE_SHA256__": sha,
  "__ARCHIVE_URL__": archiveUrl,
  "__VERSION__": version,
  "__TAG__": tag,
  "__RELEASE_COMMAND__": releaseCommand,
});

console.log(
  JSON.stringify(
    {
      archivePath,
      shaPath,
      companionArchivePath,
      companionShaPath,
      readmePath,
      readmeZhPath,
      archiveUrl,
      version,
      tag,
    },
    null,
    2,
  ),
);
