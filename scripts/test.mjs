import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const tests = readdirSync('tests')
  .filter((file) => file.endsWith('.test.cjs'))
  .sort()
  .map((file) => resolve('tests', file));

execFileSync(process.execPath, ['--test', ...tests], { stdio: 'inherit' });

