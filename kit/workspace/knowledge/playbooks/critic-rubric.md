# Critic Rubric

Score from 1 to 5 for each dimension:

- task success improvement
- clarity and legibility
- consistency with domain rules
- regression risk
- safety or policy fit
- maintainability

The scorecard must also state:

- strongest evidence for the candidate
- weakest part of the candidate
- ship blockers
- recommended follow-up checks

Canonical output path:

- `forge/eval/reports/<caseId>-v1.critic.json`

If the canonical candidate artifact is missing, write the scorecard as a hold
signal and state that evaluation could not proceed on evidence.
