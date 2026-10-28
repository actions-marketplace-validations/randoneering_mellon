import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runAction } from '../../src/action.mjs';

const event = {
  action: 'opened', repository: { full_name: 'owner/repo' },
  issue: { number: 7, title: 'Describe your contribution', body: 'I implemented a test.',
    user: { login: 'contributor' } },
};

async function setup(t, { uid = 1000, eventName = 'issues', payload = event,
  inputs = { token: 'test-token' }, scorer, fetchImpl } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mellon-action-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const eventPath = path.join(directory, 'event.json');
  const outputPath = path.join(directory, 'output');
  await writeFile(eventPath, JSON.stringify(payload));
  const env = {
    GITHUB_EVENT_NAME: eventName,
    GITHUB_REPOSITORY: 'owner/repo',
    GITHUB_EVENT_PATH: eventPath,
    GITHUB_OUTPUT: outputPath,
    GITHUB_STEP_SUMMARY: path.join(directory, 'summary'),
  };
  const result = await runAction({
    env, getuid: () => uid,
    getInput: (name) => inputs[name] ?? '',
    ...(scorer ? { score: scorer } : {}),
    ...(fetchImpl ? { fetchImpl } : {}),
  });
  return { result, outputPath };
}

test('unsupported and allowlisted events skip before token, scorer, and API access', async (t) => {
  let scoreCalls = 0;
  let fetchCalls = 0;
  const unsupported = await setup(t, { eventName: 'issues', payload: { action: 'edited' },
    inputs: {}, scorer: async () => { scoreCalls++; }, fetchImpl: async () => { fetchCalls++; } });
  assert.deepEqual(unsupported.result, { outcome: 'skipped' });

  const allowed = await setup(t, { inputs: { token: '', allowlist: '["CONTRIBUTOR"]' },
    scorer: async () => { scoreCalls++; }, fetchImpl: async () => { fetchCalls++; } });
  assert.deepEqual(allowed.result, { outcome: 'skipped' });
  assert.equal(scoreCalls, 0);
  assert.equal(fetchCalls, 0);
});

test('invalid policy and root runtime fail before inference or API access', async (t) => {
  let calls = 0;
  const invalid = await setup(t, { inputs: { token: 'secret', allowlist: '[] trailing' },
    scorer: async () => { calls++; }, fetchImpl: async () => { calls++; } });
  assert.equal(invalid.result.outcome, 'error');
  assert.equal(calls, 0);
  const root = await setup(t, { uid: 0, scorer: async () => { calls++; },
    fetchImpl: async () => { calls++; } });
  assert.equal(root.result.outcome, 'error');
  assert.equal(calls, 0);
});

test('invalid UTF-8 and oversized event files fail safely', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mellon-event-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const eventPath = path.join(directory, 'event.json');
  const env = { GITHUB_EVENT_NAME: 'issues', GITHUB_REPOSITORY: 'owner/repo',
    GITHUB_EVENT_PATH: eventPath, GITHUB_OUTPUT: path.join(directory, 'out') };
  await writeFile(eventPath, Buffer.from([0xff]));
  const invalidUtf8 = await runAction({ env, getuid: () => 1000, getInput: () => 'token' });
  assert.equal(invalidUtf8.outcome, 'error');
  await writeFile(eventPath, Buffer.alloc(4 * 1024 * 1024 + 1, 0x20));
  const oversized = await runAction({ env, getuid: () => 1000, getInput: () => 'token' });
  assert.equal(oversized.outcome, 'error');
});

test('malformed supported event fails before creating API client or scorer', async (t) => {
  let calls = 0;
  const { result } = await setup(t, { payload: { action: 'opened' },
    scorer: async () => { calls++; }, fetchImpl: async () => { calls++; } });
  assert.equal(result.outcome, 'error');
  assert.equal(calls, 0);
});

test('a real packaged scorer runs with trusted packaged detector assets', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mellon-scorer-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const eventPath = path.join(directory, 'event.json');
  const outputPath = path.join(directory, 'output');
  await writeFile(eventPath, JSON.stringify(event));
  const result = await runAction({
    env: { GITHUB_EVENT_NAME: 'issues', GITHUB_REPOSITORY: 'owner/repo',
      GITHUB_EVENT_PATH: eventPath, GITHUB_OUTPUT: outputPath },
    getuid: () => 1000, getInput: name => name === 'token' ? 'test-token' : '',
    fetchImpl: async () => new Response('[]', { status: 200 }),
    actionDirectory: path.resolve('dist'),
  });
  assert.equal(result.outcome, 'below_cutoff');
  assert.ok(result.robotScore >= 0.6 && result.robotScore < 0.8);
  assert.match(await readFile(outputPath, 'utf8'), /^outcome=below_cutoff\nrobot-score=0\.\d+\n$/);
});

test('normal no-score outcomes write only validated output records', async (t) => {
  const { result, outputPath } = await setup(t, { scorer: async () => ({
    protocol_version: 1, outcome: 'classified', robot_score: 0.599999,
    detector_revision: 'c'.repeat(40), model_sha256: 'a'.repeat(64),
    input_sha256: 'b'.repeat(64),
  }) });
  assert.equal(result.outcome, 'below_cutoff');
  assert.equal(result.robotScore, 0.599999);
  assert.equal(await readFile(outputPath, 'utf8'), 'outcome=below_cutoff\nrobot-score=0.599999\n');
});

test('scorer/API failures are redacted and set error output', async (t) => {
  const secret = 'token-should-not-leak';
  const source = 'private submission text';
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mellon-error-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const eventPath = path.join(directory, 'event.json');
  const outputPath = path.join(directory, 'output');
  await writeFile(eventPath, JSON.stringify(event));
  const result = await runAction({
    env: { GITHUB_EVENT_NAME: 'issues', GITHUB_REPOSITORY: 'owner/repo',
      GITHUB_EVENT_PATH: eventPath, GITHUB_OUTPUT: outputPath },
    getuid: () => 1000, getInput: (name) => name === 'token' ? secret : '',
    score: async () => { throw new Error(`${source} ${secret}`); },
  });
  assert.equal(result.outcome, 'error');
  assert.doesNotMatch(JSON.stringify(result), new RegExp(`${source}|${secret}`));
  assert.equal(await readFile(outputPath, 'utf8'), 'outcome=error\n');
});

test('output write errors become operational failures without leaking event data', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mellon-output-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const eventPath = path.join(directory, 'event.json');
  await writeFile(eventPath, JSON.stringify({ action: 'edited' }));
  const result = await runAction({
    env: { GITHUB_EVENT_NAME: 'issues', GITHUB_REPOSITORY: 'owner/repo',
      GITHUB_EVENT_PATH: eventPath, GITHUB_OUTPUT: directory },
    getuid: () => 1000, getInput: () => '',
  });
  assert.equal(result.outcome, 'error');
});

test('rejects unsafe outcome and non-finite scores in output formatter', async () => {
  const { formatOutputs } = await import('../../src/action.mjs');
  assert.throws(() => formatOutputs({ outcome: 'secret\nTOKEN=value' }));
  assert.throws(() => formatOutputs({ outcome: 'below_cutoff', robotScore: NaN }));
  assert.throws(() => formatOutputs({ outcome: 'below_cutoff', robotScore: 1.1 }));
  assert.throws(() => formatOutputs({ outcome: 'below_cutoff', robotScore: '0.6' }));
});
