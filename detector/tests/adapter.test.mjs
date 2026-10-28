import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const adapter = path.join(root, 'adapter.mjs');
const manifest = JSON.parse(readFileSync(path.join(root, 'provenance.json'), 'utf8'));

function invoke(input) {
  return spawnSync(process.execPath, [adapter], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    timeout: 15_000,
    maxBuffer: 128 * 1024,
  });
}

test('classifies prose and emits only score, outcome, and provenance', () => {
  const secretText = 'The request times out after I restart the worker. Can you help?';
  const result = invoke({ protocol_version: 1, text: secretText });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.protocol_version, 1);
  assert.equal(output.outcome, 'classified');
  assert.ok(Number.isFinite(output.robot_score));
  assert.ok(output.robot_score >= 0 && output.robot_score <= 1);
  assert.equal(output.detector_revision, manifest.detector_revision);
  assert.equal(output.model_sha256, manifest.model_sha256);
  assert.match(output.input_sha256, /^[a-f0-9]{64}$/);
  assert.ok(!result.stdout.includes(secretText));
  assert.ok(!result.stderr.includes(secretText));
});

for (const text of ['', ' \n\t ', 'hello', 'Le serveur échoue après le redémarrage.']) {
  test(`handles ${JSON.stringify(text)} without a fabricated empty score`, () => {
    const result = invoke({ protocol_version: 1, text });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    if (!text.trim()) {
      assert.equal(output.outcome, 'empty_input');
      assert.ok(!Object.hasOwn(output, 'robot_score'));
    } else {
      assert.equal(output.outcome, 'classified');
      assert.ok(Number.isFinite(output.robot_score));
    }
  });
}

for (const input of ['not JSON', {}, { protocol_version: 2, text: 'hello' },
  { protocol_version: 1, text: null }, { protocol_version: 1, text: 'hello', unknown: true }]) {
  test(`rejects malformed request ${JSON.stringify(input)}`, () => {
    const result = invoke(input);
    assert.notEqual(result.status, 0);
    const output = JSON.parse(result.stdout);
    assert.equal(output.outcome, 'error');
    assert.ok(!Object.hasOwn(output, 'robot_score'));
    assert.ok(!result.stderr.includes('not JSON'));
  });
}

test('repeats identical inputs with identical hashes and scores', () => {
  const request = { protocol_version: 1, text: 'I get a crash when saving twice.' };
  const first = invoke(request);
  const second = invoke(request);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.deepEqual(JSON.parse(first.stdout), JSON.parse(second.stdout));
});

test('hashes the exact upstream-preprocessed text', async () => {
  const { preprocess } = await import('../vendor/aicomment/preprocess.mjs');
  const text = 'A small test with punctuation!';
  const output = JSON.parse(invoke({ protocol_version: 1, text }).stdout);
  const expected = createHash('sha256').update(preprocess(text, ''), 'utf8').digest('hex');
  assert.equal(output.input_sha256, expected);
});

for (const kind of ['missing', 'changed']) {
  test(`rejects ${kind} assets before loading inference modules`, async () => {
    const { scoreRequest } = await import('../adapter.mjs');
    const temporary = mkdtempSync(path.join(os.tmpdir(), 'mellon-assets-'));
    if (kind === 'changed') {
      cpSync(path.join(root, 'vendor'), path.join(temporary, 'vendor'), { recursive: true });
      cpSync(path.join(root, 'provenance.json'), path.join(temporary, 'provenance.json'));
      writeFileSync(path.join(temporary, 'vendor/aicomment/model.json'), '{}');
    }
    await assert.rejects(
      scoreRequest({ protocol_version: 1, text: 'hello' }, temporary),
      /asset|provenance|checksum/,
    );
  });
}
