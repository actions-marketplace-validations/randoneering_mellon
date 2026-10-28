import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PACKAGE_ROOT = fileURLToPath(new URL('./', import.meta.url));

class DetectorError extends Error {}

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

async function loadBundle(root) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(path.join(root, 'provenance.json'), 'utf8'));
  } catch {
    throw new DetectorError('detector provenance is missing or invalid');
  }
  if (manifest.protocol_version !== 1 || !/^[a-f0-9]{40}$/.test(manifest.detector_revision)
      || !/^[a-f0-9]{64}$/.test(manifest.model_sha256) || !Array.isArray(manifest.assets)) {
    throw new DetectorError('detector provenance is invalid');
  }
  const vendor = path.resolve(root, 'vendor/aicomment');
  let modelBytes;
  for (const asset of manifest.assets) {
    if (typeof asset.path !== 'string' || !/^[a-f0-9]{64}$/.test(asset.sha256)) {
      throw new DetectorError('detector asset provenance is invalid');
    }
    const filename = path.resolve(vendor, asset.path);
    if (!filename.startsWith(vendor + path.sep)) {
      throw new DetectorError('detector asset path is invalid');
    }
    let bytes;
    try {
      bytes = await readFile(filename);
    } catch {
      throw new DetectorError('detector asset is missing');
    }
    if (digest(bytes) !== asset.sha256) {
      throw new DetectorError('detector asset checksum mismatch');
    }
    if (asset.path === 'model.json') modelBytes = bytes;
  }
  if (!modelBytes || digest(modelBytes) !== manifest.model_sha256) {
    throw new DetectorError('detector model checksum mismatch');
  }
  return { manifest, vendor, model: JSON.parse(modelBytes.toString('utf8')) };
}

export async function scoreRequest(request, root = PACKAGE_ROOT) {
  if (!request || typeof request !== 'object' || Array.isArray(request)
      || request.protocol_version !== 1 || typeof request.text !== 'string'
      || Object.keys(request).some(key => !['protocol_version', 'text'].includes(key))) {
    throw new DetectorError('invalid detector request');
  }
  const { manifest, vendor, model } = await loadBundle(root);
  const { preprocess } = await import(pathToFileURL(path.join(vendor, 'preprocess.mjs')).href);
  const prose = preprocess(request.text, '');
  const result = {
    protocol_version: 1,
    detector_revision: manifest.detector_revision,
    model_sha256: manifest.model_sha256,
    input_sha256: digest(Buffer.from(prose, 'utf8')),
  };
  // Upstream adds boundary markers even when preprocessing removes every word.
  const body = prose.slice(model.markers.open.length, -model.markers.close.length);
  if (!body.trim()) return { ...result, outcome: 'empty_input' };

  const [{ default: winkNLP }, { default: languageModel }, classifier] = await Promise.all([
    import('wink-nlp'),
    import('wink-eng-lite-web-model'),
    import(pathToFileURL(path.join(vendor, 'classifier.mjs')).href),
  ]);
  const nlp = winkNLP(languageModel);
  const preparedModel = classifier.prepareModel(model);
  const tokenizers = classifier.tokenizersFor(preparedModel,
    text => nlp.readDoc(text).tokens().out(nlp.its.pos));
  const classified = classifier.classify(preparedModel, tokenizers, prose);
  const groups = classifier.collapseProbs(
    classifier.perClass(preparedModel, classified.probs), classifier.HUMAN_VS_ROBOT,
  );
  const human = groups.find(([label]) => label === 'human');
  const robotScore = human ? 1 - human[1] : Number.NaN;
  if (!Number.isFinite(robotScore) || robotScore < 0 || robotScore > 1) {
    throw new DetectorError('detector returned an invalid probability');
  }
  return { ...result, outcome: 'classified', robot_score: robotScore };
}
