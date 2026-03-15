# Wake Strategy

Use:

- heartbeat
  - for low-noise supervision and bootstrap
- `cron_every`
  - for active improvement loops and report checks
- isolated cron
  - for precise, fresh-state follow-up

Forge rule:

- before ending a run, either advance, block, complete, fail, or schedule the
  next wake
- do not leave a live case without a next check
