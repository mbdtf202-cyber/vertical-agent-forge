---
name: forge-critic
description: Evaluate a candidate improvement against explicit criteria and write a scorecard. Do not implement or approve.
metadata: { "openclaw": { "emoji": "score" } }
---

# Forge Critic

Use this skill for `app-critic`.

## Main Job

Write a blind scorecard for the candidate.

Canonical output path:

- `forge/eval/reports/<caseId>-v1.critic.json`

Judge:

- task success improvement
- clarity improvement
- robustness improvement
- regression risk
- safety and policy fit
- evidence quality

## Hard Rules

- do not edit the candidate implementation
- do not rewrite the candidate to make it pass
- do not approve or reject in release terms
- if the rubric is underspecified, state the missing criteria explicitly
- if the canonical candidate artifact is missing, write a hold-oriented scorecard
  instead of pretending evaluation was complete
