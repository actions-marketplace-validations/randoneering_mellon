import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { scoreRequest } from '../adapter.mjs';

const reference = JSON.parse(readFileSync(new URL('./fixtures/reference.json', import.meta.url), 'utf8'));

for (const fixture of reference.cases) {
  test(`matches upstream prose UI: ${fixture.name}`, async () => {
    const result = await scoreRequest({ protocol_version: 1, text: fixture.text });
    assert.equal(result.outcome, 'classified');
    assert.equal(result.detector_revision, reference.detector_revision);
    assert.equal(result.model_sha256, reference.model_sha256);
    assert.equal(result.input_sha256, fixture.input_sha256);
    assert.ok(Math.abs(result.robot_score - fixture.robot_score) <= 1e-9,
      `robot score drift for ${fixture.name}`);
  });
}
