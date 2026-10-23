'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const EXT = path.join(__dirname, '..', 'extension');
const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}

test('manifest V3 con permessi minimi', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions.sort(), ['activeTab', 'storage']);
  assert.deepEqual(manifest.host_permissions, ['https://www.tinkercad.com/*', 'http://localhost/*', 'http://127.0.0.1/*']);
  assert.deepEqual(manifest.optional_host_permissions, ['<all_urls>']);
  for (const cs of manifest.content_scripts) {
    assert.deepEqual(cs.matches, ['https://www.tinkercad.com/*']);
    assert.equal(cs.all_frames, false);
  }
  assert.equal(manifest.content_scripts.filter((cs) => cs.world === 'MAIN').length, 1);
  for (const war of manifest.web_accessible_resources) {
    assert.deepEqual(war.matches, ['https://www.tinkercad.com/*']);
  }
});

test('tutti i file referenziati dal manifest esistono', () => {
  const referenced = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
    ...manifest.content_scripts.flatMap((cs) => [...(cs.js || []), ...(cs.css || [])]),
    ...manifest.web_accessible_resources.flatMap((w) => w.resources),
  ];
  for (const rel of referenced) {
    assert.ok(fs.existsSync(path.join(EXT, rel)), `manca ${rel}`);
  }
  // importScripts del service worker
  const bg = fs.readFileSync(path.join(EXT, manifest.background.service_worker), 'utf8');
  for (const [, rel] of bg.matchAll(/importScripts\('([^']+)'\)/g)) {
    assert.ok(fs.existsSync(path.join(EXT, rel)), `manca ${rel}`);
  }
});

test('le dipendenze dei content script sono caricate prima di content.js', () => {
  const isolated = manifest.content_scripts.find((cs) => !cs.world);
  const order = isolated.js;
  assert.equal(order[order.length - 1], 'content/content.js');
  assert.ok(order.indexOf('shared/state-machine.js') < order.indexOf('content/ui.js'));
});

test('nessuna chiave API o segreto nei file dell\'estensione', () => {
  const patterns = [/sk-or-[a-z0-9-]{10,}/i, /OPENROUTER_API_KEY\s*[:=]/, /Bearer\s+[A-Za-z0-9_-]{20,}/, /openrouter\.ai\/api/];
  for (const file of listFiles(EXT)) {
    if (!/\.(js|json|html|css)$/.test(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    for (const re of patterns) {
      assert.doesNotMatch(content, re, `${path.relative(EXT, file)} contiene ${re}`);
    }
  }
});

test('nessun innerHTML nei file dell\'estensione', () => {
  for (const file of listFiles(EXT).filter((f) => f.endsWith('.js'))) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML/, path.relative(EXT, file));
  }
});

test('.env non è versionato e .env.example non contiene valori', () => {
  const gitignore = fs.readFileSync(path.join(__dirname, '..', '.gitignore'), 'utf8');
  assert.match(gitignore, /^\.env$/m);
  assert.match(gitignore, /^node_modules\/$/m);
  const example = fs.readFileSync(path.join(__dirname, '..', 'server', '.env.example'), 'utf8');
  assert.match(example, /^OPENROUTER_API_KEY=$/m);
  assert.match(example, /^OPENROUTER_MODEL=$/m);
});
