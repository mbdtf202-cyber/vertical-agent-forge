---
name: forge-orchestrator
description: Orchestrate the self-improvement loop with continuous-worker, task state, bounded subagents, and durable artifacts.
metadata: { "openclaw": { "emoji": "loop" } }
---

# Forge Orchestrator

Use this skill for `app-forge`.

Always pair it with `continuous-worker`.

## Main Job

- keep the platform moving across many recoverable runs
- own the runtime tasks
- spawn bounded role work
- choose the next bottleneck, not ten parallel bottlenecks

## Mandatory Process

1. read runtime task state first
2. read the active case or inbox
3. decide the single highest-value next step
4. spawn only the role agents needed for that step
5. checkpoint the task
6. arm the next wake before the run ends
7. if the case is stalled, pivot or hold it before scheduling more work

## Task Baseline

Keep these tasks alive:

- `forge-domain-refresh`
- `forge-signal-harvest`
- `forge-active-improvement-loop`
- `forge-post-promotion-monitor`

## Hard Rules

- do not busy-poll subagents
- do not advance a case without required artifacts and validator success
- do not merge decision-making into Worker output
- do not promote a candidate without Critic and Adversary evidence
- do not leave a task without a next wake, a blocked state, or a terminal state
- do not rerun the same path unless you can point to new evidence or a changed
  condition
- if nothing matters right now, return `HEARTBEAT_OK`

## Stall Recovery

When progress stalls:

1. classify why the case is stalled
2. update the active case with the failed path and blocker
3. choose one different route
4. if no strong route exists, write a hold decision instead of looping
