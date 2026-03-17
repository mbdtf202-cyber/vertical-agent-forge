# Vertical Agent Forge Control Plane

Companion OpenClaw plugin for `vertical-agent-forge`.

It provides the runtime control-plane services that the main Vertical Agent Forge
kit expects in VAF 2.0:

- artifact and state-machine validation
- local SQLite control-plane state
- connector diagnostics with simulator defaults
- gateway RPC methods for snapshot, validation, jobs, metrics, connectors, and incidents
- canary / incident / rollback-aware operational snapshots

## Runtime methods

- `vertical-agent-forge.snapshot`
- `vertical-agent-forge.validate`
- `vertical-agent-forge.jobs`
- `vertical-agent-forge.metrics`
- `vertical-agent-forge.connectors`
- `vertical-agent-forge.incidents`

## Config

Configure under `plugins.entries.vertical-agent-forge-control-plane.config`.

Important fields:

- `tenantId`
- `workspaceDir`
- `fullAuto`
- `killSwitch`
- `refreshIntervalMs`
- `connectors.zendesk.mode`
- `connectors.stripe.mode`
- `connectors.filesystem.mode`

All connectors default to simulator mode when credentials are not present.
