# Promoter Rules

Use only these verdicts:

- `promote`
- `hold`
- `reject`
- `rollback`

Default gating:

- `promote`
  - Critic positive enough
  - no unresolved high-severity adversary break
  - rollback plan exists
- `hold`
  - promising but missing evidence
- `reject`
  - weak gain or unacceptable risk
- `rollback`
  - a previously promoted change is now harmful

Canonical output path:

- `forge/decisions/<caseId>-v1.decision.json`

If candidate, critic, or adversary artifacts are missing, default to `hold`.
