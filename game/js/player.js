'use strict';
/* =========================================================================
   GIOCATORE: movimento FPS (camminata, corsa, accovacciata, scivolata,
   salto, gravità), stamina, salute con rigenerazione, danni, morte.
   ========================================================================= */
G.player = (function () {
  const V = THREE.Vector3;
  const P = {
    pos: new V(30, 0, 446),
    vel: new V(),
    yaw: Math.PI * 0.95,
    pitch: 0,
    radius: 0.38,
    eye: 1.65,
    onGround: false,
    crouch: false,
    sprint: false,
    slide: 0,
    slideDir: new V(),
    stamina: 1,
    staminaLock: 0,
    health: 100,
    lastHit: -99,
    dead: false,
    vehicle: null,
    kickPitch: 0,
    kickYaw: 0,
    bobPhase: 0,
    bob: new V(),
    landDip: 0,
    tilt: 0,
    fallSpeed: 0,
    swimming: false,
    ads: 0,            // 0..1 progresso della mira
    moveAmount: 0,     // 0..1 per dispersione colpi
    kills: 0,
    headshots: 0,
    deaths: 0,
    score: 0,
    shotsFired: 0,
    shotsHit: 0,
    lastShotTime: -99,
    flashlight: false,
    holdBreath: 0,
    stepSide: 0,
    heartbeatT: 0,
  };

  const SPEED = { walk: 4.6, sprint: 7.6, crouch: 2.3, swim: 2.2 };
  const JUMP_V = 6.8;
  const tmpF = new V(), tmpR = new V(), wish = new V();

  P.forward = (out = new V()) => out.set(-Math.sin(P.yaw) * Math.cos(P.pitch), Math.sin(P.pitch), -Math.cos(P.yaw) * Math.cos(P.pitch));
  P.eyePos = (out = new V()) => out.set(P.pos.x, P.pos.y + P.eye, P.pos.z);

  P.reset = (spawn) => {
    P.pos.copy(spawn);
    P.pos.y = G.heightAt(spawn.x, spawn.z) + 0.1;
    P.vel.set(0, 0, 0);
    P.health = 100;
    P.dead = false;
    P.stamina = 1;
    P.crouch = false;
    P.slide = 0;
    P.kickPitch = P.kickYaw = 0;
    P.yaw = Math.PI * 0.95;
    P.pitch = 0;
    P.vehicle = null;
  };

  function look() {
    const s = G.settings;
    let sens = 0.0021 * s.sens;
    if (P.ads > 0.5) sens *= s.adsSens * (G.weapons.current().scope ? 0.35 : 0.85);
    P.yaw -= G.mouse.dx * sens;
    P.pitch -= G.mouse.dy * sens * (s.invertY ? -1 : 1);
    P.pitch = G.clamp(P.pitch, -1.52, 1.52);
    P.yaw = G.wrapAngle(P.yaw);
  }

  P.update = (dt) => {
    if (P.dead || P.vehicle) return;
    look();
    const k = G.keys;
    const fwd = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0);
    const str = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
    const moving = fwd !== 0 || str !== 0;
    const g = G.settings.gravity;
    const W = G.weapons;

    // --- accovacciata / scivolata
    const crouchPressed = G.wasPressed('KeyC') || G.wasPressed('ControlLeft');
    if (crouchPressed) {
      if (P.sprint && P.onGround && P.slide <= 0) {
        P.slide = 0.85;
        P.slideDir.set(P.vel.x, 0, P.vel.z).normalize();
        const sp = Math.hypot(P.vel.x, P.vel.z) * 1.3 + 1.5;
        P.vel.x = P.slideDir.x * sp;
        P.vel.z = P.slideDir.z * sp;
        P.crouch = true;
        G.audio.footstep('dirt', 0.35);
        G.fx.addShake(0.08);
      } else P.crouch = !P.crouch;
    }
    if (P.slide > 0) {
      P.slide -= dt;
      if (P.slide <= 0 || Math.hypot(P.vel.x, P.vel.z) < 2.5) P.slide = 0;
      if (P.onGround && Math.random() < 0.5) G.fx.dust(P.pos.clone().add(new V(0, 0.1, 0)), new V(0, 0.5, 0), [0.45, 0.4, 0.32], 0.3);
    }

    // --- corsa e stamina
    const wantSprint = k.ShiftLeft && fwd > 0 && P.ads < 0.3 && !W.reloading() && P.staminaLock <= 0 && !P.swimming && G.time > (P.noSprintUntil || 0);
    if (wantSprint && P.crouch && P.slide <= 0) P.crouch = false;
    P.sprint = wantSprint && P.onGround ? true : P.sprint && wantSprint;
    if (P.sprint && moving) {
      P.stamina -= dt * 0.16;
      if (P.stamina <= 0) { P.stamina = 0; P.staminaLock = 1.8; P.sprint = false; }
    } else {
      P.stamina = Math.min(1, P.stamina + dt * (P.sprint ? 0 : 0.22));
    }
    P.staminaLock -= dt;

    // --- velocità desiderata
    let speed = P.sprint ? SPEED.sprint : P.crouch ? SPEED.crouch : SPEED.walk;
    if (P.ads > 0.3) speed *= G.lerp(1, 0.55, P.ads);
    if (P.swimming) speed = SPEED.swim;
    speed *= W.current().moveMul || 1;
    tmpF.set(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
    tmpR.set(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
    wish.set(0, 0, 0).addScaledVector(tmpF, fwd).addScaledVector(tmpR, str);
    if (wish.lengthSq() > 0) wish.normalize();

    if (P.slide > 0) {
      const f = Math.exp(-1.6 * dt);
      P.vel.x *= f;
      P.vel.z *= f;
    } else {
      const accel = P.onGround || P.swimming ? 11 : 1.8;
      const tx = wish.x * speed, tz = wish.z * speed;
      P.vel.x = G.damp(P.vel.x, tx, accel, dt);
      P.vel.z = G.damp(P.vel.z, tz, accel, dt);
    }

    // --- salto
    if (G.wasPressed('Space')) {
      if (P.onGround && !P.swimming) {
        if (P.crouch && P.slide <= 0) P.crouch = false;
        else {
          P.vel.y = JUMP_V;
          P.onGround = false;
          P.slide = 0;
          P.crouch = false;
          G.audio.footstep('dirt', 0.25);
        }
      } else if (P.swimming) P.vel.y = 3;
    }

    // --- gravità e integrazione (con sotto-passi per evitare di attraversare i muri)
    if (!P.onGround) P.vel.y -= g * dt;
    else P.vel.y = Math.min(P.vel.y, 0) - 2 * dt;
    const steps = Math.max(1, Math.ceil((Math.hypot(P.vel.x, P.vel.z) * dt) / 0.3));
    let ground = 0;
    const h = P.crouch ? 1.15 : 1.8;
    const wasGround = P.onGround;
    for (let i = 0; i < steps; i++) {
      P.pos.addScaledVector(P.vel, dt / steps);
      ground = G.collide(P.pos, P.radius, h, P.vel);
      G.vehicles.pushOut(P.pos, P.radius, P.vel);
    }
    // acqua: nuoto
    const waterFloat = G.WATER - 1.35;
    P.swimming = ground < waterFloat;
    if (P.swimming) {
      ground = Math.max(ground, waterFloat);
      if (P.pos.y < waterFloat + 0.2) { P.vel.y = Math.max(P.vel.y, 0) * 0.5; }
      if (Math.random() < 0.05 && moving) G.fx.impact(new V(P.pos.x, G.WATER, P.pos.z), null, 'water');
    }

    if (P.pos.y <= ground) {
      if (!wasGround) {
        const impactV = -P.fallSpeed;
        if (impactV > 4) {
          P.landDip = Math.min(0.35, impactV * 0.025);
          G.audio.land(impactV);
        }
        // danno da caduta (scala con la gravità scelta)
        const lethal = Math.sqrt(2 * g * 5.5);
        if (impactV > lethal) P.damage((impactV - lethal) * 9, null, 'Caduta');
      }
      P.pos.y = ground;
      P.vel.y = 0;
      P.onGround = true;
    } else if (wasGround && P.pos.y - ground < 0.45 && P.vel.y <= 0.01) {
      P.pos.y = ground; // aderisce alle discese
      P.onGround = true;
    } else {
      P.onGround = false;
    }
    P.fallSpeed = P.vel.y;
    // confini della mappa
    const B = G.HALF - 4;
    P.pos.x = G.clamp(P.pos.x, -B, B);
    P.pos.z = G.clamp(P.pos.z, -B, B);

    // --- altezza occhi, bob, inclinazione
    const targetEye = P.slide > 0 ? 0.75 : P.crouch ? 1.05 : 1.65;
    P.eye = G.damp(P.eye, targetEye, 12, dt);
    const hs = Math.hypot(P.vel.x, P.vel.z);
    P.moveAmount = G.clamp(hs / SPEED.sprint, 0, 1);
    if (P.onGround && hs > 0.5 && P.slide <= 0) {
      const prev = P.bobPhase;
      P.bobPhase += dt * hs * (P.sprint ? 1.55 : 1.9);
      // passi sincronizzati con il bob
      if (Math.floor(prev / Math.PI) !== Math.floor(P.bobPhase / Math.PI)) {
        const surf = G.surfaceAt(P.pos.x, P.pos.z);
        G.audio.footstep(P.pos.y > G.heightAt(P.pos.x, P.pos.z) + 0.4 ? 'road' : surf, P.crouch ? 0.06 : P.sprint ? 0.26 : 0.16);
      }
    }
    const bobAmt = G.settings.headBob ? (P.sprint ? 1.4 : 1) * G.clamp(hs / 4.6, 0, 1.6) * (1 - P.ads * 0.85) : 0;
    P.bob.set(Math.cos(P.bobPhase) * 0.035 * bobAmt, Math.abs(Math.sin(P.bobPhase)) * 0.05 * bobAmt, 0);
    P.landDip = G.damp(P.landDip, 0, 8, dt);
    const tiltTarget = -str * 0.012 * (1 - P.ads) + (P.slide > 0 ? 0.06 : 0);
    P.tilt = G.damp(P.tilt, tiltTarget, 8, dt);

    // --- salute
    if (G.time - P.lastHit > 4.5 && P.health < 100) P.health = Math.min(100, P.health + dt * 22);
    if (P.health < 35) {
      P.heartbeatT -= dt;
      if (P.heartbeatT <= 0) { G.audio.heartbeat(); P.heartbeatT = 0.9; }
    }
    // recupero del rinculo visivo
    P.kickPitch = G.damp(P.kickPitch, 0, 9, dt);
    P.kickYaw = G.damp(P.kickYaw, 0, 9, dt);

    if (G.wasPressed('KeyF')) {
      P.flashlight = !P.flashlight;
      G.audio.click(2000, 0.2);
    }
  };

  // telecamera in prima persona
  P.updateCamera = (dt) => {
    const cam = G.camera;
    cam.rotation.order = 'YXZ';
    const shake = G.fx.shake;
    const t = G.time * 40;
    const sx = (Math.sin(t * 1.3) + Math.sin(t * 2.1)) * 0.012 * shake;
    const sy = (Math.cos(t * 1.7) + Math.sin(t * 2.9)) * 0.012 * shake;
    // oscillazione del mirino di precisione (trattieni il respiro con Shift)
    let sway = 0;
    const w = G.weapons.current();
    if (w.scope && P.ads > 0.9) {
      const holding = G.keys.ShiftLeft && P.holdBreath < 4;
      P.holdBreath = holding ? P.holdBreath + dt : Math.max(0, P.holdBreath - dt * 0.6);
      sway = holding ? 0.15 : 1;
    } else P.holdBreath = Math.max(0, P.holdBreath - dt);
    const swx = Math.sin(G.time * 0.9) * 0.004 * sway, swy = Math.sin(G.time * 1.4) * 0.003 * sway;
    cam.position.set(P.pos.x + P.bob.x * Math.cos(P.yaw), P.pos.y + P.eye + P.bob.y - P.landDip, P.pos.z - P.bob.x * Math.sin(P.yaw));
    cam.rotation.set(P.pitch + P.kickPitch + sy + swy, P.yaw + P.kickYaw + sx + swx, P.tilt);
    // FOV: sprint lo allarga, la mira lo stringe
    const base = G.settings.fov;
    const target = G.lerp(base + (P.sprint ? 7 : 0) + (P.slide > 0 ? 10 : 0), w.adsFov, P.ads);
    cam.fov = G.damp(cam.fov, target, w.scope && P.ads > 0.85 ? 30 : 12, dt);
    cam.updateProjectionMatrix();
  };

  P.damage = (amount, fromPos, cause = 'Nemico') => {
    if (P.dead || G.godMode) return;
    const mul = cause === 'Caduta' || cause === 'Esplosione' ? 1 : G.diffMul();
    const armor = P.vehicle ? 0.5 : 1;
    P.health -= amount * mul * armor;
    P.lastHit = G.time;
    G.audio.hurt();
    G.fx.addShake(0.25);
    G.hud.damage(fromPos, amount);
    if (P.health <= 0) P.die(cause);
  };

  P.die = (cause) => {
    P.health = 0;
    P.dead = true;
    P.deaths++;
    if (P.vehicle) G.vehicles.exit(true);
    G.hud.showDeath(cause);
  };

  return P;
})();
