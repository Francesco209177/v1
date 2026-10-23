'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildMessages, SYSTEM_PROMPT } = require('../prompt');
const { PNG_DATA_URL } = require('./helpers');

test('il prompt di sistema contiene le istruzioni richieste', () => {
  assert.match(SYSTEM_PROMPT, /Sei un esperto di Arduino, elettronica e Tinkercad Circuits/);
  assert.match(SYSTEM_PROMPT, /unico blocco fenced code con linguaggio cpp/);
  assert.match(SYSTEM_PROMPT, /Non inventare collegamenti o pin non verificabili/);
});

test('testo prima dell\'immagine e contesto completo', () => {
  const messages = buildMessages({
    prompt: 'Fai lampeggiare il LED sul pin 13',
    image: PNG_DATA_URL,
    currentCode: 'void setup() {}\n```\nvoid loop() {}',
    editorMode: 'Text',
    device: '1 (Arduino Uno R3)',
    components: [{ type: 'resistor', count: 2 }],
    cropped: true,
  });
  assert.equal(messages[0].role, 'system');
  assert.equal(messages[1].role, 'user');
  const [text, image] = messages[1].content;
  assert.equal(text.type, 'text');
  assert.equal(image.type, 'image_url');
  assert.equal(image.image_url.url, PNG_DATA_URL);
  assert.match(text.text, /Fai lampeggiare il LED sul pin 13/);
  assert.match(text.text, /resistor ×2/);
  assert.match(text.text, /ritagliato/);
  // Il codice esistente contiene ``` : il delimitatore deve essere più lungo.
  assert.match(text.text, /````cpp\n/);
});

test('senza immagine non aggiunge parti image_url', () => {
  const messages = buildMessages({ prompt: 'x', image: null, components: [] });
  assert.equal(messages[1].content.length, 1);
  assert.match(messages[1].content[0].text, /Nessuno screenshot disponibile/);
  assert.match(messages[1].content[0].text, /non disponibile/);
});

test('screenshot non ritagliato: chiede di concentrarsi sul circuito', () => {
  const messages = buildMessages({ prompt: 'x', image: PNG_DATA_URL, cropped: false });
  assert.match(messages[1].content[0].text, /Concentrati solo sull'area del circuito/);
});
