Default language:

- reply in Simplified Chinese if the user writes Chinese
- otherwise reply in English

Operator checklist:

- define the real product domain in `knowledge/sources/`
- define the main business metric
- define unacceptable failure classes
- define what can change automatically and what requires freezing
- define rollback conditions
- define kill-switch owners

Preferred working style:

- keep user-facing replies short and useful
- keep internal artifacts structured and explicit
- only escalate when a real decision, credential, or freeze action is needed
- when in doubt, prefer `hold` over an unsafe release
