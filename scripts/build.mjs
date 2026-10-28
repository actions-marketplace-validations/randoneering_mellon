import { build } from 'esbuild';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');

const built = await build({
  entryPoints: [path.join(root, 'src/action.mjs')],
  outfile: path.join(output, 'index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  packages: 'bundle',
  write: false,
  sourcemap: false,
  legalComments: 'eof',
  banner: { js: 'import { fileURLToPath as entryFileURLToPath } from "node:url"; import entryPath from "node:path";' },
  footer: { js: 'if (process.argv[1] && entryPath.resolve(process.argv[1]) === entryFileURLToPath(import.meta.url)) { await main(); }' },
  metafile: true,
});
const index = built.outputFiles.find(file => file.path.endsWith('/index.mjs'));
if (!index) throw new Error('esbuild did not produce index.mjs');
const imports = built.metafile.outputs[Object.keys(built.metafile.outputs)[0]].imports;
const unexpected = imports.filter(item => !item.external && item.kind !== 'import-statement');
if (unexpected.length > 0) throw new Error('unexpected unresolved bundle imports');
await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'index.mjs'), index.contents);

const scorer = await build({
  entryPoints: [path.join(root, 'detector/scorer.mjs')],
  outfile: path.join(output, 'scorer.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  packages: 'bundle',
  write: false,
  sourcemap: false,
  legalComments: 'eof',
  metafile: true,
});
const scorerFile = scorer.outputFiles.find(file => file.path.endsWith('/scorer.mjs'));
if (!scorerFile) throw new Error('esbuild did not produce scorer.mjs');
await writeFile(path.join(output, 'scorer.mjs'), scorerFile.contents);
const scorerImports = scorer.metafile.outputs[Object.keys(scorer.metafile.outputs)[0]].imports;
await cp(path.join(root, 'detector/provenance.json'), path.join(output, 'detector/provenance.json'));
await cp(path.join(root, 'detector/vendor/aicomment'), path.join(output, 'detector/vendor/aicomment'), { recursive: true, force: true });
const notices = [
  ['detector/vendor/aicomment/LICENSE', 'Upstream aicomment license'],
  ['detector/node_modules/wink-nlp/LICENSE', 'wink-nlp license'],
  ['detector/node_modules/wink-eng-lite-web-model/LICENSE', 'wink language model license'],
  ['node_modules/markdown-it/LICENSE', 'markdown-it license'],
  ['node_modules/argparse/LICENSE', 'argparse license'],
  ['node_modules/entities/LICENSE', 'entities license'],
  ['node_modules/linkify-it/LICENSE', 'linkify-it license'],
  ['node_modules/mdurl/LICENSE', 'mdurl license'],
  ['node_modules/punycode.js/LICENSE-MIT.txt', 'punycode.js license'],
  ['node_modules/uc.micro/LICENSE.txt', 'uc.micro license'],
];
const noticeContents = (await Promise.all(notices.map(async ([filename, label]) =>
  `--- ${label} ---\n${await readFile(path.join(root, filename), 'utf8')}`))).join('\n\n');
await writeFile(path.join(output, 'THIRD_PARTY_NOTICES.txt'), noticeContents.endsWith('\n') ? noticeContents : `${noticeContents}\n`);
await writeFile(path.join(output, 'build-meta.json'), `${JSON.stringify({
  entryPoint: 'src/action.mjs',
  output: 'dist/index.mjs',
  platform: 'node',
  format: 'esm',
  target: 'node24',
  esbuildVersion: JSON.parse(await readFile(path.join(root, 'node_modules/esbuild/package.json'), 'utf8')).version,
  imports: scorerImports,
  actionImports: imports,
  scorerOutput: 'dist/scorer.mjs',
  scorerImports,
}, null, 2)}\n`);
