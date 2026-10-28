import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const reference = JSON.parse(readFileSync(path.join(root, 'tests/fixtures/reference.json'), 'utf8'));
const dist = path.join(root, '..', 'dist');
const repoRoot = path.dirname(root);

function tempDirectory() {
  return mkdtempSync(path.join(os.tmpdir(), 'mellon-release-'));
}

function copyRuntime(target) {
  cpSync(path.join(dist, 'scorer.mjs'), path.join(target, 'scorer.mjs'));
  cpSync(path.join(root, 'provenance.json'), path.join(target, 'provenance.json'));
  cpSync(path.join(root, 'vendor'), path.join(target, 'vendor'), { recursive: true });
}

test('bundled scorer matches every upstream fixture without node_modules or network access', async () => {
  const temporary = tempDirectory();
  try {
    const release = path.join(temporary, 'release');
    copyRuntime(release);
    const { scoreRequest } = await import(pathToFileURL(path.join(release, 'scorer.mjs')).href);
    for (const fixture of reference.cases) {
      const result = await scoreRequest({ protocol_version: 1, text: fixture.text }, release);
      assert.equal(result.outcome, 'classified', fixture.name);
      assert.equal(result.input_sha256, fixture.input_sha256, fixture.name);
      assert.ok(Math.abs(result.robot_score - fixture.robot_score) <= 1e-9, fixture.name);
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('bundled scorer validates model bytes at runtime', async () => {
  const temporary = tempDirectory();
  try {
    const release = path.join(temporary, 'release');
    copyRuntime(release);
    writeFileSync(path.join(release, 'vendor/aicomment/model.json'), '{}');
    const { scoreRequest } = await import(pathToFileURL(path.join(release, 'scorer.mjs')).href);
    await assert.rejects(scoreRequest({ protocol_version: 1, text: 'hello' }, release),
      /asset checksum mismatch/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('the checked-in fixture identity retains the pinned model and source revision', () => {
  assert.equal(reference.model_sha256,
    '228087029eceee8a1c6cd57f29ec484a0141c639f8ed139fd506ef27eaa98825');
  assert.equal(reference.detector_revision, '9d3abed60e628951c7b0d2cd1e1c69eddb23eb97');
  assert.equal(createHash('sha256').update(readFileSync(path.join(root, 'vendor/aicomment/model.json')))
    .digest('hex'), reference.model_sha256);
});

test('release scorer imports no external npm modules', () => {
  const metadata = JSON.parse(readFileSync(path.join(repoRoot, 'dist/build-meta.json'), 'utf8'));
  assert.deepEqual(metadata.imports.map(item => item.path).sort(), [
    'node:crypto', 'node:fs/promises', 'node:path', 'node:url',
  ]);
  assert.ok(metadata.imports.every(item => item.external));
});
