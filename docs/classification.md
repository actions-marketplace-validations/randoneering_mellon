# Submission classification

Mellon prepares the opening issue or pull-request title and body, then uses the bundled JavaScript scorer locally. The Action runs on GitHub's Node 24 runtime on maintained Linux runners and rejects UID 0 before inference or API operations. This JavaScript Action interface has no supported Go command-line, stdin, Docker, or standalone local-classification delivery path; retained legacy Go files are not a supported runtime.

## Supported input

Only `issues.opened` and `pull_request_target.opened` events are eligible. Other event names or actions, including ordinary `pull_request`, are skipped before policy inputs or inference are needed. A supported payload must match trusted `GITHUB_REPOSITORY` and contain a positive safe integer item number, author login, nonempty title, and a string or null body. Event JSON is bounded to 4 MiB valid UTF-8; malformed supported events fail without exposing submitted text or secrets. Payload-provided URLs are ignored.

Mellon normalizes CRLF and CR to LF, excludes complete CommonMark fenced-code and blockquote source spans, and keeps other source text, including templates, inline code, indented code, and HTML. Parser source maps determine block spans. Outer blank content and ordinary surrounding spaces are trimmed while meaningful code indentation is retained. Nonempty title and body sections are joined with two LF characters. Short titles have no minimum word-count exemption. If exclusions leave no classifier text, report an empty input without a score.

## Scoring and limits

Inference is local and uses the pinned detector and bundled model assets. A score is a fallible signal, not a calibrated probability for pull requests or issues, and it does not prove who wrote code, whether a contributor understands the work, or whether a contribution is good. Do not treat the score as a fraction of AI authorship. Historical evaluation, calibration, and training are outside v1 and remain separate follow-up work.

An inclusive unrounded score of `0.80` is the fixed moderation cutoff. Workflow policy uses an exact-account JSON allowlist and literal response text as described in [workflow configuration](configuration.md). Submitted text cannot configure policy, execute code, or alter the model. No network fetch is used for inference.
