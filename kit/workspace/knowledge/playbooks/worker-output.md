# Worker Output

The Worker must produce:

- one bounded hypothesis
- exact files changed or proposed
- expected win
- expected risk
- rollback hint

Canonical output path:

- `forge/candidates/<caseId>-v1.candidate.json`

The Worker artifact should be implementable and reviewable.

Bad output:

- "improve tone"
- "be smarter"
- "fix prompts"

Good output:

- "tighten follow-up question threshold in `vertical-service-core` and add one
  domain red-flag checklist entry"

Do not invent alternate candidate filenames when the canonical path is known.
