import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const sourceDirectory = path.join(root, 'src');
const sourceFiles = (await readdir(sourceDirectory)).filter(file => file.endsWith('.mjs')).sort();
const testFiles = [];
for (const directory of ['detector/tests', 'tests/unit', 'tests/integration']) {
  for (const file of await readdir(path.join(root, directory))) {
    if (file.endsWith('.test.mjs')) testFiles.push(path.join(directory, file));
  }
}
const args = [
  '--test',
  '--experimental-test-coverage',
  '--test-coverage-include=src/**',
  '--test-coverage-include=detector/scorer.mjs',
  '--test-coverage-lines=0',
  ...testFiles.sort(),
];
const result = spawnSync(process.execPath, args, {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 8 * 1024 * 1024,
});
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
if (result.status !== 0) process.exit(result.status ?? 1);

const output = result.stdout + result.stderr;
const matching = output.match(/all files\s*\|\s*([0-9.]+)\s*\|/i);
if (!matching) throw new Error('Node test runner did not report source-line coverage.');
const coverage = Number(matching[1]);
if (!Number.isFinite(coverage) || coverage < 80) {
  throw new Error(`First-party Action runtime line coverage is ${coverage}%, below 80%.`);
}
const expected = [...sourceFiles.map(file => `src/${file}`), 'detector/scorer.mjs'];
for (const file of expected) {
  const basename = path.basename(file);
  const row = output.split('\n').find(line => line.includes(basename) && /\|\s*[0-9.]+\s*\|/.test(line));
  if (!row) throw new Error(`Coverage report is missing Action runtime file: ${file}`);
  const columns = row.split('|').map(value => value.trim());
  const percentageIndex = columns.findIndex(value => /^\d+(?:\.\d+)?$/.test(value));
  if (percentageIndex < 0) throw new Error(`Coverage report has no line percentage for ${file}`);
  const linePercentage = Number(columns[percentageIndex]);
  const lines = await readFile(path.join(root, file), 'utf8');
  const denominator = lines.split('\n').length - (lines.endsWith('\n') ? 1 : 0);
  console.log(`${file}: ${linePercentage}% of ${denominator} source lines`);
}
console.log('Coverage scope: src/*.mjs and detector/scorer.mjs, the complete first-party Action runtime graph.');
console.log('detector/adapter.mjs is a legacy standalone stdin wrapper, not imported or executed by the Action, and is excluded from Action runtime coverage.');
console.log(`First-party Action runtime source files: ${expected.length}.`);
console.log(`First-party Action runtime line coverage: ${coverage}% (Node native coverage, minimum 80%).`);
