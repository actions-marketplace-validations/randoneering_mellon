import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import winkNLP from 'wink-nlp';
import languageModel from 'wink-eng-lite-web-model';
import { preprocess } from '../vendor/aicomment/preprocess.mjs';
import { prepareModel, tokenizersFor, classify, perClass, collapseProbs,
  HUMAN_VS_ROBOT } from '../vendor/aicomment/classifier.mjs';

// Execute the pinned upstream prose UI path, independently of Mellon's adapter.
const manifest = JSON.parse(readFileSync(new URL('../provenance.json', import.meta.url), 'utf8'));
const bytes = readFileSync(new URL('../vendor/aicomment/model.json', import.meta.url));
if (createHash('sha256').update(bytes).digest('hex') !== manifest.model_sha256) {
  throw new Error('reference model checksum mismatch');
}
const model = prepareModel(JSON.parse(bytes));
const nlp = winkNLP(languageModel);
const tokenizers = tokenizersFor(model, text => nlp.readDoc(text).tokens().out(nlp.its.pos));
const examples = [
  ['short', 'hello'],
  ['bug-report', 'I get a crash when saving twice. This started after the last update.'],
  ['question', 'Can we make the timeout configurable? Mine takes about 90 seconds.'],
  ['formal', 'This change introduces a structured approach to configuration management and improves maintainability.'],
  ['punctuation', 'Wait... why?! It worked yesterday; now it does not.'],
  ['non-ascii', 'Le serveur échoue après le redémarrage. Où sont les journaux ?'],
  ['mixed-script', 'The server returns an error: 接続できません。'],
  ['template', '## Description\nThe app crashes.\n## Checklist\n- [x] I searched existing issues.'],
  ['inline-code', 'Calling `save()` twice raises EINVAL; I expected the second call to succeed.'],
  ['longer', 'I restarted the process and checked the logs. The first connection succeeds, but later attempts time out. I can reproduce this on two machines using the same configuration. Please let me know what else would help narrow it down.'],
];
const cases = examples.map(([name, text]) => {
  const prose = preprocess(text, '');
  const scored = classify(model, tokenizers, prose);
  const human = collapseProbs(perClass(model, scored.probs), HUMAN_VS_ROBOT)
    .find(([label]) => label === 'human')[1];
  return { name, text, input_sha256: createHash('sha256').update(prose).digest('hex'),
    robot_score: 1 - human };
});
const output = new URL('./fixtures/reference.json', import.meta.url);
mkdirSync(new URL('./fixtures/', import.meta.url), { recursive: true });
writeFileSync(output, JSON.stringify({ detector_revision: manifest.detector_revision,
  model_sha256: manifest.model_sha256, cases }, null, 2) + '\n', { flag: 'wx' });
console.log(`Generated ${cases.length} reference cases through pinned upstream inference.`);
