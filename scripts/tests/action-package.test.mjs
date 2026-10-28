import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));

function npmPackage(name) {
  return JSON.parse(readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf8'));
}

test('built Action runs from isolated release files and keeps submission as data', async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'mellon-release-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const release = path.join(temp, 'release');
  await mkdir(release, { recursive: true });
  for (const item of ['action.yml', 'dist/index.mjs', 'dist/scorer.mjs', 'dist/build-meta.json',
    'dist/THIRD_PARTY_NOTICES.txt', 'dist/detector']) {
    await cp(path.join(root, item), path.join(release, item), { recursive: true });
  }
  const event = {
    action: 'opened', repository: { full_name: 'owner/repo' },
    issue: { number: 4, title: 'Injection `$(touch /tmp/nope)`', body: 'Text {{ secrets.TOKEN }}',
      user: { login: 'contributor' } },
  };
  const eventPath = path.join(temp, 'event.json');
  const outputPath = path.join(temp, 'output');
  await writeFile(eventPath, JSON.stringify(event));
  const smoke = await import(pathToFileURL(path.join(release, 'dist/index.mjs')));
  let scored;
  let fetchCount = 0;
  const result = await smoke.runAction({
    env: { GITHUB_EVENT_NAME: 'issues', GITHUB_REPOSITORY: 'owner/repo',
      GITHUB_EVENT_PATH: eventPath, GITHUB_OUTPUT: outputPath,
      GITHUB_STEP_SUMMARY: path.join(temp, 'summary') },
    getuid: () => 1000,
    getInput: name => ({ token: 'mock-token', allowlist: '', response: '' })[name] ?? '',
    includeSummary: false,
    fetchImpl: async () => { fetchCount++; throw new Error('Unexpected network request.'); },
    score: async request => {
      scored = request.text;
      return { protocol_version: 1, outcome: 'classified', robot_score: 0.2,
        detector_revision: 'c'.repeat(40), model_sha256: 'a'.repeat(64), input_sha256: 'b'.repeat(64) };
    },
  });
  assert.equal(result.outcome, 'below_cutoff');
  assert.match(scored, /\$\(touch \/tmp\/nope\)/);
  assert.match(scored, /\{\{ secrets\.TOKEN \}\}/);
  assert.equal(fetchCount, 0);
  assert.equal(await readFile(outputPath, 'utf8'), 'outcome=below_cutoff\nrobot-score=0.2\n');
  const notices = await readFile(path.join(release, 'dist/THIRD_PARTY_NOTICES.txt'), 'utf8');
  assert.match(notices, /license/i);
  for (const dependency of ['markdown-it', 'argparse', 'entities', 'linkify-it', 'mdurl', 'punycode.js', 'uc.micro']) {
    const metadata = npmPackage(dependency);
    assert.ok(notices.includes(`--- ${dependency} license ---`), `${dependency} notice section exists`);
    const licenseFile = dependency === 'punycode.js' ? 'LICENSE-MIT.txt'
      : dependency === 'uc.micro' ? 'LICENSE.txt' : 'LICENSE';
    const license = await readFile(path.join(root, 'node_modules', dependency, licenseFile), 'utf8');
    assert.ok(notices.includes(license), `${dependency} license text is present`);
    assert.ok(metadata.license);
  }
  assert.equal(existsSync(path.join(release, 'node_modules')), false);
  assert.equal(existsSync(path.join(temp, 'node_modules')), false);
});

test('compiled executable rejects root before event access and exits nonzero', async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'mellon-root-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const eventPath = path.join(temp, 'event.json');
  const outputPath = path.join(temp, 'output');
  await writeFile(eventPath, JSON.stringify({ action: 'edited' }));
  const result = spawnSync(process.execPath, [path.join(root, 'dist/index.mjs')], {
    cwd: temp,
    encoding: 'utf8',
    env: { PATH: process.env.PATH, GITHUB_EVENT_NAME: 'issues', GITHUB_REPOSITORY: 'owner/repo',
      GITHUB_EVENT_PATH: eventPath, GITHUB_OUTPUT: outputPath },
  });
  if (process.getuid?.() === 0) {
    assert.equal(result.status, 1);
    assert.equal(await readFile(outputPath, 'utf8'), 'outcome=error\n');
  }
  assert.doesNotMatch(result.stdout + result.stderr, /submission text|token/i);
});
