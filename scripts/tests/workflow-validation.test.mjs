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

test('release validator accepts metadata and consumer template boundaries', () => {
  const result = spawnSync(process.execPath, ['scripts/validate-release.mjs'], {
    cwd: root, encoding: 'utf8', timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /validated/);
});
