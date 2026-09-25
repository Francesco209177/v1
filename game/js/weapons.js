'use strict';
/* =========================================================================
   ARMI: modelli in prima persona, fuoco (hitscan con dispersione), rinculo,
   mira, ricarica, cambio arma, granate, corpo a corpo, danni da esplosione.
   ========================================================================= */
G.weapons = (function () {
  const V = THREE.Vector3;

  const DEFS = [
    {
      id: 'ar', name: 'M4A1', slot: 1, auto: true, modes: ['AUTO', 'SEMI'], dmg: 29, head: 2.3, rpm: 760, mag: 30, reserve: 180,
      reload: 2.0, reloadEmpty: 2.5, spreadHip: 0.03, spreadAds: 0.0015, moveSpread: 0.035, bloom: 0.004,
      recoilV: 0.016, recoilH: 0.007, range: 550, falloff: 60, adsFov: 52, adsTime: 0.2, sound: 'ar', tracerEvery: 3,
      hip: new V(0.13, -0.14, -0.3), adsPos: new V(0, -0.089, -0.2), moveMul: 1,
    },
    {
      id: 'smg', name: 'MP5', slot: 2, auto: true, modes: ['AUTO', 'SEMI'], dmg: 22, head: 2, rpm: 880, mag: 32, reserve: 192,
      reload: 1.8, reloadEmpty: 2.2, spreadHip: 0.025, spreadAds: 0.003, moveSpread: 0.018, bloom: 0.003,
      recoilV: 0.011, recoilH: 0.008, range: 250, falloff: 30, adsFov: 58, adsTime: 0.15, sound: 'pistol', tracerEvery: 3,
      hip: new V(0.14, -0.15, -0.28), adsPos: new V(0, -0.081, -0.19), moveMul: 1.07,
    },
    {
      id: 'sniper', name: 'Barrett M82', slot: 3, auto: false, bolt: true, modes: ['BOLT'], dmg: 140, head: 3, rpm: 45, mag: 5, reserve: 30,
      reload: 3.0, reloadEmpty: 3.4, spreadHip: 0.09, spreadAds: 0.0, moveSpread: 0.05, bloom: 0,
      recoilV: 0.09, recoilH: 0.02, range: 1100, falloff: 900, adsFov: 13, adsTime: 0.32, sound: 'sniper', scope: true, tracerEvery: 1,
      hip: new V(0.16, -0.16, -0.3), adsPos: new V(0, -0.085, -0.15), moveMul: 0.9,
    },
    {
      id: 'pistol', name: 'M1911', slot: 4, auto: false, modes: ['SEMI'], dmg: 36, head: 2, rpm: 420, mag: 8, reserve: 64,
      reload: 1.4, reloadEmpty: 1.7, spreadHip: 0.022, spreadAds: 0.004, moveSpread: 0.012, bloom: 0.006,
      recoilV: 0.03, recoilH: 0.01, range: 150, falloff: 25, adsFov: 64, adsTime: 0.12, sound: 'pistol', tracerEvery: 99,
      hip: new V(0.13, -0.13, -0.3), adsPos: new V(0, -0.047, -0.26), moveMul: 1.1,
    },
  ];

  const W = { list: [], idx: 0, grenades: 4, maxGrenades: 4 };
  let vmRoot, knife, grenadeHand, flashSprite;
  const state = {
    cooldown: 0, reloadT: 0, reloadDur: 0, switchT: 0, switchTo: -1, boltT: 0, meleeT: 0, throwT: 0,
    kick: 0, kickRot: 0, swayX: 0, swayY: 0, lastDx: 0, lastDy: 0, bloom: 0, flashT: 0, shotCount: 0,
    triggerHeld: false, sprintBlend: 0, modeIdx: 0,
  };
  const grenades = [];

  /* ------------------------------------------------ materiali viewmodel */
  const mBlack = G.std(0x1c1d1f, 0.75, 0.3);
  const mPoly = G.std(0x252624, 0.85, 0.0);
  const mTan = G.std(0x7d7052, 0.88, 0.0);
  const mGlove = G.std(0x2a2826, 0.9);
  const mSleeve = new THREE.MeshStandardMaterial({ map: G.tex.camoGreen, roughness: 1 });
  const mSkin = G.std(0x9a7358, 0.8);
  const mDot = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  const mLens = new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.35 });
  const mBrass = G.std(0xc9a040, 0.35, 0.8);

  const box = (w, h, d, m, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    o.position.set(x, y, z);
    o.rotation.set(rx, ry, rz);
    return o;
  };
  const cyl = (r, l, m, x, y, z, seg = 10) => {
    const g = new THREE.CylinderGeometry(r, r, l, seg);
    g.rotateX(Math.PI / 2);
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z);
    return o;
  };
  function arms(g, gripZ = 0.02, foreZ = -0.36, foreY = -0.035) {
    // mano destra sull'impugnatura + avambraccio
    g.add(box(0.05, 0.075, 0.09, mGlove, 0.005, -0.075, gripZ + 0.01));
    g.add(box(0.055, 0.035, 0.06, mSkin, 0.02, -0.11, gripZ + 0.06, 0.9, 0.38));
    g.add(box(0.08, 0.085, 0.22, mSleeve, 0.045, -0.19, gripZ + 0.12, 0.9, 0.38, 0));
    // mano sinistra sul paramano, avambraccio verso il basso a sinistra
    g.add(box(0.06, 0.05, 0.1, mGlove, -0.01, foreY - 0.035, foreZ));
    g.add(box(0.08, 0.085, 0.42, mSleeve, -0.1, foreY - 0.12, foreZ + 0.2, 0.38, -0.52, 0));
  }
  function buildAR() {
    const g = new THREE.Group();
    g.add(box(0.062, 0.07, 0.36, mBlack, 0, 0.01, -0.12));          // castello
    g.add(box(0.07, 0.072, 0.28, mTan, 0, 0.012, -0.42));            // paramano
    g.add(cyl(0.011, 0.2, mBlack, 0, 0.015, -0.66));                 // canna
    g.add(cyl(0.018, 0.07, mBlack, 0, 0.015, -0.78));                // spegnifiamma
    g.add(box(0.022, 0.012, 0.52, mBlack, 0, 0.054, -0.23));         // slitta picatinny
    g.add(box(0.012, 0.04, 0.012, mBlack, 0, 0.07, -0.53));          // mirino anteriore
    g.add(box(0.04, 0.095, 0.05, mPoly, 0, -0.06, 0.03, 0.3));        // impugnatura
    g.add(cyl(0.017, 0.2, mBlack, 0, 0.0, 0.14));                    // tubo del calcio
    g.add(box(0.05, 0.085, 0.2, mTan, 0, -0.015, 0.23));             // calcio
    g.add(box(0.03, 0.03, 0.05, mPoly, 0, -0.05, -0.43));            // impugnatura anteriore
    const mag = new THREE.Group();
    mag.add(box(0.035, 0.15, 0.072, mTan, 0, -0.07, 0, 0.18));
    mag.position.set(0, -0.02, -0.14);
    g.add(mag);
    // mirino olografico
    const sight = new THREE.Group();
    sight.add(box(0.05, 0.02, 0.08, mBlack, 0, 0.07, -0.1));
    sight.add(box(0.006, 0.04, 0.012, mBlack, 0.022, 0.093, -0.07));
    sight.add(box(0.006, 0.04, 0.012, mBlack, -0.022, 0.093, -0.07));
    sight.add(box(0.05, 0.006, 0.012, mBlack, 0, 0.113, -0.07));
    sight.add(box(0.05, 0.006, 0.07, mBlack, 0, 0.082, -0.1));
    const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.038, 0.03), mLens);
    lens.position.set(0, 0.095, -0.07);
    sight.add(lens);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0014, 10), mDot);
    dot.position.set(0, 0.089, -0.071);
    sight.add(dot);
    g.add(sight);
    arms(g, 0.02, -0.4, -0.02);
    g.userData = { mag, muzzle: new V(0, 0.015, -0.83), eject: new V(0.04, 0.02, -0.1) };
    return g;
  }
  function buildSMG() {
    const g = new THREE.Group();
    g.add(box(0.055, 0.075, 0.34, mBlack, 0, 0.01, -0.12));
    g.add(box(0.06, 0.06, 0.16, mPoly, 0, 0.0, -0.36));
    g.add(cyl(0.014, 0.08, mBlack, 0, 0.015, -0.47));
    g.add(box(0.012, 0.035, 0.03, mBlack, 0, 0.06, -0.4));
    g.add(box(0.03, 0.03, 0.03, mBlack, 0, 0.06, 0.02));
    g.add(box(0.012, 0.012, 0.012, mDot, 0, 0.083, -0.405));
    g.add(box(0.04, 0.095, 0.05, mPoly, 0, -0.06, 0.03, 0.3));
    g.add(box(0.03, 0.05, 0.2, mBlack, 0, 0.0, 0.15));
    const mag = new THREE.Group();
    mag.add(box(0.03, 0.14, 0.05, mBlack, 0, -0.07, 0, 0.35));
    mag.position.set(0, -0.02, -0.2);
    g.add(mag);
    arms(g, 0.02, -0.34, -0.02);
    g.userData = { mag, muzzle: new V(0, 0.015, -0.52), eject: new V(0.04, 0.02, -0.1) };
    return g;
  }
  function buildSniper() {
    const g = new THREE.Group();
    g.add(box(0.07, 0.08, 0.5, mBlack, 0, 0.0, -0.15));
    g.add(box(0.075, 0.06, 0.3, mBlack, 0, 0.005, -0.5));
    g.add(cyl(0.015, 0.45, mBlack, 0, 0.015, -0.85));
    g.add(box(0.06, 0.03, 0.09, mBlack, 0, 0.015, -1.1));             // freno di bocca
    g.add(cyl(0.024, 0.34, mBlack, 0, 0.085, -0.14));                  // cannocchiale
    g.add(cyl(0.032, 0.08, mBlack, 0, 0.085, -0.34));
    g.add(cyl(0.03, 0.06, mBlack, 0, 0.085, 0.04));
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.028, 16), mLens);
    lens.position.set(0, 0.085, 0.071);
    g.add(lens);
    g.add(box(0.02, 0.05, 0.02, mBlack, 0, 0.05, -0.25));
    g.add(box(0.02, 0.05, 0.02, mBlack, 0, 0.05, -0.05));
    g.add(box(0.045, 0.1, 0.05, mPoly, 0, -0.065, 0.05, 0.3));
    g.add(box(0.06, 0.1, 0.26, mPoly, 0, -0.02, 0.25));
    g.add(box(0.012, 0.012, 0.18, mBlack, 0.03, -0.04, -0.6, 0.6));    // bipiede
    g.add(box(0.012, 0.012, 0.18, mBlack, -0.03, -0.04, -0.6, 0.6));
    const bolt = box(0.012, 0.012, 0.05, mBlack, 0.05, 0.03, -0.02);
    g.add(bolt);
    const mag = new THREE.Group();
    mag.add(box(0.05, 0.1, 0.1, mBlack, 0, -0.05, 0));
    mag.position.set(0, -0.03, -0.18);
    g.add(mag);
    arms(g, 0.05, -0.45, -0.02);
    g.userData = { mag, bolt, muzzle: new V(0, 0.015, -1.15), eject: new V(0.05, 0.03, -0.05) };
    return g;
  }
  function buildPistol() {
    const g = new THREE.Group();
    const slide = box(0.032, 0.035, 0.2, mBlack, 0, 0.018, -0.07);
    g.add(slide);
    g.add(box(0.03, 0.022, 0.16, mBlack, 0, -0.01, -0.06));
    g.add(box(0.034, 0.1, 0.05, G.std(0x4a3526, 0.7), 0, -0.065, 0.015, 0.25));
    g.add(box(0.006, 0.01, 0.006, mBlack, 0, 0.04, -0.16));
    g.add(box(0.02, 0.008, 0.006, mBlack, 0, 0.04, 0.02));
    g.add(box(0.03, 0.01, 0.04, mBlack, 0, -0.03, -0.03));
    const mag = new THREE.Group();
    mag.add(box(0.024, 0.09, 0.035, mBlack, 0, -0.045, 0, 0.25));
    mag.position.set(0, -0.03, 0.01);
    g.add(mag);
    // due mani sull'impugnatura
    g.add(box(0.05, 0.075, 0.08, mGlove, 0.005, -0.075, 0.02));
    g.add(box(0.05, 0.07, 0.07, mGlove, -0.02, -0.085, 0.01, 0, 0, 0.3));
    g.add(box(0.075, 0.08, 0.3, mSleeve, 0.07, -0.15, 0.17, 0.4, 0.35));
    g.add(box(0.075, 0.08, 0.3, mSleeve, -0.08, -0.15, 0.17, 0.4, -0.4));
    g.userData = { mag, slide, muzzle: new V(0, 0.018, -0.18), eject: new V(0.03, 0.03, -0.05) };
    return g;
  }

  function init() {
    G.vmScene = new THREE.Scene();
    G.vmCam = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.01, 10);
    G.vmHemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.9);
    G.vmSun = new THREE.DirectionalLight(0xffffff, 1.6);
    G.vmScene.add(G.vmHemi, G.vmSun, G.vmSun.target);
    vmRoot = new THREE.Group();
    G.vmScene.add(vmRoot);
    const builders = { ar: buildAR, smg: buildSMG, sniper: buildSniper, pistol: buildPistol };
    for (const d of DEFS) {
      const model = builders[d.id]();
      model.visible = false;
      vmRoot.add(model);
      W.list.push(Object.assign({}, d, { ammo: d.mag, reserveAmmo: d.reserve, model }));
    }
    // coltello (corpo a corpo)
    knife = new THREE.Group();
    knife.add(box(0.012, 0.03, 0.2, G.std(0xb8bcc0, 0.25, 0.9), 0, 0, -0.12));
    knife.add(box(0.025, 0.035, 0.11, mPoly, 0, -0.005, 0.03));
    knife.add(box(0.07, 0.075, 0.1, mGlove, 0, -0.02, 0.05));
    knife.add(box(0.075, 0.08, 0.3, mSleeve, 0.02, -0.04, 0.24));
    knife.visible = false;
    vmRoot.add(knife);
    // granata in mano
    grenadeHand = new THREE.Group();
    const gb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), G.std(0x3d4530, 0.7));
    gb.scale.y = 1.2;
    grenadeHand.add(gb);
    grenadeHand.add(box(0.015, 0.03, 0.02, mBlack, 0, 0.045, 0));
    grenadeHand.add(box(0.07, 0.075, 0.09, mGlove, 0.02, -0.03, 0.03));
    grenadeHand.add(box(0.075, 0.08, 0.3, mSleeve, 0.05, -0.06, 0.22, 0.2));
    grenadeHand.visible = false;
    vmRoot.add(grenadeHand);
    // vampata
    flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.tex.flash, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    flashSprite.visible = false;
    vmRoot.add(flashSprite);
    W.list[0].model.visible = true;
    // torcia
    G.flashlight = new THREE.SpotLight(0xfff4e0, 0, 70, 0.42, 0.45, 1.6);
    G.scene.add(G.flashlight, G.flashlight.target);
  }

  const cur = () => W.list[W.idx];
  const reloading = () => state.reloadT > 0;

  /* ------------------------------------------------------ tiro */
  function spread() {
    const w = cur(), P = G.player;
    let s = G.lerp(w.spreadHip, w.spreadAds, P.ads);
    s += P.moveAmount * w.moveSpread * (1 - P.ads * 0.75);
    if (!P.onGround) s += 0.06;
    if (P.crouch) s *= 0.7;
    s += state.bloom * (1 - P.ads * 0.6);
    return s;
  }
  W.spread = spread;

  function randomDir(base, s) {
    const d = base.clone();
    if (s <= 0) return d;
    const up = Math.abs(d.y) > 0.99 ? new V(1, 0, 0) : new V(0, 1, 0);
    const r = new V().crossVectors(d, up).normalize();
    const u = new V().crossVectors(r, d).normalize();
    const a = Math.random() * Math.PI * 2, m = Math.sqrt(Math.random()) * s;
    return d.addScaledVector(r, Math.cos(a) * m).addScaledVector(u, Math.sin(a) * m).normalize();
  }

  // risolve un proiettile: mondo statico + nemici + veicoli
  W.trace = (o, d, range, ignoreVehicle = null) => {
    const wh = G.raycastWorld(o, d, range);
    let best = wh ? { t: wh.t, point: wh.point, normal: wh.normal, kind: wh.water ? 'water' : wh.terrain ? 'terrain' : 'static', col: wh.col } : null;
    const lim = () => (best ? best.t : range);
    const e = G.enemies.rayTest(o, d, lim());
    if (e) best = { t: e.t, point: o.clone().addScaledVector(d, e.t), normal: d.clone().negate(), kind: 'enemy', enemy: e.enemy, head: e.head };
    const v = G.vehicles.rayTest(o, d, lim(), ignoreVehicle);
    if (v) best = { t: v.t, point: o.clone().addScaledVector(d, v.t), normal: v.normal, kind: 'vehicle', vehicle: v.vehicle };
    return best;
  };

  function applyHit(hit, dmg, headMul, falloffStart, range, dir) {
    if (!hit) return;
    const f = hit.t > falloffStart ? Math.max(0.55, 1 - (hit.t - falloffStart) / range) : 1;
    if (hit.kind === 'enemy') {
      const dd = dmg * f * (hit.head ? headMul : 1);
      const killed = hit.enemy.damage(dd, hit.head, dir);
      G.fx.impact(hit.point, hit.normal, 'flesh');
      G.player.shotsHit++;
      G.hud.hitmarker(hit.head, killed);
      G.audio.hitmarker(hit.head);
    } else if (hit.kind === 'vehicle') {
      hit.vehicle.damage(dmg * f * 0.35);
      G.fx.impact(hit.point, hit.normal, 'vehicle');
      G.hud.hitmarker(false, false, true);
    } else if (hit.kind === 'water') {
      G.fx.impact(hit.point, hit.normal, 'water');
    } else {
      const ref = hit.col && hit.col.ref;
      if (ref && ref.hp !== undefined) { W.damageDestructible(ref, dmg * f); G.hud.hitmarker(false, false, true); }
      G.fx.impact(hit.point, hit.normal, hit.kind === 'terrain' ? 'terrain' : hit.col ? hit.col.mat : 'concrete');
    }
  }

  const muzzleLocal = new V();
  function muzzleWorld(out) {
    const m = cur().model;
    muzzleLocal.copy(m.userData.muzzle);
    m.localToWorld(muzzleLocal);           // spazio telecamera del viewmodel
    muzzleLocal.z *= 0.6;
    return G.camera.localToWorld(out.copy(muzzleLocal));
  }
  W.muzzleWorld = muzzleWorld;

  function fire() {
    const w = cur(), P = G.player;
    if (state.cooldown > 0 || state.switchT > 0 || state.meleeT > 0 || state.throwT > 0 || state.boltT > 0) return;
    if (reloading()) return;
    if (w.ammo <= 0) {
      G.audio.dryFire();
      state.cooldown = 0.25;
      if (w.reserveAmmo > 0) startReload();
      return;
    }
    if (P.sprint) { P.sprint = false; P.noSprintUntil = G.time + 0.35; }
    w.ammo--;
    state.cooldown = 60 / w.rpm;
    state.shotCount++;
    P.shotsFired++;
    P.lastShotTime = G.time;
    const o = G.camera.getWorldPosition(new V());
    const base = new V(0, 0, -1).applyQuaternion(G.camera.quaternion);
    const s = spread();
    const dir = randomDir(base, s);
    const hit = W.trace(o, dir, w.range, null);
    applyHit(hit, w.dmg, w.head, w.falloff, w.range, dir);
    // tracciante
    const mz = muzzleWorld(new V());
    const end = hit ? hit.point : o.clone().addScaledVector(dir, w.range);
    if (state.shotCount % w.tracerEvery === 0) G.fx.tracer(mz, end, 800);
    // rinculo
    const adsK = G.lerp(1, 0.55, P.ads) * (P.crouch ? 0.8 : 1);
    const rv = w.recoilV * adsK * G.fr(0.8, 1.2);
    P.pitch = G.clamp(P.pitch + rv * 0.55, -1.52, 1.52);
    P.kickPitch += rv * 0.45;
    const rh = G.fr(-w.recoilH, w.recoilH * 1.3) * adsK;
    P.yaw += rh * 0.5;
    P.kickYaw += rh * 0.5;
    state.kick = Math.min(1.4, state.kick + (w.id === 'sniper' ? 1.4 : 0.55));
    state.bloom = Math.min(0.045, state.bloom + w.bloom);
    // effetti
    state.flashT = 0.05;
    G.fx.muzzleLight(mz);
    G.fx.muzzleSmoke(mz, dir);
    const ej = w.model.userData.eject.clone();
    w.model.localToWorld(ej);
    ej.z *= 0.6;
    G.camera.localToWorld(ej);
    const right = new V(1, 0, 0).applyQuaternion(G.camera.quaternion);
    if (!w.bolt) G.fx.shell(ej, right.multiplyScalar(2 + Math.random()).add(new V(0, 2.2, 0)).add(P.vel));
    G.audio.shot(w.sound, null);
    G.fx.addShake(w.id === 'sniper' ? 0.35 : 0.04);
    G.enemies.noise(P.pos, w.id === 'sniper' ? 160 : 90);
    if (w.bolt && w.ammo > 0) { state.boltT = 1.0; G.audio.bolt(); }
    if (w.ammo === 0 && w.reserveAmmo > 0) setTimeout(() => { if (cur() === w && w.ammo === 0 && !reloading()) startReload(); }, 250);
  }

  function startReload() {
    const w = cur();
    if (reloading() || w.ammo >= w.mag || w.reserveAmmo <= 0 || state.switchT > 0) return;
    state.reloadDur = w.ammo === 0 ? w.reloadEmpty : w.reload;
    state.reloadT = state.reloadDur;
    G.audio.reload(state.reloadDur);
  }
  function finishReload() {
    const w = cur();
    const take = Math.min(w.mag - w.ammo, w.reserveAmmo);
    w.ammo += take;
    w.reserveAmmo -= take;
  }
  function switchTo(i) {
    if (i === W.idx || i < 0 || i >= W.list.length || state.switchT > 0) return;
    state.reloadT = 0;
    state.boltT = 0;
    state.switchT = 0.5;
    state.switchTo = i;
    G.audio.weaponSwitch();
  }

  /* ------------------------------------------------------ granate */
  const gGeo = new THREE.SphereGeometry(0.06, 10, 8);
  const gMat = G.std(0x3d4530, 0.7);
  function throwGrenade() {
    if (W.grenades <= 0 || state.throwT > 0 || state.switchT > 0) return;
    W.grenades--;
    state.throwT = 0.6;
    state.reloadT = 0;
    setTimeout(() => {
      if (G.player.dead) return;
      const o = G.camera.getWorldPosition(new V());
      const d = new V(0, 0, -1).applyQuaternion(G.camera.quaternion);
      const m = new THREE.Mesh(gGeo, gMat);
      m.castShadow = true;
      m.position.copy(o).addScaledVector(d, 0.5);
      G.scene.add(m);
      grenades.push({ m, v: d.multiplyScalar(19).add(new V(0, 4, 0)).add(G.player.vel), fuse: 3.0 });
      G.audio.click(900, 0.3, 0, 0.1);
    }, 250);
  }
  function updateGrenades(dt) {
    for (let i = grenades.length - 1; i >= 0; i--) {
      const g = grenades[i];
      g.fuse -= dt;
      g.v.y -= G.settings.gravity * dt;
      const p = g.m.position;
      const step = g.v.clone().multiplyScalar(dt);
      const len = step.length();
      if (len > 0) {
        const hit = G.raycastStatic(p, step.clone().divideScalar(len), len + 0.06);
        if (hit) {
          const n = hit.normal;
          g.v.reflect(n).multiplyScalar(0.4);
          p.addScaledVector(n, 0.05);
          if (g.v.length() > 2) G.audio.click(1200, 0.25, 0, 0.05);
        } else p.add(step);
      }
      const gy = G.heightAt(p.x, p.z) + 0.06;
      if (p.y < gy) {
        p.y = gy;
        const n = G.normalAt(p.x, p.z);
        if (g.v.dot(n) < 0) g.v.reflect(n);
        g.v.multiplyScalar(0.4);
        if (g.v.length() > 2) G.audio.click(800, 0.2, 0, 0.05);
      }
      g.m.rotation.x += g.v.length() * dt * 3;
      if (g.fuse <= 0) {
        G.scene.remove(g.m);
        grenades.splice(i, 1);
        W.explode(p.clone(), 9, 170, 'Granata', true);
      }
    }
  }
  W.grenadeList = grenades;

  /* ------------------------------------------------------ esplosioni */
  W.explode = (pos, radius, dmg, cause, byPlayer) => {
    G.fx.explosion(pos, radius > 12 ? 1.6 : 1);
    // nemici
    for (const e of G.enemies.list) {
      if (e.dead) continue;
      const d = e.pos.distanceTo(pos);
      if (d < radius) {
        const killed = e.damage(dmg * (1 - d / radius) + 10, false, e.pos.clone().sub(pos).normalize(), 'explosion');
        if (byPlayer) G.hud.hitmarker(false, killed);
      }
    }
    // giocatore
    const P = G.player;
    const pd = (P.vehicle ? P.vehicle.pos : P.pos).distanceTo(pos);
    if (pd < radius * 1.1) P.damage(dmg * 0.9 * (1 - pd / (radius * 1.1)), pos, 'Esplosione');
    // veicoli
    for (const v of G.vehicles.list) {
      const d = v.pos.distanceTo(pos);
      if (d < radius * 1.3) {
        v.damage(dmg * 1.4 * (1 - d / (radius * 1.3)));
        const push = new V().subVectors(v.pos, pos).setY(0).normalize().multiplyScalar(8 * (1 - d / (radius * 1.3)));
        v.vel.add(push);
        v.vel.y += 4 * (1 - d / (radius * 1.3));
      }
    }
    // barili vicini: reazione a catena
    for (const o of G.destructibles) {
      if (o.dead) continue;
      const d = o.pos.distanceTo(pos);
      if (d < radius) setTimeout(() => W.damageDestructible(o, dmg * (1 - d / radius) + 20), 120 + Math.random() * 200);
    }
    G.enemies.noise(pos, 150);
  };
  W.damageDestructible = (o, dmg) => {
    if (o.dead) return;
    o.hp -= dmg;
    if (o.hp > 0) {
      if (o.type === 'barrel' && o.hp < 10) G.fx.smoke(o.pos.clone().add(new V(0, 0.7, 0)), 0.3, 3);
      return;
    }
    o.dead = true;
    o.col.dead = true;
    o.mesh.visible = false;
    for (const e of o.extra) e.visible = false;
    if (o.explosive) W.explode(o.pos.clone(), o.blast, o.dmg, 'Esplosione', true);
    if (o.objective) G.missions.event('fuel');
    // rottame bruciato
    if (o.type === 'fuel') {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.2, 1.6, 14, 1, true), G.M.wreck);
      r.position.copy(o.pos).setY(o.pos.y - 2.9);
      G.scene.add(r);
      G.burning.push({ pos: o.pos.clone().setY(o.pos.y - 2), t: 40, i: 2 });
    }
  };
  G.burning = [];

  /* ------------------------------------------------------ corpo a corpo */
  function melee() {
    if (state.meleeT > 0 || state.switchT > 0 || state.throwT > 0) return;
    state.meleeT = 0.55;
    state.reloadT = 0;
    G.audio.click(700, 0.25, 0.05, 0.12);
    setTimeout(() => {
      const P = G.player;
      const f = P.forward();
      let hitAny = false;
      for (const e of G.enemies.list) {
        if (e.dead) continue;
        const to = new V().subVectors(e.pos, P.pos);
        to.y = 0;
        const d = to.length();
        if (d < 2.4 && to.normalize().dot(new V(f.x, 0, f.z).normalize()) > 0.4) {
          const killed = e.damage(200, false, f, 'melee');
          G.hud.hitmarker(false, killed);
          G.audio.hitmarker(false);
          G.fx.impact(e.pos.clone().setY(e.pos.y + 1.3), f.clone().negate(), 'flesh');
          hitAny = true;
          break;
        }
      }
      if (!hitAny) {
        const o = G.camera.getWorldPosition(new V());
        const h = G.raycastWorld(o, f, 2.0);
        if (h) G.fx.impact(h.point, h.normal, h.terrain ? 'terrain' : 'concrete');
      }
    }, 130);
  }

  /* ------------------------------------------------------ update */
  W.update = (dt) => {
    const P = G.player;
    const w = cur();
    state.cooldown -= dt;
    state.bloom = Math.max(0, state.bloom - dt * 0.06);
    updateGrenades(dt);
    if (P.dead) { vmRoot.visible = false; return; }
    vmRoot.visible = !P.vehicle;
    if (P.vehicle) { P.ads = 0; return; }

    // input
    const canAct = state.switchT <= 0 && state.meleeT <= 0 && state.throwT <= 0;
    if (G.wasPressed('Digit1')) switchTo(0);
    if (G.wasPressed('Digit2')) switchTo(1);
    if (G.wasPressed('Digit3')) switchTo(2);
    if (G.wasPressed('Digit4')) switchTo(3);
    if (G.mouse.wheel !== 0 && state.switchT <= 0) switchTo((W.idx + (G.mouse.wheel > 0 ? 1 : W.list.length - 1)) % W.list.length);
    if (G.wasPressed('KeyR') && canAct) startReload();
    if (G.wasPressed('KeyG')) throwGrenade();
    if (G.wasPressed('KeyV')) melee();
    if (G.wasPressed('KeyB') && w.modes.length > 1) {
      w.modeIdx = ((w.modeIdx || 0) + 1) % w.modes.length;
      G.audio.click(2600, 0.25);
      G.hud.notify('Modalità di fuoco: ' + w.modes[w.modeIdx]);
    }
    const autoMode = w.auto && (w.modeIdx || 0) === 0;
    if (canAct && G.mouse.left && G.pointerLocked) {
      if (autoMode) fire();
      else if (!state.triggerHeld) fire();
      state.triggerHeld = true;
    }
    if (!G.mouse.left) state.triggerHeld = false;

    // mira
    const wantAds = G.mouse.right && canAct && !reloading() && !P.sprint && state.boltT <= 0.2;
    P.ads = G.clamp(P.ads + (wantAds ? dt : -dt) / w.adsTime, 0, 1);

    // timer
    if (state.reloadT > 0) {
      state.reloadT -= dt;
      if (state.reloadT <= 0) finishReload();
    }
    if (state.boltT > 0) state.boltT -= dt;
    if (state.meleeT > 0) state.meleeT -= dt;
    if (state.throwT > 0) state.throwT -= dt;
    if (state.switchT > 0) {
      const prev = state.switchT;
      state.switchT -= dt;
      if (prev > 0.25 && state.switchT <= 0.25) {
        w.model.visible = false;
        W.idx = state.switchTo;
        cur().model.visible = true;
        P.ads = 0;
      }
    }
    animate(dt);
  };

  /* ------------------------------------------------------ animazione viewmodel */
  const tmpPos = new V();
  function animate(dt) {
    const P = G.player, w = cur(), m = w.model, ud = m.userData;
    const ads = P.ads;
    const easeAds = ads * ads * (3 - 2 * ads);
    tmpPos.copy(w.hip).lerp(w.adsPos, easeAds);
    // oscillazione dovuta al movimento del mouse (ritardo dell'arma)
    const k = 1 - ads * 0.8;
    state.swayX = G.damp(state.swayX, G.clamp(-G.mouse.dx * 0.0004, -0.04, 0.04) * k, 8, dt);
    state.swayY = G.damp(state.swayY, G.clamp(G.mouse.dy * 0.0004, -0.04, 0.04) * k, 8, dt);
    // bob da passo
    const bk = (1 - ads * 0.9) * (G.settings.headBob ? 1 : 0.4);
    const hs = G.clamp(Math.hypot(P.vel.x, P.vel.z) / 4.6, 0, 1.7) * (P.onGround ? 1 : 0.2);
    const bx = Math.cos(P.bobPhase) * 0.012 * hs * bk;
    const by = -Math.abs(Math.sin(P.bobPhase)) * 0.014 * hs * bk;
    // posa di corsa
    state.sprintBlend = G.damp(state.sprintBlend, P.sprint && P.slide <= 0 ? 1 : 0, 10, dt);
    const sb = state.sprintBlend;
    // rinculo
    state.kick = G.damp(state.kick, 0, 14, dt);
    const kick = state.kick;
    // abbassamento durante il cambio arma
    let lower = 0;
    if (state.switchT > 0) lower = state.switchT > 0.25 ? 1 - (state.switchT - 0.25) / 0.25 : state.switchT / 0.25;
    // ricarica
    let rl = 0, magOff = 0;
    if (state.reloadT > 0) {
      const t = 1 - state.reloadT / state.reloadDur;
      rl = Math.sin(Math.min(1, t * 1.15) * Math.PI);
      magOff = t > 0.2 && t < 0.65 ? Math.sin(((t - 0.2) / 0.45) * Math.PI) : 0;
    }
    const bolt = state.boltT > 0 ? Math.sin((1 - state.boltT) * Math.PI) : 0;
    const air = P.onGround ? 0 : G.clamp(-P.vel.y * 0.004, -0.03, 0.03);

    m.position.set(
      tmpPos.x + bx + state.swayX - sb * 0.06 - rl * 0.03,
      tmpPos.y + by + state.swayY - lower * 0.3 - sb * 0.03 - rl * 0.05 + air - P.landDip * 0.2 * (1 - ads),
      tmpPos.z + kick * 0.035 * (w.id === 'sniper' ? 2 : 1) + sb * 0.02
    );
    m.rotation.set(
      kick * 0.045 * (1 - ads * 0.6) + sb * -0.35 + rl * 0.35 + bolt * 0.15 - state.swayY * 2,
      sb * 0.75 + state.swayX * 2 + bolt * 0.1,
      sb * 0.35 + rl * 0.45 + bolt * 0.3 + P.tilt * 2
    );
    if (ud.mag) ud.mag.position.y = (w.id === 'pistol' ? -0.03 : w.id === 'sniper' ? -0.03 : -0.02) - magOff * 0.25;
    if (ud.slide) ud.slide.position.z = -0.07 + Math.min(kick, 0.6) * 0.05;
    if (ud.bolt) ud.bolt.position.z = -0.02 + bolt * 0.08;
    // coltello e granata
    knife.visible = state.meleeT > 0;
    if (knife.visible) {
      const t = 1 - state.meleeT / 0.55;
      const s = Math.sin(Math.min(1, t * 1.6) * Math.PI);
      knife.position.set(0.25 - s * 0.3, -0.18 + s * 0.05, -0.35 - s * 0.15);
      knife.rotation.set(-0.2, 0.4 + s * 0.9, -0.5 + s * 0.6);
      m.position.y -= s * 0.15;
    }
    grenadeHand.visible = state.throwT > 0;
    if (grenadeHand.visible) {
      const t = 1 - state.throwT / 0.6;
      const s = t < 0.4 ? t / 0.4 : 1 - (t - 0.4) / 0.6;
      grenadeHand.position.set(-0.15 + s * 0.05, -0.2 + s * 0.1, -0.3 + (t > 0.4 ? -(t - 0.4) * 0.8 : 0));
      grenadeHand.rotation.set(-s * 0.8, 0, 0);
      m.position.y -= 0.2 * Math.sin(Math.min(1, t) * Math.PI);
    }
    // vampata di bocca
    state.flashT -= dt;
    flashSprite.visible = state.flashT > 0 && !(w.scope && ads > 0.9);
    if (flashSprite.visible) {
      const mp = ud.muzzle.clone();
      m.localToWorld(mp);
      flashSprite.position.copy(mp);
      const s = (w.id === 'sniper' ? 0.35 : 0.18) * G.fr(0.8, 1.3);
      flashSprite.scale.set(s, s, s);
      flashSprite.material.rotation = Math.random() * 6.28;
    }
    // cannocchiale: nasconde il modello
    m.visible = !(w.scope && ads > 0.92);
    if (vmRoot.parent) vmRoot.updateMatrixWorld(true);
  }

  W.refill = () => {
    for (const w of W.list) {
      w.reserveAmmo = w.reserve;
      if (w.ammo < w.mag) w.ammo = w.mag;
    }
    W.grenades = W.maxGrenades;
  };
  W.addAmmoCurrent = (mags = 1) => {
    const w = cur();
    w.reserveAmmo = Math.min(w.reserve * 1.5, w.reserveAmmo + w.mag * mags);
  };
  W.current = cur;
  W.reloading = reloading;
  W.state = state;
  W.init = init;
  W.isScoped = () => !!cur().scope && G.player.ads > 0.92;
  return W;
})();
