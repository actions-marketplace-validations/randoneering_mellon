import filesystem from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';

filesystem.rm = () => {
  throw new Error('build attempted to remove existing output');
};
syncBuiltinESMExports();

const live = await import('node:fs/promises');
if (live.rm !== filesystem.rm) {
  throw new Error('deletion guard is not active');
}
