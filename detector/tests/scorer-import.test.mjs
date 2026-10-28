import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const scorer = new URL('../scorer.mjs', import.meta.url);

test('imports the pure scorer without reading stdin or starting the CLI', () => {
  const source = `
    import { scoreRequest } from ${JSON.stringify(scorer.href)};
    const result = await scoreRequest({ protocol_version: 1, text: 'hello' });
    process.stdout.write(JSON.stringify(result));
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
    cwd: root,
    input: '',
    encoding: 'utf8',
    timeout: 15_000,
    maxBuffer: 128 * 1024,
  });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.outcome, 'classified');
  assert.ok(Number.isFinite(output.robot_score));
});
