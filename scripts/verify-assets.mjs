import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, 'detector/provenance.json'), 'utf8'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
if (manifest.detector_revision !== '9d3abed60e628951c7b0d2cd1e1c69eddb23eb97') {
  throw new Error('unexpected detector source revision');
}
if (manifest.model_sha256 !== '228087029eceee8a1c6cd57f29ec484a0141c639f8ed139fd506ef27eaa98825') {
  throw new Error('unexpected pinned model digest');
}
for (const asset of manifest.assets) {
  const filename = path.join(root, 'detector/vendor/aicomment', asset.path);
  if (digest(await readFile(filename)) !== asset.sha256) {
    throw new Error(`detector asset checksum mismatch: ${asset.path}`);
  }
}
console.log(`verified ${manifest.assets.length} detector assets`);
