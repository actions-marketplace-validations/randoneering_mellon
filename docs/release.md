# Release, security, and rollback

## Prepare a release

Use Node 24 and the repository lockfile. Install dependencies only in the build job, run the checks in the README, and build with `npm run build`. Commit the generated `dist/index.mjs`, `dist/scorer.mjs`, `dist/detector/` provenance/assets, `dist/build-meta.json`, and `dist/THIRD_PARTY_NOTICES.txt` with the reviewed source. Do not publish a release until the exact commit has passed workflow and bundle checks. The consumer action runs packaged files and does not install npm dependencies, fetch a model, or require Go or Docker.

A consumer workflow must pin the actual reviewed release commit, not a mutable branch, tag, or a SHA copied from an unrelated commit. The example deliberately uses `REPLACE_WITH_REVIEWED_40_CHARACTER_RELEASE_SHA`; it is not an installable revision. Never claim a release exists before publication.

## Security boundary

The supported runtime is Node 24 on maintained Linux runners. UID zero causes a safe failure before classification or GitHub operations; do not add sudo, root bootstraps, or privilege changes. The Action, Markdown parser, inference code, and runtime dependencies share one process and the token's trust boundary. Dependencies are not isolated from the credential. The `pull_request_target` workflow must not check out the consumer repository or execute PR-controlled source, artifacts, or policy files.

The default response welcomes AI-assisted code and asks contributors to describe work in their own words. The score is a fallible signal, not proof of authorship, understanding, or quality. Issue and PR calibration has not been validated; `0.80` is a fixed moderation policy cutoff, not a calibrated authorship probability. Historical evaluation and training are separate follow-up work.

## Upgrade and rollback

To upgrade, review the source and dependency lock changes, run asset verification, all tests, parity and release validation, build the bundle, then publish and pin the resulting commit. Keep the prior reviewed immutable commit available for rollback. To roll back, update the workflow to the prior reviewed SHA or disable the workflow. Rollback does not remove an existing response or reopen a closed issue or pull request. An operator must review and reopen manually if needed.

Serialized retries help avoid duplicate responses, but GitHub writes are separate and are not exactly-once. If a response is confirmed but closure fails, the response remains and the workflow fails safely. Rerunning an unchanged opening event after a manual reopen can close it again; Mellon does not persist manual reopen as a bypass.
