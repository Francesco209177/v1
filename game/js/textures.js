'use strict';
/* =========================================================================
   TEXTURE PROCEDURALI: generate su canvas all'avvio (niente file esterni)
   ========================================================================= */
G.tex = {};
(function () {
  const R = G.makeRng(4242);
  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return [c, c.getContext('2d')];
  }
  function toTex(c, repeat = true, srgb = true) {
    const t = new THREE.CanvasTexture(c);
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (srgb) t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 8;
    return t;
  }
  // rumore per-pixel con più ottave (tileable approssimato)
  function noiseFill(ctx, w, h, base, amp, scale = 1, colorFn) {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const nx = x / w, ny = y / h;
        // somma di sinusoidi periodiche → tileable
        let n = 0;
        n += G.noise2(Math.cos(nx * 6.283) * 2 * scale + 10, Math.sin(nx * 6.283) * 2 * scale + ny * 4 * scale) * 0.5;
        n += (R() - 0.5) * 0.5;
        const i = (y * w + x) * 4;
        const c = colorFn ? colorFn(n, x, y) : [base[0] + n * amp, base[1] + n * amp, base[2] + n * amp];
        d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  function speckle(ctx, w, h, n, colors, sMin = 1, sMax = 3, alpha = 0.3) {
    for (let i = 0; i < n; i++) {
      ctx.globalAlpha = alpha * R();
      ctx.fillStyle = colors[Math.floor(R() * colors.length)];
      const s = sMin + R() * (sMax - sMin);
      ctx.fillRect(R() * w, R() * h, s, s);
    }
    ctx.globalAlpha = 1;
  }

  /* terreno: dettaglio grigio moltiplicato per i colori dei vertici */
  {
    const [c, x] = canvas(512, 512);
    noiseFill(x, 512, 512, null, 0, 3, (n) => {
      const v = 200 + n * 90;
      return [v, v, v * 0.97];
    });
    speckle(x, 512, 512, 5000, ['#fff', '#000', '#8a8', '#553'], 1, 3, 0.25);
    // fili d'erba
    x.strokeStyle = 'rgba(40,60,20,0.25)';
    for (let i = 0; i < 1500; i++) {
      const px = R() * 512, py = R() * 512;
      x.beginPath();
      x.moveTo(px, py);
      x.lineTo(px + (R() - 0.5) * 4, py - 3 - R() * 6);
      x.stroke();
    }
    G.tex.ground = toTex(c);
  }

  /* asfalto con segnaletica: u = larghezza, v = lunghezza */
  function asphalt(lines = true, edge = true) {
    const [c, x] = canvas(256, 512);
    noiseFill(x, 256, 512, [62, 62, 64], 26, 4);
    speckle(x, 256, 512, 3000, ['#999', '#222', '#555'], 1, 2, 0.4);
    // crepe
    x.strokeStyle = 'rgba(20,20,20,0.6)';
    x.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      let px = R() * 256, py = R() * 512;
      x.beginPath();
      x.moveTo(px, py);
      for (let k = 0; k < 8; k++) { px += (R() - 0.5) * 30; py += (R() - 0.5) * 30; x.lineTo(px, py); }
      x.stroke();
    }
    // chiazze d'olio
    for (let i = 0; i < 6; i++) {
      const g = x.createRadialGradient(128 + (R() - 0.5) * 80, R() * 512, 0, 128, R() * 512, 40);
      g.addColorStop(0, 'rgba(10,10,10,0.25)');
      g.addColorStop(1, 'rgba(10,10,10,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, 256, 512);
    }
    if (edge) {
      x.fillStyle = 'rgba(225,225,215,0.85)';
      x.fillRect(10, 0, 6, 512);
      x.fillRect(240, 0, 6, 512);
    }
    if (lines) {
      x.fillStyle = 'rgba(230,180,40,0.9)';
      x.fillRect(124, 40, 8, 180);
      x.fillRect(124, 296, 8, 180);
    }
    // usura della vernice
    speckle(x, 256, 512, 1500, ['#3a3a3c'], 1, 3, 0.8);
    return toTex(c);
  }
  G.tex.road = asphalt(true, true);
  G.tex.roadPlain = asphalt(false, false);

  /* marciapiede / cemento a lastre */
  {
    const [c, x] = canvas(256, 256);
    noiseFill(x, 256, 256, [128, 126, 120], 30, 3);
    x.strokeStyle = 'rgba(40,40,40,0.5)';
    x.lineWidth = 2;
    for (let i = 0; i <= 256; i += 64) {
      x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.stroke();
      x.beginPath(); x.moveTo(0, i); x.lineTo(256, i); x.stroke();
    }
    speckle(x, 256, 256, 1500, ['#555', '#aaa', '#4a4630'], 1, 4, 0.3);
    G.tex.concrete = toTex(c);
  }

  /* facciate: 4 campate x 4 piani (16 m x 14 m) + mappa emissiva per luci notturne */
  function facade(style) {
    const [c, x] = canvas(512, 512);
    const [ce, xe] = canvas(512, 512);
    xe.fillStyle = '#000';
    xe.fillRect(0, 0, 512, 512);
    const wallCols = [[176, 160, 130], [140, 72, 55], [95, 100, 108], [190, 186, 176], [120, 110, 90]];
    const w = wallCols[style];
    noiseFill(x, 512, 512, w, 30, 2);
    if (style === 1) { // mattoni
      x.strokeStyle = 'rgba(60,40,30,0.45)';
      for (let y = 0; y < 512; y += 8) {
        x.beginPath(); x.moveTo(0, y); x.lineTo(512, y); x.stroke();
        for (let xx = (y / 8) % 2 ? 0 : 10; xx < 512; xx += 20) { x.beginPath(); x.moveTo(xx, y); x.lineTo(xx, y + 8); x.stroke(); }
      }
    }
    // colature di sporco
    for (let i = 0; i < 40; i++) {
      const px = R() * 512;
      const g = x.createLinearGradient(0, 0, 0, 512);
      g.addColorStop(0, 'rgba(30,25,20,0.12)');
      g.addColorStop(1, 'rgba(30,25,20,0)');
      x.fillStyle = g;
      x.fillRect(px, R() * 256, 2 + R() * 6, 200 + R() * 200);
    }
    const bw = 128, fh = 128;
    for (let fy = 0; fy < 4; fy++) {
      // marcapiano
      x.fillStyle = 'rgba(0,0,0,0.18)';
      x.fillRect(0, fy * fh + fh - 6, 512, 6);
      for (let bx = 0; bx < 4; bx++) {
        const glass = style === 2;
        const ww = glass ? 118 : 60, wh = glass ? 100 : 64;
        const px = bx * bw + (bw - ww) / 2, py = fy * fh + (glass ? 10 : 28);
        const broken = R() < 0.12;
        // cornice
        x.fillStyle = 'rgba(40,38,35,0.9)';
        x.fillRect(px - 4, py - 4, ww + 8, wh + 8);
        const g = x.createLinearGradient(px, py, px + ww, py + wh);
        if (broken) {
          g.addColorStop(0, '#0b0b0b');
          g.addColorStop(1, '#151515');
        } else {
          g.addColorStop(0, glass ? '#6f8290' : '#4b5a66');
          g.addColorStop(0.5, glass ? '#2c3a44' : '#1d252c');
          g.addColorStop(1, glass ? '#51626e' : '#303b44');
        }
        x.fillStyle = g;
        x.fillRect(px, py, ww, wh);
        // montanti
        x.fillStyle = 'rgba(50,50,50,0.9)';
        x.fillRect(px + ww / 2 - 2, py, 4, wh);
        if (!glass) x.fillRect(px, py + wh * 0.35, ww, 3);
        if (!broken && !glass && R() < 0.4) { // tende
          x.fillStyle = `rgba(${150 + R() * 80},${130 + R() * 60},${100 + R() * 50},0.8)`;
          x.fillRect(px, py, ww, wh * (0.2 + R() * 0.5));
        }
        // luci accese di notte
        if (!broken && R() < 0.35) {
          xe.fillStyle = R() < 0.7 ? '#ffcf7a' : '#cfe4ff';
          xe.globalAlpha = 0.5 + R() * 0.5;
          xe.fillRect(px, py, ww, wh);
          xe.globalAlpha = 1;
        }
        // balconi per stile sovietico
        if (style === 3 && fy > 0) {
          x.fillStyle = 'rgba(150,146,138,1)';
          x.fillRect(px - 10, py + wh + 2, ww + 20, 16);
          x.fillStyle = 'rgba(0,0,0,0.25)';
          x.fillRect(px - 10, py + wh + 16, ww + 20, 4);
        }
      }
    }
    // fori di proiettile / danni
    speckle(x, 512, 512, 300, ['#222', '#444'], 1, 3, 0.7);
    return { map: toTex(c), emissive: toTex(ce) };
  }
  G.tex.facades = [0, 1, 2, 3, 4].map(facade);

  /* tetto in ghiaia */
  {
    const [c, x] = canvas(256, 256);
    noiseFill(x, 256, 256, [85, 83, 78], 30, 5);
    speckle(x, 256, 256, 4000, ['#aaa', '#333', '#665'], 1, 2, 0.5);
    G.tex.roof = toTex(c);
  }

  /* lamiera ondulata (container, hangar) — tinta via material.color */
  {
    const [c, x] = canvas(256, 256);
    for (let i = 0; i < 256; i++) {
      const v = 170 + Math.sin(i / 256 * Math.PI * 2 * 16) * 45;
      x.fillStyle = `rgb(${v},${v},${v})`;
      x.fillRect(i, 0, 1, 256);
    }
    // ruggine
    for (let i = 0; i < 60; i++) {
      const g = x.createRadialGradient(R() * 256, R() * 256, 0, R() * 256, R() * 256, 10 + R() * 30);
      g.addColorStop(0, 'rgba(110,60,30,0.35)');
      g.addColorStop(1, 'rgba(110,60,30,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, 256, 256);
    }
    speckle(x, 256, 256, 800, ['#555', '#8a5a3a'], 1, 3, 0.4);
    G.tex.metal = toTex(c);
  }

  /* cassa di legno */
  {
    const [c, x] = canvas(128, 128);
    noiseFill(x, 128, 128, [140, 110, 70], 30, 6);
    x.strokeStyle = 'rgba(60,40,20,0.7)';
    x.lineWidth = 2;
    for (let i = 0; i < 128; i += 21) { x.beginPath(); x.moveTo(0, i); x.lineTo(128, i); x.stroke(); }
    x.lineWidth = 10;
    x.strokeStyle = 'rgb(105,80,48)';
    x.strokeRect(5, 5, 118, 118);
    x.beginPath(); x.moveTo(8, 8); x.lineTo(120, 120); x.stroke();
    G.tex.crate = toTex(c);
  }

  /* cassa munizioni (verde militare con scritte) */
  {
    const [c, x] = canvas(128, 128);
    noiseFill(x, 128, 128, [70, 82, 50], 20, 4);
    x.fillStyle = '#e8c547';
    x.font = 'bold 20px monospace';
    x.fillText('AMMO', 36, 60);
    x.font = 'bold 11px monospace';
    x.fillText('5.56 NATO', 34, 80);
    x.strokeStyle = 'rgba(0,0,0,0.5)';
    x.lineWidth = 4;
    x.strokeRect(3, 3, 122, 122);
    G.tex.ammo = toTex(c);
  }

  /* sacchi di sabbia */
  {
    const [c, x] = canvas(256, 128);
    noiseFill(x, 256, 128, [150, 135, 100], 25, 6);
    for (let row = 0; row < 4; row++) {
      for (let i = -1; i < 5; i++) {
        const px = i * 64 + (row % 2) * 32, py = row * 32;
        const g = x.createRadialGradient(px + 32, py + 16, 4, px + 32, py + 16, 36);
        g.addColorStop(0, 'rgba(255,240,200,0.15)');
        g.addColorStop(1, 'rgba(40,30,15,0.55)');
        x.fillStyle = g;
        x.beginPath();
        x.ellipse(px + 32, py + 16, 31, 15, 0, 0, Math.PI * 2);
        x.fill();
      }
    }
    G.tex.sandbag = toTex(c);
  }

  /* intonaco (villaggio) */
  {
    const [c, x] = canvas(256, 256);
    noiseFill(x, 256, 256, [205, 196, 178], 22, 3);
    speckle(x, 256, 256, 600, ['#8a7a60', '#fff'], 2, 6, 0.2);
    // finestrella e porta
    x.fillStyle = '#2d2a26';
    x.fillRect(90, 60, 70, 60);
    x.fillStyle = '#5b3d25';
    x.fillRect(86, 56, 78, 6);
    x.fillRect(86, 120, 78, 6);
    G.tex.plaster = toTex(c);
  }
  /* tegole */
  {
    const [c, x] = canvas(256, 256);
    noiseFill(x, 256, 256, [150, 70, 45], 25, 4);
    x.strokeStyle = 'rgba(60,20,10,0.5)';
    for (let y = 0; y < 256; y += 16) {
      x.beginPath(); x.moveTo(0, y); x.lineTo(256, y); x.stroke();
      for (let xx = (y / 16) % 2 ? 0 : 8; xx < 256; xx += 16) { x.beginPath(); x.moveTo(xx, y); x.lineTo(xx, y + 16); x.stroke(); }
    }
    G.tex.tiles = toTex(c);
  }
  /* corteccia */
  {
    const [c, x] = canvas(64, 128);
    noiseFill(x, 64, 128, [80, 62, 45], 30, 8);
    x.strokeStyle = 'rgba(30,20,10,0.5)';
    for (let i = 0; i < 20; i++) { const px = R() * 64; x.beginPath(); x.moveTo(px, 0); x.lineTo(px + (R() - 0.5) * 8, 128); x.stroke(); }
    G.tex.bark = toTex(c);
  }
  /* mimetica veicoli */
  function camo(cols) {
    const [c, x] = canvas(256, 256);
    x.fillStyle = cols[0];
    x.fillRect(0, 0, 256, 256);
    for (let k = 1; k < cols.length; k++) {
      x.fillStyle = cols[k];
      for (let i = 0; i < 18; i++) {
        x.beginPath();
        const cx = R() * 256, cy = R() * 256;
        for (let a = 0; a < 6.28; a += 0.6) {
          const r = 10 + R() * 22;
          x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        }
        x.fill();
      }
    }
    speckle(x, 256, 256, 1500, ['#000', '#fff'], 1, 2, 0.1);
    return toTex(c);
  }
  G.tex.camoGreen = camo(['#4a5234', '#373d27', '#61603f', '#2a2b1f']);
  G.tex.camoDesert = camo(['#a18d68', '#8a7552', '#b9a67f', '#6d5c42']);
  /* rete metallica (trasparente) */
  {
    const [c, x] = canvas(64, 64);
    x.strokeStyle = 'rgba(160,160,160,1)';
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(0, 0); x.lineTo(64, 64);
    x.moveTo(64, 0); x.lineTo(0, 64);
    x.moveTo(-32, 0); x.lineTo(32, 64);
    x.moveTo(32, 0); x.lineTo(96, 64);
    x.moveTo(96, 0); x.lineTo(32, 64);
    x.moveTo(32, 0); x.lineTo(-32, 64);
    x.stroke();
    G.tex.fence = toTex(c);
  }
  /* sprite morbida per particelle */
  {
    const [c, x] = canvas(64, 64);
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    G.tex.soft = toTex(c, false, false);
  }
  /* fumo irregolare */
  {
    const [c, x] = canvas(64, 64);
    for (let i = 0; i < 14; i++) {
      const cx = 16 + R() * 32, cy = 16 + R() * 32, r = 8 + R() * 14;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, 64, 64);
    }
    G.tex.smoke = toTex(c, false, false);
  }
  /* vampata di bocca */
  {
    const [c, x] = canvas(128, 128);
    x.translate(64, 64);
    for (let i = 0; i < 7; i++) {
      x.rotate((Math.PI * 2) / 7 + R() * 0.3);
      const g = x.createLinearGradient(0, 0, 60, 0);
      g.addColorStop(0, 'rgba(255,250,210,1)');
      g.addColorStop(0.4, 'rgba(255,170,60,0.8)');
      g.addColorStop(1, 'rgba(255,90,0,0)');
      x.fillStyle = g;
      x.beginPath();
      x.moveTo(0, -6); x.lineTo(40 + R() * 22, 0); x.lineTo(0, 6);
      x.fill();
    }
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 26);
    g.addColorStop(0, 'rgba(255,255,230,1)');
    g.addColorStop(1, 'rgba(255,160,40,0)');
    x.fillStyle = g;
    x.fillRect(-64, -64, 128, 128);
    G.tex.flash = toTex(c, false, false);
  }
  /* foro di proiettile */
  {
    const [c, x] = canvas(64, 64);
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 30);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.18, 'rgba(10,10,10,0.95)');
    g.addColorStop(0.3, 'rgba(40,35,30,0.6)');
    g.addColorStop(1, 'rgba(60,55,50,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    G.tex.hole = toTex(c, false, false);
  }
  /* bruciatura esplosione */
  {
    const [c, x] = canvas(128, 128);
    for (let i = 0; i < 20; i++) {
      const cx = 64 + (R() - 0.5) * 40, cy = 64 + (R() - 0.5) * 40, r = 20 + R() * 40;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(5,5,5,0.35)');
      g.addColorStop(1, 'rgba(5,5,5,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, 128, 128);
    }
    G.tex.scorch = toTex(c, false, false);
  }
  /* nuvole */
  {
    const [c, x] = canvas(512, 512);
    const img = x.createImageData(512, 512);
    for (let y = 0; y < 512; y++) {
      for (let xx = 0; xx < 512; xx++) {
        const u = xx / 512, v = y / 512;
        // campionamento su toro → tileable
        const a = u * Math.PI * 2, b = v * Math.PI * 2;
        let n = G.fbm(Math.cos(a) * 1.3 + Math.cos(b) * 0.2 + 50, Math.sin(a) * 1.3 + Math.sin(b) * 1.3 + 20, 5);
        n = G.clamp((n + 0.05) * 2.2, 0, 1);
        const i = (y * 512 + xx) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = n * n * 255;
      }
    }
    x.putImageData(img, 0, 0);
    G.tex.clouds = toTex(c, true, false);
  }
  /* helipad */
  {
    const [c, x] = canvas(256, 256);
    x.fillStyle = 'rgba(0,0,0,0)';
    x.fillRect(0, 0, 256, 256);
    x.strokeStyle = 'rgba(235,230,210,0.9)';
    x.lineWidth = 12;
    x.beginPath(); x.arc(128, 128, 110, 0, Math.PI * 2); x.stroke();
    x.fillStyle = 'rgba(235,230,210,0.9)';
    x.fillRect(80, 60, 24, 136);
    x.fillRect(152, 60, 24, 136);
    x.fillRect(80, 116, 96, 24);
    G.tex.helipad = toTex(c, false);
  }
})();
