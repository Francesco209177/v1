'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { extractCode, parseFencedBlocks } = require('../extension/shared/extract-code');

const BLINK = 'void setup() {\n  pinMode(13, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(13, HIGH);\n  delay(1000);\n}';

test('estrae un singolo blocco cpp senza delimitatori', () => {
  const text = `Ecco il codice:\n\n\`\`\`cpp\n${BLINK}\n\`\`\`\n\nBuon lavoro!`;
  const r = extractCode(text, { finishReason: 'stop' });
  assert.equal(r.hasCode, true);
  assert.equal(r.code, BLINK + '\n');
  assert.equal(r.language, 'cpp');
  assert.doesNotMatch(r.code, /```/);
  assert.equal(r.explanation, 'Ecco il codice:\n\nBuon lavoro!');
  assert.deepEqual(r.warnings, []);
});

test('accetta blocchi senza linguaggio, ~~~ e varianti arduino/c++', () => {
  for (const fence of ['```', '```arduino', '```c++', '~~~cpp', '```CPP']) {
    const close = fence.startsWith('~') ? '~~~' : '```';
    const r = extractCode(`${fence}\n${BLINK}\n${close}`);
    assert.equal(r.hasCode, true, fence);
    assert.equal(r.code, BLINK + '\n');
  }
});

test('normalizza CRLF', () => {
  const r = extractCode('```cpp\r\nvoid setup() {}\r\nvoid loop() {}\r\n```\r\n');
  assert.equal(r.code, 'void setup() {}\nvoid loop() {}\n');
});

test('più blocchi: preferisce il primo cpp e avvisa', () => {
  const text = '```text\nnota\n```\n\n```cpp\n' + BLINK + '\n```\n\n```cpp\n// altro\n```';
  const r = extractCode(text);
  assert.equal(r.hasCode, true);
  assert.equal(r.code, BLINK + '\n');
  assert.deepEqual(r.warnings.map((w) => w.code), ['MULTIPLE_BLOCKS']);
});

test('nessun blocco: niente codice da copiare', () => {
  const r = extractCode('Non vedo a quale pin è collegato il LED. Puoi indicarlo?');
  assert.equal(r.hasCode, false);
  assert.equal(r.reason, 'NO_CODE_BLOCK');
  assert.equal(r.code, '');
  assert.match(r.explanation, /Puoi indicarlo/);
});

test('blocco non chiuso (risposta troncata): niente codice', () => {
  const r = extractCode('```cpp\nvoid setup() {\n  pinMode(13, OUTPUT);', { finishReason: 'length' });
  assert.equal(r.hasCode, false);
  assert.equal(r.reason, 'UNCLOSED_BLOCK');
  assert.deepEqual(r.warnings.map((w) => w.code), ['TRUNCATED']);
});

test('linguaggio diverso da C/C++: non viene copiato', () => {
  const r = extractCode('```python\nprint("hi")\n```');
  assert.equal(r.hasCode, false);
  assert.equal(r.reason, 'WRONG_LANGUAGE');
});

test('avvisa se mancano setup() o loop()', () => {
  const r = extractCode('```cpp\nint x = 1;\n```');
  assert.equal(r.hasCode, true);
  assert.deepEqual(r.warnings.map((w) => w.code), ['MISSING_SETUP_LOOP']);
});

test('contenuto vuoto o non stringa', () => {
  assert.equal(extractCode('').reason, 'EMPTY');
  assert.equal(extractCode(null).reason, 'EMPTY');
  assert.equal(extractCode('```cpp\n\n```').reason, 'NO_CODE_BLOCK');
});

test('un fence più lungo può contenere ``` nel codice', () => {
  const text = '````cpp\n// esempio con ```\nvoid setup() {}\nvoid loop() {}\n````';
  const r = extractCode(text);
  assert.equal(r.hasCode, true);
  assert.match(r.code, /esempio con ```/);
});

test('parseFencedBlocks separa testo e blocchi', () => {
  const { blocks, outsideText } = parseFencedBlocks('a\n```c\nx\n```\nb');
  assert.deepEqual(blocks, [{ lang: 'c', code: 'x', closed: true }]);
  assert.equal(outsideText, 'a\nb');
});

test('HTML nella risposta resta testo semplice', () => {
  const r = extractCode('<img src=x onerror=alert(1)>\n```cpp\n// <script>alert(1)</script>\nvoid setup(){}\nvoid loop(){}\n```');
  assert.equal(r.hasCode, true);
  assert.match(r.code, /<script>/); // nessuna interpretazione: la UI usa textContent/value
  assert.match(r.explanation, /<img/);
});
