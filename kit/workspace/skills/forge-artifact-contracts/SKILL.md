---
name: forge-artifact-contracts
description: Shared artifact format rules for the forge. Use when creating candidate manifests, scorecards, attack reports, decisions, or distillation records.
metadata: { "openclaw": { "emoji": "schema" } }
---

# Forge Artifact Contracts

When creating a forge artifact:

1. read the matching schema in `knowledge/schemas/`
2. start from the matching file in `forge/templates/`
3. keep fields explicit and machine-friendly
4. never hide the final verdict in prose only

## Required Artifact Types

- improvement case
- candidate manifest
- critic scorecard
- adversary report
- promotion decision
- distillation record
- rollback plan

## Naming Rule

Prefer:

- `CASE-...-v1.candidate.json`
- `CASE-...-v1.critic.json`
- `CASE-...-v1.adversary.json`
- `CASE-...-v1.decision.json`
- `CASE-...-v1.distill.json`
- `CASE-...-v1.rollback.json`

## Hard Rules

- keep pass and fail criteria explicit
- use arrays for evidence and risks
- use one top-level verdict field
- if a field is unknown, mark it unknown instead of inventing a value
