import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const guard = fileURLToPath(new URL('./fixtures/block-removal.mjs', import.meta.url));

test('build succeeds when removal of existing outputs is prohibited', () => {
  const result = spawnSync(process.execPath, ['--import', guard, 'scripts/build.mjs'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 128 * 1024,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(path.join(root, 'dist/scorer.mjs')));
  assert.ok(existsSync(path.join(root, 'dist/index.mjs')));
  assert.ok(existsSync(path.join(root, 'dist/detector/provenance.json')));
  assert.ok(existsSync(path.join(root, 'dist/detector/vendor/aicomment/model.json')));
  assert.ok(existsSync(path.join(root, 'dist/build-meta.json')));
  assert.ok(existsSync(path.join(root, 'dist/THIRD_PARTY_NOTICES.txt')));
});
