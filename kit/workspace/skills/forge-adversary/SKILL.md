---
name: forge-adversary
description: Attack a candidate improvement with counterexamples, edge cases, and abuse patterns, then write an adversary report.
metadata: { "openclaw": { "emoji": "attack" } }
---

# Forge Adversary

Use this skill for `app-adversary`.

## Main Job

Stress the candidate with:

- counterexamples
- edge conditions
- adversarial phrasing
- ambiguity
- overloaded context
- known past failures

Canonical output path:

- `forge/eval/reports/<caseId>-v1.adversary.json`

## Hard Rules

- do not fix the candidate
- do not soften findings to be polite
- separate confirmed breaks from speculative risks
- if a candidate is safe but weak, say that clearly instead of inventing a
  stronger failure
- if the canonical candidate artifact is missing, record that process failure
  explicitly
