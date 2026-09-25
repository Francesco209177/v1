'use strict';
/* =========================================================================
   AUDIO: tutti i suoni sono sintetizzati in tempo reale con WebAudio
   (nessun file esterno). Spazializzazione semplice: distanza + panning.
   ========================================================================= */
G.audio = (function () {
  let ctx = null, master = null, comp = null, noiseBuf = null;
  let engine = null, wind = null, horn = null;
  const listener = { pos: new THREE.Vector3(), yaw: 0 };

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = G.settings.volume;
    master.connect(comp);
    comp.connect(ctx.destination);
    // buffer di rumore bianco riutilizzato da quasi tutti i suoni
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    startWind();
  }
  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }
  function setVolume(v) { if (master) master.gain.value = v; }

  const now = () => ctx.currentTime;
  function noiseSrc(loop = false) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = loop;
    if (!loop) s.playbackRate.value = 0.8 + Math.random() * 0.4;
    return s;
  }
  // nodo di uscita spazializzato: ritorna {node, dist}
  function spatial(pos, vol = 1, maxD = 400) {
    const out = ctx.createGain();
    let dist = 0, pan = 0;
    if (pos) {
      const dx = pos.x - listener.pos.x, dz = pos.z - listener.pos.z, dy = pos.y - listener.pos.y;
      dist = Math.sqrt(dx * dx + dz * dz + dy * dy);
      // angolo relativo all'ascoltatore (yaw 0 = guarda verso -z)
      const ang = Math.atan2(dx, -dz) + listener.yaw;
      pan = G.clamp(Math.sin(ang), -1, 1) * G.clamp(dist / 6, 0, 0.85);
    }
    const att = pos ? vol / (1 + dist * 0.045) * G.clamp(1 - dist / maxD, 0, 1) : vol;
    out.gain.value = att;
    let node = out;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      out.connect(p);
      p.connect(master);
    } else out.connect(master);
    return { node, dist, att };
  }
  function env(g, t0, a, peak, decay) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + decay);
  }

  /* ------------------------------------------------------------- armi */
  const SHOTS = {
    ar: { f: 1400, q: 0.7, dec: 0.22, thump: 110, vol: 0.9, tail: 0.5 },
    pistol: { f: 2000, q: 0.9, dec: 0.14, thump: 150, vol: 0.7, tail: 0.3 },
    sniper: { f: 900, q: 0.6, dec: 0.5, thump: 70, vol: 1.3, tail: 1.3 },
    enemy: { f: 1200, q: 0.8, dec: 0.2, thump: 100, vol: 0.8, tail: 0.5 },
  };
  function shot(type, pos) {
    if (!ctx) return;
    const s = SHOTS[type] || SHOTS.ar;
    const sp = spatial(pos, s.vol, 700);
    if (sp.att < 0.002) return;
    // la distanza "ovatta" il suono (filtro passa-basso) e lo ritarda (velocità del suono)
    const far = G.clamp(sp.dist / 250, 0, 1);
    const t0 = now() + (pos ? sp.dist / 343 : 0);
    const n = noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'lowpass';
    bp.frequency.value = G.lerp(s.f * 3, 700, far);
    bp.Q.value = s.q;
    const g = ctx.createGain();
    env(g, t0, 0.002, 1, s.dec * (1 + far));
    n.connect(bp); bp.connect(g); g.connect(sp.node);
    n.start(t0); n.stop(t0 + s.dec * 2 + 0.3);
    // "botta" a bassa frequenza
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(s.thump, t0);
    o.frequency.exponentialRampToValueAtTime(35, t0 + 0.15);
    const og = ctx.createGain();
    env(og, t0, 0.003, 0.9, 0.18);
    o.connect(og); og.connect(sp.node);
    o.start(t0); o.stop(t0 + 0.3);
    // coda/eco ambientale
    const tail = noiseSrc();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    const tg = ctx.createGain();
    env(tg, t0 + 0.03, 0.05, 0.18 * (1 + far), s.tail);
    tail.connect(lp); lp.connect(tg); tg.connect(sp.node);
    tail.start(t0); tail.stop(t0 + s.tail + 0.4);
  }
  function click(freq = 3000, vol = 0.25, delay = 0, dur = 0.03) {
    if (!ctx) return;
    const t0 = now() + delay;
    const n = noiseSrc();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = 3;
    const g = ctx.createGain();
    env(g, t0, 0.001, vol, dur);
    n.connect(f); f.connect(g); g.connect(master);
    n.start(t0); n.stop(t0 + dur + 0.05);
  }
  function dryFire() { click(2500, 0.3); }
  function reload(time) {
    click(1800, 0.35, 0.15, 0.05);      // caricatore fuori
    click(900, 0.2, 0.25, 0.08);
    click(1500, 0.45, time * 0.6, 0.06); // caricatore dentro
    click(3200, 0.4, time * 0.85, 0.04); // otturatore
    click(2200, 0.35, time * 0.9, 0.05);
  }
  function bolt() { click(1600, 0.35, 0.25, 0.05); click(2600, 0.35, 0.45, 0.05); }
  function weaponSwitch() { click(1200, 0.2, 0, 0.06); click(2400, 0.2, 0.12, 0.04); }
  function hitmarker(head) {
    if (!ctx) return;
    const t0 = now();
    const o = ctx.createOscillator();
    o.type = head ? 'triangle' : 'square';
    o.frequency.value = head ? 2400 : 1600;
    const g = ctx.createGain();
    env(g, t0, 0.001, head ? 0.25 : 0.12, head ? 0.12 : 0.04);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + 0.2);
  }
  function kill() {
    if (!ctx) return;
    const t0 = now();
    [880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      env(g, t0 + i * 0.06, 0.002, 0.12, 0.12);
      o.connect(g); g.connect(master);
      o.start(t0 + i * 0.06); o.stop(t0 + 0.4);
    });
  }
  function whiz(pos) {
    if (!ctx) return;
    const t0 = now();
    const n = noiseSrc();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 6;
    f.frequency.setValueAtTime(4000, t0);
    f.frequency.exponentialRampToValueAtTime(900, t0 + 0.18);
    const sp = spatial(pos, 0.6);
    const g = ctx.createGain();
    env(g, t0, 0.02, 1, 0.16);
    n.connect(f); f.connect(g); g.connect(sp.node);
    n.start(t0); n.stop(t0 + 0.3);
  }
  function impact(pos, soft) {
    if (!ctx) return;
    const sp = spatial(pos, soft ? 0.25 : 0.4, 120);
    if (sp.att < 0.01) return;
    const t0 = now();
    const n = noiseSrc();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = soft ? 500 : 2500 + Math.random() * 2000;
    f.Q.value = 2;
    const g = ctx.createGain();
    env(g, t0, 0.001, 1, soft ? 0.08 : 0.05);
    n.connect(f); f.connect(g); g.connect(sp.node);
    n.start(t0); n.stop(t0 + 0.15);
  }
  function explosion(pos, big = 1) {
    if (!ctx) return;
    const sp = spatial(pos, 2.2 * big, 1200);
    const t0 = now() + sp.dist / 343;
    const n = noiseSrc();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(G.lerp(3000, 800, G.clamp(sp.dist / 300, 0, 1)), t0);
    lp.frequency.exponentialRampToValueAtTime(90, t0 + 1.8);
    const g = ctx.createGain();
    env(g, t0, 0.005, 1, 2.2);
    n.connect(lp); lp.connect(g); g.connect(sp.node);
    n.start(t0); n.stop(t0 + 2.4);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(70, t0);
    o.frequency.exponentialRampToValueAtTime(22, t0 + 0.8);
    const og = ctx.createGain();
    env(og, t0, 0.005, 1.2, 0.9);
    o.connect(og); og.connect(sp.node);
    o.start(t0); o.stop(t0 + 1.1);
  }
  function footstep(surface, vol = 0.18) {
    if (!ctx) return;
    const t0 = now();
    const n = noiseSrc();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    const base = { road: 900, grass: 1800, dirt: 700, metal: 2600, water: 1200 }[surface] || 900;
    f.frequency.value = base * (0.8 + Math.random() * 0.4);
    f.Q.value = surface === 'metal' ? 8 : 1.2;
    const g = ctx.createGain();
    env(g, t0, 0.005, vol, surface === 'water' ? 0.2 : 0.08);
    n.connect(f); f.connect(g); g.connect(master);
    n.start(t0); n.stop(t0 + 0.3);
  }
  function land(v) { footstep('dirt', G.clamp(v * 0.05, 0.15, 0.6)); footstep('road', G.clamp(v * 0.03, 0.1, 0.4)); }
  function hurt() {
    if (!ctx) return;
    const t0 = now();
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(70, t0);
    o.frequency.exponentialRampToValueAtTime(40, t0 + 0.2);
    const g = ctx.createGain();
    env(g, t0, 0.005, 0.6, 0.25);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + 0.35);
    click(600, 0.3, 0, 0.06);
  }
  function heartbeat() {
    if (!ctx) return;
    [0, 0.22].forEach((d) => {
      const t0 = now() + d;
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(55, t0);
      o.frequency.exponentialRampToValueAtTime(30, t0 + 0.12);
      const g = ctx.createGain();
      env(g, t0, 0.01, d ? 0.35 : 0.5, 0.15);
      o.connect(g); g.connect(master);
      o.start(t0); o.stop(t0 + 0.3);
    });
  }
  function ui() { click(4000, 0.12, 0, 0.02); }
  function crash(pos, strength) {
    if (!ctx) return;
    const sp = spatial(pos, G.clamp(strength / 15, 0.2, 1.4));
    const t0 = now();
    const n = noiseSrc();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1800;
    const g = ctx.createGain();
    env(g, t0, 0.003, 1, 0.35);
    n.connect(f); f.connect(g); g.connect(sp.node);
    n.start(t0); n.stop(t0 + 0.5);
    click(3500, 0.3, 0.02, 0.1);
    click(2100, 0.3, 0.08, 0.12);
  }
  function door() { click(700, 0.35, 0, 0.1); click(400, 0.3, 0.08, 0.12); }
  function pickup() {
    if (!ctx) return;
    const t0 = now();
    [660, 990].forEach((fr, i) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = fr;
      const g = ctx.createGain();
      env(g, t0 + i * 0.07, 0.003, 0.15, 0.1);
      o.connect(g); g.connect(master);
      o.start(t0 + i * 0.07); o.stop(t0 + 0.3);
    });
    click(1500, 0.3, 0, 0.05);
  }
  function splash(pos) {
    if (!ctx) return;
    const sp = spatial(pos, 0.4, 150);
    const t0 = now();
    const n = noiseSrc();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1400;
    const g = ctx.createGain();
    env(g, t0, 0.01, 1, 0.25);
    n.connect(f); f.connect(g); g.connect(sp.node);
    n.start(t0); n.stop(t0 + 0.4);
  }

  /* ------------------------------------------------- motore veicolo */
  function engineStart() {
    if (!ctx || engine) return;
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o2.type = 'square';
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 600;
    lp.Q.value = 2;
    const g = ctx.createGain();
    g.gain.value = 0;
    const g2 = ctx.createGain();
    g2.gain.value = 0.35;
    o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(master);
    // stridio pneumatici
    const sk = noiseSrc(true);
    const skf = ctx.createBiquadFilter();
    skf.type = 'bandpass';
    skf.frequency.value = 1100;
    skf.Q.value = 5;
    const skg = ctx.createGain();
    skg.gain.value = 0;
    sk.connect(skf); skf.connect(skg); skg.connect(master);
    o1.start(); o2.start(); sk.start();
    engine = { o1, o2, lp, g, skg, sk };
    click(300, 0.5, 0, 0.3);
  }
  function engineUpdate(rpm, load, skid, heavy) {
    if (!engine) return;
    const t = now();
    const base = heavy ? 28 : 38;
    const f = base + rpm * (heavy ? 70 : 110);
    engine.o1.frequency.setTargetAtTime(f, t, 0.05);
    engine.o2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    engine.lp.frequency.setTargetAtTime(350 + load * 1300 + rpm * 500, t, 0.08);
    engine.g.gain.setTargetAtTime(0.09 + load * 0.1, t, 0.08);
    engine.skg.gain.setTargetAtTime(G.clamp(skid, 0, 1) * 0.22, t, 0.05);
  }
  function engineStop() {
    if (!engine) return;
    const e = engine;
    engine = null;
    const t = now();
    e.g.gain.setTargetAtTime(0, t, 0.1);
    e.skg.gain.setTargetAtTime(0, t, 0.05);
    setTimeout(() => { try { e.o1.stop(); e.o2.stop(); e.sk.stop(); } catch (err) { /* già fermati */ } }, 600);
  }
  function hornSet(on) {
    if (!ctx) return;
    if (on && !horn) {
      const g = ctx.createGain();
      g.gain.value = 0.12;
      const oa = ctx.createOscillator(), ob = ctx.createOscillator();
      oa.type = ob.type = 'square';
      oa.frequency.value = 392;
      ob.frequency.value = 494;
      const lp = ctx.createBiquadFilter();
      lp.frequency.value = 2000;
      oa.connect(lp); ob.connect(lp); lp.connect(g); g.connect(master);
      oa.start(); ob.start();
      horn = { oa, ob, g };
    } else if (!on && horn) {
      const h = horn;
      horn = null;
      h.g.gain.setTargetAtTime(0, now(), 0.02);
      setTimeout(() => { h.oa.stop(); h.ob.stop(); }, 150);
    }
  }

  /* ---------------------------------------------------- ambiente */
  function startWind() {
    const n = noiseSrc(true);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.12;
    const lg = ctx.createGain();
    lg.gain.value = 0.03;
    lfo.connect(lg); lg.connect(g.gain);
    n.connect(lp); lp.connect(g); g.connect(master);
    n.start(); lfo.start();
    wind = { g, lp };
  }
  let nextAmb = 0;
  function ambience(isNight, inForest) {
    if (!ctx || G.time < nextAmb) return;
    nextAmb = G.time + (isNight ? 0.4 : 1.5) + Math.random() * 3;
    const t0 = now();
    if (isNight) { // grilli
      for (let i = 0; i < 3; i++) {
        const o = ctx.createOscillator();
        o.frequency.value = 4200 + Math.random() * 400;
        const g = ctx.createGain();
        env(g, t0 + i * 0.07, 0.005, 0.015, 0.04);
        o.connect(g); g.connect(master);
        o.start(t0 + i * 0.07); o.stop(t0 + i * 0.07 + 0.1);
      }
    } else if (inForest || Math.random() < 0.3) { // uccelli
      const o = ctx.createOscillator();
      o.type = 'sine';
      const f0 = 2200 + Math.random() * 1800;
      o.frequency.setValueAtTime(f0, t0);
      o.frequency.exponentialRampToValueAtTime(f0 * (0.6 + Math.random() * 0.9), t0 + 0.12);
      o.frequency.exponentialRampToValueAtTime(f0, t0 + 0.2);
      const g = ctx.createGain();
      env(g, t0, 0.01, 0.025, 0.18);
      o.connect(g); g.connect(master);
      o.start(t0); o.stop(t0 + 0.3);
    }
  }
  function setWind(v) { if (wind) wind.g.gain.setTargetAtTime(0.03 + v * 0.12, now(), 0.3); }

  return {
    init, resume, setVolume, listener, shot, dryFire, reload, bolt, weaponSwitch, hitmarker, kill, whiz,
    impact, explosion, footstep, land, hurt, heartbeat, ui, crash, door, pickup, splash, click,
    engineStart, engineUpdate, engineStop, hornSet, ambience, setWind,
    get ready() { return !!ctx; },
  };
})();
