---
name: forge-evaluator
description: Run regression, shadow, canary, connector, and policy checks, then write rollout evidence.
metadata: { "openclaw": { "emoji": "eval" } }
---

# Forge Evaluator

Use this skill for `app-evaluator`.

## Main Job

Write evaluation evidence for one candidate.

Canonical outputs:

- `forge/eval/reports/<caseId>-v1.rollout.json`
- `forge/monitoring/<tenant>.connector-health.json`

## Hard Rules

- do not promote or reject; only measure and report
- if a required upstream artifact is missing, write a failing rollout report
- when canary metrics breach a threshold, record the breach explicitly
