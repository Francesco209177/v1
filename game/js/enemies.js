'use strict';
/* =========================================================================
   NEMICI: soldati con IA (pattuglia, allerta, combattimento, ricerca),
   percezione con linea di vista, raffiche, precisione variabile,
   animazioni procedurali, morte, drop di munizioni, respawn per zona.
   ========================================================================= */
G.enemies = (function () {
  const V = THREE.Vector3;
  const list = [];
  const pickups = [];

  /* --------------------------------------------- modello (vertex colors) */
  function colored(geo, hex, m) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (m) g.applyMatrix4(m);
    const c = new THREE.Color(hex).convertSRGBToLinear();
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  }
  function merge(geos) {
    const pos = [], nor = [], col = [];
    for (const g of geos) {
      pos.push(...g.attributes.position.array);
      nor.push(...g.attributes.normal.array);
      col.push(...g.attributes.color.array);
    }
    const o = new THREE.BufferGeometry();
    o.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    o.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    o.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return o;
  }
  const B = (w, h, d, hex, x, y, z, rx = 0, ry = 0, rz = 0) => colored(new THREE.BoxGeometry(w, h, d), hex, G.mat4(x, y, z, rx, ry, rz));
  const UNI = 0x8a7c5e, UNI2 = 0x6f6349, VEST = 0x3b3a30, DARK = 0x1b1b1a, HELM = 0x4f4c3c, SKIN = 0x9a7358, GUN = 0x1e1f20;
  let GEO;
  function buildGeos() {
    GEO = {
      upper: merge([
        B(0.44, 0.58, 0.25, UNI, 0, 1.27, 0),                  // busto
        B(0.5, 0.42, 0.32, VEST, 0, 1.32, 0.01),               // giubbotto tattico
        B(0.12, 0.1, 0.06, UNI2, -0.13, 1.25, 0.18),           // tasche
        B(0.12, 0.1, 0.06, UNI2, 0.0, 1.25, 0.18),
        B(0.12, 0.1, 0.06, UNI2, 0.13, 1.25, 0.18),
        B(0.4, 0.14, 0.24, UNI2, 0, 0.98, 0),                  // cintura
        B(0.1, 0.1, 0.1, SKIN, 0, 1.6, 0),                     // collo
        B(0.22, 0.25, 0.24, DARK, 0, 1.75, 0),                 // passamontagna
        B(0.16, 0.05, 0.02, SKIN, 0, 1.78, 0.121),             // occhi
        colored(new THREE.SphereGeometry(0.165, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), HELM, G.mat4(0, 1.8, 0, 0, 0, 0, 1, 0.85, 1.05)),
        B(0.34, 0.03, 0.36, HELM, 0, 1.8, 0),
        B(0.3, 0.35, 0.14, VEST, 0, 1.35, -0.2),               // zaino
      ]),
      leg: merge([
        B(0.17, 0.5, 0.19, UNI, 0, -0.25, 0),
        B(0.15, 0.42, 0.17, UNI, 0, -0.68, 0),
        B(0.16, 0.08, 0.28, DARK, 0, -0.9, 0.04),              // anfibio
        B(0.13, 0.1, 0.06, UNI2, 0.0, -0.45, 0.1),             // ginocchiera
      ]),
      arms: merge([
        // braccia in posizione di tiro + fucile
        B(0.13, 0.32, 0.14, UNI, 0.28, -0.12, 0.05, -0.6, 0, 0.1),
        B(0.12, 0.3, 0.12, UNI, 0.22, -0.3, 0.3, -1.4, 0, 0.3),
        B(0.1, 0.1, 0.1, DARK, 0.12, -0.33, 0.42),
        B(0.13, 0.32, 0.14, UNI, -0.28, -0.12, 0.08, -0.9, 0, -0.1),
        B(0.12, 0.3, 0.12, UNI, -0.18, -0.25, 0.42, -1.5, 0, -0.5),
        B(0.1, 0.1, 0.1, DARK, -0.04, -0.28, 0.58),
        B(0.06, 0.08, 0.75, GUN, 0.08, -0.24, 0.45),           // fucile
        B(0.05, 0.14, 0.06, GUN, 0.08, -0.34, 0.4, 0.2),        // caricatore
        B(0.05, 0.08, 0.22, GUN, 0.08, -0.26, 0.02),           // calcio
        B(0.03, 0.03, 0.2, GUN, 0.08, -0.22, 0.9),             // canna
      ]),
    };
    GEO.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  }

  /* ------------------------------------------------------------- nemico */
  let idc = 0;
  class Enemy {
    constructor(x, z, zone, opts = {}) {
      this.id = idc++;
      this.zone = zone;
      this.home = new V(x, 0, z);
      this.homeR = opts.homeR || 25;
      this.sniper = !!opts.sniper;
      this.root = new THREE.Group();
      const mk = (g) => { const m = new THREE.Mesh(g, GEO.mat); m.castShadow = true; return m; };
      this.upper = mk(GEO.upper);
      this.legL = new THREE.Group();
      this.legR = new THREE.Group();
      this.legL.add(mk(GEO.leg));
      this.legR.add(mk(GEO.leg));
      this.legL.position.set(0.11, 0.95, 0);
      this.legR.position.set(-0.11, 0.95, 0);
      this.armsG = new THREE.Group();
      this.armsG.add(mk(GEO.arms));
      this.armsG.position.set(0, 1.52, 0);
      this.torso = new THREE.Group();
      this.torso.add(this.upper, this.armsG);
      this.root.add(this.torso, this.legL, this.legR);
      G.scene.add(this.root);
      this.pos = new V(x, G.heightAt(x, z), z);
      if (opts.y !== undefined) this.pos.y = opts.y;
      this.vel = new V();
      this.yaw = Math.random() * 6.28;
      this.hp = this.sniper ? 90 : 100;
      this.dead = false;
      this.state = 'patrol';
      this.target = null;
      this.waitT = Math.random() * 3;
      this.percT = Math.random() * 0.3;
      this.reactT = 0;
      this.canSee = false;
      this.lastSeen = -99;
      this.lastKnown = new V();
      this.burst = 0;
      this.fireT = 0;
      this.strafeT = 0;
      this.strafe = 1;
      this.prefDist = this.sniper ? 80 : G.fr(14, 32);
      this.walkPhase = Math.random() * 6;
      this.crouch = 0;
      this.hitFlinch = 0;
      this.deathT = 0;
      this.stuckT = 0;
      this.lastPos = this.pos.clone();
      this.static = !!opts.static;
      this.onGround = true;
      this.sync();
    }
    sync() {
      this.root.position.copy(this.pos);
      this.root.rotation.y = this.yaw;
    }
    headPos(out = new V()) { return out.set(this.pos.x, this.pos.y + 1.74 - this.crouch * 0.5, this.pos.z); }
    eyePos(out = new V()) { return out.set(this.pos.x, this.pos.y + 1.7 - this.crouch * 0.5, this.pos.z); }

    damage(amount, head, dir, kind) {
      if (this.dead) return false;
      this.hp -= amount;
      this.hitFlinch = 1;
      // essere colpiti rivela la posizione del giocatore
      if (this.state !== 'combat') {
        this.state = 'combat';
        this.reactT = 0.25;
        this.lastKnown.copy(G.player.vehicle ? G.player.vehicle.pos : G.player.pos);
        this.lastSeen = G.time;
      }
      if (this.hp <= 0) {
        this.die(head, dir, kind);
        return true;
      }
      return false;
    }
    die(head, dir, kind) {
      this.dead = true;
      this.deathT = 0;
      const f = new V(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      this.fallDir = dir && f.dot(dir) > 0 ? 1 : -1;
      this.fallSide = G.fr(-0.4, 0.4);
      if (kind === 'explosion') { this.vel.copy(dir || new V()).multiplyScalar(6).setY(5); this.onGround = false; }
      else if (kind !== 'vehicle') this.vel.set(0, 0, 0);
      const P = G.player;
      P.kills++;
      let pts = 100;
      let tag = G.weapons.current().name;
      if (head) { P.headshots++; pts += 50; tag += '  ☠ COLPO ALLA TESTA'; }
      if (kind === 'melee') { pts += 50; tag = 'COLTELLO'; }
      if (kind === 'explosion') tag = 'ESPLOSIONE';
      if (kind === 'vehicle') { pts += 25; tag = 'INVESTITO'; }
      P.score += pts;
      G.hud.killfeed(tag, pts);
      G.audio.kill();
      G.missions.event('kill', { zone: this.zone });
      if (Math.random() < 0.5) spawnPickup(this.pos.clone());
      // allerta i compagni vicini
      for (const e of list) if (!e.dead && e !== this && e.pos.distanceTo(this.pos) < 35 && e.state !== 'combat') {
        e.state = 'search';
        e.lastKnown.copy(this.pos);
        e.target = this.pos.clone();
      }
    }

    update(dt, dist) {
      if (this.dead) return this.updateDead(dt);
      const P = G.player;
      const tgtPos = P.vehicle ? P.vehicle.pos.clone().setY(P.vehicle.pos.y + 1.2) : P.eyePos().setY(P.pos.y + P.eye * 0.85);
      // --- percezione (a intervalli)
      this.percT -= dt;
      if (this.percT <= 0) {
        this.percT = dist < 60 ? 0.2 : 0.45;
        this.canSee = false;
        if (!P.dead) {
          const fwd = new V(Math.sin(this.yaw), 0, Math.cos(this.yaw));
          const to = tgtPos.clone().sub(this.pos).setY(0);
          const d = to.length();
          const night = G.nightFactor;
          let range = (this.sniper ? 200 : 120) * G.lerp(1, 0.45, night);
          if (P.flashlight || (P.vehicle && P.vehicle.lightsOn)) range = Math.max(range, 150);
          if (P.crouch && !P.vehicle) range *= 0.7;
          const inFov = fwd.dot(to.normalize()) > 0.35 || d < 10 || this.state === 'combat';
          if (d < range && inFov) this.canSee = G.los(this.eyePos(), tgtPos);
        }
        if (this.canSee) {
          if (this.state !== 'combat') {
            this.state = 'combat';
            this.reactT = G.fr(0.5, 1.1) / Math.sqrt(G.diffMul());
            G.hud.spotted();
            for (const e of list) if (!e.dead && e !== this && e.pos.distanceTo(this.pos) < 40) {
              if (e.state !== 'combat') { e.state = 'search'; e.target = tgtPos.clone(); }
              e.lastKnown.copy(tgtPos);
            }
          }
          this.lastSeen = G.time;
          this.lastKnown.copy(tgtPos);
        }
      }
      this.reactT -= dt;

      // --- comportamento
      let moveDir = new V(), speed = 0, faceTarget = null;
      if (this.state === 'patrol') {
        this.crouch = G.damp(this.crouch, 0, 5, dt);
        if (this.static) { this.yaw += Math.sin(G.time * 0.3 + this.id) * dt * 0.3; }
        else if (this.waitT > 0) this.waitT -= dt;
        else {
          if (!this.target) {
            const a = Math.random() * 6.28, r = Math.random() * this.homeR;
            this.target = new V(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
          }
          const to = this.target.clone().sub(this.pos).setY(0);
          if (to.length() < 1.2) { this.target = null; this.waitT = G.fr(2, 6); }
          else { moveDir.copy(to.normalize()); speed = 1.5; faceTarget = this.target; }
        }
      } else if (this.state === 'search') {
        this.crouch = G.damp(this.crouch, 0, 5, dt);
        const tgt = this.target || this.lastKnown;
        const to = tgt.clone().sub(this.pos).setY(0);
        if (to.length() < 2 || G.time - this.lastSeen > 25) { this.state = 'patrol'; this.target = null; }
        else { moveDir.copy(to.normalize()); speed = 3.6; faceTarget = tgt; }
      } else if (this.state === 'combat') {
        const to = this.lastKnown.clone().sub(this.pos).setY(0);
        const d = to.length();
        faceTarget = this.lastKnown;
        if (!this.canSee && G.time - this.lastSeen > 7) {
          this.state = 'search';
          this.target = this.lastKnown.clone();
        } else if (!this.static) {
          const dirTo = to.normalize();
          const side = new V(dirTo.z, 0, -dirTo.x);
          this.strafeT -= dt;
          if (this.strafeT <= 0) { this.strafeT = G.fr(1.2, 3); this.strafe = Math.random() < 0.5 ? -1 : 1; if (Math.random() < 0.25) this.strafe = 0; }
          if (!this.canSee) { moveDir.copy(dirTo); speed = 3.8; }
          else if (d > this.prefDist + 6) { moveDir.copy(dirTo).addScaledVector(side, this.strafe * 0.4).normalize(); speed = 3.6; }
          else if (d < this.prefDist - 8) { moveDir.copy(dirTo).negate().addScaledVector(side, this.strafe * 0.5).normalize(); speed = 2.2; }
          else { moveDir.copy(side).multiplyScalar(this.strafe); speed = this.strafe ? 1.8 : 0; }
          // a volte si accovaccia mentre spara da fermo
          this.crouch = G.damp(this.crouch, speed === 0 && this.canSee ? 1 : 0, 5, dt);
        }
        // --- fuoco
        if (this.canSee && this.reactT <= 0 && !P.dead) {
          this.fireT -= dt;
          if (this.fireT <= 0) {
            if (this.burst <= 0) {
              this.burst = this.sniper ? 1 : G.rndi(3, 6);
              this.fireT = this.sniper ? G.fr(2.5, 4) : G.fr(0.5, 1.3);
            } else {
              this.shoot(tgtPos, d);
              this.burst--;
              this.fireT = this.sniper ? 0 : 0.11;
            }
          }
        }
      }
      // --- orientamento
      if (faceTarget) {
        const ty = Math.atan2(faceTarget.x - this.pos.x, faceTarget.z - this.pos.z);
        this.yaw = G.dampAngle(this.yaw, ty, this.state === 'combat' ? 8 : 4, dt);
      }
      // --- movimento
      const old = this.pos.clone();
      if (speed > 0) {
        const nx = this.pos.x + moveDir.x * speed * dt, nz = this.pos.z + moveDir.z * speed * dt;
        if (G.heightAt(nx, nz) > G.WATER - 0.3) {
          this.vel.x = moveDir.x * speed;
          this.vel.z = moveDir.z * speed;
        } else { this.vel.x = this.vel.z = 0; this.target = null; }
      } else { this.vel.x = 0; this.vel.z = 0; }
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      const ground = G.collide(this.pos, 0.35, 1.8, this.vel);
      G.vehicles.pushOut(this.pos, 0.35, this.vel);
      if (this.pos.y > ground + 0.05) { this.vel.y -= G.settings.gravity * dt; this.pos.y = Math.max(ground, this.pos.y + this.vel.y * dt); }
      else { this.pos.y = ground; this.vel.y = 0; }
      // bloccato contro un ostacolo → cambia direzione
      const moved = old.distanceTo(this.pos);
      if (speed > 0 && moved < speed * dt * 0.3) {
        this.stuckT += dt;
        if (this.stuckT > 0.6) { this.stuckT = 0; this.strafe = -this.strafe || 1; this.target = null; this.waitT = 0.3; }
      } else this.stuckT = 0;
      // --- animazione
      const hs = Math.hypot(this.vel.x, this.vel.z);
      if (dist < 120) {
        this.walkPhase += dt * hs * 2.6;
        const sw = Math.sin(this.walkPhase) * Math.min(0.75, hs * 0.22);
        this.legL.rotation.x = sw - this.crouch * 1.2;
        this.legR.rotation.x = -sw - this.crouch * 0.3;
        this.torso.position.y = -this.crouch * 0.45 + Math.abs(Math.cos(this.walkPhase)) * 0.03 * hs;
        this.legL.position.y = this.legR.position.y = 0.95 - this.crouch * 0.42;
        this.hitFlinch = G.damp(this.hitFlinch, 0, 8, dt);
        this.torso.rotation.x = this.hitFlinch * -0.3 + (hs > 3 ? 0.15 : 0);
        this.armsG.rotation.x = this.state === 'combat' ? 0 : 0.5;
        this.armsG.rotation.y = this.state === 'combat' ? 0 : -0.5;
        if (this.state === 'combat') {
          // punta l'arma verso l'alto/basso in base al bersaglio
          const dy = tgtPos.y - (this.pos.y + 1.4);
          const dd = Math.hypot(tgtPos.x - this.pos.x, tgtPos.z - this.pos.z);
          this.armsG.rotation.x = -Math.atan2(dy, dd);
        }
      }
      this.root.visible = dist < 420;
      this.sync();
    }

    shoot(tgt, dist) {
      const P = G.player;
      const muzzle = this.root.localToWorld(new V(0.08, 1.28 - this.crouch * 0.45, 1.05));
      this.lastShot = G.time;
      G.audio.shot('enemy', muzzle);
      G.fx.particle(true, { pos: muzzle, life: 0.05, size: 0.5, color: [1, 0.7, 0.3] });
      G.fx.muzzleLight(muzzle);
      // probabilità di colpire
      const accMul = { facile: 0.45, normale: 0.75, veterano: 1.05 }[G.settings.difficulty] || 0.75;
      let acc = G.clamp(0.62 - dist * 0.0055, 0.08, 0.62) * accMul;
      if (this.sniper) acc = G.clamp(0.8 - dist * 0.002, 0.3, 0.8) * accMul;
      const pv = P.vehicle ? P.vehicle.vel : P.vel;
      const ps = Math.hypot(pv.x, pv.z);
      acc *= G.clamp(1 - ps * 0.045, 0.45, 1);
      if (P.crouch && !P.vehicle) acc *= 0.8;
      if (P.slide > 0) acc *= 0.4;
      acc *= G.clamp((G.time - this.lastSeen + 1.2) * 0.8, 0.3, 1); // i primi colpi sono meno precisi
      const hit = Math.random() < acc;
      let aim = tgt.clone();
      if (!hit) aim.add(new V(G.fr(-1, 1), G.fr(-0.8, 1.2), G.fr(-1, 1)).normalize().multiplyScalar(G.fr(0.9, 2.5)));
      const dir = aim.clone().sub(muzzle).normalize();
      const range = muzzle.distanceTo(aim) + 30;
      if (hit) {
        // controllo ostacoli (il giocatore potrebbe essere dietro copertura)
        const wh = G.raycastWorld(muzzle, dir, muzzle.distanceTo(tgt) - 0.6);
        if (wh) {
          G.fx.impact(wh.point, wh.normal, wh.terrain ? 'terrain' : wh.col ? wh.col.mat : 'concrete');
          G.fx.tracer(muzzle, wh.point, 600);
          return;
        }
        G.fx.tracer(muzzle, tgt, 600);
        if (P.vehicle) {
          P.vehicle.damage(this.sniper ? 25 : 6);
          P.damage(this.sniper ? 20 : 4, this.pos, 'Nemico');
        } else P.damage(this.sniper ? 45 : G.fr(9, 14), this.pos, 'Nemico');
      } else {
        const h = G.weapons.trace(muzzle, dir, range, null);
        const end = h ? h.point : muzzle.clone().addScaledVector(dir, range);
        G.fx.tracer(muzzle, end, 600);
        if (h && h.kind !== 'enemy') G.fx.impact(h.point, h.normal, h.kind === 'terrain' ? 'terrain' : h.kind === 'vehicle' ? 'vehicle' : h.col ? h.col.mat : 'concrete');
        if (h && h.kind === 'vehicle' && h.vehicle === P.vehicle) P.vehicle.damage(3);
        // proiettile che sibila vicino
        const cp = G.camera.position;
        const t = G.clamp(cp.clone().sub(muzzle).dot(dir), 0, range);
        const closest = muzzle.clone().addScaledVector(dir, t);
        if (closest.distanceTo(cp) < 3.5) G.audio.whiz(closest);
      }
    }

    updateDead(dt) {
      this.deathT += dt;
      if (!this.onGround || this.vel.lengthSq() > 0.01) {
        this.vel.y -= G.settings.gravity * dt;
        this.pos.addScaledVector(this.vel, dt);
        const gy = G.collide(this.pos, 0.3, 0.5, this.vel);
        if (this.pos.y <= gy) { this.pos.y = gy; this.vel.multiplyScalar(0.5); this.vel.y = 0; this.onGround = true; if (this.vel.lengthSq() < 0.3) this.vel.set(0, 0, 0); }
      }
      const t = G.clamp(this.deathT / 0.55, 0, 1);
      const e = t * t;
      this.root.position.copy(this.pos);
      this.root.rotation.set((this.fallDir * Math.PI) / 2 * e, this.yaw, this.fallSide * e, 'YXZ');
      this.legL.rotation.x = G.lerp(this.legL.rotation.x, 0.3, t);
      this.legR.rotation.x = G.lerp(this.legR.rotation.x, -0.2, t);
      this.armsG.rotation.x = G.lerp(this.armsG.rotation.x, 1.2, t);
      if (this.deathT > 25) this.root.position.y -= (this.deathT - 25) * 0.3;
      if (this.deathT > 28) { G.scene.remove(this.root); this.removed = true; }
    }

    // test del raggio: testa (sfera) e corpo (cilindro)
    rayTest(o, d, maxT) {
      const h = this.headPos();
      let best = null;
      // sfera testa
      const oc = new V().subVectors(o, h);
      const b = oc.dot(d), c = oc.lengthSq() - 0.17 * 0.17;
      const disc = b * b - c;
      if (disc > 0) {
        const t = -b - Math.sqrt(disc);
        if (t > 0 && t < maxT) best = { t, head: true };
      }
      // cilindro corpo
      const ox = o.x - this.pos.x, oz = o.z - this.pos.z;
      const a2 = d.x * d.x + d.z * d.z;
      if (a2 > 1e-9) {
        const b2 = 2 * (ox * d.x + oz * d.z), c2 = ox * ox + oz * oz - 0.3 * 0.3;
        const disc2 = b2 * b2 - 4 * a2 * c2;
        if (disc2 > 0) {
          const t = (-b2 - Math.sqrt(disc2)) / (2 * a2);
          const y = o.y + d.y * t - this.pos.y;
          const top = 1.58 - this.crouch * 0.5;
          if (t > 0 && t < (best ? best.t : maxT) && y > 0.05 && y < top) best = { t, head: false };
        }
      }
      return best;
    }
  }

  /* ------------------------------------------------------ munizioni a terra */
  const pickGeo = new THREE.BoxGeometry(0.45, 0.25, 0.3);
  function spawnPickup(pos) {
    const m = new THREE.Mesh(pickGeo, G.M.ammo);
    m.position.copy(pos);
    m.castShadow = true;
    G.scene.add(m);
    pickups.push({ m, t: 0, pos: pos.clone() });
  }

  /* ------------------------------------------------------ zone e spawn */
  const ZONES = {};
  function randomCityPoint() {
    const v = G.pick([-200, -100, 0, 100, 200]);
    const t = G.fr(-190, 190);
    const off = G.fr(-5, 5);
    return Math.random() < 0.5 ? [v + off, t] : [t, v + off];
  }
  function spawnIn(zoneKey) {
    const Z = ZONES[zoneKey];
    let x, z, opts = { homeR: Z.homeR };
    if (zoneKey === 'city') { [x, z] = randomCityPoint(); opts.homeR = 30; }
    else if (zoneKey === 'tower') { x = Z.x + G.fr(-10, 10); z = Z.z + G.fr(-10, 10); opts.sniper = Math.random() < 0.6; }
    else if (zoneKey.startsWith('rb')) { x = Z.x + G.fr(-8, 8); z = Z.z + G.fr(-8, 8); opts.homeR = 10; }
    else { const a = Math.random() * 6.28, r = Math.random() * Z.r * 0.8; x = Z.x + Math.cos(a) * r; z = Z.z + Math.sin(a) * r; }
    // evita di comparire dentro agli edifici
    const p = new V(x, G.heightAt(x, z), z);
    for (let k = 0; k < 4; k++) G.collide(p, 0.6, 1.8, null);
    const e = new Enemy(p.x, p.z, zoneKey, opts);
    list.push(e);
    return e;
  }

  function init() {
    buildGeos();
    const Zs = G.zones;
    ZONES.city = { x: 0, z: 0, r: 200, count: 18, homeR: 30 };
    ZONES.base = { x: Zs.base.x, z: Zs.base.z, r: 75, count: 16, homeR: 25 };
    ZONES.village = { x: Zs.village.x, z: Zs.village.z, r: 70, count: 10, homeR: 25 };
    ZONES.tower = { x: Zs.tower.x, z: Zs.tower.z, r: 15, count: 4, homeR: 10 };
    G.roadblocks.forEach((p, i) => { ZONES['rb' + i] = { x: p.x, z: p.z, r: 10, count: 3, homeR: 10 }; });
    for (const k in ZONES) for (let i = 0; i < ZONES[k].count; i++) spawnIn(k);
    // cecchini sulle torri di guardia della base
    for (const t of G.towers) {
      const e = new Enemy(t.x, t.z, 'base', { static: true, sniper: false, y: t.y });
      e.pos.y = t.y;
      list.push(e);
    }
  }

  let respawnT = 20;
  function update(dt) {
    const P = G.player;
    const pp = P.vehicle ? P.vehicle.pos : P.pos;
    for (const e of list) {
      const d = e.pos.distanceTo(pp);
      // aggiornamento ridotto per i nemici lontani e tranquilli
      if (!e.dead && d > 260 && e.state === 'patrol') {
        e.lodT = (e.lodT || 0) + dt;
        if (e.lodT < 0.5) continue;
        e.update(e.lodT, d);
        e.lodT = 0;
        continue;
      }
      e.update(dt, d);
    }
    for (let i = list.length - 1; i >= 0; i--) if (list[i].removed) list.splice(i, 1);
    // munizioni a terra
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      p.t += dt;
      p.m.rotation.y += dt * 1.5;
      p.m.position.y = G.heightAt(p.pos.x, p.pos.z) + 0.35 + Math.sin(p.t * 3) * 0.08;
      if (!P.vehicle && !P.dead && P.pos.distanceTo(p.m.position) < 1.8) {
        G.weapons.addAmmoCurrent(1);
        if (Math.random() < 0.3 && G.weapons.grenades < G.weapons.maxGrenades) G.weapons.grenades++;
        G.audio.pickup();
        G.hud.notify('+ Munizioni raccolte');
        G.scene.remove(p.m);
        pickups.splice(i, 1);
      } else if (p.t > 60) { G.scene.remove(p.m); pickups.splice(i, 1); }
    }
    // respawn lento nelle zone lontane dal giocatore
    respawnT -= dt;
    if (respawnT <= 0) {
      respawnT = 12;
      for (const k in ZONES) {
        const Z = ZONES[k];
        const alive = list.filter((e) => !e.dead && e.zone === k).length;
        const dz = Math.hypot(pp.x - Z.x, pp.z - Z.z);
        if (alive < Z.count && dz > Z.r + 140 && !(G.missions.cleared(k))) { spawnIn(k); break; }
      }
    }
  }

  // un rumore (sparo, esplosione, clacson) attira i nemici vicini
  function noise(pos, radius) {
    for (const e of list) {
      if (e.dead || e.state === 'combat') continue;
      if (e.pos.distanceTo(pos) < radius) {
        e.state = 'search';
        e.target = pos.clone().add(new V(G.fr(-6, 6), 0, G.fr(-6, 6)));
        e.lastKnown.copy(pos);
        e.lastSeen = G.time;
      }
    }
  }

  function rayTest(o, d, maxT) {
    let best = null;
    for (const e of list) {
      if (e.dead || !e.root.visible) continue;
      // scarto veloce: distanza del centro dal raggio
      const dx = e.pos.x - o.x, dz = e.pos.z - o.z;
      const t = dx * d.x + dz * d.z;
      if (t < -1 || t > (best ? best.t : maxT) + 1) continue;
      const r = e.rayTest(o, d, best ? best.t : maxT);
      if (r) best = { t: r.t, head: r.head, enemy: e };
    }
    return best;
  }

  return {
    init, update, noise, rayTest, list, pickups, ZONES,
    aliveIn: (k) => list.filter((e) => !e.dead && e.zone === k).length,
  };
})();
