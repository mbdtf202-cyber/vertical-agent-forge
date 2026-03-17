# Vertical Agent Forge Operating Contract

This workspace powers a full Vertical Agent Forge 2.0 factory on OpenClaw.

The workspace is shared by multiple agent ids on purpose. Role separation comes
from:

- per-agent skill filters
- per-agent tool policy
- per-agent auth and session state
- file artifacts plus control-plane validation gates

## Core Split

- `app-main`
  - serves end users as the vertical expert agent
  - writes durable misses into `forge/cases/inbox/`
- `app-forge`
  - owns orchestration, state transitions, and wake scheduling
- `app-domain-compiler`
  - compiles raw business materials from `knowledge/sources/`
- `app-worker`
  - builds one bounded candidate improvement
- `app-evaluator`
  - runs regression, shadow, canary, and connector checks
- `app-critic`
  - scores the candidate
- `app-adversary`
  - tries to break the candidate
- `app-promoter`
  - decides whether the candidate ships
- `app-deployer`
  - executes promote / canary / live / rollback transitions
- `app-observer`
  - monitors post-promotion health and writes incidents
- `app-archivist`
  - turns accepted improvements into durable knowledge

## Hard Rules

1. Do not treat one endless agent turn as the control plane.
2. The source of truth for long-running work is `task` plus files under `forge/`.
3. No state transition without required artifacts and control-plane validation.
4. No candidate is accepted until Promoter writes a decision artifact.
5. No rollout without rollback material and passing evaluation evidence.
6. Full-auto does not mean reckless; kill switch, deny lists, canary, and rollback still govern.
7. Internal roles produce artifacts. They do not produce user-facing narration.
8. If evidence is missing, write a hold or blocker artifact instead of guessing.
9. Rejected improvements are still valuable; archive why they failed.
10. If the current route is not producing new evidence, pivot instead of repeating the same run shape.
11. A live case must always be advancing, blocked with a named blocker, complete, failed, or waiting on the next scheduled wake.

## Directory Rules

- raw business materials live in `knowledge/sources/`
- compiled domain outputs live in `knowledge/domain/compiled/`
- compiled policies live in `knowledge/policies/`
- glossary lives in `knowledge/glossary/`
- allowed actions live in `knowledge/action-catalog/`
- eval seeds and fixtures live in `knowledge/evals/`
- routing, taxonomy, escalation, and metric definitions live in `knowledge/routing/`
- machine-readable contracts live in `knowledge/schemas/`
- incoming problems live in `forge/cases/inbox/`
- in-progress problems live in `forge/cases/active/`
- candidate outputs live in `forge/candidates/`
- evaluation outputs live in `forge/eval/reports/`
- promotion decisions live in `forge/decisions/`
- release and rollback artifacts live in `forge/releases/`
- incidents live in `forge/incidents/`
- monitoring snapshots live in `forge/monitoring/`
- durable lessons live in `forge/memory/`

## Default Factory Loop

1. compile or refresh domain materials
2. harvest or receive one case
3. triage for impact and reproducibility
4. build one bounded candidate
5. evaluate it with regression, shadow, connector, and canary checks
6. run Critic and Adversary
7. run Promoter for a release decision
8. if promoted, run Deployer then Observer
9. if the rollout stays healthy, run Archivist
10. update task state and arm the next wake

## Stall Recovery

Treat a case as stalled when one or more of these is true:

- the same hypothesis or tool pattern repeats without new evidence
- two consecutive wakes end with the same blocker and no narrower next step
- an expected upstream artifact is still missing after a bounded retry window
- the team keeps producing motion but not a better shipping decision

When stalled:

1. write the blocker or failed path into the active case
2. pick a materially different route
3. shrink scope if needed
4. slow the wake cadence if the next step depends on external change
5. hold or reject the case if no credible path remains

## State Machine

Primary path:

- `inbox -> triage -> building -> validating -> shadow -> canary -> live -> archived`

Exceptional path:

- `hold`
- `reject`
- `rollback`
- `incident`

## Domain Customization

This package ships a working factory, not your final business expertise.

Before using it seriously, customize:

- `knowledge/sources/`
- `knowledge/domain/README.md`
- `skills/vertical-service-core/SKILL.md`
- `USER.md`
