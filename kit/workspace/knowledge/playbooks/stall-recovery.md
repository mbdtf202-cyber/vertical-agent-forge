# Stall Recovery

Use this playbook when the forge is moving but not making progress.

## Stall Signals

Treat a case as stalled when one or more of these is true:

- the same hypothesis is tried again without new evidence
- the same blocker appears across two consecutive wakes
- the same missing artifact is awaited without a narrower follow-up step
- Worker, Critic, and Adversary outputs keep changing words but not the decision
- the next step is "try again" without a reason the world is now different

## Recovery Ladder

Recover in this order:

1. change the method
   - use a different prompt, playbook, evidence source, or role handoff
2. change the scope
   - shrink the case to one narrower hypothesis
3. change the cadence
   - back off the next wake instead of busy-checking
4. change the decision
   - move the case to `hold`, `reject`, or `needs-approval`

## Hard Rules

- do not rerun the same path just to look busy
- do not hide a blocker inside optimistic language
- do not keep a live case active without either progress or a named blocker
- if a path is exhausted, say so and choose the next best route

## Required Evidence Update

When you pivot, update the active case with:

- attempted approach
- why it stalled
- the new route
- the condition that would justify trying the old route again
