import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const roots = ['worker.js', 'public/app.js', 'public/shared-browser-utils.js'];
for (const directory of ['public/bro-phone', 'public/dongchedi-user']) {
  for (const file of readdirSync(directory)) {
    if (file.endsWith('.js')) roots.push(join(directory, file));
  }
}

for (const file of roots) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
}

console.log(`Checked ${roots.length} JavaScript files.`);

