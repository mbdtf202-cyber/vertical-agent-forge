# Vertical Agent Forge Release

`vertical-agent-forge` is a production-grade self-improvement control plane for
OpenClaw vertical agents.

- Version: `__VERSION__`
- Tag: `__TAG__`

## What It Is

Vertical Agent Forge turns a vertical OpenClaw deployment into a managed
improvement system with:

- one user-facing agent
- one continuous forge loop
- bounded multi-agent proposal, evaluation, and promotion stages
- durable artifacts and release gates

## Why Teams Use It

- stop hiding all quality logic in one giant prompt
- make regressions visible
- keep release decisions evidence-based
- preserve durable lessons across runs

## Download

- Archive: [`__ARCHIVE_FILE__`](__ARCHIVE_URL__)
- SHA256: `__ARCHIVE_SHA256__`

## Quick Install

```bash
git clone https://github.com/mbdtf202-cyber/vertical-agent-forge.git
cd vertical-agent-forge
npm install
node ./bin/vertical-agent-forge.mjs install
```

## Hot Plug / Hot Load

This product is designed for existing OpenClaw users.

It installs by:

- copying the toolkit workspace into your OpenClaw state directory
- merging the required multi-agent config into your current OpenClaw config
- inheriting your existing default model so forge subagents stay compatible

## Core Roles

- `app-main`
- `app-forge`
- `app-worker`
- `app-critic`
- `app-adversary`
- `app-promoter`
- `app-archivist`

## Included Docs

- `README.md`
- `README.zh-CN.md`
- `docs/ARCHITECTURE.md`
- `docs/OPERATIONS.md`
- `docs/FAQ.md`
- `docs/RELEASING.md`
- `CHANGELOG.md`

## Local Packaging

```bash
__RELEASE_COMMAND__
```
