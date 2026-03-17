# Improvement Loop

Default loop:

1. pick one active case
2. make sure the domain pack is current enough for this case
3. state one bounded hypothesis
4. ask Worker for one candidate
5. ask Evaluator for rollout evidence
6. ask Critic for a blind scorecard
7. ask Adversary for counterexamples
8. ask Promoter for a shipping decision
9. if promoted, ask Deployer then Observer
10. if accepted, ask Archivist to distill it
11. update task state and arm the next wake

If the loop stalls:

1. classify the blocker
2. update the active case with the failed path
3. choose one materially different route
4. if no credible route remains, hold or reject the case instead of looping

Do not run multiple candidate hypotheses for one case in the same iteration
unless the operator explicitly wants a comparison.

## Canonical Artifact Paths

For case `CASE-YYYYMMDD-001`, prefer:

- active case:
  - `forge/cases/active/CASE-YYYYMMDD-001.md`
- candidate:
  - `forge/candidates/CASE-YYYYMMDD-001-v1.candidate.json`
- rollout:
  - `forge/eval/reports/CASE-YYYYMMDD-001-v1.rollout.json`
- critic report:
  - `forge/eval/reports/CASE-YYYYMMDD-001-v1.critic.json`
- adversary report:
  - `forge/eval/reports/CASE-YYYYMMDD-001-v1.adversary.json`
- promoter decision:
  - `forge/decisions/CASE-YYYYMMDD-001-v1.decision.json`
- archivist distillation:
  - `forge/releases/CASE-YYYYMMDD-001-v1.distill.json`
- rollback:
  - `forge/releases/CASE-YYYYMMDD-001-v1.rollback.json`
- incident:
  - `forge/incidents/CASE-YYYYMMDD-001-v1.canary.incident.json`
- durable memory note:
  - `forge/memory/CASE-YYYYMMDD-001.md`

If an upstream artifact is missing, record a hold or blocker instead of making
up an alternate path.

## Anti-Loop Rule

Do not repeat the same hypothesis, same evidence request, or same role handoff
unless you can state what changed since the previous attempt.
