# Vertical Agent Forge Operating Contract

This workspace powers a self-improving vertical application on OpenClaw.

The workspace is shared by multiple agent ids on purpose. Role separation comes
from:

- per-agent skill filters
- per-agent tool policy
- per-agent auth and session state

## Core Split

- `app-main`
  - serves users
  - writes durable case notes when something valuable is learned or goes wrong
- `app-forge`
  - owns continuous improvement
  - owns runtime tasks and wake scheduling
- `app-worker`
  - builds one candidate improvement
- `app-critic`
  - scores the candidate
- `app-adversary`
  - tries to break the candidate
- `app-promoter`
  - decides whether the candidate ships
- `app-archivist`
  - turns accepted improvements into reusable knowledge

## Hard Rules

1. Do not treat one endless agent turn as the control plane.
2. The source of truth for long-running work is `task` plus files under `forge/`.
3. Internal roles produce artifacts. They do not produce user-facing narration.
4. No candidate is considered accepted until Promoter writes a decision artifact.
5. Accepted improvements must create durable assets:
   - updated skill
   - updated playbook
   - updated forge memory
   - regression or adversarial test addition when relevant
6. Rejected improvements are still valuable. Archive why they failed.
7. Keep artifacts factual and compact. Avoid vague meta commentary.
8. If the same path is not producing new evidence, change approach instead of
   repeating the same run shape.
9. A live case must always be in one of these states:
   - advancing
   - blocked with a named blocker
   - complete
   - failed
   - waiting on the next scheduled wake

## Directory Rules

- shared domain knowledge lives in `knowledge/domain/`
- operating rules live in `knowledge/playbooks/`
- machine-readable contracts live in `knowledge/schemas/`
- incoming problems live in `forge/cases/inbox/`
- in-progress problems live in `forge/cases/active/`
- candidate outputs live in `forge/candidates/`
- evaluation outputs live in `forge/eval/reports/`
- promotion decisions live in `forge/decisions/`
- accepted durable lessons live in `forge/memory/`
- release notes and rollback plans live in `forge/releases/`

## Default Improvement Loop

1. harvest or receive a case
2. triage for impact and reproducibility
3. spawn Worker for one bounded candidate
4. spawn Critic for blind scoring
5. spawn Adversary for counterexamples
6. spawn Promoter for a release decision
7. if accepted, spawn Archivist
8. update the runtime task and arm the next wake

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

## User-Facing Safety

- only `app-main` should answer end users in normal operation
- internal roles should write files, not chat to users
- if a case requires human approval, state the minimum approval needed

## Domain Customization

This package ships the control plane, not your business domain.

Before using it seriously, customize:

- `knowledge/domain/README.md`
- `skills/vertical-service-core/SKILL.md`
- `USER.md`
