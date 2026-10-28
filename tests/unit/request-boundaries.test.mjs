import assert from 'node:assert/strict';
import test from 'node:test';
import { createEligibleContinuation, parseEvent } from '../../src/inputs.mjs';
import { prepareSection } from '../../src/prepare.mjs';

const payload = {
  action: 'opened',
  repository: { full_name: 'owner/repo' },
  issue: { number: 7, title: 'Title', user: { login: 'contributor' } },
};
const context = { eventName: 'issues', repository: 'owner/repo' };

test('an absent opening body is normalized to null', () => {
  assert.equal(parseEvent({ ...context, payload }).body, null);
});

test('supported event names require a structurally valid action envelope', () => {
  for (const broken of [null, [], {}, { action: null }, { action: 3 }]) {
    assert.throws(() => parseEvent({ ...context, payload: broken }), /invalid/i);
  }
  assert.deepEqual(parseEvent({ ...context, payload: { action: 'edited' } }), { kind: 'skip' });
});

test('the eligible continuation preserves its actual moderation result', async () => {
  const run = createEligibleContinuation({
    getContext: () => ({ ...context, payload: { ...payload, issue: { ...payload.issue, body: null } } }),
    getInputs: () => ({}),
  });
  const result = await run(async () => ({ outcome: 'below_threshold', score: 0.2 }));
  assert.deepEqual(result, { outcome: 'below_threshold', score: 0.2 });
});

test('an excluded fenced list item does not consume a separate empty list item', () => {
  const source = '-\n- ```js\n  secret\n  ```\n\nsafe';
  assert.equal(prepareSection(source), '-\n\nsafe');
});
