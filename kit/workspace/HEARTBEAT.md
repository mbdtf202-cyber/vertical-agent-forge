# HEARTBEAT.md

Only `app-forge` should act on this checklist.

- Ensure these runtime tasks exist:
  - `forge-signal-harvest`
  - `forge-active-improvement-loop`
  - `forge-post-promotion-monitor`
- If a required task is missing, recreate it and arm its next wake.
- If `forge/cases/inbox/` contains a strong new case and no better active case
  exists, promote one case into `forge/cases/active/`.
- Continue the highest-value active case using the role agents.
- Keep progress silent unless blocked, approval-needed, milestone, or complete.
- Never busy-poll. Use `task` state, logs, and wake scheduling.
- If nothing needs attention, reply `HEARTBEAT_OK`.
