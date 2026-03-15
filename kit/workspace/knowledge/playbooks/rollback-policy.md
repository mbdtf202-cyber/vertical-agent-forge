# Rollback Policy

Trigger rollback when:

- a promoted change creates a worse regression than the original case
- a safety or trust issue appears
- user-facing quality drops on important baseline scenarios
- the promoted change causes repeated operator intervention

Rollback artifact should state:

- change being rolled back
- trigger evidence
- immediate revert action
- follow-up case to reopen
