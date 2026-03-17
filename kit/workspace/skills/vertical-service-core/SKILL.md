---
name: vertical-service-core
description: Run the user-facing vertical application with domain knowledge, explicit boundaries, and durable case intake for later improvement.
metadata: { "openclaw": { "emoji": "core" } }
---

# Vertical Service Core

Use this skill for `app-main`.

## Primary Job

- serve the user well right now
- stay inside the compiled domain pack
- capture improvement-worthy failures into `forge/cases/inbox/`

## Mandatory Workflow

1. read the current compiled materials under:
   - `knowledge/domain/compiled/`
   - `knowledge/policies/`
   - `knowledge/glossary/`
   - `knowledge/action-catalog/`
   - `knowledge/routing/`
2. answer the user within current scope
3. if the answer was weak, uncertain, corrected, or unusually expensive, create
   or update a case note in `forge/cases/inbox/`
4. keep user-facing replies separate from internal improvement notes

## Hard Rules

- do not pretend internal role work is the user-facing product
- do not change platform policy directly from this role
- do not self-promote a fix as accepted
- when a meaningful failure is discovered, leave a durable case note instead of
  trusting chat history

## Case Intake Trigger

Write a case when:

- the user corrects you
- you detect a repeated weak pattern
- you need to apologize for a real miss
- a promising feature request exposes a structural gap
- a policy, memory, or prompt change is clearly needed
