import test from 'node:test';
import assert from 'node:assert/strict';
import { moderate } from '../../src/moderation.mjs';

const hash = 'a'.repeat(64);
const inputHash = 'b'.repeat(64);
const revision = 'c'.repeat(40);
const event = { action: 'opened', repository: { full_name: 'o/r' }, issue: { number: 4, title: 'Title', body: 'Body', user: { login: 'contributor' } } };
function result(score) {
  return { protocol_version: 1, outcome: 'classified', robot_score: score, detector_revision: revision, model_sha256: hash, input_sha256: inputHash };
}
function setup(scoreValue = 0.8, options = {}) {
  const calls = [];
  const api = {
    async listComments() { calls.push('comments'); return options.comments ?? []; },
    async getItem() { calls.push('state'); return options.states?.shift() ?? { state: 'open', title: 'Title', body: 'Body' }; },
    async createComment({ body }) { calls.push('post'); return { id: 22, body, user: { login: 'github-actions[bot]', type: 'Bot' } }; },
    async closeItem() { calls.push('close'); },
  };
  let scored = 0;
  return { calls, api, get scored() { return scored; }, score: async ({ protocol_version, text }) => { scored++; assert.equal(protocol_version, 1); assert.equal(text, 'Title\n\nBody'); return result(scoreValue); } };
}
const getContext = () => ({ eventName: 'issues', repository: 'o/r', payload: event });
const getInputs = () => ({});
const marker = `<!-- mellon-submission-moderation-v1 repo=o/r item=4 input=${inputHash} detector=${revision} model=${hash} -->`;

test('uses real classifier result and enforces inclusive unrounded cutoff', async () => {
  for (const [value, expected] of [[0.6, 'below_cutoff'], [0.799999, 'below_cutoff'], [0.8, 'closed'], [0.800001, 'closed']]) {
    const fixture = setup(value);
    const outcome = await moderate({ getContext, getInputs, api: fixture.api, score: fixture.score });
    assert.equal(outcome.outcome, expected);
    assert.equal(fixture.scored, 1);
    assert.equal(fixture.calls.includes('post'), expected === 'closed');
  }
});

test('reuses only a genuine bot comment and checks state before response and closure', async () => {
  const fixture = setup(0.8, { comments: [{ id: 3, body: `spoof ${marker}`, user: { login: 'contributor', type: 'User' } }] });
  const outcome = await moderate({ getContext, getInputs, api: fixture.api, score: fixture.score });
  assert.equal(outcome.outcome, 'closed');
  assert.deepEqual(fixture.calls, ['comments', 'state', 'post', 'state', 'close']);
});

test('changed current state prevents response and post-response change reports partial skip', async () => {
  const changed = setup(0.8, { states: [{ state: 'open', title: 'changed', body: 'Body' }] });
  assert.equal((await moderate({ getContext, getInputs, api: changed.api, score: changed.score })).outcome, 'skipped');
  assert.deepEqual(changed.calls, ['comments', 'state']);
  const later = setup(0.8, { states: [{ state: 'open', title: 'Title', body: 'Body' }, { state: 'closed', title: 'Title', body: 'Body' }] });
  const outcome = await moderate({ getContext, getInputs, api: later.api, score: later.score });
  assert.equal(outcome.outcome, 'skipped');
  assert.equal(outcome.partial, true);
  assert.equal(later.calls.includes('close'), false);
});

test('invalid score metadata never causes API access and classifier remains lazy for skipped inputs', async () => {
  const fixture = setup(0.9);
  for (const invalid of [
    { ...result(NaN) }, { ...result(Infinity) }, { ...result(-0.1) }, { ...result(1.1) },
    { ...result(0.9), detector_revision: 'rev-1' }, { ...result(0.9), model_sha256: undefined },
    { ...result(0.9), input_sha256: undefined }, { ...result(0.9), protocol_version: 2 },
  ]) {
    fixture.score = async () => invalid;
    assert.equal((await moderate({ getContext, getInputs, api: fixture.api, score: fixture.score })).outcome, 'error');
  }
  assert.deepEqual(fixture.calls, []);
  let calls = 0;
  const unsupported = await moderate({ getContext: () => ({ eventName: 'issues', repository: 'o/r', payload: { action: 'closed' } }), getInputs, api: fixture.api, score: async () => { calls++; } });
  assert.equal(unsupported.outcome, 'skipped');
  assert.equal(calls, 0);
});

test('empty input is reported without API calls and requires real provenance', async () => {
  const fixture = setup();
  fixture.score = async () => ({ protocol_version: 1, outcome: 'empty_input', detector_revision: revision, model_sha256: hash, input_sha256: inputHash });
  const outcome = await moderate({ getContext, getInputs, api: fixture.api, score: fixture.score });
  assert.equal(outcome.outcome, 'empty_input');
  assert.deepEqual(fixture.calls, []);
});

test('uncertain comment failures reconcile once before closure and never blindly repost', async () => {
  const fixture = setup();
  let listings = 0;
  fixture.api.listComments = async () => { listings++; return listings === 1 ? [] : [{ id: 22, body: marker, user: { login: 'github-actions[bot]', type: 'Bot' } }]; };
  fixture.api.createComment = async () => { fixture.calls.push('post'); throw new Error('timeout secret'); };
  const outcome = await moderate({ getContext, getInputs, api: fixture.api, score: fixture.score });
  assert.equal(outcome.outcome, 'closed');
  assert.equal(fixture.calls.filter((call) => call === 'post').length, 1);
  assert.equal(listings, 2);
});

test('failed reconciliation and close failures are safe partial errors', async () => {
  const fixture = setup();
  fixture.api.createComment = async () => { throw new Error('token leaked'); };
  fixture.api.listComments = async () => { if (fixture.calls.filter((call) => call === 'comments').length > 1) throw new Error('raw'); return []; };
  const uncertain = await moderate({ getContext, getInputs, api: fixture.api, score: fixture.score });
  assert.equal(uncertain.outcome, 'error');
  assert.equal(uncertain.uncertainty, true);
  assert.equal(fixture.calls.includes('close'), false);
  const closeFailure = setup();
  closeFailure.api.closeItem = async () => { throw new Error('raw token'); };
  const partial = await moderate({ getContext, getInputs, api: closeFailure.api, score: closeFailure.score });
  assert.equal(partial.outcome, 'error');
  assert.equal(partial.partial, true);
  assert.equal(partial.error.includes('raw token'), false);
});
