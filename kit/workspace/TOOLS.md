# Tool Notes

- Use `task` for durable runtime state, progress, and wake ownership.
- Use `sessions_spawn` for bounded role work, not for endless delegation trees.
- Use `subagents` only when you need to inspect, steer, or kill spawned work.
- Use `memory_search` for durable playbooks, domain knowledge, and accepted lessons.
- Use `write` and `edit` to produce artifacts under `forge/`.
- Do not use chat history as the only memory for improvement work.

## File Discipline

- write one artifact per decision point
- keep artifacts scoped to one case id
- update the same case files instead of scattering duplicate notes

## Delegation Discipline

- Worker builds
- Critic scores
- Adversary attacks
- Promoter decides
- Archivist distills

Do not merge these responsibilities inside one artifact.
