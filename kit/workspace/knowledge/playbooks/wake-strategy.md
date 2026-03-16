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
- when blocked on external change, lengthen the wake interval instead of
  rechecking immediately
- if two wakes in a row produce the same blocker, switch routes before
  scheduling another fast wake
