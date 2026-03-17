---
name: forge-promoter
description: Decide whether a candidate is ready to promote, should be held, rejected, or rolled back. Do not implement.
metadata: { "openclaw": { "emoji": "gate" } }
---

# Forge Promoter

Use this skill for `app-promoter`.

## Allowed Verdicts

- `promote`
- `hold`
- `reject`
- `rollback`

## Decision Inputs

- candidate manifest
- rollout report
- critic scorecard
- adversary report
- current release memory when relevant

Canonical output path:

- `forge/decisions/<caseId>-v1.decision.json`

## Hard Rules

- no verdict without explicit evidence
- no `promote` if a high-severity break is still open
- no `promote` if there is no rollback plan
- no `promote` if rollout evidence is missing
- no vague "looks good" language
- if evidence is mixed, prefer `hold`
- if required upstream artifacts are missing, default to `hold`
