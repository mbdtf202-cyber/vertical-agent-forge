# Changelog

## 0.3.0

### Features

- Rebuilt Vertical Agent Forge as a two-part expert-agent factory with a companion control-plane plugin.
- Added full factory CLI flows for bootstrap, ingest, compile, validate, connector checks, evals, deploy, status, and rollback.
- Added strict activation, deep doctor checks, plugin wiring, and packaged companion-plugin release assets.
- Added new factory roles, new artifact schemas/templates, incident tracking, and a SaaS Support source-pack reference vertical.
- Added runtime validation, connector diagnostics, SQLite-backed control-plane snapshots, and automatic breach-triggered rollback flows.
- Added an explicit anti-stall and route-pivot protocol across the forge operating contract, playbooks, and role skills.
- Expanded artifact contracts so cases, candidates, and promotion decisions can record blockers, fallback plans, and the next route.
- Updated product documentation to position smart stall recovery as a first-class capability of Vertical Agent Forge.

## 0.2.0

### Features

- Fixed packaged `init --domain` by shipping runtime templates inside `kit/domain-templates/`.
- Made `upgrade` refresh managed toolkit/workspace assets while preserving user domain and runtime files.
- Made install transactional with rollback when `openclaw config validate` fails.
- Changed `uninstall` to preserve the workspace by default and added `--purge-workspace` for destructive removal.
- Slimmed the npm package to runtime-only assets while keeping the GitHub release archive full-fat.

## 0.1.6

### Features

- Added generated PNG screenshots to the repository for richer product presentation.
- Updated release tooling to use the local Chromium installation path for demo capture.
- Refined README presentation to better match the product-style site and visual assets.

## 0.1.5

### Features

- Fixed README SVG overflow and alignment issues for GitHub rendering.
- Added multi-page docs-site with navigation, search, and examples gallery.
- Added logo, favicon, and social-card product assets.
- Added npm-ready package metadata and npm publish workflow.

## 0.1.4

### Features

- Added `init --domain <template>` and `upgrade` lifecycle commands.
- Added example domain templates and one-click demo profiles.
- Expanded the landing site with comparison, examples, pricing, and contact sections.

## 0.1.3

### Features

- Added GitHub Pages landing site with bilingual entry pages.
- Added screenshot/demo generation script using Playwright.
- Added SVG product visuals and richer lifecycle-focused README content.

## 0.1.2

### Features

- Added lifecycle commands for `activate` and `uninstall`.
- Added SVG visual assets for banner and console-style documentation panels.
- Upgraded standalone README pages with product visuals and lifecycle usage.
- Updated release assets to surface lifecycle commands more clearly.

## 0.1.1

### Features

- Enriched standalone product documentation with richer landing-page content.
- Added production architecture, operations, FAQ, and release docs.
- Upgraded release assets to ship richer bilingual release README pages.

## 0.1.0

### Features

- Initial standalone release of Vertical Agent Forge.
- Hot-plug installer for existing OpenClaw setups.
- Bilingual release assets.
- Packaged workspace kit with multi-agent forge roles.
