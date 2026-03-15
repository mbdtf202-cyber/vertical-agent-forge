# Releasing

## Tag Format

Use standard product tags:

- `v0.1.0`
- `v0.1.1`

## Local Packaging

```bash
RELEASE_REPO=<owner>/<repo> RELEASE_TAG=v0.1.0 RELEASE_VERSION=0.1.0 npm run package
```

## Release Assets

- `vertical-agent-forge-kit.tar.gz`
- `vertical-agent-forge-kit.tar.gz.sha256`
- `vertical-agent-forge-kit.README.md`
- `vertical-agent-forge-kit.README.zh-CN.md`

## GitHub Workflow

Push a `v*` tag to trigger the release workflow.
