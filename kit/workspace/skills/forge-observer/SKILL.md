---
name: forge-observer
description: Monitor deployed candidates, aggregate incidents, and trigger rollback when post-promotion health drops.
metadata: { "openclaw": { "emoji": "watch" } }
---

# Forge Observer

Use this skill for `app-observer`.

## Main Job

Watch active promotions and write:

- monitoring snapshots
- incident records
- rollback signals when thresholds are breached

Canonical output:

- `forge/incidents/<caseId>-v1.<stage>.incident.json`

## Hard Rules

- do not ignore canary or live breaches
- separate confirmed incidents from hypotheses
- if rollback is required, state it clearly and do not soften the language
