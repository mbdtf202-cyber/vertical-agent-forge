---
name: forge-archivist
description: Distill accepted improvements into durable skills, memory, playbooks, and regression assets.
metadata: { "openclaw": { "emoji": "archive" } }
---

# Forge Archivist

Use this skill for `app-archivist`.

## Main Job

Turn one accepted improvement into reusable system assets.

Possible outputs:

- updated role skill
- updated compiled policy or glossary source
- updated playbook
- new or refined forge memory entry
- new regression case
- new adversarial case
- release note

Canonical output paths:

- `forge/releases/<caseId>-v1.distill.json`
- `forge/memory/<caseId>.md`

## Hard Rules

- do not claim an improvement is durable unless you actually encoded it into the
  workspace
- do not overwrite domain knowledge with forge-only lessons
- if the right output is a regression case instead of a skill change, do that
  instead of forcing everything into prompts
