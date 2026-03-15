import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const siteDir = path.join(repoRoot, "site");
const screenshotsDir = path.join(siteDir, "assets", "screenshots");

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function mimeType(filePath) {
  if (filePath.endsWith(".css")) return "text/css";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  return "application/octet-stream";
}

function startServer(rootDir) {
  const server = http.createServer((req, res) => {
    const urlPath = new URL(req.url, "http://127.0.0.1").pathname;
    const relative = urlPath === "/" ? "/index.html" : urlPath;
    const resolved = path.join(rootDir, relative);
    if (!resolved.startsWith(rootDir) || !fs.existsSync(resolved)) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "content-type": mimeType(resolved) });
    res.end(fs.readFileSync(resolved));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        server,
        url: `http://127.0.0.1:${address.port}`,
      });
    });
  });
}

function resolveExecutablePath() {
  const candidate = path.join(
    os.homedir(),
    "Library",
    "Caches",
    "ms-playwright",
    "chromium-1208",
    "chrome-mac-arm64",
    "Google Chrome for Testing.app",
    "Contents",
    "MacOS",
    "Google Chrome for Testing",
  );
  return fs.existsSync(candidate) ? candidate : undefined;
}

ensureDir(screenshotsDir);
const { server, url } = await startServer(siteDir);
const browser = await chromium.launch({
  executablePath: resolveExecutablePath(),
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });

await page.goto(`${url}/index.html`, { waitUntil: "networkidle" });
await page.screenshot({
  path: path.join(screenshotsDir, "landing-page.png"),
  fullPage: true,
});

await page.goto(`${url}/zh-CN.html`, { waitUntil: "networkidle" });
await page.screenshot({
  path: path.join(screenshotsDir, "landing-page.zh-CN.png"),
  fullPage: true,
});

await page.goto(`${url}/index.html#cli`, { waitUntil: "networkidle" });
await page.screenshot({
  path: path.join(screenshotsDir, "demo-console.png"),
  fullPage: true,
});

await browser.close();
server.close();

console.log(
  JSON.stringify(
    {
      generated: [
        "docs/assets/screenshots/landing-page.png",
        "docs/assets/screenshots/landing-page.zh-CN.png",
        "docs/assets/screenshots/demo-console.png",
      ],
    },
    null,
    2,
  ),
);
