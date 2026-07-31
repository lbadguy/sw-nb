const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const html = fs.readFileSync('public/swhappybirthday/index.html', 'utf8');
const css = fs.readFileSync('public/swhappybirthday/style.css', 'utf8');
const script = fs.readFileSync('public/swhappybirthday/script.js', 'utf8');

test('birthday page stays isolated and unlisted', () => {
  assert.match(html, /<meta name="robots" content="noindex, nofollow, noarchive">/);
  assert.match(html, /id="swhappybirthday"|Happy Birthday, Homie/i);
  assert.doesNotMatch(fs.readFileSync('public/index.html', 'utf8'), /swhappybirthday/i);
});

test('birthday page ships local portraits and reference fonts', () => {
  for (const asset of [
    'homie-full.png',
    'homie-portrait.png',
    'homie-cutout.png',
    'homie-cutout-clean-v4.png',
    'helmet-21.glb',
    'helmet-21-uncompressed.glb',
    'Norris_Helmet_mat_BaseColor.webp',
    'mona-sans.woff2',
    'brier-bold.woff2',
  ]) {
    assert.equal(fs.existsSync(`public/swhappybirthday/assets/${asset}`), true);
  }
  assert.match(css, /@font-face\{font-family:Mona/);
  assert.match(css, /--lime:#c7ff00/);
});

test('birthday page includes responsive, accessible interactions', () => {
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /type="module" src="\.\/script\.js(?:\?v=\d+)?"/);
  assert.match(html, /data-helmet-toggle/);
  assert.match(css, /@media\(max-width:800px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(script, /IntersectionObserver/);
  assert.match(script, /class HelmetHero/);
  assert.match(script, /GLTFLoader/);
  assert.match(script, /ShaderMaterial/);
  assert.match(script, /deviceorientation/);
  assert.match(script, /paintCursor/);
  assert.match(script, /event\.key === 'Escape'/);
  assert.match(script, /0\.22 \+ this\.pointer\.y \* 0\.12/);
  assert.match(script, /this\.frameId = requestAnimationFrame/);
  assert.doesNotMatch(script, /confettiLayer|const celebrate|revealObserver|themeObserver/);
  assert.doesNotMatch(html, /confetti-layer|party-toast|data-celebrate/);
  assert.match(css, /Keep everything below the WebGL hero static/);
});
