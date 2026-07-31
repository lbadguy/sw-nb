import { copyFileSync, mkdirSync } from 'node:fs';

mkdirSync('public/vendor', { recursive: true });
copyFileSync('node_modules/lucide/dist/umd/lucide.min.js', 'public/vendor/lucide.min.js');
console.log('Vendored Lucide to public/vendor/lucide.min.js');

