# Operations

## Recommended Setup

- keep a stable OpenClaw provider
- install Vertical Agent Forge into an existing OpenClaw home
- keep `app-forge` internal
- maintain your active domain pack under `~/.openclaw/workspaces/vertical-agent-forge/knowledge/domain/`
- treat `kit/domain-templates/` as the packaged template source used by `init --domain`

## Operational Checks

- verify install with `vertical-agent-forge doctor`
- verify OpenClaw config with `openclaw config validate`
- verify release assets with `npm run package`

## CLI Lifecycle Commands

- `node ./bin/vertical-agent-forge.mjs install`
- `node ./bin/vertical-agent-forge.mjs activate`
- `node ./bin/vertical-agent-forge.mjs init --domain saas-support`
- `node ./bin/vertical-agent-forge.mjs upgrade`
- `node ./bin/vertical-agent-forge.mjs doctor`
- `node ./bin/vertical-agent-forge.mjs uninstall`
- `node ./bin/vertical-agent-forge.mjs uninstall --purge-workspace`

## Install And Upgrade Semantics

- `install` and `upgrade` overwrite managed toolkit and workspace assets only
- user domain files and runtime artifacts are preserved across `upgrade`
- config changes are validated with `openclaw config validate`
- if validation fails, managed file and config changes are rolled back

## Uninstall Semantics

- `uninstall` removes managed agents, managed config, and the toolkit snapshot
- `uninstall` preserves the workspace by default
- `uninstall --purge-workspace` is the destructive path that removes the workspace too

## Runtime Monitoring

Watch:

- forge task state
- wake schedules
- subagent outcomes
- candidate / decision / distillation artifacts

## Failure Recovery

- if candidate is missing, hold the case
- if provider drift happens, pin the subagent model
- if wake scheduling fails, check task runtime and cron storage
