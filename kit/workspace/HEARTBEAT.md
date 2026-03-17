# HEARTBEAT.md

Only `app-forge` should act on this checklist.

- Ensure these runtime tasks exist:
  - `forge-domain-refresh`
  - `forge-signal-harvest`
  - `forge-active-improvement-loop`
  - `forge-post-promotion-monitor`
- If a required task is missing, recreate it and arm its next wake.
- If `knowledge/sources/` changed materially, schedule `app-domain-compiler`.
- If `forge/cases/inbox/` contains a strong new case and no better active case exists, promote one case into `forge/cases/active/`.
- Continue the highest-value active case using the role agents.
- Before ending a run, ensure the active case has either advanced, blocked, failed, completed, or been scheduled for the next wake.
- Never busy-poll. Use `task` state, logs, and wake scheduling.
- If the same blocker appears twice in a row, force a route change or hold the
  case.
- If nothing needs attention, reply `HEARTBEAT_OK`.
