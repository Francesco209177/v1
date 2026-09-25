'use strict';
/* =========================================================================
   CORE: namespace globale, matematica, rumore procedurale, impostazioni, input
   ========================================================================= */
const G = (window.G = {
  HALF: 600,            // metà lato mappa (mappa 1200 x 1200 m)
  WATER: -3.2,          // livello dell'acqua
  time: 0,
  dt: 0,
  state: 'menu',        // menu | loading | playing | paused | dead
  V3: THREE.Vector3,
});

/* ---------------------------------------------------------------- math */
G.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
G.lerp = (a, b, t) => a + (b - a) * t;
G.smooth = (e0, e1, x) => {
  const t = G.clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
G.damp = (a, b, lambda, dt) => G.lerp(a, b, 1 - Math.exp(-lambda * dt));
G.wrapAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
G.dampAngle = (a, b, lambda, dt) => a + G.wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));

// PRNG deterministico (mulberry32) — il mondo è sempre lo stesso
G.makeRng = (seed) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
G.rand = G.makeRng(1337);
G.rnd = (a, b) => a + (b - a) * G.rand();
G.rndi = (a, b) => Math.floor(G.rnd(a, b + 1));
G.pick = (arr) => arr[Math.floor(G.rand() * arr.length)];
// random non deterministico per gameplay
G.fr = (a, b) => a + (b - a) * Math.random();

/* ------------------------------------------------ Perlin noise 2D + fbm */
(function () {
  const r = G.makeRng(90210);
  const perm = new Uint8Array(512);
  const p = [];
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const gx = [1, -1, 1, -1, 1, -1, 0, 0], gy = [1, 1, -1, -1, 0, 0, 1, -1];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  G.noise2 = (x, y) => {
    const X = Math.floor(x), Y = Math.floor(y);
    const xf = x - X, yf = y - Y;
    const xi = X & 255, yi = Y & 255;
    const g = (h, dx, dy) => gx[h & 7] * dx + gy[h & 7] * dy;
    const aa = perm[perm[xi] + yi], ab = perm[perm[xi] + yi + 1];
    const ba = perm[perm[xi + 1] + yi], bb = perm[perm[xi + 1] + yi + 1];
    const u = fade(xf), v = fade(yf);
    const x1 = G.lerp(g(aa, xf, yf), g(ba, xf - 1, yf), u);
    const x2 = G.lerp(g(ab, xf, yf - 1), g(bb, xf - 1, yf - 1), u);
    return G.lerp(x1, x2, v) * 1.1;
  };
  G.fbm = (x, y, oct = 4) => {
    let a = 0.5, f = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) {
      s += a * G.noise2(x * f, y * f);
      n += a;
      a *= 0.5;
      f *= 2.03;
    }
    return s / n;
  };
})();

/* ------------------------------------------------------------ settings */
G.DEFAULTS = {
  sens: 1.0,          // sensibilità mouse
  adsSens: 0.75,      // moltiplicatore sensibilità in mira
  vehSens: 1.0,       // sensibilità telecamera veicolo
  invertY: false,
  fov: 80,
  volume: 0.8,
  gravity: 18,        // m/s² (terrestre "arcade")
  quality: 'alta',    // bassa | media | alta
  shadows: true,
  showFps: true,
  dayCycle: true,
  timeOfDay: 16.5,
  headBob: true,
  difficulty: 'normale', // facile | normale | veterano
  crosshairColor: '#ffffff',
  hitmarkers: true,
};
G.settings = Object.assign({}, G.DEFAULTS);
G.loadSettings = () => {
  try {
    const s = JSON.parse(localStorage.getItem('ob_settings') || '{}');
    Object.assign(G.settings, s);
  } catch (e) { /* storage non disponibile */ }
};
G.saveSettings = () => {
  try { localStorage.setItem('ob_settings', JSON.stringify(G.settings)); } catch (e) { /* ignore */ }
};
G.loadSettings();
G.diffMul = () => ({ facile: 0.55, normale: 1, veterano: 1.6 }[G.settings.difficulty] || 1);

/* ---------------------------------------------------------------- input */
G.keys = {};
G.pressed = new Set();
G.mouse = { dx: 0, dy: 0, left: false, right: false, wheel: 0, clicked: false, lastMove: 0 };
G.pointerLocked = false;

G.wasPressed = (code) => G.pressed.has(code);
G.endFrameInput = () => {
  G.pressed.clear();
  G.mouse.dx = 0;
  G.mouse.dy = 0;
  G.mouse.wheel = 0;
  G.mouse.clicked = false;
};

addEventListener('keydown', (e) => {
  if (G.state === 'playing' && ['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ControlLeft', 'KeyF'].includes(e.code)) e.preventDefault();
  if (!e.repeat) G.pressed.add(e.code);
  G.keys[e.code] = true;
});
addEventListener('keyup', (e) => { G.keys[e.code] = false; });
addEventListener('blur', () => { G.keys = {}; G.mouse.left = G.mouse.right = false; });
addEventListener('mousemove', (e) => {
  if (!G.pointerLocked) return;
  // alcuni browser generano picchi anomali di movimento: li scartiamo
  if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
  G.mouse.dx += e.movementX;
  G.mouse.dy += e.movementY;
  G.mouse.lastMove = G.time;
});
addEventListener('mousedown', (e) => {
  if (e.button === 0) { G.mouse.left = true; G.mouse.clicked = true; }
  if (e.button === 2) G.mouse.right = true;
});
addEventListener('mouseup', (e) => {
  if (e.button === 0) G.mouse.left = false;
  if (e.button === 2) G.mouse.right = false;
});
addEventListener('wheel', (e) => { G.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
addEventListener('contextmenu', (e) => e.preventDefault());

/* ------------------------------------------ helper geometria / materiali */
// Box con UV scalate in metri (texture che si ripetono in modo coerente)
G.boxGeo = (w, h, d, tileU = 4, tileV = 4, roofTile = 8) => {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const sizes = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [su, sv] = sizes[f];
    const tu = f === 2 || f === 3 ? roofTile : tileU;
    const tv = f === 2 || f === 3 ? roofTile : tileV;
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * (su / tu), uv.getY(i) * (sv / tv));
    }
  }
  return g;
};

// merge semplice di geometrie (non indicizzate) con matrice opzionale
G.mergeGeos = (list) => {
  const pos = [], nor = [], uvs = [];
  for (const item of list) {
    let g = item.geo || item;
    g = g.index ? g.toNonIndexed() : g.clone();
    if (item.matrix) g.applyMatrix4(item.matrix);
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
    if (g.attributes.uv) uvs.push(...g.attributes.uv.array);
    else for (let i = 0; i < g.attributes.position.count; i++) uvs.push(0, 0);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return out;
};
G.mat4 = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
  const m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  return m;
};
G.std = (color, rough = 0.8, metal = 0, extra = {}) =>
  new THREE.MeshStandardMaterial(Object.assign({ color, roughness: rough, metalness: metal }, extra));

// fonde tutte le mesh di un gruppo in una mesh per materiale (meno draw call)
G.mergeByMaterial = (group) => {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const byMat = new Map();
  group.traverse((o) => {
    if (!o.isMesh) return;
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push({ geo: o.geometry, matrix: new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld) });
  });
  const out = [];
  for (const [mat, items] of byMat) {
    const m = new THREE.Mesh(G.mergeGeos(items), mat);
    m.castShadow = m.receiveShadow = true;
    out.push(m);
  }
  return out;
};
