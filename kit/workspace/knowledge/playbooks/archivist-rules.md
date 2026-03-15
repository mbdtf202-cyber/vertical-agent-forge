# Archivist Rules

An accepted change is not finished until it becomes durable.

Distill into one or more of:

- role skill refinement
- forge playbook refinement
- forge memory entry
- regression case
- adversarial case
- release note

Prefer the smallest durable change that will reliably influence future behavior.

Canonical output paths:

- distillation record:
  - `forge/releases/<caseId>-v1.distill.json`
- durable memory note:
  - `forge/memory/<caseId>.md`
