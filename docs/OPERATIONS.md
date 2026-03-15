# Operations

## Recommended Setup

- keep a stable OpenClaw provider
- install Vertical Agent Forge into an existing OpenClaw home
- keep `app-forge` internal
- maintain your domain pack under `kit/workspace/knowledge/domain/`

## Operational Checks

- verify install with `vertical-agent-forge doctor`
- verify OpenClaw config with `openclaw config validate`
- verify release assets with `npm run package`

## CLI Lifecycle Commands

- `node ./bin/vertical-agent-forge.mjs install`
- `node ./bin/vertical-agent-forge.mjs activate`
- `node ./bin/vertical-agent-forge.mjs doctor`
- `node ./bin/vertical-agent-forge.mjs uninstall`

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
