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

async function screenshotSvg(page, baseUrl, fileName, viewport, outputName) {
  await page.setViewportSize(viewport);
  await page.goto(`${baseUrl}/assets/${fileName}`, { waitUntil: "load" });
  await page.waitForTimeout(250);
  await page.screenshot({
    path: path.join(screenshotsDir, outputName),
  });
}

async function screenshotSelector(page, baseUrl, pagePath, selector, outputName, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(`${baseUrl}/${pagePath}`, { waitUntil: "load" });
  await page.waitForTimeout(400);
  await page.locator(selector).screenshot({
    path: path.join(screenshotsDir, outputName),
  });
}

ensureDir(screenshotsDir);
const { server, url } = await startServer(siteDir);
const browser = await chromium.launch({
  executablePath: resolveExecutablePath(),
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });

await screenshotSvg(page, url, "banner.svg", { width: 1600, height: 900 }, "banner.png");
await screenshotSvg(
  page,
  url,
  "console-panels.svg",
  { width: 1600, height: 980 },
  "console-panels.png",
);
await screenshotSelector(page, url, "index.html", ".hero", "landing-page.png", {
  width: 1600,
  height: 1100,
});
await screenshotSelector(page, url, "zh-CN.html", ".hero", "landing-page.zh-CN.png", {
  width: 1600,
  height: 1100,
});

console.log(
  JSON.stringify(
    {
      generated: [
        "site/assets/screenshots/banner.png",
        "site/assets/screenshots/console-panels.png",
        "site/assets/screenshots/landing-page.png",
        "site/assets/screenshots/landing-page.zh-CN.png",
      ],
    },
    null,
    2,
  ),
);

process.exit(0);
