# Releasing

## Tag Format

Use standard product tags:

- `v0.2.0`
- `v0.2.1`

## Local Packaging

```bash
RELEASE_REPO=<owner>/<repo> RELEASE_TAG=v0.2.0 RELEASE_VERSION=0.2.0 npm run package
```

## Packaging Model

- the GitHub release archive is full-fat and includes the site, release tooling, and visual assets
- the npm package is runtime-only and contains the CLI, `kit/`, and product docs
- `init --domain` must work from the unpacked npm tarball, not only from a git checkout

## Release Assets

- `vertical-agent-forge-kit.tar.gz`
- `vertical-agent-forge-kit.tar.gz.sha256`
- `vertical-agent-forge-kit.README.md`
- `vertical-agent-forge-kit.README.zh-CN.md`

## GitHub Workflow

Push a `v*` tag to trigger the release workflow.
