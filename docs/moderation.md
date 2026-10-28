# Submission moderation

Mellon processes only supported issue and `pull_request_target` opening events. It prepares the opening title and body, then lazily runs the bundled local classifier for eligible, nonempty submissions. A score below the fixed `0.60` cutoff leaves GitHub unchanged. A score at or above the cutoff triggers a current-state check, a moderation response, a second state check, and closure through the issue- or pull-request-specific API endpoint.

The default response welcomes AI-assisted code while asking contributors to describe the work in their own words. The automated result can be wrong; it is not proof of authorship, code quality, or understanding. The model probabilities are not validated for issue or pull-request moderation and `0.60` is a repository policy cutoff, not a calibrated authorship probability.

## Writes and reruns

A response must exist before Mellon requests closure. Mellon uses a marker bound to repository, item, prepared-input hash, detector revision, and model hash. On reruns, it reuses a matching comment only when GitHub reports a positive comment ID and the server-authored identity `github-actions[bot]` with type `Bot`. A contributor-written matching marker never suppresses the Action response.

If comment creation fails ambiguously, Mellon lists comments once to reconcile the write. A confirmed matching bot response permits a fresh state check and then closure. If reconciliation cannot confirm the response, Mellon stops without reposting or closing. A failed close or a stale state after posting leaves a response in place and reports the partial result; it does not claim the item was closed. API errors are reported without raw response bodies or submitted text.

Serialized workflow runs reduce ordinary duplicate writes, but independent concurrent executions and human edits cannot be made atomic with GitHub's separate reads and writes. Exactly-once behavior is not guaranteed. A manual reopen is not recorded as an exemption: rerunning an old opening event for an unchanged item can close it again. Mellon does not automatically process edits, reopenings, or later discussion.

The API client always addresses `https://api.github.com` using trusted runner repository and item identity. It bounds request duration and response sizes, rejects redirects, validates same-resource pagination, and reads all comment pages before mutations. The Action requires a narrowly permissioned token and its packaged dependencies share the same process and credential trust boundary; they are not sandboxed from that token.
