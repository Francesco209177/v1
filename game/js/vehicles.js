'use strict';
/* =========================================================================
   VEICOLI: 5 modelli guidabili con fisica arcade (accelerazione, frenata,
   sterzo dipendente dalla velocità, derapata con freno a mano, salti,
   sospensioni, pendenze), danni, esplosioni, fari, clacson, telecamere.
   ========================================================================= */
G.vehicles = (function () {
  const V = THREE.Vector3;
  const TYPES = {
    jeep: { name: 'Jeep Militare', max: 36, accel: 11, brake: 22, grip: 7, steer: 0.55, wb: 2.5, track: 1.6, W: 2.0, L: 4.2, H: 1.9, r: 0.42, off: 0.92, hp: 320, mass: 1.6 },
    sedan: { name: 'Berlina', max: 48, accel: 13, brake: 24, grip: 6, steer: 0.5, wb: 2.7, track: 1.55, W: 1.85, L: 4.6, H: 1.45, r: 0.34, off: 0.55, hp: 200, mass: 1.3 },
    pickup: { name: 'Pickup 4x4', max: 42, accel: 11.5, brake: 22, grip: 6.5, steer: 0.5, wb: 3.0, track: 1.65, W: 2.0, L: 5.2, H: 1.85, r: 0.42, off: 0.82, hp: 260, mass: 1.7 },
    truck: { name: 'Camion Militare', max: 28, accel: 7, brake: 16, grip: 8, steer: 0.45, wb: 4.2, track: 2.0, W: 2.5, L: 7.2, H: 3.1, r: 0.55, off: 0.88, hp: 600, mass: 4, heavy: true },
    sport: { name: 'Sportiva GT', max: 64, accel: 19, brake: 30, grip: 7.5, steer: 0.45, wb: 2.6, track: 1.65, W: 1.95, L: 4.4, H: 1.2, r: 0.34, off: 0.4, hp: 160, mass: 1.2 },
  };
  const list = [];
  let driving = null;
  const cam = { yawOff: 0, pitch: 0.2, mode: 0, lastMouse: -99, pos: new V(), init: false };
  let headlight;

  /* ------------------------------------------------------------ modelli */
  const mBlack = G.std(0x111111, 0.6, 0.3);
  const mTire = G.std(0x1a1a1a, 0.95);
  const mRim = G.std(0x7a7a7a, 0.35, 0.8);
  const mGlass = new THREE.MeshStandardMaterial({ color: 0x1c2833, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.75 });
  const mHead = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d0, emissiveIntensity: 0.3 });
  const mTail = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1010, emissiveIntensity: 0.3 });
  const mCanvas = G.std(0x4d5236, 1);
  const mSeat = G.std(0x2b2520, 0.9);

  function b(g, w, h, d, m, x, y, z, rx = 0) {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    o.position.set(x, y, z);
    o.rotation.x = rx;
    o.castShadow = true;
    o.receiveShadow = true;
    g.add(o);
    return o;
  }
  function buildModel(type, def) {
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const { W, L, H, r } = def;
    let paint;
    if (type === 'jeep' || type === 'truck') paint = new THREE.MeshStandardMaterial({ map: G.tex.camoGreen, roughness: 0.85, metalness: 0.1 });
    else {
      const cols = type === 'sport' ? [0xb01818, 0xd8b020, 0x1a1a1a, 0xe0e0e0] : [0x5a6570, 0x8a8a84, 0x2d3b4a, 0x6b2020, 0xc8c2b0, 0x324030];
      paint = new THREE.MeshStandardMaterial({ color: G.pick(cols), roughness: 0.35, metalness: 0.55 });
    }
    const lights = { head: [], tail: [] };
    const headM = mHead.clone(), tailM = mTail.clone(); // materiali per-veicolo (fari indipendenti)
    const hl = (x, y, z) => { const o = b(body, 0.28, 0.14, 0.05, headM, x, y, z); lights.head.push(o); };
    const tl = (x, y, z) => { const o = b(body, 0.25, 0.12, 0.05, tailM, x, y, z); lights.tail.push(o); };
    const base = r + 0.1;
    if (type === 'jeep') {
      b(body, W, 0.55, L, paint, 0, base + 0.3, 0);
      b(body, W * 0.96, 0.3, L * 0.36, paint, 0, base + 0.72, L * 0.3);             // cofano
      b(body, W + 0.2, 0.08, 1, mBlack, 0, base + 0.5, L * 0.38);                    // parafanghi
      b(body, W + 0.2, 0.08, 1, mBlack, 0, base + 0.5, -L * 0.36);
      b(body, W * 0.95, 0.5, 0.06, mBlack, 0, base + 1.05, L * 0.1, -0.15);          // telaio parabrezza
      b(body, W * 0.85, 0.4, 0.03, mGlass, 0, base + 1.07, L * 0.1 + 0.03, -0.15);
      b(body, 0.08, 0.9, 0.08, mBlack, W / 2 - 0.1, base + 1.0, -L * 0.2);           // roll bar
      b(body, 0.08, 0.9, 0.08, mBlack, -W / 2 + 0.1, base + 1.0, -L * 0.2);
      b(body, W - 0.1, 0.08, 0.08, mBlack, 0, base + 1.45, -L * 0.2);
      b(body, 0.55, 0.5, 0.5, mSeat, 0.45, base + 0.8, -0.2);
      b(body, 0.55, 0.5, 0.5, mSeat, -0.45, base + 0.8, -0.2);
      b(body, W - 0.3, 0.4, 0.8, mSeat, 0, base + 0.75, -L * 0.34);
      const spare = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.28, 16), mTire);
      spare.rotation.x = Math.PI / 2;
      spare.position.set(0, base + 0.55, -L / 2 - 0.15);
      body.add(spare);
      b(body, W + 0.1, 0.18, 0.2, mBlack, 0, base + 0.15, L / 2 + 0.05);             // paraurti
      b(body, 0.1, 0.4, 0.05, mBlack, 0.4, base + 0.6, L / 2 + 0.01);                 // griglia
      hl(0.6, base + 0.65, L / 2 + 0.01); hl(-0.6, base + 0.65, L / 2 + 0.01);
      tl(0.8, base + 0.45, -L / 2 - 0.01); tl(-0.8, base + 0.45, -L / 2 - 0.01);
      const ant = b(body, 0.03, 1.8, 0.03, mBlack, -W / 2 + 0.1, base + 1.5, -L / 2 + 0.2);
      ant.rotation.x = -0.2;
    } else if (type === 'sedan' || type === 'sport') {
      const low = type === 'sport';
      b(body, W, low ? 0.45 : 0.6, L, paint, 0, base + (low ? 0.12 : 0.22), 0);
      b(body, W * 0.98, 0.1, L * 0.3, paint, 0, base + (low ? 0.38 : 0.55), L * 0.34, low ? 0.1 : 0.05);
      const cab = b(body, W * 0.86, low ? 0.4 : 0.55, L * (low ? 0.4 : 0.48), mGlass, 0, base + (low ? 0.55 : 0.8), low ? -L * 0.05 : -L * 0.04);
      b(body, W * 0.84, 0.06, L * (low ? 0.34 : 0.42), paint, 0, base + (low ? 0.77 : 1.09), low ? -L * 0.07 : -L * 0.05);
      cab.castShadow = true;
      b(body, W + 0.02, 0.15, 0.15, mBlack, 0, base + 0.02, L / 2);
      b(body, W + 0.02, 0.15, 0.15, mBlack, 0, base + 0.02, -L / 2);
      if (low) {
        b(body, W * 0.9, 0.05, 0.3, mBlack, 0, base + 0.75, -L / 2 + 0.2);            // alettone
        b(body, 0.06, 0.3, 0.1, mBlack, 0.6, base + 0.55, -L / 2 + 0.2);
        b(body, 0.06, 0.3, 0.1, mBlack, -0.6, base + 0.55, -L / 2 + 0.2);
      }
      hl(0.65, base + (low ? 0.2 : 0.35), L / 2 + 0.01); hl(-0.65, base + (low ? 0.2 : 0.35), L / 2 + 0.01);
      tl(0.7, base + (low ? 0.25 : 0.4), -L / 2 - 0.01); tl(-0.7, base + (low ? 0.25 : 0.4), -L / 2 - 0.01);
    } else if (type === 'pickup') {
      b(body, W, 0.6, L, paint, 0, base + 0.25, 0);
      b(body, W * 0.98, 0.15, L * 0.25, paint, 0, base + 0.62, L * 0.38);
      b(body, W * 0.95, 0.75, L * 0.3, mGlass, 0, base + 0.95, L * 0.1);
      b(body, W * 0.95, 0.06, L * 0.28, paint, 0, base + 1.34, L * 0.09);
      // cassone
      b(body, 0.08, 0.5, L * 0.4, paint, W / 2 - 0.04, base + 0.8, -L * 0.28);
      b(body, 0.08, 0.5, L * 0.4, paint, -W / 2 + 0.04, base + 0.8, -L * 0.28);
      b(body, W, 0.5, 0.08, paint, 0, base + 0.8, -L / 2 + 0.04);
      b(body, 0.06, 0.5, 0.06, mBlack, 0.5, base + 1.2, -0.3);
      b(body, 0.06, 0.5, 0.06, mBlack, -0.5, base + 1.2, -0.3);
      b(body, 1.1, 0.06, 0.06, mBlack, 0, base + 1.45, -0.3);
      b(body, W + 0.05, 0.18, 0.18, mBlack, 0, base + 0.05, L / 2);
      hl(0.65, base + 0.45, L / 2 + 0.01); hl(-0.65, base + 0.45, L / 2 + 0.01);
      tl(0.8, base + 0.5, -L / 2 - 0.01); tl(-0.8, base + 0.5, -L / 2 - 0.01);
    } else if (type === 'truck') {
      b(body, W * 0.9, 0.35, L, mBlack, 0, base + 0.15, 0);                          // telaio
      b(body, W, 1.5, L * 0.28, paint, 0, base + 1.0, L * 0.36);                     // cabina
      b(body, W * 0.9, 0.55, 0.04, mGlass, 0, base + 1.35, L * 0.5 + 0.01);
      b(body, W, 0.8, 0.5, paint, 0, base + 0.5, L * 0.5 - 0.2);
      b(body, W, 0.2, L * 0.66, paint, 0, base + 0.45, -L * 0.15);                   // pianale
      b(body, W, 1.9, L * 0.64, mCanvas, 0, base + 1.5, -L * 0.15);                  // telone
      for (let i = 0; i < 4; i++) b(body, W + 0.04, 0.06, 0.08, mBlack, 0, base + 2.45, -L * 0.45 + i * 1.3);
      hl(0.85, base + 0.6, L / 2 + 0.01); hl(-0.85, base + 0.6, L / 2 + 0.01);
      tl(0.95, base + 0.4, -L / 2 - 0.01); tl(-0.95, base + 0.4, -L / 2 - 0.01);
    }
    // fonde le parti della carrozzeria per materiale
    const merged = G.mergeByMaterial(body);
    body.clear();
    for (const m of merged) body.add(m);
    lights.head = merged.filter((m) => m.material === headM);
    lights.tail = merged.filter((m) => m.material === tailM);
    // ruote
    const wheels = [];
    const wx = W / 2 - 0.12;
    const axles = type === 'truck' ? [def.wb / 2, -def.wb / 2 + 0.6, -def.wb / 2 - 0.6] : [def.wb / 2, -def.wb / 2];
    for (const az of axles) {
      for (const side of [1, -1]) {
        const pivot = new THREE.Group();
        pivot.position.set(side * wx, r, az);
        const wg = new THREE.Group();
        const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.3, 16), mTire);
        tire.rotation.z = Math.PI / 2;
        tire.castShadow = true;
        const rimG = new THREE.CylinderGeometry(r * 0.6, r * 0.6, 0.31, 8);
        rimG.rotateZ(Math.PI / 2);
        const rim = new THREE.Mesh(G.mergeGeos([rimG, new THREE.BoxGeometry(0.32, r * 0.25, r * 1.1)]), mRim);
        wg.add(tire, rim);
        pivot.add(wg);
        root.add(pivot);
        wheels.push({ pivot, spin: wg, front: az > 0 && az === axles[0], z: az, x: side * wx });
      }
    }
    return { root, body, wheels, paint, lights };
  }

  /* ------------------------------------------------------------ veicolo */
  class Vehicle {
    constructor(type, x, z, ry) {
      this.type = type;
      this.def = TYPES[type];
      this.spawn = { x, z, ry };
      Object.assign(this, buildModel(type, this.def));
      G.scene.add(this.root);
      this.pos = new V(x, G.heightAt(x, z), z);
      this.vel = new V();
      this.yaw = ry;
      this.pitch = 0;
      this.roll = 0;
      this.steer = 0;
      this.hp = this.def.hp;
      this.dead = false;
      this.onGround = true;
      this.spinAngle = 0;
      this.bodyY = 0;
      this.bodyVy = 0;
      this.bodyRoll = 0;
      this.bodyPitch = 0;
      this.lightsOn = false;
      this.rpm = 0;
      this.gear = 1;
      this.slip = 0;
      this.asleep = false;
      this.slopeVy = 0;
      this.settle();
      this.sync();
    }
    get fwd() { return new V(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
    get right() { return new V(-Math.cos(this.yaw), 0, Math.sin(this.yaw)); }
    wheelHeights() {
      const f = this.fwd, r = this.right, d = this.def;
      const hw = d.track / 2, hl = d.wb / 2;
      const s = (lz, lx) => G.heightAt(this.pos.x + f.x * lz - r.x * lx, this.pos.z + f.z * lz - r.z * lx);
      // lx positivo = lato sinistro (asse x locale)
      return { fl: s(hl, hw), fr: s(hl, -hw), rl: s(-hl, hw), rr: s(-hl, -hw) };
    }
    settle() {
      const h = this.wheelHeights();
      this.pos.y = (h.fl + h.fr + h.rl + h.rr) / 4;
      this.pitch = -Math.atan2((h.fl + h.fr) / 2 - (h.rl + h.rr) / 2, this.def.wb);
      this.roll = Math.atan2((h.fl + h.rl) / 2 - (h.fr + h.rr) / 2, this.def.track);
    }
    sync() {
      this.root.visible = !G.camera || this.pos.distanceToSquared(G.camera.position) < 450 * 450;
      this.root.position.copy(this.pos);
      this.root.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
      this.body.position.y = this.bodyY;
      this.body.rotation.set(this.bodyPitch, 0, this.bodyRoll);
    }
    damage(amount) {
      if (this.dead) return;
      this.hp -= amount;
      this.asleep = false;
      if (this.hp <= 0) this.explode();
    }
    explode() {
      this.dead = true;
      this.hp = 0;
      this.deadT = 0;
      this.paint = this.paint.clone();
      this.body.traverse((o) => { if (o.material && o.material !== mGlass) o.material = G.M.wreck; });
      for (const w of this.wheels) w.spin.visible = Math.random() < 0.5;
      this.vel.y += 5;
      G.weapons.explode(this.pos.clone().setY(this.pos.y + 1), 8, 140, 'Esplosione veicolo', driving === this || this.lastHitByPlayer);
      if (driving === this) {
        G.player.damage(200, this.pos, 'Esplosione veicolo');
      }
    }

    update(dt, input) {
      const d = this.def;
      if (this.asleep && !input) return;
      const g = G.settings.gravity;
      const f = this.fwd, r = this.right;
      let vf = this.vel.dot(f), vr = this.vel.dot(r);
      const onRoad = G.inCity(this.pos.x, this.pos.z) || G.roadDistFast(this.pos.x, this.pos.z) < 1.5;
      const inWater = this.pos.y < G.WATER - 0.4;
      const surf = inWater ? 0.25 : onRoad ? 1 : d.off;
      let maxS = d.max * (onRoad ? 1 : 0.55 + 0.45 * d.off);
      let accel = d.accel * surf;
      let grip = d.grip * (onRoad ? 1 : 0.7 + 0.3 * d.off);
      let throttle = 0, braking = false, hand = false, steerIn = 0, boost = false;
      if (input && !this.dead) {
        throttle = (G.keys.KeyW ? 1 : 0) - (G.keys.KeyS ? 1 : 0);
        hand = !!G.keys.Space;
        steerIn = (G.keys.KeyA ? 1 : 0) - (G.keys.KeyD ? 1 : 0);
        boost = !!G.keys.ShiftLeft;
      }
      if (boost) { accel *= 1.6; maxS *= 1.15; }
      let longAcc = 0;
      if (this.onGround) {
        if (throttle > 0) {
          if (vf < -0.5) { longAcc = d.brake; braking = true; }
          else longAcc = accel * Math.max(0, 1 - (vf / maxS) * (vf / maxS));
        } else if (throttle < 0) {
          if (vf > 0.5) { longAcc = -d.brake; braking = true; }
          else longAcc = -accel * 0.6 * Math.max(0, 1 - (-vf / 12));
        }
        vf += longAcc * dt;
        // resistenza al rotolamento + aerodinamica
        vf -= Math.sign(vf) * Math.min(Math.abs(vf), (0.6 + vf * vf * 0.0012 + (onRoad ? 0 : 1.2)) * dt * (throttle === 0 ? 1.8 : 1));
        if (inWater) vf *= Math.exp(-1.2 * dt);
        if (hand) { vf -= Math.sign(vf) * Math.min(Math.abs(vf), 7 * dt); grip = 1.1; }
        // gravità lungo la pendenza
        vf -= g * Math.sin(-this.pitch) * dt * 0.9;
        // sterzo (meno sterzata alle alte velocità)
        const maxSteer = d.steer / (1 + Math.abs(vf) * 0.045);
        this.steer = G.damp(this.steer, steerIn * maxSteer, 6, dt);
        let yawRate = (vf / d.wb) * Math.tan(this.steer);
        if (hand && Math.abs(vf) > 5) yawRate *= 1.5;
        this.yaw += yawRate * dt;
        // aderenza laterale (derapata quando è bassa)
        this.slip = Math.abs(vr);
        vr = G.damp(vr, 0, grip, dt);
        const nf = this.fwd, nr = this.right;
        this.vel.x = nf.x * vf + nr.x * vr;
        this.vel.z = nf.z * vf + nr.z * vr;
        this.lastYawRate = yawRate;
      } else {
        this.vel.y -= g * dt;
        this.vel.x *= Math.exp(-0.05 * dt);
        this.vel.z *= Math.exp(-0.05 * dt);
        this.steer = G.damp(this.steer, steerIn * d.steer, 6, dt);
        this.yaw += steerIn * 0.4 * dt; // lieve controllo in aria
        this.lastYawRate = 0;
      }
      // integrazione orizzontale
      const oldY = this.pos.y;
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      this.collideStatic();
      // terreno
      const h = this.wheelHeights();
      const groundY = (h.fl + h.fr + h.rl + h.rr) / 4;
      const tPitch = -Math.atan2((h.fl + h.fr) / 2 - (h.rl + h.rr) / 2, d.wb);
      const tRoll = Math.atan2((h.fl + h.rl) / 2 - (h.fr + h.rr) / 2, d.track);
      if (this.onGround) {
        const drop = oldY - groundY;
        const speed = Math.hypot(this.vel.x, this.vel.z);
        // se il terreno scende più velocemente di quanto cadremmo → decollo
        if (drop > 0.25 && speed > 10 && drop > -this.slopeVy * dt + 0.5 * g * dt * dt + 0.08) {
          this.onGround = false;
          this.vel.y = this.slopeVy;
          this.pos.y = oldY + this.slopeVy * dt;
        } else {
          this.slopeVy = (groundY - oldY) / Math.max(dt, 1e-3);
          this.pos.y = groundY;
          this.vel.y = 0;
        }
        this.pitch = G.damp(this.pitch, tPitch, 14, dt);
        this.roll = G.damp(this.roll, tRoll, 14, dt);
      } else {
        this.pos.y += this.vel.y * dt;
        this.pitch = G.damp(this.pitch, 0.12, 0.8, dt); // il muso scende in volo
        if (this.pos.y <= groundY) {
          const impact = -this.vel.y;
          this.pos.y = groundY;
          this.vel.y = 0;
          this.onGround = true;
          this.slopeVy = 0;
          this.bodyVy -= impact * 0.06;
          if (impact > 3) G.audio.crash(this.pos, impact * 0.8);
          if (impact > 11) {
            this.damage((impact - 11) * 7);
            if (driving === this) G.player.damage((impact - 11) * 2.5, null, 'Incidente');
          }
          if (driving === this) G.fx.addShake(G.clamp(impact * 0.04, 0, 0.8));
        }
      }
      // limiti mappa
      const B = G.HALF - 6;
      if (Math.abs(this.pos.x) > B) { this.pos.x = Math.sign(this.pos.x) * B; this.vel.x *= -0.3; }
      if (Math.abs(this.pos.z) > B) { this.pos.z = Math.sign(this.pos.z) * B; this.vel.z *= -0.3; }
      // sospensioni visive
      const lat = (this.lastYawRate || 0) * vf;
      this.bodyRoll = G.damp(this.bodyRoll, G.clamp(-lat * 0.008, -0.09, 0.09), 6, dt);
      this.bodyPitch = G.damp(this.bodyPitch, G.clamp(longAcc * 0.004 * (braking ? -1.5 : 1), -0.06, 0.05), 5, dt);
      this.bodyVy += (-this.bodyY * 120 - this.bodyVy * 10) * dt;
      this.bodyY += this.bodyVy * dt;
      // ruote
      this.spinAngle += (vf / d.r) * dt;
      for (const w of this.wheels) {
        w.spin.rotation.x = this.spinAngle;
        w.pivot.rotation.y = w.front ? this.steer : 0;
      }
      // effetti: polvere fuori strada, fumo pneumatici in derapata
      const speed = Math.hypot(this.vel.x, this.vel.z);
      const drift = this.onGround && (this.slip > 3.5 || (hand && speed > 6));
      if (this.onGround && speed > 6) {
        for (const w of this.wheels) {
          if (w.front) continue;
          const wp = this.root.localToWorld(new V(w.x, 0.1, w.z));
          if (!onRoad && Math.random() < 0.35) G.fx.dust(wp, new V(-this.vel.x * 0.1, 1, -this.vel.z * 0.1), [0.5, 0.43, 0.32], 0.8);
          if (drift && Math.random() < 0.5) G.fx.dust(wp, new V(0, 0.6, 0), [0.75, 0.75, 0.75], 0.7);
        }
      }
      // danni visibili
      if (!this.dead && this.hp < this.def.hp * 0.35) G.fx.smoke(this.root.localToWorld(new V(0, this.def.H * 0.7, this.def.L * 0.35)), 0.2, 1.5);
      if (this.dead) {
        this.deadT += dt;
        if (this.deadT < 25) G.fx.fire(this.root.localToWorld(new V(0, this.def.H * 0.6, 0)), this.deadT < 15 ? 1 : 0.5);
      }
      // audio motore
      if (input) {
        const gears = [0, 0.18, 0.36, 0.56, 0.78, 1.0];
        const sn = Math.abs(vf) / d.max;
        let gi = 1;
        while (gi < 5 && sn > gears[gi]) gi++;
        const lo = gears[gi - 1], hi = gears[gi];
        const target = G.clamp(0.2 + ((sn - lo) / (hi - lo)) * 0.8, 0.2, 1.05);
        this.rpm = G.damp(this.rpm, this.onGround ? target : Math.max(target, throttle !== 0 ? 1 : 0.4), 8, dt);
        this.gear = vf < -0.5 ? 'R' : gi;
        G.audio.engineUpdate(this.rpm, Math.abs(throttle), drift ? G.clamp(this.slip / 8, 0.3, 1) : 0, d.heavy);
      }
      // si "addormenta" quando è fermo e non guidato
      if (!input && this.onGround && speed < 0.05 && !this.dead) { this.vel.set(0, 0, 0); this.asleep = true; }
      if (this.dead && this.deadT > 25 && this.onGround) this.asleep = true;
      this.sync();
    }

    // tre cerchi lungo il veicolo contro il mondo statico
    collideStatic() {
      const d = this.def, f = this.fwd;
      const rad = d.W / 2;
      const offs = [-d.L / 2 + rad, 0, d.L / 2 - rad];
      for (const o of offs) {
        const cx = this.pos.x + f.x * o, cz = this.pos.z + f.z * o;
        G.queryXZ(cx - rad - 1, cz - rad - 1, cx + rad + 1, cz + rad + 1, (c) => {
          if (c.maxY < this.pos.y + 0.45 || c.minY > this.pos.y + d.H) return;
          let nx, nz, pen;
          if (c.cyl) {
            const dx = cx - c.x, dz = cz - c.z;
            const dist = Math.hypot(dx, dz);
            pen = rad + c.r - dist;
            if (pen <= 0 || dist < 1e-4) return;
            nx = dx / dist; nz = dz / dist;
          } else {
            const px = G.clamp(cx, c.minX, c.maxX), pz = G.clamp(cz, c.minZ, c.maxZ);
            let dx = cx - px, dz = cz - pz;
            let dist = Math.hypot(dx, dz);
            if (dist < 1e-4) { // centro dentro al box: esci dal lato più vicino
              const m = Math.min(cx - c.minX, c.maxX - cx, cz - c.minZ, c.maxZ - cz);
              if (m === cx - c.minX) { dx = -1; dz = 0; } else if (m === c.maxX - cx) { dx = 1; dz = 0; }
              else if (m === cz - c.minZ) { dx = 0; dz = -1; } else { dx = 0; dz = 1; }
              pen = m + rad; nx = dx; nz = dz;
            } else {
              pen = rad - dist;
              if (pen <= 0) return;
              nx = dx / dist; nz = dz / dist;
            }
          }
          this.pos.x += nx * pen;
          this.pos.z += nz * pen;
          const vn = this.vel.x * nx + this.vel.z * nz;
          if (vn < 0) {
            this.vel.x -= nx * vn * 1.3;
            this.vel.z -= nz * vn * 1.3;
            this.vel.multiplyScalar(0.85);
            const imp = -vn;
            if (imp > 4) {
              G.audio.crash(this.pos, imp);
              G.fx.impact(new V(cx - nx * rad, this.pos.y + 0.7, cz - nz * rad), new V(nx, 0, nz), 'metal');
              if (driving === this) G.fx.addShake(G.clamp(imp * 0.05, 0, 1));
            }
            if (imp > 8) {
              this.damage((imp - 8) * 5 * (d.heavy ? 0.4 : 1));
              if (driving === this) G.player.damage((imp - 8) * 1.2, null, 'Incidente');
            }
            // barili colpiti
            if (c.ref && c.ref.hp !== undefined && imp > 6) G.weapons.damageDestructible(c.ref, imp * 3);
          }
        });
      }
    }
    // cerchi per collisioni veicolo-veicolo / investimenti
    circles() {
      const d = this.def, f = this.fwd, rad = d.W / 2;
      return [-d.L / 2 + rad, 0, d.L / 2 - rad].map((o) => ({ x: this.pos.x + f.x * o, z: this.pos.z + f.z * o, r: rad }));
    }
  }

  /* ------------------------------------------------------------ gestione */
  function init() {
    for (const s of G.vehicleSpawns) list.push(new Vehicle(s.type, s.x, s.z, s.ry));
    headlight = new THREE.SpotLight(0xfff0d0, 0, 90, 0.55, 0.5, 1.4);
    G.scene.add(headlight, headlight.target);
  }

  function nearest(pos, maxD = 3.8) {
    let best = null, bd = maxD;
    for (const v of list) {
      if (v.dead) continue;
      const loc = toLocal(v, pos);
      // distanza dal bordo del veicolo
      const dx = Math.max(0, Math.abs(loc.x) - v.def.W / 2), dz = Math.max(0, Math.abs(loc.z) - v.def.L / 2);
      const dd = Math.hypot(dx, dz);
      if (dd < bd && Math.abs(pos.y - v.pos.y) < 3) { bd = dd; best = v; }
    }
    return best;
  }
  function toLocal(v, p) {
    const dx = p.x - v.pos.x, dz = p.z - v.pos.z;
    const c = Math.cos(v.yaw), s = Math.sin(v.yaw);
    // x locale = -right... asse x locale = (cos, 0, -sin)
    return { x: dx * c - dz * s, z: dx * s + dz * c };
  }

  function enter(v) {
    const P = G.player;
    driving = v;
    P.vehicle = v;
    v.asleep = false;
    P.ads = 0;
    cam.yawOff = 0;
    cam.pitch = 0.2;
    cam.init = false;
    G.audio.door();
    G.audio.engineStart();
    v.lightsOn = G.nightFactor > 0.5;
    G.missions.event('vehicle');
    G.hud.notify(v.def.name + '  —  [E] Scendi  [L] Fari  [H] Clacson  [C] Visuale');
  }
  function exit(force = false) {
    const v = driving;
    if (!v) return;
    const P = G.player;
    const r = v.right;
    // prova lato guida (sinistro), poi destro, poi sopra
    const sides = [-1, 1];
    let placed = false;
    for (const s of sides) {
      const p = new V(v.pos.x + r.x * s * (v.def.W / 2 + 0.9), 0, v.pos.z + r.z * s * (v.def.W / 2 + 0.9));
      p.y = G.heightAt(p.x, p.z);
      const test = p.clone();
      G.collide(test, 0.38, 1.8, null);
      if (test.distanceTo(p) < 0.2 || force) { P.pos.copy(test); placed = true; break; }
    }
    if (!placed) P.pos.set(v.pos.x, v.pos.y + v.def.H + 0.2, v.pos.z);
    P.vel.copy(v.vel).multiplyScalar(0.4);
    P.vel.y = 0;
    P.yaw = G.wrapAngle(v.yaw + Math.PI + cam.yawOff);
    P.pitch = 0;
    P.onGround = false;
    P.vehicle = null;
    driving = null;
    G.audio.engineStop();
    G.audio.hornSet(false);
    G.audio.door();
    headlight.intensity = 0;
  }

  function update(dt) {
    const P = G.player;
    for (const v of list) v.update(dt, v === driving && !P.dead);
    // collisioni veicolo-veicolo
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.asleep && b.asleep) continue;
        if (a.pos.distanceToSquared(b.pos) > 100) continue;
        for (const ca of a.circles()) {
          for (const cb of b.circles()) {
            const dx = ca.x - cb.x, dz = ca.z - cb.z;
            const dist = Math.hypot(dx, dz), rr = ca.r + cb.r;
            if (dist >= rr || dist < 1e-4) continue;
            const nx = dx / dist, nz = dz / dist, pen = rr - dist;
            const ma = a.def.mass, mb = b.def.mass, tot = ma + mb;
            a.pos.x += nx * pen * (mb / tot); a.pos.z += nz * pen * (mb / tot);
            b.pos.x -= nx * pen * (ma / tot); b.pos.z -= nz * pen * (ma / tot);
            const rv = (a.vel.x - b.vel.x) * nx + (a.vel.z - b.vel.z) * nz;
            if (rv < 0) {
              const jimp = (-1.3 * rv) / (1 / ma + 1 / mb);
              a.vel.x += (jimp / ma) * nx; a.vel.z += (jimp / ma) * nz;
              b.vel.x -= (jimp / mb) * nx; b.vel.z -= (jimp / mb) * nz;
              a.asleep = b.asleep = false;
              if (-rv > 4) {
                G.audio.crash(a.pos, -rv);
                a.damage((-rv - 4) * 4 * (mb / tot));
                b.damage((-rv - 4) * 4 * (ma / tot));
                if (driving === a || driving === b) {
                  G.fx.addShake(G.clamp(-rv * 0.05, 0, 1));
                  b.lastHitByPlayer = a.lastHitByPlayer = true;
                }
              }
            }
          }
        }
      }
    }
    // controlli del veicolo guidato
    const v = driving;
    if (v) {
      if (G.wasPressed('KeyL')) { v.lightsOn = !v.lightsOn; G.audio.click(1500, 0.2); }
      if (G.wasPressed('KeyC')) cam.mode = (cam.mode + 1) % 2;
      G.audio.hornSet(!!G.keys.KeyH && !v.dead);
      if (G.keys.KeyH && !v.dead) G.enemies.noise(v.pos, 60);
      // investimenti
      const sp = Math.hypot(v.vel.x, v.vel.z);
      if (sp > 4) {
        for (const e of G.enemies.list) {
          if (e.dead) continue;
          for (const c of v.circles()) {
            if (Math.hypot(e.pos.x - c.x, e.pos.z - c.z) < c.r + 0.45 && Math.abs(e.pos.y - v.pos.y) < 2) {
              const killed = e.damage(sp * 12, false, v.vel.clone().normalize(), 'vehicle');
              if (killed) { G.hud.hitmarker(false, true); e.vel.copy(v.vel).multiplyScalar(0.8).setY(5); }
              v.vel.multiplyScalar(0.94);
              G.audio.crash(e.pos, 6);
              break;
            }
          }
        }
      }
      v.lastHitByPlayer = true;
      // fari
      if (!v.dead) for (const o of v.lights.head) o.material.emissiveIntensity = v.lightsOn ? 3 : 0.3;
      headlight.intensity = v.lightsOn && !v.dead ? 3.5 : 0;
      if (headlight.intensity > 0) {
        headlight.position.copy(v.root.localToWorld(new V(0, v.def.r + 0.7, v.def.L / 2 + 0.2)));
        headlight.target.position.copy(v.root.localToWorld(new V(0, -1, v.def.L / 2 + 20)));
        headlight.target.updateMatrixWorld();
      }
      if (!v.dead) for (const o of v.lights.tail) o.material.emissiveIntensity = G.keys.KeyS || G.keys.Space ? 2.5 : v.lightsOn ? 1 : 0.3;
    }
    // fari accesi sui veicoli non guidati se lasciati accesi
    for (const o of list) if (o !== driving && !o.dead) for (const h of o.lights.head) h.material.emissiveIntensity = o.lightsOn && !o.dead ? 2 : 0.3;
    // respawn dei veicoli distrutti quando il giocatore è lontano
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o.dead && o.deadT > 60 && G.player.pos.distanceTo(o.pos) > 150) {
        const s = o.spawn;
        if (G.player.pos.distanceTo(new V(s.x, 0, s.z)) < 120) continue;
        G.scene.remove(o.root);
        list[i] = new Vehicle(o.type, s.x, s.z, s.ry);
      }
    }
  }

  function updateCamera(dt) {
    const v = driving;
    const c = G.camera;
    const sens = 0.0022 * G.settings.vehSens;
    if (G.mouse.dx || G.mouse.dy) {
      cam.yawOff -= G.mouse.dx * sens;
      cam.pitch = G.clamp(cam.pitch + G.mouse.dy * sens * (G.settings.invertY ? -1 : 1), -0.25, 1.1);
      cam.lastMouse = G.time;
    }
    const speed = Math.hypot(v.vel.x, v.vel.z);
    if (G.time - cam.lastMouse > 1.4 && speed > 2) {
      cam.yawOff = G.dampAngle(cam.yawOff, 0, 2.5, dt);
      cam.pitch = G.damp(cam.pitch, 0.2, 2, dt);
    }
    cam.yawOff = G.wrapAngle(cam.yawOff);
    const fovT = G.settings.fov + G.clamp(speed / v.def.max, 0, 1.2) * 14;
    c.fov = G.damp(c.fov, fovT, 4, dt);
    c.updateProjectionMatrix();
    const shake = G.fx.shake;
    if (cam.mode === 0) {
      const dist = v.def.L * 1.25 + 3.5;
      const yaw = v.yaw + cam.yawOff;
      const target = new V(v.pos.x, v.pos.y + v.def.H * 0.9 + 0.6, v.pos.z);
      const back = new V(-Math.sin(yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), -Math.cos(yaw) * Math.cos(cam.pitch));
      const desired = target.clone().addScaledVector(back, dist);
      // evita che la telecamera entri nei muri
      const dir = desired.clone().sub(target);
      const len = dir.length();
      dir.normalize();
      const hit = G.raycastStatic(target, dir, len);
      if (hit) desired.copy(target).addScaledVector(dir, Math.max(1.5, hit.t - 0.4));
      const gy = G.heightAt(desired.x, desired.z) + 0.6;
      if (desired.y < gy) desired.y = gy;
      if (!cam.init) { cam.pos.copy(desired); cam.init = true; }
      cam.pos.x = G.damp(cam.pos.x, desired.x, 14, dt);
      cam.pos.y = G.damp(cam.pos.y, desired.y, 8, dt);
      cam.pos.z = G.damp(cam.pos.z, desired.z, 14, dt);
      c.position.copy(cam.pos);
      c.position.x += (Math.random() - 0.5) * shake * 0.1;
      c.position.y += (Math.random() - 0.5) * shake * 0.1;
      c.lookAt(target.x + Math.sin(v.yaw) * 2, target.y, target.z + Math.cos(v.yaw) * 2);
    } else {
      // visuale interna (posto di guida)
      v.root.updateMatrixWorld();
      const seat = v.root.localToWorld(new V(v.type === 'truck' ? 0.55 : 0.42, v.def.H * (v.type === 'sport' ? 0.78 : 0.72), v.type === 'truck' ? v.def.L * 0.35 : v.type === 'jeep' ? -0.2 : 0));
      c.position.copy(seat);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(v.pitch, v.yaw + Math.PI + cam.yawOff, v.roll, 'YXZ'));
      q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-cam.pitch + 0.2 + (Math.random() - 0.5) * shake * 0.02, 0, 0)));
      c.quaternion.copy(q);
    }
  }

  // spinge fuori un cilindro (giocatore/nemico) dai veicoli
  function pushOut(pos, r, vel) {
    for (const v of list) {
      if (v === driving && pos === G.player.pos) continue;
      const dx = pos.x - v.pos.x, dz = pos.z - v.pos.z;
      if (dx * dx + dz * dz > 64) continue;
      if (pos.y > v.pos.y + v.def.H || pos.y + 1.8 < v.pos.y) continue;
      const loc = toLocal(v, pos);
      const hw = v.def.W / 2 + r, hl = v.def.L / 2 + r;
      if (Math.abs(loc.x) >= hw || Math.abs(loc.z) >= hl) continue;
      const px = hw - Math.abs(loc.x), pz = hl - Math.abs(loc.z);
      const c = Math.cos(v.yaw), s = Math.sin(v.yaw);
      let lx = 0, lz = 0;
      if (px < pz) lx = Math.sign(loc.x) * px; else lz = Math.sign(loc.z) * pz;
      // ritorno allo spazio mondo (inversa della rotazione in toLocal)
      const wx = lx * c + lz * s, wz = -lx * s + lz * c;
      pos.x += wx;
      pos.z += wz;
      if (vel) {
        const n = Math.hypot(wx, wz) || 1;
        const vn = (vel.x * wx + vel.z * wz) / n;
        if (vn < 0) { vel.x -= (wx / n) * vn; vel.z -= (wz / n) * vn; }
      }
    }
  }

  function rayTest(o, d, maxT, ignore) {
    let best = null;
    for (const v of list) {
      if (v === ignore) continue;
      const dx = o.x - v.pos.x, dz = o.z - v.pos.z;
      const c = Math.cos(v.yaw), s = Math.sin(v.yaw);
      const lo = { x: dx * c - dz * s, y: o.y - v.pos.y, z: dx * s + dz * c };
      const ld = { x: d.x * c - d.z * s, y: d.y, z: d.x * s + d.z * c };
      const mn = [-v.def.W / 2, 0.25, -v.def.L / 2], mx = [v.def.W / 2, v.def.H, v.def.L / 2];
      const os = [lo.x, lo.y, lo.z], ds = [ld.x, ld.y, ld.z];
      let tmin = 0, tmax = best ? best.t : maxT, axis = -1, sign = 0, ok = true;
      for (let a = 0; a < 3 && ok; a++) {
        if (Math.abs(ds[a]) < 1e-9) { if (os[a] < mn[a] || os[a] > mx[a]) ok = false; continue; }
        let t1 = (mn[a] - os[a]) / ds[a], t2 = (mx[a] - os[a]) / ds[a], sg = -1;
        if (t1 > t2) { [t1, t2] = [t2, t1]; sg = 1; }
        if (t1 > tmin) { tmin = t1; axis = a; sign = sg; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) ok = false;
      }
      if (!ok || axis < 0) continue;
      const ln = [0, 0, 0];
      ln[axis] = sign;
      const nx = ln[0] * c + ln[2] * s, nz = -ln[0] * s + ln[2] * c;
      best = { t: tmin, vehicle: v, normal: new V(nx, ln[1], nz) };
    }
    return best;
  }

  return {
    init, update, updateCamera, nearest, enter, exit, pushOut, rayTest, list, TYPES,
    get driving() { return driving; },
    get camMode() { return cam.mode; },
  };
})();
