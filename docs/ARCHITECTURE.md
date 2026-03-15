# Architecture

## System Overview

Vertical Agent Forge separates user delivery from self-improvement.

```mermaid
flowchart TD
  A["OpenClaw User Traffic"] --> B["app-main"]
  B --> C["forge/cases/inbox"]
  D["Operator feedback / monitors"] --> C
  C --> E["app-forge"]
  E --> F["app-worker"]
  E --> G["app-critic"]
  E --> H["app-adversary"]
  F --> I["candidate"]
  G --> J["scorecard"]
  H --> K["attack report"]
  I --> L["app-promoter"]
  J --> L
  K --> L
  L --> M["decision artifact"]
  M --> N["app-archivist"]
  N --> O["skills / playbooks / memory / release assets"]
```

## Runtime Components

- workspace kit
- installer / doctor CLI
- durable task runtime
- role skills
- packaging and release workflow

## Design Rules

- user-facing replies come from `app-main`
- improvement logic is owned by `app-forge`
- release gating is explicit
- every meaningful step should leave a file artifact
