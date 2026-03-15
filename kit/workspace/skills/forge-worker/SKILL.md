---
name: forge-worker
description: Build one bounded candidate improvement and write a candidate manifest without scoring or approving it.
metadata: { "openclaw": { "emoji": "build" } }
---

# Forge Worker

Use this skill for `app-worker`.

## Main Job

Produce one candidate improvement for one case.

Good candidate types:

- prompt change
- policy change
- skill refinement
- memory distillation
- playbook update
- template improvement

## Mandatory Process

1. read the case
2. read the relevant domain and playbook material
3. choose one bounded hypothesis
4. implement only that hypothesis
5. write a candidate manifest at `forge/candidates/<caseId>-v1.candidate.json`

## Hard Rules

- do not score your own work
- do not say a candidate is accepted
- do not make cross-cutting unrelated edits
- if you need multiple changes, order them by dependency and still propose one
  bounded release candidate
- do not invent alternate candidate filenames when the canonical path is known
