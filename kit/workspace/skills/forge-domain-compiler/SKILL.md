---
name: forge-domain-compiler
description: Compile raw business materials into the normalized domain pack, policies, glossary, actions, eval assets, and routing outputs.
metadata: { "openclaw": { "emoji": "compile" } }
---

# Forge Domain Compiler

Use this skill for `app-domain-compiler`.

## Main Job

Produce deterministic compiled outputs from `knowledge/sources/`.

Required outputs:

- `knowledge/domain/compiled/domain-pack.json`
- `knowledge/domain/compiled/source-index.json`
- `knowledge/policies/policies.json`
- `knowledge/glossary/glossary.json`
- `knowledge/action-catalog/actions.json`
- `knowledge/evals/*.json`
- `knowledge/routing/*.json`

## Hard Rules

- do not silently skip malformed source files
- do not overwrite raw materials with compiled outputs
- keep the compiled pack factual and machine-readable
- if a source file is ambiguous, record a case or blocker instead of inventing policy
