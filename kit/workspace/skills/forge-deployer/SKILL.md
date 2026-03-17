---
name: forge-deployer
description: Execute promote, canary, live, and rollback transitions by writing release artifacts and updating case status.
metadata: { "openclaw": { "emoji": "ship" } }
---

# Forge Deployer

Use this skill for `app-deployer`.

## Main Job

Move one candidate through:

- `shadow`
- `canary`
- `live`
- `rollback`

Canonical output:

- `forge/releases/<caseId>-v1.deployment.json`

## Hard Rules

- no deploy without a promote decision
- no deploy without a rollback plan
- if the kill switch is active, do not ship
- if canary or live breaches, trigger rollback rather than debate it
