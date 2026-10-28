# Mellon

Mellon is a JavaScript GitHub Action for a repository's human-voice contribution policy. AI-assisted code is welcome; contributors should describe their work in their own words. The Action reviews only opening issue and pull-request titles and bodies, excludes fenced code and blockquotes, and applies a fixed inclusive `0.60` robot-score cutoff. Scores are fallible and have not been validated for issue or pull-request moderation.

The Action uses Node 24 on maintained Linux runners and rejects UID 0 before inference or GitHub operations. It is the supported runtime. Existing Go files remain historical and are not an Action runtime, CLI, or supported installation path.

## Setup

1. Review [workflow configuration](docs/configuration.md), [classification limits](docs/classification.md), [moderation and reruns](docs/moderation.md), and [dependency trust](docs/dependencies.md).
2. Publish and review an Action release, then replace the clearly unusable revision placeholder in [`examples/submission-moderation.yml`](examples/submission-moderation.yml) with that release's actual immutable 40-character commit SHA.
3. Copy the workflow into the consuming repository, set its owner/name and required permissions, and do not add a consumer checkout or run contributor-controlled code.

The workflow supports `issues.opened` and `pull_request_target.opened`, with only `issues: write` and `pull-requests: write`. Set `allowlist` to a JSON array of exact account logins. Set `response` to literal text or omit it for the packaged human-voice message. The cutoff is not configurable. See [all Action inputs and defaults](docs/configuration.md).

## Build and test

Use Node 24 and the checked-in lockfile:

```sh
npm ci --ignore-scripts
npm run verify:assets
npm run test:build
npm test
npm run test:parity
npm run build
npm run validate:release
```

The build produces `dist/index.mjs`, `dist/scorer.mjs`, detector assets and provenance, build metadata, and third-party notices. Include generated `dist/` files in a release commit; consumers do not install npm packages or fetch models at runtime. Run the tests and release validator before publishing. The local YAML validator is used because `actionlint` is not installed.

## Security and operations

The scorer, parser, and Action share one Node process and token trust boundary. Dependencies are not sandboxed from credentials. Do not run this Action with a token broader than required, and review source, locked npm dependencies, and release artifacts before upgrading. A root runner is rejected; do not bootstrap with sudo or change runtime ownership.

Concurrent runs serialize per repository and item. This is not an exactly-once guarantee. A response posted before a later failure can remain. Manual reopening is not a persisted exemption, and rerunning an unchanged opening event can close the item again. Roll back by changing the workflow to a previously reviewed immutable Action revision or disabling the workflow. Rollback does not delete comments or automatically reopen items.

Historical dataset evaluation, calibration, and training remain separate follow-up work.
