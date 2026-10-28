import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));

test('CI installs detector dependencies before tests and builds', () => {
  const workflow = parse(readFileSync(new URL('../../.github/workflows/test.yml', import.meta.url), 'utf8'));
  const steps = workflow.jobs.test.steps;
  const install = steps.findIndex(step => step.run === 'npm ci --ignore-scripts' && step['working-directory'] === 'detector');
  const buildTest = steps.findIndex(step => step.run === 'npm run test:build');
  assert.ok(install >= 0, 'CI must install locked detector dependencies without scripts');
  assert.ok(buildTest > install, 'detector dependencies must be installed before build tests');
});

test('CI checks that built distribution files match the checkout', () => {
  const workflow = parse(readFileSync(new URL('../../.github/workflows/test.yml', import.meta.url), 'utf8'));
  const steps = workflow.jobs.test.steps;
  const build = steps.findIndex(step => step.run === 'npm run build');
  const check = steps.findIndex(step => step.name === 'Check distribution is committed');
  assert.ok(build >= 0 && check > build, 'CI must check distribution files after building');
  assert.match(steps[check].run, /git status --porcelain --untracked-files=all -- dist/);
  assert.match(steps[check].run, /exit 1/);
});

test('release drafter runs on main with a pinned action and does not publish', () => {
  const workflow = parse(readFileSync(new URL('../../.github/workflows/release-drafter.yml', import.meta.url), 'utf8'));
  assert.deepEqual(workflow.on, { push: { branches: ['main'] } });
  assert.deepEqual(workflow.permissions, { contents: 'write', 'pull-requests': 'read' });
  const step = workflow.jobs.draft.steps[0];
  assert.match(step.uses, /^release-drafter\/release-drafter@[a-f0-9]{40}$/);
  assert.equal(step.with.publish, false);
  const config = parse(readFileSync(new URL('../../.github/release-drafter.yml', import.meta.url), 'utf8'));
  assert.match(config.template, /\$CHANGES/);
});

test('Action metadata includes Marketplace branding', () => {
  const metadata = parse(readFileSync(new URL('../../action.yml', import.meta.url), 'utf8'));
  assert.deepEqual(metadata.branding, { icon: 'message-square', color: 'yellow' });
});

test('release validator accepts metadata and consumer template boundaries', () => {
  const result = spawnSync(process.execPath, ['scripts/validate-release.mjs'], {
    cwd: root, encoding: 'utf8', timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /validated/);
});
