import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { scoreRequest } from './scorer.mjs';

export { scoreRequest };

const MAX_INPUT = 4 * 1024 * 1024;

class DetectorError extends Error {}

async function main() {
  try {
    const chunks = [];
    let length = 0;
    for await (const chunk of process.stdin) {
      length += chunk.length;
      if (length > MAX_INPUT) throw new DetectorError('detector request exceeds 4 MiB');
      chunks.push(chunk);
    }
    let request;
    try {
      request = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
    } catch {
      throw new DetectorError('detector request must be valid UTF-8 JSON');
    }
    process.stdout.write(JSON.stringify(await scoreRequest(request)) + '\n');
  } catch (error) {
    const message = error instanceof DetectorError ? error.message : 'detector inference failed';
    process.stdout.write(JSON.stringify({ protocol_version: 1, outcome: 'error', error: message }) + '\n');
    process.stderr.write(message + '\n');
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
