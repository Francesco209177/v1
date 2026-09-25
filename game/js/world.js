'use strict';
/* =========================================================================
   MONDO: terreno, strade, città, base militare, villaggio, vegetazione,
   cielo, ciclo giorno/notte, sistema di collisioni e raycast statico.
   ========================================================================= */
(function () {
  const HALF = G.HALF;
  const CITY = 222;
  const SEG = 240;                    // suddivisioni del terreno
  const CELL = (HALF * 2) / SEG;      // 5 m
  const V = THREE.Vector3;

  /* ================================================================ STRADE */
  G.roads = [];
  const addRoad = (x1, z1, x2, z2, w, kind) => G.roads.push({ x1, z1, x2, z2, w, kind });
  // autostrade principali (attraversano tutta la mappa)
  addRoad(0, -590, 0, 590, 14, 'v');
  addRoad(-590, 0, 590, 0, 14, 'h');
  // griglia urbana
  for (const v of [-200, -100, 100, 200]) {
    addRoad(v, -206, v, 206, 12, 'v');
    addRoad(-206, v, 206, v, 12, 'h');
  }
  addRoad(400, 0, 400, -335, 10, 'v');   // verso la base militare
  addRoad(-400, 0, -400, 475, 10, 'v');  // verso il villaggio
  addRoad(-400, 250, -206, 250, 8, 'h'); // strada di campagna

  function segDist(px, pz, r) {
    const dx = r.x2 - r.x1, dz = r.z2 - r.z1;
    const l2 = dx * dx + dz * dz;
    let t = ((px - r.x1) * dx + (pz - r.z1) * dz) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = r.x1 + dx * t - px, qz = r.z1 + dz * t - pz;
    return Math.sqrt(qx * qx + qz * qz);
  }
  // distanza dal bordo della strada più vicina (negativa = sopra la strada)
  G.roadDist = (x, z) => {
    let best = 1e9;
    for (const r of G.roads) {
      const d = segDist(x, z, r) - r.w / 2;
      if (d < best) best = d;
    }
    return best;
  };

  /* ===================================================== ZONE PIANEGGIANTI */
  G.zones = {
    city: { x: 0, z: 0, r: 215, name: 'Città di Vostok' },
    base: { x: 400, z: -400, r: 95, name: 'Base Militare Nemica' },
    village: { x: -400, z: 400, r: 85, name: 'Villaggio di Krasnaya' },
    outpost: { x: 38, z: 440, r: 32, name: 'Avamposto Alleato' },
  };
  const FLAT = [
    { x: 400, z: -400, r: 112 },
    { x: -400, z: 400, r: 95 },
    { x: 38, z: 440, r: 38 },
    { x: -40, z: 330, r: 22 }, // stazione di servizio
  ];

  function heightFn(x, z) {
    const low = G.fbm(x * 0.0035 + 3.3, z * 0.0035 - 7.1, 3) * 9;
    let n = G.fbm(x * 0.0021 + 37.1, z * 0.0021 - 12.7, 5);
    n = Math.max(0, n + 0.12);
    let hills = Math.pow(n, 1.5) * 110;
    const e = Math.max(Math.abs(x), Math.abs(z));
    hills += G.smooth(440, 600, e) * (55 + 25 * G.noise2(x * 0.012, z * 0.012));
    const rd = G.roadDist(x, z);
    const cityD = Math.max(Math.abs(x), Math.abs(z)) - CITY;
    let m = G.smooth(5, 50, rd);
    let flat = G.smooth(-5, 45, cityD);
    for (const zn of FLAT) {
      const d = Math.hypot(x - zn.x, z - zn.z) - zn.r;
      m = Math.min(m, G.smooth(0, 50, d));
      flat = Math.min(flat, G.smooth(-5, 40, d));
    }
    m = Math.min(m, flat);
    const lowV = G.lerp(Math.max(low, -2.2), low, G.smooth(5, 30, rd));
    return lowV * flat + hills * m;
  }

  /* ======================================================== GRIGLIA ALTEZZE */
  const N1 = SEG + 1;
  const H = new Float32Array(N1 * N1);
  const RD = new Float32Array(N1 * N1);
  G.buildHeights = () => {
    for (let iz = 0; iz < N1; iz++) {
      for (let ix = 0; ix < N1; ix++) {
        const x = -HALF + ix * CELL, z = -HALF + iz * CELL;
        H[iz * N1 + ix] = heightFn(x, z);
        RD[iz * N1 + ix] = G.roadDist(x, z);
      }
    }
  };
  // altezza esatta del triangolo del mesh (stessa triangolazione di PlaneGeometry)
  G.heightAt = (x, z) => {
    let fx = (x + HALF) / CELL, fz = (z + HALF) / CELL;
    fx = G.clamp(fx, 0, SEG - 0.0001);
    fz = G.clamp(fz, 0, SEG - 0.0001);
    const ix = Math.floor(fx), iz = Math.floor(fz);
    const u = fx - ix, v = fz - iz;
    const h00 = H[iz * N1 + ix], h10 = H[iz * N1 + ix + 1];
    const h01 = H[(iz + 1) * N1 + ix], h11 = H[(iz + 1) * N1 + ix + 1];
    if (u + v <= 1) return h00 + (h10 - h00) * u + (h01 - h00) * v;
    return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
  };
  G.normalAt = (x, z, out = new V()) => {
    const e = 1.0;
    const hl = G.heightAt(x - e, z), hr = G.heightAt(x + e, z);
    const hd = G.heightAt(x, z - e), hu = G.heightAt(x, z + e);
    return out.set(hl - hr, 2 * e, hd - hu).normalize();
  };
  G.roadDistFast = (x, z) => {
    const ix = G.clamp(Math.round((x + HALF) / CELL), 0, SEG), iz = G.clamp(Math.round((z + HALF) / CELL), 0, SEG);
    return RD[iz * N1 + ix];
  };
  G.inCity = (x, z) => Math.abs(x) < CITY + 8 && Math.abs(z) < CITY + 8;
  G.surfaceAt = (x, z) => {
    if (G.heightAt(x, z) < G.WATER - 0.3) return 'water';
    if (G.inCity(x, z) || G.roadDist(x, z) < 0) return 'road';
    const b = G.zones.base;
    if (Math.abs(x - b.x) < 80 && Math.abs(z - b.z) < 80) return 'dirt';
    return 'grass';
  };

  /* ============================================================ COLLISIONI */
  const GC = 16, GOFF = 64;
  const grid = new Map();
  let stamp = 1;
  G.colliders = [];
  const key = (ix, iz) => (ix + GOFF) * 1000 + (iz + GOFF);
  function insert(c, minX, minZ, maxX, maxZ) {
    const x0 = Math.floor(minX / GC), x1 = Math.floor(maxX / GC);
    const z0 = Math.floor(minZ / GC), z1 = Math.floor(maxZ / GC);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const k = key(ix, iz);
        let a = grid.get(k);
        if (!a) grid.set(k, (a = []));
        a.push(c);
      }
    }
    G.colliders.push(c);
  }
  // box allineato agli assi; mat = tipo di superficie per effetti d'impatto
  G.addBox = (cx, y0, cz, w, h, d, mat = 'concrete', ref = null) => {
    const c = { minX: cx - w / 2, maxX: cx + w / 2, minY: y0, maxY: y0 + h, minZ: cz - d / 2, maxZ: cz + d / 2, mat, ref, s: 0 };
    insert(c, c.minX, c.minZ, c.maxX, c.maxZ);
    return c;
  };
  G.addCyl = (x, z, r, y0, h, mat = 'wood', ref = null) => {
    const c = { cyl: true, x, z, r, minY: y0, maxY: y0 + h, mat, ref, s: 0 };
    insert(c, x - r, z - r, x + r, z + r);
    return c;
  };
  G.queryXZ = (minX, minZ, maxX, maxZ, cb) => {
    stamp++;
    const x0 = Math.floor(minX / GC), x1 = Math.floor(maxX / GC);
    const z0 = Math.floor(minZ / GC), z1 = Math.floor(maxZ / GC);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const a = grid.get(key(ix, iz));
        if (!a) continue;
        for (let i = 0; i < a.length; i++) {
          const c = a[i];
          if (c.s === stamp || c.dead) continue;
          c.s = stamp;
          cb(c);
        }
      }
    }
  };

  /* Risolve un cilindro verticale (giocatore, nemici) contro il mondo statico.
     pos = piedi. Ritorna l'altezza del "pavimento" sotto il cilindro. */
  const STEP = 0.55;
  G.collide = (pos, r, h, vel) => {
    let ground = G.heightAt(pos.x, pos.z);
    G.queryXZ(pos.x - r - 1, pos.z - r - 1, pos.x + r + 1, pos.z + r + 1, (c) => {
      if (c.cyl) {
        if (pos.y > c.maxY - STEP || pos.y + h < c.minY) {
          if (pos.y >= c.maxY - STEP) {
            const dx = pos.x - c.x, dz = pos.z - c.z;
            if (dx * dx + dz * dz < c.r * c.r) ground = Math.max(ground, c.maxY);
          }
          return;
        }
        const dx = pos.x - c.x, dz = pos.z - c.z;
        const d2 = dx * dx + dz * dz, rr = r + c.r;
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = rr - d;
          const nx = dx / d, nz = dz / d;
          pos.x += nx * push;
          pos.z += nz * push;
          if (vel) {
            const vn = vel.x * nx + vel.z * nz;
            if (vn < 0) { vel.x -= nx * vn; vel.z -= nz * vn; }
          }
        }
        return;
      }
      if (pos.x + r <= c.minX || pos.x - r >= c.maxX || pos.z + r <= c.minZ || pos.z - r >= c.maxZ) return;
      if (pos.y >= c.maxY - STEP) {
        // si può salire/camminare sopra: solo se il centro è sopra (con piccolo margine)
        if (pos.x > c.minX - r * 0.5 && pos.x < c.maxX + r * 0.5 && pos.z > c.minZ - r * 0.5 && pos.z < c.maxZ + r * 0.5)
          ground = Math.max(ground, c.maxY);
        return;
      }
      if (pos.y + h <= c.minY) {
        // sotto il box: soffitto
        if (vel && vel.y > 0 && pos.y + h + vel.y * 0.02 > c.minY) vel.y = 0;
        return;
      }
      const px1 = pos.x + r - c.minX, px2 = c.maxX - (pos.x - r);
      const pz1 = pos.z + r - c.minZ, pz2 = c.maxZ - (pos.z - r);
      const m = Math.min(px1, px2, pz1, pz2);
      if (m === px1) { pos.x -= px1; if (vel && vel.x > 0) vel.x = 0; }
      else if (m === px2) { pos.x += px2; if (vel && vel.x < 0) vel.x = 0; }
      else if (m === pz1) { pos.z -= pz1; if (vel && vel.z > 0) vel.z = 0; }
      else { pos.z += pz2; if (vel && vel.z < 0) vel.z = 0; }
    });
    return ground;
  };

  /* --------------------------------------------------------- RAYCAST */
  function rayBox(o, d, c, maxT, out) {
    let tmin = 0, tmax = maxT, axis = -1, sign = 0;
    const mins = [c.minX, c.minY, c.minZ], maxs = [c.maxX, c.maxY, c.maxZ];
    const os = [o.x, o.y, o.z], ds = [d.x, d.y, d.z];
    for (let a = 0; a < 3; a++) {
      if (Math.abs(ds[a]) < 1e-9) {
        if (os[a] < mins[a] || os[a] > maxs[a]) return false;
      } else {
        const inv = 1 / ds[a];
        let t1 = (mins[a] - os[a]) * inv, t2 = (maxs[a] - os[a]) * inv;
        let s = -1;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
        if (t1 > tmin) { tmin = t1; axis = a; sign = s; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return false;
      }
    }
    if (axis < 0) return false; // origine dentro al box
    out.t = tmin;
    out.normal.set(0, 0, 0).setComponent(axis, sign);
    return true;
  }
  function rayCyl(o, d, c, maxT, out) {
    const ox = o.x - c.x, oz = o.z - c.z;
    const a = d.x * d.x + d.z * d.z;
    if (a < 1e-9) return false;
    const b = 2 * (ox * d.x + oz * d.z), cc = ox * ox + oz * oz - c.r * c.r;
    const disc = b * b - 4 * a * cc;
    if (disc < 0) return false;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    if (t < 0 || t > maxT) return false;
    const y = o.y + d.y * t;
    if (y < c.minY || y > c.maxY) return false;
    out.t = t;
    out.normal.set(ox + d.x * t, 0, oz + d.z * t).normalize();
    return true;
  }
  const tmpHit = { t: 0, normal: new V() };
  // raycast contro i collider statici tramite DDA sulla griglia spaziale
  G.raycastStatic = (o, d, maxT) => {
    let best = null;
    stamp++;
    const dx = d.x, dz = d.z;
    let ix = Math.floor(o.x / GC), iz = Math.floor(o.z / GC);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tdx = Math.abs(dx) > 1e-9 ? Math.abs(GC / dx) : 1e9;
    const tdz = Math.abs(dz) > 1e-9 ? Math.abs(GC / dz) : 1e9;
    let tmx = Math.abs(dx) > 1e-9 ? ((dx > 0 ? (ix + 1) * GC - o.x : o.x - ix * GC) / Math.abs(dx)) : 1e9;
    let tmz = Math.abs(dz) > 1e-9 ? ((dz > 0 ? (iz + 1) * GC - o.z : o.z - iz * GC) / Math.abs(dz)) : 1e9;
    let tCell = 0;
    for (let n = 0; n < 200; n++) {
      const a = grid.get(key(ix, iz));
      if (a) {
        for (let i = 0; i < a.length; i++) {
          const c = a[i];
          if (c.s === stamp || c.dead) continue;
          c.s = stamp;
          const lim = best ? best.t : maxT;
          if (c.cyl ? rayCyl(o, d, c, lim, tmpHit) : rayBox(o, d, c, lim, tmpHit)) {
            best = { t: tmpHit.t, normal: tmpHit.normal.clone(), col: c };
          }
        }
      }
      if (best && best.t < tCell) break;
      if (tmx < tmz) { tCell = tmx; tmx += tdx; ix += stepX; }
      else { tCell = tmz; tmz += tdz; iz += stepZ; }
      if (tCell > maxT) break;
    }
    return best;
  };
  G.raycastTerrain = (o, d, maxT) => {
    const step = 1.5;
    let prevT = 0;
    for (let t = 0; t <= maxT; t += step) {
      const x = o.x + d.x * t, z = o.z + d.z * t, y = o.y + d.y * t;
      if (Math.abs(x) > HALF || Math.abs(z) > HALF) return null;
      if (y < G.heightAt(x, z)) {
        let lo = prevT, hi = t;
        for (let k = 0; k < 8; k++) {
          const m = (lo + hi) / 2;
          if (o.y + d.y * m < G.heightAt(o.x + d.x * m, o.z + d.z * m)) hi = m;
          else lo = m;
        }
        const px = o.x + d.x * hi, pz = o.z + d.z * hi;
        return { t: hi, normal: G.normalAt(px, pz), terrain: true };
      }
      prevT = t;
    }
    return null;
  };
  // raycast completo del mondo statico: terreno + oggetti + acqua
  G.raycastWorld = (o, d, maxT) => {
    let hit = G.raycastStatic(o, d, maxT);
    const th = G.raycastTerrain(o, d, hit ? hit.t : maxT);
    if (th && (!hit || th.t < hit.t)) hit = th;
    if (d.y < -1e-4 && o.y > G.WATER) {
      const tw = (G.WATER - o.y) / d.y;
      if (tw > 0 && tw < (hit ? hit.t : maxT)) {
        const x = o.x + d.x * tw, z = o.z + d.z * tw;
        if (G.heightAt(x, z) < G.WATER) hit = { t: tw, normal: new V(0, 1, 0), water: true };
      }
    }
    if (hit) hit.point = new V(o.x + d.x * hit.t, o.y + d.y * hit.t, o.z + d.z * hit.t);
    return hit;
  };
  // linea di vista libera tra due punti
  G.los = (a, b) => {
    const d = new V().subVectors(b, a);
    const len = d.length();
    d.divideScalar(len);
    if (G.raycastStatic(a, d, len - 0.3)) return false;
    // controllo terreno a campioni radi (più economico)
    const n = Math.ceil(len / 4);
    for (let i = 1; i < n; i++) {
      const t = (i / n) * len;
      if (a.y + d.y * t < G.heightAt(a.x + d.x * t, a.z + d.z * t) + 0.1) return false;
    }
    return true;
  };

  /* ============================================================= MATERIALI */
  const M = {};
  function makeMaterials() {
    M.terrain = new THREE.MeshStandardMaterial({ vertexColors: true, map: G.tex.ground, roughness: 0.96 });
    const off = (f, u) => ({ polygonOffset: true, polygonOffsetFactor: f, polygonOffsetUnits: u });
    M.roadV = new THREE.MeshStandardMaterial(Object.assign({ map: G.tex.road, roughness: 0.9 }, off(-2, -4)));
    M.roadH = new THREE.MeshStandardMaterial(Object.assign({ map: G.tex.road, roughness: 0.9 }, off(-3, -6)));
    M.cityGround = new THREE.MeshStandardMaterial(Object.assign({ map: G.tex.concrete, color: 0x9a968c, roughness: 0.95 }, off(-1, -2)));
    M.grassPatch = new THREE.MeshStandardMaterial(Object.assign({ map: G.tex.ground, color: 0x5d6b35, roughness: 1 }, off(-1.5, -3)));
    M.dirtPatch = new THREE.MeshStandardMaterial(Object.assign({ map: G.tex.ground, color: 0x8a7658, roughness: 1 }, off(-1, -2)));
    M.facades = G.tex.facades.map((f) => new THREE.MeshStandardMaterial({
      map: f.map, emissiveMap: f.emissive, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.88,
    }));
    M.roof = new THREE.MeshStandardMaterial({ map: G.tex.roof, roughness: 1 });
    M.concrete = new THREE.MeshStandardMaterial({ map: G.tex.concrete, color: 0xb0aca2, roughness: 0.95 });
    M.darkConcrete = new THREE.MeshStandardMaterial({ map: G.tex.concrete, color: 0x6a6660, roughness: 1 });
    M.metal = new THREE.MeshStandardMaterial({ map: G.tex.metal, color: 0x7d8078, roughness: 0.6, metalness: 0.5 });
    M.metalDark = G.std(0x2c2e2c, 0.5, 0.7);
    M.crate = new THREE.MeshStandardMaterial({ map: G.tex.crate, roughness: 0.9 });
    M.ammo = new THREE.MeshStandardMaterial({ map: G.tex.ammo, roughness: 0.7, emissive: 0x222200, emissiveIntensity: 0.4 });
    M.sandbag = new THREE.MeshStandardMaterial({ map: G.tex.sandbag, roughness: 1 });
    M.plaster = new THREE.MeshStandardMaterial({ map: G.tex.plaster, roughness: 0.95 });
    M.tiles = new THREE.MeshStandardMaterial({ map: G.tex.tiles, roughness: 0.85, side: THREE.DoubleSide });
    M.bark = new THREE.MeshStandardMaterial({ map: G.tex.bark, roughness: 1 });
    M.foliage = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
    M.rock = new THREE.MeshStandardMaterial({ color: 0xffffff, map: G.tex.concrete, roughness: 1, flatShading: true });
    M.wreck = G.std(0x1d1a17, 0.9, 0.3);
    M.rust = new THREE.MeshStandardMaterial({ map: G.tex.metal, color: 0x6b4a33, roughness: 0.9, metalness: 0.3 });
    M.fence = new THREE.MeshStandardMaterial({ map: G.tex.fence, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.6 });
    M.lampGlow = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffd9a0, emissiveIntensity: 0 });
    M.redLight = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2020, emissiveIntensity: 2 });
    M.glass = G.std(0x223038, 0.1, 0.8);
    M.door = G.std(0x1a1816, 0.6, 0.4);
    M.hay = G.std(0xb39a55, 1);
    M.wood = G.std(0x6b5238, 0.9);
    M.tent = G.std(0x5a5c3c, 1, 0, { side: THREE.DoubleSide });
    M.barrelRed = G.std(0x8b1a14, 0.55, 0.4);
    M.fuel = new THREE.MeshStandardMaterial({ map: G.tex.metal, color: 0xb9b4a4, roughness: 0.5, metalness: 0.5 });
    M.water = new THREE.MeshStandardMaterial({ color: 0x1b2e33, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.88 });
    M.jersey = new THREE.MeshStandardMaterial({ map: G.tex.concrete, color: 0xcfcac0, roughness: 0.95 });
    M.helipad = new THREE.MeshStandardMaterial({ map: G.tex.helipad, transparent: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8, depthWrite: false });
    G.M = M;
  }

  /* ================================================================ HELPER */
  let root;
  function add(obj, cast = true, recv = true) {
    obj.castShadow = cast;
    obj.receiveShadow = recv;
    root.add(obj);
    return obj;
  }
  function mesh(geo, mat, x, y, z, ry = 0, cast = true, recv = true) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    return add(m, cast, recv);
  }
  // box con collider; rot90 = ruotato di 90° (scambia w/d per il collider)
  function solidBox(x, y0, z, w, h, d, mat, colMat = 'concrete', rot90 = false, tile = 4) {
    const m = mesh(G.boxGeo(w, h, d, tile, tile, tile), mat, x, y0 + h / 2, z, rot90 ? Math.PI / 2 : 0);
    if (rot90) G.addBox(x, y0, z, d, h, w, colMat);
    else G.addBox(x, y0, z, w, h, d, colMat);
    return m;
  }
  G.mapShapes = { rects: [], circles: [], labels: [] };
  const mapRect = (x, z, w, d, color) => G.mapShapes.rects.push({ x, z, w, d, color });

  /* ================================================================ TERRENO */
  function buildTerrain() {
    const geo = new THREE.PlaneGeometry(HALF * 2, HALF * 2, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const ix = Math.round((pos.getX(i) + HALF) / CELL), iz = Math.round((pos.getZ(i) + HALF) / CELL);
      pos.setY(i, H[iz * N1 + ix]);
    }
    geo.computeVertexNormals();
    const nor = geo.attributes.normal;
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 180, uv.getY(i) * 180);
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const cGrass = new THREE.Color(0x4d5a2c), cDry = new THREE.Color(0x7a7148), cDirt = new THREE.Color(0x6e5c43),
      cRock = new THREE.Color(0x6d6a63), cSand = new THREE.Color(0x6b6048), cForest = new THREE.Color(0x3b4724);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const ix = Math.round((x + HALF) / CELL), iz = Math.round((z + HALF) / CELL);
      const rd = RD[iz * N1 + ix];
      const n1 = G.fbm(x * 0.01, z * 0.01, 3);
      c.copy(cGrass).lerp(cDry, G.smooth(-0.3, 0.4, n1));
      c.lerp(cForest, G.smooth(0.05, 0.35, G.fbm(x * 0.006 + 9, z * 0.006 + 4, 3)) * 0.7);
      c.lerp(cDirt, G.smooth(14, 2, rd) * 0.85);
      const ny = nor.getY(i);
      c.lerp(cRock, G.smooth(0.9, 0.72, ny));
      c.lerp(cRock, G.smooth(45, 75, y) * 0.6);
      c.lerp(cSand, G.smooth(G.WATER + 1.2, G.WATER + 0.2, y));
      for (const zn of FLAT) {
        const d = Math.hypot(x - zn.x, z - zn.z);
        c.lerp(cDirt, G.smooth(zn.r + 10, zn.r - 20, d) * 0.7);
      }
      const v = 0.92 + G.noise2(x * 0.08, z * 0.08) * 0.1;
      c.multiplyScalar(v);
      c.convertSRGBToLinear();
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(geo, M.terrain);
    m.receiveShadow = true;
    m.castShadow = false;
    G.scene.add(m);
    G.terrainMesh = m;

    // acqua
    const w = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2.4, HALF * 2.4), M.water);
    w.rotation.x = -Math.PI / 2;
    w.position.y = G.WATER;
    w.receiveShadow = true;
    G.scene.add(w);
    G.waterMesh = w;
  }

  function buildRoads() {
    for (const r of G.roads) {
      const dx = r.x2 - r.x1, dz = r.z2 - r.z1;
      const len = Math.hypot(dx, dz);
      const fx = dx / len, fz = dz / len, px = -fz, pz = fx;
      const n = Math.ceil(len / 4);
      const P = [], UV = [], I = [];
      for (let i = 0; i <= n; i++) {
        const t = (i / n) * len;
        const cx = r.x1 + fx * t, cz = r.z1 + fz * t;
        const lx = cx + (px * r.w) / 2, lz = cz + (pz * r.w) / 2;
        const rx = cx - (px * r.w) / 2, rz = cz - (pz * r.w) / 2;
        const y = Math.max(G.heightAt(lx, lz), G.heightAt(rx, rz), G.heightAt(cx, cz)) + 0.06;
        P.push(lx, y, lz, rx, y, rz);
        UV.push(0, t / 10, 1, t / 10);
        if (i < n) {
          const a = i * 2;
          I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
      g.setIndex(I);
      g.computeVertexNormals();
      // assicura normali verso l'alto
      const nn = g.attributes.normal;
      if (nn.getY(0) < 0) { I.reverse(); g.setIndex(I); g.computeVertexNormals(); }
      const m = new THREE.Mesh(g, r.kind === 'h' ? M.roadH : M.roadV);
      m.receiveShadow = true;
      G.scene.add(m);
    }
    // pavimentazione urbana
    const cg = new THREE.Mesh(new THREE.PlaneGeometry(CITY * 2 + 10, CITY * 2 + 10), M.cityGround);
    cg.rotation.x = -Math.PI / 2;
    cg.position.y = 0.03;
    cg.material.map.repeat.set(1, 1);
    const uv = cg.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 110, uv.getY(i) * 110);
    cg.receiveShadow = true;
    G.scene.add(cg);
  }

  /* ================================================================ EDIFICI */
  function building(x, z, w, d, h, style, opts = {}) {
    const mat = M.facades[style];
    const geo = G.boxGeo(w, h, d, 16, 14, 8);
    const m = new THREE.Mesh(geo, [mat, mat, M.roof, M.roof, mat, mat]);
    m.position.set(x, h / 2, z);
    add(m);
    G.addBox(x, 0, z, w, h, d, 'concrete');
    // zoccolo
    mesh(G.boxGeo(w + 0.4, 1.1, d + 0.4, 4, 4, 4), M.darkConcrete, x, 0.55, z, 0, false, true);
    // parapetto (fuso in un'unica geometria)
    const pt = 0.35, ph = 1.1;
    const parts = [
      { geo: new THREE.BoxGeometry(w, ph, pt), matrix: G.mat4(0, h + ph / 2, d / 2 - pt / 2) },
      { geo: new THREE.BoxGeometry(w, ph, pt), matrix: G.mat4(0, h + ph / 2, -d / 2 + pt / 2) },
      { geo: new THREE.BoxGeometry(pt, ph, d), matrix: G.mat4(w / 2 - pt / 2, h + ph / 2, 0) },
      { geo: new THREE.BoxGeometry(pt, ph, d), matrix: G.mat4(-w / 2 + pt / 2, h + ph / 2, 0) },
    ];
    // unità di condizionamento e locali tecnici sul tetto
    const nAc = G.rndi(1, 4);
    for (let i = 0; i < nAc; i++) {
      const aw = G.rnd(1.5, 3), ah = G.rnd(1, 2.2);
      parts.push({ geo: new THREE.BoxGeometry(aw, ah, aw), matrix: G.mat4(G.rnd(-w / 2 + 3, w / 2 - 3), h + ah / 2, G.rnd(-d / 2 + 3, d / 2 - 3)) });
    }
    if (G.rand() < 0.5) parts.push({ geo: new THREE.BoxGeometry(4, 3, 4), matrix: G.mat4(G.rnd(-w / 4, w / 4), h + 1.5, G.rnd(-d / 4, d / 4)) });
    const roofStuff = new THREE.Mesh(G.mergeGeos(parts), M.darkConcrete);
    roofStuff.position.set(x, 0, z);
    add(roofStuff);
    if (G.rand() < 0.35) { // antenna
      mesh(new THREE.CylinderGeometry(0.06, 0.08, G.rnd(4, 9), 5), M.metalDark, x + G.rnd(-w / 3, w / 3), h + 3, z + G.rnd(-d / 3, d / 3));
    }
    // porta d'ingresso sulla facciata verso la strada più vicina
    const doorSide = opts.door ?? G.rndi(0, 3);
    const dw = 2.4, dh = 3;
    const dm = M.door;
    if (doorSide === 0) mesh(new THREE.BoxGeometry(dw, dh, 0.2), dm, x, dh / 2, z + d / 2 + 0.05, 0, false);
    if (doorSide === 1) mesh(new THREE.BoxGeometry(dw, dh, 0.2), dm, x, dh / 2, z - d / 2 - 0.05, 0, false);
    if (doorSide === 2) mesh(new THREE.BoxGeometry(0.2, dh, dw), dm, x + w / 2 + 0.05, dh / 2, z, 0, false);
    if (doorSide === 3) mesh(new THREE.BoxGeometry(0.2, dh, dw), dm, x - w / 2 - 0.05, dh / 2, z, 0, false);
    mapRect(x, z, w, d, opts.mapColor || '#3b3a36');
  }

  function ruin(x, z, w, d, hMax, style) {
    const mat = M.facades[style];
    // blocchi irregolari a varie altezze: edificio parzialmente crollato
    const nx = 2, nz = 2;
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const bw = w / nx, bd = d / nz;
        const h = G.rand() < 0.3 ? G.rnd(2, 5) : G.rnd(hMax * 0.35, hMax);
        const cx = x - w / 2 + bw * (i + 0.5), cz = z - d / 2 + bd * (j + 0.5);
        const m = new THREE.Mesh(G.boxGeo(bw, h, bd, 16, 14, 8), [mat, mat, M.darkConcrete, M.darkConcrete, mat, mat]);
        m.position.set(cx, h / 2, cz);
        add(m);
        G.addBox(cx, 0, cz, bw, h, bd, 'concrete');
        // travi spezzate che sporgono
        for (let k = 0; k < 2; k++) {
          const beam = mesh(new THREE.BoxGeometry(0.3, 0.3, G.rnd(2, 5)), M.rust, cx + G.rnd(-bw / 2, bw / 2), h + 0.2, cz + G.rnd(-bd / 2, bd / 2), G.rnd(0, 3));
          beam.rotation.x = G.rnd(-0.6, 0.6);
        }
      }
    }
    // macerie (fuse in un'unica mesh)
    const rubble = [];
    for (let i = 0; i < 18; i++) {
      const s = G.rnd(0.6, 2.2);
      const px = x + G.rnd(-w / 2 - 5, w / 2 + 5), pz = z + G.rnd(-d / 2 - 5, d / 2 + 5);
      rubble.push({ geo: new THREE.DodecahedronGeometry(s, 0), matrix: G.mat4(px, s * 0.3, pz, G.rnd(0, 3), G.rnd(0, 3), 0) });
      if (s > 1.4) G.addBox(px, 0, pz, s * 1.2, s * 0.9, s * 1.2, 'concrete');
    }
    add(new THREE.Mesh(G.mergeGeos(rubble), M.darkConcrete));
    mapRect(x, z, w, d, '#4a4640');
  }

  /* ============================================== OGGETTI ISTANZIATI (props) */
  const inst = {};
  function instList(name) { return (inst[name] = inst[name] || []); }
  function crate(x, z, y = null, s = 1.2) {
    const gy = y ?? G.heightAt(x, z);
    instList('crate').push(G.mat4(x, gy + s / 2, z, 0, G.rnd(-0.2, 0.2), 0, s, s, s));
    G.addBox(x, gy, z, s, s, s, 'wood');
  }
  function crateStack(x, z) {
    crate(x, z);
    if (G.rand() < 0.7) crate(x + 1.3, z + G.rnd(-0.2, 0.2));
    if (G.rand() < 0.5) crate(x + 0.6, z + G.rnd(-0.1, 0.1), G.heightAt(x, z) + 1.2);
  }
  function sandbags(x, z, ry = 0, len = 3) {
    const gy = G.heightAt(x, z);
    instList('sandbag').push(G.mat4(x, gy + 0.45, z, 0, ry, 0, len, 1, 1));
    const rot = Math.abs(Math.sin(ry)) > 0.7;
    G.addBox(x, gy, z, rot ? 0.8 : len, 0.95, rot ? len : 0.8, 'sand');
  }
  function sandbagNest(x, z, r = 3) { // postazione a U
    sandbags(x, z - r, 0, r * 2);
    sandbags(x - r, z, Math.PI / 2, r * 2);
    sandbags(x + r, z, Math.PI / 2, r * 2);
  }
  function jersey(x, z, ry = 0) {
    const gy = G.heightAt(x, z);
    instList('jersey').push(G.mat4(x, gy + 0.5, z, 0, ry, 0));
    const rot = Math.abs(Math.sin(ry)) > 0.7;
    G.addBox(x, gy, z, rot ? 0.7 : 3, 1.05, rot ? 3 : 0.7, 'concrete');
  }
  function container(x, z, ry = 0, stack = 0, color) {
    const gy = G.heightAt(x, z) + stack * 2.6;
    instList('container').push({ m: G.mat4(x, gy + 1.3, z, 0, ry, 0), c: color || G.pick([0x6d2f22, 0x2f4d6b, 0x4d5a36, 0x8a6a2c, 0x5a5a5a]) });
    const rot = Math.abs(Math.sin(ry)) > 0.7;
    G.addBox(x, gy, z, rot ? 2.5 : 12, 2.6, rot ? 12 : 2.5, 'metal');
    G.mapShapes.rects.push({ x, z, w: rot ? 2.5 : 12, d: rot ? 12 : 2.5, color: '#5a4a3a' });
  }
  function wreck(x, z, ry) {
    const gy = G.heightAt(x, z);
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.8, 4.3), M.wreck);
    body.position.y = 0.6;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.2), M.rust);
    cab.position.set(0, 1.25, -0.2);
    g.add(body, cab);
    for (const [wx, wz] of [[0.9, 1.3], [-0.9, 1.3], [0.9, -1.3], [-0.9, -1.3]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 8), M.metalDark);
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, 0.25, wz);
      g.add(w);
    }
    g.position.set(x, gy, z);
    g.rotation.y = ry;
    g.rotation.z = G.rnd(-0.08, 0.08);
    g.traverse((o) => { o.castShadow = o.receiveShadow = true; });
    root.add(g);
    const rot = Math.abs(Math.sin(ry)) > 0.7;
    G.addBox(x, gy, z, rot ? 4.3 : 2, 1.6, rot ? 2 : 4.3, 'metal');
  }

  /* barili esplosivi, cisterne e casse munizioni: oggetti interattivi */
  G.destructibles = [];
  G.ammoCrates = [];
  function barrel(x, z, explosive = true) {
    const gy = G.heightAt(x, z);
    const m = mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.25, 12), explosive ? M.barrelRed : M.rust, x, gy + 0.62, z);
    const band = mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.12, 12), G.std(0xd8c020, 0.6), x, gy + 0.8, z, 0, false);
    m.userData.keep = band.userData.keep = true;
    const col = G.addCyl(x, z, 0.42, gy, 1.25, 'metal');
    const obj = { type: 'barrel', mesh: m, extra: [band], col, hp: explosive ? 18 : 1e9, pos: new V(x, gy + 0.62, z), radius: 0.45, halfH: 0.62, explosive, blast: 7, dmg: 110 };
    col.ref = obj;
    G.destructibles.push(obj);
  }
  function fuelTank(x, z) {
    const gy = G.heightAt(x, z);
    const m = mesh(new THREE.CylinderGeometry(3, 3, 7, 20), M.fuel, x, gy + 3.5, z);
    const top = mesh(new THREE.SphereGeometry(3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.fuel, x, gy + 7, z);
    const stripe = mesh(new THREE.CylinderGeometry(3.02, 3.02, 0.6, 20), G.std(0x8b1a14, 0.6), x, gy + 5, z, 0, false);
    m.userData.keep = top.userData.keep = stripe.userData.keep = true;
    const col = G.addCyl(x, z, 3, gy, 7.5, 'metal');
    const obj = { type: 'fuel', mesh: m, extra: [top, stripe], col, hp: 160, pos: new V(x, gy + 3.5, z), radius: 3, halfH: 3.7, explosive: true, blast: 16, dmg: 200, objective: true };
    col.ref = obj;
    G.destructibles.push(obj);
    G.mapShapes.circles.push({ x, z, r: 3, color: '#b0a890' });
  }
  function ammoCrate(x, z, ry = 0) {
    const gy = G.heightAt(x, z);
    const m = mesh(G.boxGeo(1.4, 0.7, 0.8, 1.4, 0.7, 1.4), M.ammo, x, gy + 0.35, z, ry);
    const lid = mesh(new THREE.BoxGeometry(1.45, 0.08, 0.85), G.std(0x3f4a2c, 0.8), x, gy + 0.74, z, ry);
    m.userData.keep = lid.userData.keep = true;
    G.addBox(x, gy, z, 1.4, 0.75, 1.4, 'wood');
    G.ammoCrates.push({ pos: new V(x, gy + 0.5, z), mesh: m, lid, cooldown: 0 });
  }

  /* lampioni */
  const lampHeads = [];
  function lamp(x, z, ry) {
    const gy = G.heightAt(x, z);
    instList('lampPole').push(G.mat4(x, gy + 3.5, z));
    const ax = Math.sin(ry) * 1.2, az = Math.cos(ry) * 1.2;
    instList('lampArm').push(G.mat4(x + ax / 2, gy + 6.9, z + az / 2, 0, ry, 0));
    instList('lampHead').push(G.mat4(x + ax, gy + 6.8, z + az, 0, ry, 0));
    lampHeads.push(x + ax, gy + 6.65, z + az);
    G.addCyl(x, z, 0.14, gy, 7, 'metal');
  }

  function flushInstances() {
    const make = (name, geo, mat, cast = true) => {
      const list = inst[name];
      if (!list || !list.length) return;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((it, i) => {
        if (it.m) {
          im.setMatrixAt(i, it.m);
          im.setColorAt(i, new THREE.Color(it.c));
        } else im.setMatrixAt(i, it);
      });
      im.castShadow = cast;
      im.receiveShadow = true;
      im.frustumCulled = false;
      G.scene.add(im);
    };
    make('crate', new THREE.BoxGeometry(1, 1, 1), M.crate);
    make('sandbag', (() => {
      const g = G.boxGeo(1, 0.9, 0.8, 1, 0.45, 1);
      return g;
    })(), M.sandbag);
    const jg = new THREE.CylinderGeometry(0.18, 0.35, 1, 4, 1);
    jg.rotateY(Math.PI / 4);
    jg.scale(1, 1, 1);
    make('jersey', (() => { const g = new THREE.CylinderGeometry(0.15, 0.35, 1.05, 4); g.rotateY(Math.PI / 4); g.scale(6.06, 1, 1); return g; })(), M.jersey);
    make('container', G.boxGeo(12, 2.6, 2.5, 3, 2.6, 3), new THREE.MeshStandardMaterial({ map: G.tex.metal, roughness: 0.6, metalness: 0.4 }));
    make('lampPole', new THREE.CylinderGeometry(0.1, 0.15, 7, 6), M.metalDark);
    make('lampArm', new THREE.BoxGeometry(0.1, 0.1, 1.3), M.metalDark);
    make('lampHead', new THREE.BoxGeometry(0.4, 0.2, 0.6), M.lampGlow, false);
    // alone luminoso dei lampioni (visibile di notte)
    if (lampHeads.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(lampHeads, 3));
      const pm = new THREE.PointsMaterial({ map: G.tex.soft, color: 0xffc070, size: 4, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      const pts = new THREE.Points(g, pm);
      pts.frustumCulled = false;
      G.scene.add(pts);
      G.lampGlow = pm;
    }
  }

  /* ================================================================ CITTÀ */
  function buildCity() {
    const blocks = [-150, -50, 50, 150];
    for (const bx of blocks) {
      for (const bz of blocks) {
        const key2 = bx + ',' + bz;
        const distC = Math.hypot(bx, bz);
        if (key2 === '-50,50') { park(bx, bz); continue; }
        if (key2 === '50,-50' || key2 === '-150,-150') { warBlock(bx, bz); continue; }
        if (key2 === '150,150') { parking(bx, bz); continue; }
        for (const ox of [-20, 20]) {
          for (const oz of [-20, 20]) {
            if (G.rand() < 0.08) { // lotto vuoto: detriti e casse
              crateStack(bx + ox, bz + oz);
              if (G.rand() < 0.6) barrel(bx + ox + 3, bz + oz - 2);
              continue;
            }
            const w = G.rnd(18, 34), d = G.rnd(18, 34);
            const px = bx + ox + G.rnd(-(38 - w) / 2 + 0.5, (38 - w) / 2 - 0.5) * 0.9;
            const pz = bz + oz + G.rnd(-(38 - d) / 2 + 0.5, (38 - d) / 2 - 0.5) * 0.9;
            let h = G.rnd(10, 22) + Math.max(0, 1 - distC / 220) * G.rnd(0, 38);
            h = Math.max(7, Math.round(h / 3.5) * 3.5);
            const style = distC < 90 && G.rand() < 0.5 ? 2 : G.pick([0, 1, 3, 4, 0, 3]);
            const door = ox > 0 ? 2 : 3;
            building(px, pz, w, d, h, style, { door });
          }
        }
      }
    }
    // lampioni lungo le strade urbane
    for (const v of [-200, -100, 0, 100, 200]) {
      for (let t = -195; t <= 195; t += 26) {
        if (Math.abs(t - Math.round(t / 100) * 100) < 12) continue; // niente lampioni sugli incroci
        const hw = v === 0 ? 8.2 : 7.2;
        lamp(v + hw, t, -Math.PI / 2);
        lamp(v - hw, t + 13, Math.PI / 2);
        lamp(t, v + hw, Math.PI);
        lamp(t + 13, v - hw, 0);
      }
    }
    // scena di guerra per le strade: carcasse, barricate, sacchi di sabbia
    const R2 = G.makeRng(777);
    const rr = (a, b) => a + (b - a) * R2();
    for (let i = 0; i < 22; i++) {
      const v = [-200, -100, 0, 100, 200][Math.floor(R2() * 5)];
      const t = rr(-190, 190);
      if (Math.abs(t - Math.round(t / 100) * 100) < 15) continue;
      if (R2() < 0.5) wreck(v + rr(-3, 3), t, rr(-0.3, 0.3) + (R2() < 0.5 ? 0 : Math.PI));
      else wreck(t, v + rr(-3, 3), Math.PI / 2 + rr(-0.3, 0.3));
    }
    // barricate agli incroci
    for (const [x, z] of [[100, 0], [-100, 0], [0, 100], [0, -100], [100, 100], [-100, -100], [200, 0], [0, -200]]) {
      jersey(x + 9, z + 9, 0);
      jersey(x - 9, z - 9, Math.PI / 2);
      sandbags(x + 11, z - 10, 0, 3);
      crateStack(x - 11, z + 11);
      barrel(x + 11.5, z + 12);
    }
    ammoCrate(4, 12, 0);
    ammoCrate(-108, 96, 0);
    ammoCrate(104, -112, 0);
    ammoCrate(-196, 108, 0);
  }
  function park(bx, bz) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(84, 84), M.grassPatch);
    g.rotation.x = -Math.PI / 2;
    g.position.set(bx, 0.045, bz);
    g.receiveShadow = true;
    const uv = g.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 20, uv.getY(i) * 20);
    G.scene.add(g);
    mapRect(bx, bz, 84, 84, '#48562f');
    // monumento
    solidBox(bx, 0, bz, 6, 1.5, 6, M.concrete);
    solidBox(bx, 1.5, bz, 2.4, 5, 2.4, M.concrete);
    mesh(new THREE.SphereGeometry(1.1, 12, 10), M.metal, bx, 7.6, bz);
    for (let i = 0; i < 26; i++) {
      const a = G.rand() * Math.PI * 2, r = G.rnd(10, 38);
      parkTrees.push([bx + Math.cos(a) * r, bz + Math.sin(a) * r]);
    }
    sandbagNest(bx + 20, bz - 20, 3);
    ammoCrate(bx + 20, bz - 18);
  }
  const parkTrees = [];
  function warBlock(bx, bz) {
    ruin(bx - 18, bz - 16, 24, 22, 20, 3);
    ruin(bx + 18, bz + 16, 22, 26, 26, 0);
    building(bx + 20, bz - 20, 20, 18, 14, 4);
    for (let i = 0; i < 6; i++) crateStack(bx + G.rnd(-30, 30), bz + G.rnd(-30, 30));
    for (let i = 0; i < 4; i++) barrel(bx + G.rnd(-35, 35), bz + G.rnd(-35, 35));
    sandbagNest(bx - 20, bz + 22, 3);
    container(bx, bz + 30, 0);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicMaterial({ map: G.tex.scorch, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
    s.rotation.x = -Math.PI / 2;
    s.position.set(bx + 4, 0.06, bz + 2);
    G.scene.add(s);
  }
  function parking(bx, bz) {
    building(bx + 22, bz + 22, 26, 26, 17.5, 0);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), new THREE.MeshStandardMaterial({ map: G.tex.roadPlain, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1.5, polygonOffsetUnits: -3 }));
    g.rotation.x = -Math.PI / 2;
    g.position.set(bx - 10, 0.045, bz - 18);
    g.receiveShadow = true;
    G.scene.add(g);
    G.vehicleSpawns.push({ type: 'sedan', x: bx - 25, z: bz - 20, ry: 0 });
    G.vehicleSpawns.push({ type: 'sport', x: bx - 12, z: bz - 20, ry: 0 });
    G.vehicleSpawns.push({ type: 'pickup', x: bx + 2, z: bz - 20, ry: Math.PI });
    wreck(bx - 30, bz - 5, 0.2);
  }

  /* ========================================================= BASE MILITARE */
  function buildBase() {
    const cx = 400, cz = -400, S = 80;
    const wallH = 3.6;
    const wallMat = M.concrete;
    // muro perimetrale con cancello a sud
    const wallSeg = (x1, z1, x2, z2) => {
      const w = Math.abs(x2 - x1) || 0.8, d = Math.abs(z2 - z1) || 0.8;
      solidBox((x1 + x2) / 2, 0, (z1 + z2) / 2, w, wallH, d, wallMat, 'concrete', false, 4);
      mapRect((x1 + x2) / 2, (z1 + z2) / 2, w, d, '#8a8478');
    };
    wallSeg(cx - S, cz - S, cx + S, cz - S);
    wallSeg(cx - S, cz - S, cx - S, cz + S);
    wallSeg(cx + S, cz - S, cx + S, cz + S);
    wallSeg(cx - S, cz + S, cx - 9, cz + S);
    wallSeg(cx + 9, cz + S, cx + S, cz + S);
    // filo spinato (rete) sopra il muro
    // torri di guardia
    for (const [tx, tz] of [[cx - S + 4, cz - S + 4], [cx + S - 4, cz - S + 4], [cx - S + 4, cz + S - 4], [cx + S - 4, cz + S - 4], [cx - 14, cz + S - 4], [cx + 14, cz + S - 4]]) {
      watchtower(tx, tz);
    }
    // hangar
    hangar(cx - 40, cz - 45);
    hangar(cx + 5, cz - 45);
    // caserme
    for (let i = 0; i < 3; i++) {
      solidBox(cx + 45, 0, cz - 50 + i * 16, 22, 4.2, 9, M.metal, 'metal', false, 4);
      mesh(new THREE.BoxGeometry(23, 0.3, 10), M.metalDark, cx + 45, 4.35, cz - 50 + i * 16);
      mapRect(cx + 45, cz - 50 + i * 16, 22, 9, '#5d6150');
    }
    // eliporto
    const hp = new THREE.Mesh(new THREE.PlaneGeometry(22, 22), M.helipad);
    hp.rotation.x = -Math.PI / 2;
    hp.position.set(cx + 40, 0.08, cz + 45);
    G.scene.add(hp);
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), M.cityGround);
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(cx + 40, 0.05, cz + 45);
    pad.receiveShadow = true;
    G.scene.add(pad);
    // deposito carburante (obiettivo)
    for (const [fx, fz] of [[-50, 20], [-50, 32], [-36, 20], [-36, 32]]) fuelTank(cx + fx, cz + fz);
    sandbags(cx - 43, cz + 42, 0, 20);
    // container, casse, barili
    container(cx - 10, cz + 10, 0);
    container(cx - 10, cz + 10, 0, 1);
    container(cx - 10, cz + 14, 0);
    container(cx + 12, cz + 5, Math.PI / 2);
    container(cx - 68, cz - 10, Math.PI / 2);
    container(cx - 64, cz - 10, Math.PI / 2);
    container(cx - 64, cz - 10, Math.PI / 2, 1);
    for (let i = 0; i < 10; i++) crateStack(cx + G.rnd(-65, 65), cz + G.rnd(-10, 60));
    for (let i = 0; i < 12; i++) barrel(cx + G.rnd(-70, 70), cz + G.rnd(-70, 70));
    sandbagNest(cx, cz + S + 10, 4);
    jersey(cx - 5, cz + S + 18, 0);
    jersey(cx + 5, cz + S + 22, 0);
    sandbagNest(cx + 20, cz + 30, 3);
    sandbagNest(cx - 20, cz - 5, 3);
    ammoCrate(cx - 25, cz + 50);
    ammoCrate(cx + 60, cz - 20);
    // antenna radio con luce rossa
    mesh(new THREE.CylinderGeometry(0.2, 0.5, 26, 6), M.metalDark, cx + 60, 13, cz + 20);
    G.addCyl(cx + 60, cz + 20, 0.5, 0, 26, 'metal');
    mesh(new THREE.SphereGeometry(0.4, 8, 6), M.redLight, cx + 60, 26.2, cz + 20, 0, false, false);
    G.vehicleSpawns.push({ type: 'truck', x: cx + 25, z: cz + 60, ry: Math.PI / 2 });
    G.vehicleSpawns.push({ type: 'jeep', x: cx - 25, z: cz + 65, ry: 0 });
    G.vehicleSpawns.push({ type: 'jeep', x: cx + 60, z: cz + 5, ry: Math.PI });
  }
  function watchtower(x, z) {
    const gy = G.heightAt(x, z);
    for (const [lx, lz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) {
      mesh(new THREE.BoxGeometry(0.25, 7, 0.25), M.wood, x + lx, gy + 3.5, z + lz);
      G.addBox(x + lx, gy, z + lz, 0.3, 7, 0.3, 'wood');
    }
    mesh(new THREE.BoxGeometry(3.6, 0.3, 3.6), M.wood, x, gy + 7, z);
    for (const [sx, sz, w, d] of [[0, 1.7, 3.6, 0.15], [0, -1.7, 3.6, 0.15], [1.7, 0, 0.15, 3.6], [-1.7, 0, 0.15, 3.6]]) {
      mesh(new THREE.BoxGeometry(w, 1.1, d), M.wood, x + sx, gy + 7.7, z + sz);
    }
    const roof = mesh(new THREE.ConeGeometry(2.9, 1.3, 4), M.metal, x, gy + 10.2, z, Math.PI / 4);
    roof.castShadow = true;
    for (const [lx, lz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) {
      mesh(new THREE.BoxGeometry(0.12, 2.3, 0.12), M.wood, x + lx, gy + 8.4, z + lz);
    }
    G.addBox(x, gy + 6.85, z, 3.6, 0.35, 3.6, 'wood');
    G.mapShapes.rects.push({ x, z, w: 3.6, d: 3.6, color: '#6b5238' });
    G.towers.push(new V(x, gy + 7.2, z));
  }
  G.towers = [];
  function hangar(x, z) {
    const len = 26, r = 11;
    const g = new THREE.CylinderGeometry(r, r, len, 24, 1, true, 0, Math.PI);
    g.rotateZ(Math.PI / 2);
    g.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: G.tex.metal, color: 0x6c7160, roughness: 0.6, metalness: 0.4, side: THREE.DoubleSide }));
    m.material.map = G.tex.metal.clone();
    m.material.map.repeat.set(6, 1);
    m.material.map.needsUpdate = true;
    m.rotation.y = Math.PI / 2;
    m.position.set(x, 0, z);
    add(m);
    // parete di fondo (lato nord); lato sud aperto
    const back = new THREE.Mesh(new THREE.CircleGeometry(r, 24, 0, Math.PI), M.metal);
    back.position.set(x, 0, z - len / 2);
    add(back);
    // collider: pareti laterali e fondo (si può entrare dal lato sud)
    G.addBox(x - r + 0.6, 0, z, 1.6, 7, len, 'metal');
    G.addBox(x + r - 0.6, 0, z, 1.6, 7, len, 'metal');
    G.addBox(x, 7, z, r * 2, 4.5, len, 'metal');
    G.addBox(x, 0, z - len / 2 - 0.2, r * 2, 11, 0.6, 'metal');
    G.mapShapes.rects.push({ x, z, w: r * 2, d: len, color: '#5a5e50' });
    crateStack(x - 5, z - 6);
    barrel(x + 6, z - 8);
    barrel(x + 7, z - 7);
  }

  /* ============================================================= VILLAGGIO */
  function house(x, z, rot, w = 8, d = 7, h = 4.2) {
    const R90 = rot % 2 === 1;
    const W = R90 ? d : w, D = R90 ? w : d;
    solidBox(x, 0, z, W, h, D, M.plaster, 'concrete', false, 6);
    // tetto a due falde
    const shape = new THREE.Shape();
    shape.moveTo(-D / 2 - 0.6, 0);
    shape.lineTo(0, 2.6);
    shape.lineTo(D / 2 + 0.6, 0);
    shape.lineTo(-D / 2 - 0.6, 0);
    const rg = new THREE.ExtrudeGeometry(shape, { depth: W + 1, bevelEnabled: false });
    rg.translate(0, 0, -(W + 1) / 2);
    rg.rotateY(Math.PI / 2);
    const uv = rg.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.25, uv.getY(i) * 0.25);
    const roof = new THREE.Mesh(rg, M.tiles);
    roof.position.set(x, h, z);
    add(roof);
    // comignolo
    mesh(new THREE.BoxGeometry(0.7, 1.8, 0.7), M.darkConcrete, x + W * 0.25, h + 1.9, z);
    mapRect(x, z, W, D, '#7a4a35');
  }
  function buildVillage() {
    const cx = -400, cz = 400;
    const spots = [
      [-14, -60, 0], [14, -48, 1], [-15, -30, 0], [15, -15, 1], [-16, 0, 0], [16, 18, 1],
      [-15, 34, 0], [15, 50, 1], [-32, -12, 1], [32, 30, 0], [-35, 55, 1], [35, -40, 0],
    ];
    for (const [ox, oz, r] of spots) house(cx + ox, cz + oz, r, G.rnd(7, 10), G.rnd(6, 8), G.rnd(3.8, 5));
    // chiesa con campanile
    solidBox(cx - 42, 0, cz + 20, 12, 8, 20, M.plaster, 'concrete', false, 6);
    solidBox(cx - 42, 0, cz + 6, 5, 20, 5, M.plaster, 'concrete', false, 6);
    mesh(new THREE.ConeGeometry(3.8, 6, 4), M.tiles, cx - 42, 23, cz + 6, Math.PI / 4);
    const sh = new THREE.Shape();
    sh.moveTo(-6.5, 0); sh.lineTo(0, 4); sh.lineTo(6.5, 0); sh.lineTo(-6.5, 0);
    const rg = new THREE.ExtrudeGeometry(sh, { depth: 20.5, bevelEnabled: false });
    rg.translate(0, 0, -10.25);
    const croof = new THREE.Mesh(rg, M.tiles);
    croof.position.set(cx - 42, 8, cz + 20);
    add(croof);
    mapRect(cx - 42, cz + 20, 12, 20, '#8a6a55');
    // balle di fieno, pozzo, recinti
    for (let i = 0; i < 8; i++) {
      const hx = cx + G.rnd(40, 70), hz = cz + G.rnd(-50, 50);
      const b = mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.4, 12), M.hay, hx, G.heightAt(hx, hz) + 0.8, hz);
      b.rotation.z = Math.PI / 2;
      G.addCyl(hx, hz, 0.8, G.heightAt(hx, hz), 1.6, 'wood');
    }
    solidBox(cx + 8, 0, cz + 70, 2, 1, 2, M.darkConcrete);
    for (let i = 0; i < 5; i++) crateStack(cx + G.rnd(-30, 30), cz + G.rnd(-60, 60));
    sandbagNest(cx + 8, cz - 75, 3);
    sandbagNest(cx - 8, cz + 80, 3);
    ammoCrate(cx + 6, cz - 5, Math.PI / 2);
    G.vehicleSpawns.push({ type: 'pickup', x: cx + 8, z: cz + 30, ry: 0 });
    G.vehicleSpawns.push({ type: 'sedan', x: cx - 8, z: cz - 40, ry: Math.PI });
  }

  /* ====================================== AVAMPOSTO ALLEATO + STAZIONE BENZINA */
  function buildOutpost() {
    const cx = 38, cz = 440;
    // tende
    for (const [ox, oz] of [[-8, -10], [6, -12], [14, 6]]) {
      const t = mesh(new THREE.CylinderGeometry(0.01, 3.4, 3, 4, 1, true), M.tent, cx + ox, 1.5, cz + oz, Math.PI / 4);
      t.scale.set(1, 1, 1.4);
      G.addBox(cx + ox, 0, cz + oz, 4.4, 2.6, 5.8, 'wood');
      G.mapShapes.rects.push({ x: cx + ox, z: cz + oz, w: 4.4, d: 5.8, color: '#5a5c3c' });
    }
    sandbags(cx - 15, cz - 20, 0, 10);
    sandbags(cx + 5, cz - 24, 0, 12);
    sandbags(cx + 20, cz - 12, Math.PI / 2, 10);
    // bandiera
    mesh(new THREE.CylinderGeometry(0.06, 0.08, 9, 6), M.metalDark, cx, 4.5, cz);
    const flag = mesh(new THREE.PlaneGeometry(2.4, 1.4, 8, 4), G.std(0x2f5d8a, 0.9, 0, { side: THREE.DoubleSide }), cx + 1.25, 8.2, cz);
    G.flag = flag;
    flag.userData.keep = true;
    ammoCrate(cx - 4, cz + 4);
    ammoCrate(cx + 3, cz + 5, Math.PI / 2);
    crateStack(cx + 10, cz - 4);
    G.vehicleSpawns.push({ type: 'jeep', x: 16, z: 452, ry: Math.PI });
    G.vehicleSpawns.push({ type: 'jeep', x: 20, z: 432, ry: Math.PI });
    G.spawnPoint = new V(30, 0, 446);

    // stazione di servizio
    const gx = -40, gz = 330;
    solidBox(gx - 8, 0, gz, 8, 4, 12, M.facades[4], 'concrete', false, 16);
    for (const [px, pz] of [[5, -6], [5, 6], [13, -6], [13, 6]]) {
      mesh(new THREE.BoxGeometry(0.4, 5, 0.4), M.concrete, gx + px, 2.5, gz + pz);
      G.addBox(gx + px, 0, gz + pz, 0.4, 5, 0.4, 'concrete');
    }
    mesh(new THREE.BoxGeometry(12, 0.8, 16), G.std(0xd8d4c8, 0.6), gx + 9, 5.4, gz);
    mesh(new THREE.BoxGeometry(12.1, 0.3, 16.1), G.std(0xa81c1c, 0.6), gx + 9, 5.1, gz);
    for (const pz of [-3, 3]) solidBox(gx + 9, 0, gz + pz, 0.8, 1.6, 1.2, G.std(0xc8c4b8, 0.5), 'metal');
    mapRect(gx - 8, gz, 8, 12, '#6a6660');
    mapRect(gx + 9, gz, 12, 16, '#8a8478');
    G.vehicleSpawns.push({ type: 'sport', x: gx + 16, z: gz + 2, ry: 0 });
    barrel(gx - 3, gz + 8, true);
    barrel(gx - 2, gz + 9, true);
  }

  /* ================================================ POSTI DI BLOCCO / FATTORIE */
  function buildRoadblocks() {
    for (const [x, z, ax] of [[0, -320, 'z'], [-320, 0, 'x'], [320, 0, 'x'], [0, 260, 'z'], [400, -200, 'z'], [-400, 150, 'z']]) {
      if (ax === 'z') {
        jersey(x - 3, z, 0); jersey(x + 4, z + 6, 0);
        sandbags(x - 10, z + 2, Math.PI / 2, 4); sandbags(x + 10, z + 4, Math.PI / 2, 4);
        crateStack(x + 11, z - 5); barrel(x - 11, z - 4);
      } else {
        jersey(x, z - 3, Math.PI / 2); jersey(x + 6, z + 4, Math.PI / 2);
        sandbags(x + 2, z - 10, 0, 4); sandbags(x + 4, z + 10, 0, 4);
        crateStack(x - 5, z + 11); barrel(x - 4, z - 11);
      }
      G.roadblocks.push(new V(x, 0, z));
    }
    // fattorie sparse
    for (const [x, z] of [[160, 380], [-250, -330], [300, 250], [-470, -120], [480, 180], [-150, 480]]) {
      const hx = x, hz = z;
      if (G.heightAt(hx, hz) < G.WATER + 1) continue;
      const y = G.heightAt(hx, hz);
      const house2 = mesh(G.boxGeo(9, 4.5, 7, 6, 6, 6), M.plaster, hx, y + 2.25, hz);
      G.addBox(hx, y - 1, hz, 9, 5.5, 7, 'concrete');
      const sh = new THREE.Shape();
      sh.moveTo(-4.1, 0); sh.lineTo(0, 2.4); sh.lineTo(4.1, 0); sh.lineTo(-4.1, 0);
      const rg = new THREE.ExtrudeGeometry(sh, { depth: 10, bevelEnabled: false });
      rg.translate(0, 0, -5);
      rg.rotateY(Math.PI / 2);
      const uv = rg.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.25, uv.getY(i) * 0.25);
      mesh(rg, M.tiles, hx, y + 4.5, hz);
      // fienile
      solidBox(hx + 14, y - 1, hz + 2, 10, 7.5, 8, M.rust, 'wood', false, 4);
      mapRect(hx, hz, 9, 7, '#7a4a35');
      mapRect(hx + 14, hz + 2, 10, 8, '#6b4a33');
      house2.castShadow = true;
    }
  }
  G.roadblocks = [];

  /* ========================================================= TORRE RADIO */
  function buildRadioTower() {
    let best = null;
    for (let i = 0; i < 400; i++) {
      const x = G.rnd(-480, 480), z = G.rnd(-480, 480);
      if (G.inCity(x, z) || Math.hypot(x - 400, z + 400) < 150 || Math.hypot(x + 400, z - 400) < 140) continue;
      const h = G.heightAt(x, z);
      if (!best || h > best.h) best = { x, z, h };
    }
    const { x, z, h } = best;
    const g = new THREE.Group();
    const legM = M.metalDark;
    for (let s = 0; s < 8; s++) { // traliccio a sezioni
      const w = 3 - s * 0.3, y0 = s * 5;
      for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 5.1, 0.2), legM);
        leg.position.set((lx * w) / 2, y0 + 2.5, (lz * w) / 2);
        g.add(leg);
      }
      for (let k = 0; k < 4; k++) {
        const br = new THREE.Mesh(new THREE.BoxGeometry(w * 1.4, 0.1, 0.1), legM);
        br.position.set(0, y0 + 2.5, 0);
        br.rotation.y = (k * Math.PI) / 2;
        br.translateZ(w / 2);
        br.rotation.z = k % 2 ? 0.8 : -0.8;
        g.add(br);
      }
    }
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), M.redLight);
    light.position.y = 40.5;
    g.add(light);
    G.towerLight = light;
    light.userData.keep = true;
    g.position.set(x, h, z);
    g.traverse((o) => { o.castShadow = true; });
    root.add(g);
    G.addBox(x, h - 1, z, 3.2, 41, 3.2, 'metal');
    // bunker
    solidBox(x + 8, h - 1, z + 6, 7, 3.5, 5, M.darkConcrete);
    sandbagNest(x - 7, z - 7, 2.5);
    ammoCrate(x + 4, z - 3);
    G.zones.tower = { x, z, r: 30, name: 'Torre Radio' };
    G.mapShapes.rects.push({ x, z, w: 4, d: 4, color: '#aa3333' });
  }

  /* ============================================================ VEGETAZIONE */
  function buildVegetation() {
    const R = G.makeRng(5150);
    const blocked = (x, z, margin = 0) => {
      if (Math.abs(x) > HALF - 5 || Math.abs(z) > HALF - 5) return true;
      if (G.roadDistFast(x, z) < 7 + margin) return true;
      if (Math.abs(x) < CITY + 12 + margin && Math.abs(z) < CITY + 12 + margin) return true;
      for (const zn of FLAT) if (Math.hypot(x - zn.x, z - zn.z) < zn.r + 8 + margin) return true;
      const tz = G.zones.tower;
      if (tz && Math.hypot(x - tz.x, z - tz.z) < 16) return true;
      if (G.heightAt(x, z) < G.WATER + 0.6) return true;
      return false;
    };
    const pines = [], broad = [], bushes = [], rocks = [], grass = [];
    for (let i = 0; i < 16000 && pines.length + broad.length < 3400; i++) {
      const x = (R() * 2 - 1) * HALF, z = (R() * 2 - 1) * HALF;
      const dens = G.fbm(x * 0.006 + 9, z * 0.006 + 4, 3);
      if (dens < -0.05 && R() > 0.08) continue;
      if (blocked(x, z)) continue;
      const n = G.normalAt(x, z);
      if (n.y < 0.75) continue;
      const y = G.heightAt(x, z);
      const s = 0.7 + R() * 0.8;
      if (y > 20 || R() < 0.65) pines.push([x, y, z, s, R() * 6.28]);
      else broad.push([x, y, z, s, R() * 6.28]);
    }
    for (const [x, z] of parkTrees) broad.push([x, 0, z, 0.8 + R() * 0.4, R() * 6.28]);
    for (let i = 0; i < 2500; i++) {
      const x = (R() * 2 - 1) * HALF, z = (R() * 2 - 1) * HALF;
      if (blocked(x, z, -4)) continue;
      bushes.push([x, G.heightAt(x, z), z, 0.6 + R() * 0.9, R() * 6.28]);
    }
    for (let i = 0; i < 700; i++) {
      const x = (R() * 2 - 1) * HALF, z = (R() * 2 - 1) * HALF;
      if (blocked(x, z, -2)) continue;
      const n = G.normalAt(x, z);
      rocks.push([x, G.heightAt(x, z), z, 0.5 + R() * R() * 3.5, R() * 6.28, n.y]);
    }
    for (let i = 0; i < 26000; i++) {
      const x = (R() * 2 - 1) * HALF, z = (R() * 2 - 1) * HALF;
      if (blocked(x, z, -5)) continue;
      if (G.normalAt(x, z).y < 0.8) continue;
      grass.push([x, G.heightAt(x, z), z, 0.5 + R() * 0.8, R() * 6.28]);
    }

    // --- pini: tronco + 3 coni sovrapposti
    const trunkG = new THREE.CylinderGeometry(0.18, 0.32, 5, 6);
    trunkG.translate(0, 2.5, 0);
    const pineG = G.mergeGeos([
      { geo: new THREE.ConeGeometry(2.6, 4.2, 7), matrix: G.mat4(0, 4.4, 0) },
      { geo: new THREE.ConeGeometry(2.1, 3.6, 7), matrix: G.mat4(0, 6.4, 0, 0, 0.4, 0) },
      { geo: new THREE.ConeGeometry(1.4, 3.0, 7), matrix: G.mat4(0, 8.3, 0, 0, 0.9, 0) },
    ]);
    const broadG = G.mergeGeos([
      { geo: new THREE.IcosahedronGeometry(2.6, 1), matrix: G.mat4(0, 5.6, 0, 0, 0, 0, 1, 0.85, 1) },
      { geo: new THREE.IcosahedronGeometry(1.9, 1), matrix: G.mat4(1.3, 4.8, 0.6) },
      { geo: new THREE.IcosahedronGeometry(1.7, 1), matrix: G.mat4(-1.2, 5, -0.6) },
    ]);
    const nT = pines.length + broad.length;
    const trunks = new THREE.InstancedMesh(trunkG, M.bark, nT);
    const pineM = new THREE.InstancedMesh(pineG, M.foliage, pines.length);
    const broadM = new THREE.InstancedMesh(broadG, M.foliage, broad.length);
    const c = new THREE.Color();
    let ti = 0;
    pines.forEach(([x, y, z, s, r], i) => {
      const m = G.mat4(x, y - 0.2, z, 0, r, 0, s, s * (0.9 + (i % 5) * 0.08), s);
      trunks.setMatrixAt(ti++, m);
      pineM.setMatrixAt(i, m);
      c.setHSL(0.24 + (i % 7) * 0.008, 0.35, 0.16 + (i % 5) * 0.015);
      pineM.setColorAt(i, c);
      G.addCyl(x, z, 0.3 * s + 0.05, y, 9 * s, 'wood');
      G.mapShapes.circles.push({ x, z, r: 2.4 * s, color: '#2f3a20', tree: true });
    });
    broad.forEach(([x, y, z, s, r], i) => {
      const m = G.mat4(x, y - 0.2, z, 0, r, 0, s, s, s);
      trunks.setMatrixAt(ti++, m);
      broadM.setMatrixAt(i, m);
      c.setHSL(0.17 + (i % 9) * 0.012, 0.4, 0.2 + (i % 4) * 0.025);
      broadM.setColorAt(i, c);
      G.addCyl(x, z, 0.32 * s + 0.05, y, 7 * s, 'wood');
      G.mapShapes.circles.push({ x, z, r: 2.6 * s, color: '#3a4626', tree: true });
    });
    [trunks, pineM, broadM].forEach((im) => {
      im.castShadow = true;
      im.receiveShadow = true;
      im.frustumCulled = false;
      G.scene.add(im);
    });
    // --- cespugli
    const bushG = new THREE.IcosahedronGeometry(1, 1);
    bushG.translate(0, 0.5, 0);
    const bushM = new THREE.InstancedMesh(bushG, M.foliage, bushes.length);
    bushes.forEach(([x, y, z, s, r], i) => {
      bushM.setMatrixAt(i, G.mat4(x, y - 0.2, z, 0, r, 0, s * 1.3, s * 0.8, s * 1.2));
      c.setHSL(0.2 + (i % 5) * 0.015, 0.35, 0.18 + (i % 3) * 0.03);
      bushM.setColorAt(i, c);
    });
    bushM.castShadow = true;
    bushM.receiveShadow = true;
    bushM.frustumCulled = false;
    G.scene.add(bushM);
    // --- rocce
    const rockG = new THREE.DodecahedronGeometry(1, 0);
    const rockM = new THREE.InstancedMesh(rockG, M.rock, rocks.length);
    rocks.forEach(([x, y, z, s, r], i) => {
      rockM.setMatrixAt(i, G.mat4(x, y + s * 0.15, z, r * 0.3, r, r * 0.2, s * 1.2, s * 0.8, s));
      c.setHSL(0.1, 0.05, 0.3 + (i % 5) * 0.03);
      rockM.setColorAt(i, c);
      if (s > 0.9) G.addCyl(x, z, s * 0.9, y - 1, s * 0.95 + 1, 'concrete');
    });
    rockM.castShadow = true;
    rockM.receiveShadow = true;
    rockM.frustumCulled = false;
    G.scene.add(rockM);
    // --- ciuffi d'erba (3 lame incrociate)
    const blades = [];
    for (let k = 0; k < 3; k++) {
      const pg = new THREE.PlaneGeometry(0.9, 0.7);
      pg.translate(0, 0.35, 0);
      blades.push({ geo: pg, matrix: G.mat4(0, 0, 0, 0, (k * Math.PI) / 3, 0) });
    }
    const grassG = G.mergeGeos(blades);
    // normali verso l'alto → illuminazione uniforme e morbida
    const gn = grassG.attributes.normal;
    for (let i = 0; i < gn.count; i++) gn.setXYZ(i, 0, 1, 0);
    const gMat = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 1, alphaTest: 0.5, map: grassTex() });
    const grassM = new THREE.InstancedMesh(grassG, gMat, grass.length);
    grass.forEach(([x, y, z, s, r], i) => {
      grassM.setMatrixAt(i, G.mat4(x, y - 0.05, z, 0, r, 0, s, s, s));
      c.setHSL(0.18 + (i % 7) * 0.012, 0.4, 0.22 + (i % 5) * 0.03);
      grassM.setColorAt(i, c);
    });
    grassM.receiveShadow = true;
    grassM.frustumCulled = false;
    G.scene.add(grassM);
    G.grassMesh = grassM;
    G.forestDensity = (x, z) => G.fbm(x * 0.006 + 9, z * 0.006 + 4, 3);
  }
  function grassTex() {
    const cv = document.createElement('canvas');
    cv.width = 64;
    cv.height = 64;
    const x = cv.getContext('2d');
    const R = G.makeRng(31);
    for (let i = 0; i < 26; i++) {
      const bx = 4 + R() * 56, h = 30 + R() * 34;
      x.strokeStyle = `rgb(${120 + R() * 60},${140 + R() * 60},${70 + R() * 40})`;
      x.lineWidth = 2 + R() * 2;
      x.beginPath();
      x.moveTo(bx, 64);
      x.quadraticCurveTo(bx + (R() - 0.5) * 10, 64 - h / 2, bx + (R() - 0.5) * 20, 64 - h);
      x.stroke();
    }
    const t = new THREE.CanvasTexture(cv);
    t.encoding = THREE.sRGBEncoding;
    return t;
  }

  /* ====================================================== LINEE ELETTRICHE */
  function buildPowerLines() {
    const pts = [];
    const poles = [];
    for (let z = -580; z <= 580; z += 45) {
      if (Math.abs(z) < CITY + 20) continue;
      const x = 13, y = G.heightAt(x, z);
      poles.push([x, y, z]);
    }
    const poleM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.2, 9, 6), M.wood, poles.length);
    const armM = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6, 0.15, 0.15), M.wood, poles.length);
    poles.forEach(([x, y, z], i) => {
      poleM.setMatrixAt(i, G.mat4(x, y + 4.5, z));
      armM.setMatrixAt(i, G.mat4(x, y + 8.5, z));
      G.addCyl(x, z, 0.2, y, 9, 'wood');
      if (i > 0) {
        const [px, py, pz] = poles[i - 1];
        if (Math.abs(pz - z) > 50) return;
        for (const off of [-1.2, 1.2]) {
          // catenaria approssimata con segmenti
          const n = 8;
          for (let k = 0; k < n; k++) {
            const t0 = k / n, t1 = (k + 1) / n;
            const sag = (t) => -Math.sin(t * Math.PI) * 1.2;
            pts.push(px + off, G.lerp(py, y, t0) + 8.55 + sag(t0), G.lerp(pz, z, t0));
            pts.push(px + off, G.lerp(py, y, t1) + 8.55 + sag(t1), G.lerp(pz, z, t1));
          }
        }
      }
    });
    [poleM, armM].forEach((m) => { m.castShadow = true; m.frustumCulled = false; G.scene.add(m); });
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    G.scene.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x151515 })));
  }

  /* ================================================== CIELO / LUCI / GIORNO */
  function buildSky() {
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, bottom: { value: new THREE.Color() },
        sunDir: { value: new V(0, 1, 0) }, sunCol: { value: new THREE.Color() }, moonDir: { value: new V(0, -1, 0) },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: `
        uniform vec3 top, horizon, bottom, sunCol, sunDir, moonDir; varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = h > 0.0 ? mix(horizon, top, pow(clamp(h,0.0,1.0), 0.45)) : mix(horizon, bottom, pow(clamp(-h,0.0,1.0), 0.35));
          float s = max(dot(d, sunDir), 0.0);
          col += sunCol * (pow(s, 900.0) * 6.0 + pow(s, 14.0) * 0.35 + pow(s, 3.0) * 0.08);
          float m = max(dot(d, moonDir), 0.0);
          col += vec3(0.7,0.75,0.9) * pow(m, 1400.0) * 2.0 + vec3(0.1,0.12,0.2) * pow(m, 30.0) * 0.2;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1200, 32, 16), skyMat);
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    G.scene.add(sky);
    G.sky = sky;
    // stelle
    const sp = [];
    const R = G.makeRng(8);
    for (let i = 0; i < 1800; i++) {
      const u = R() * 2 - 1, a = R() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      if (u < 0.02) continue;
      sp.push(Math.cos(a) * r * 1100, u * 1100, Math.sin(a) * r * 1100);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    G.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    G.stars.frustumCulled = false;
    G.scene.add(G.stars);
    // nuvole
    const cm = new THREE.MeshBasicMaterial({ map: G.tex.clouds, transparent: true, opacity: 0.85, depthWrite: false, fog: false });
    cm.map.repeat.set(3, 3);
    const clouds = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), cm);
    clouds.rotation.x = Math.PI / 2;
    clouds.position.y = 320;
    clouds.renderOrder = -5;
    G.scene.add(clouds);
    G.clouds = clouds;

    // luci
    G.hemi = new THREE.HemisphereLight(0xbcc8d6, 0x4a4232, 0.8);
    G.scene.add(G.hemi);
    const sun = new THREE.DirectionalLight(0xfff0dd, 2.6);
    sun.castShadow = true;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -80;
    sc.right = sc.top = 80;
    sc.near = 10;
    sc.far = 500;
    G.scene.add(sun);
    G.scene.add(sun.target);
    G.sun = sun;
    G.scene.fog = new THREE.FogExp2(0xa9aea8, 0.0026);
  }

  // palette per il ciclo giorno/notte
  const C = (h) => new THREE.Color(h);
  const SKY = {
    day: { top: C(0x35649e), hor: C(0x9fadb6), bot: C(0x5d6058), fog: C(0x939da0), sun: C(0xfff2de), hemiS: C(0xc2d0e0), hemiG: C(0x524a38) },
    dusk: { top: C(0x2f3f66), hor: C(0xe0915c), bot: C(0x4a3d33), fog: C(0xb08268), sun: C(0xff9a55), hemiS: C(0xa08aa0), hemiG: C(0x3a2e26) },
    night: { top: C(0x03060d), hor: C(0x0d1420), bot: C(0x050608), fog: C(0x0b1018), sun: C(0x6d86c0), hemiS: C(0x26324a), hemiG: C(0x0c0c10) },
  };
  const tc = { top: new THREE.Color(), hor: new THREE.Color(), bot: new THREE.Color(), fog: new THREE.Color(), sun: new THREE.Color(), hemiS: new THREE.Color(), hemiG: new THREE.Color() };
  function mix3(k, a, b, t) { tc[k].copy(a[k]).lerp(b[k], t); }
  G.nightFactor = 0;
  G.sunDir = new V(0.5, 0.7, -0.3).normalize();
  G.updateSky = (hour) => {
    const a = ((hour - 6) / 12) * Math.PI;
    const sd = G.sunDir.set(Math.cos(a), Math.sin(a), -0.38).normalize();
    const elev = sd.y;
    const dayT = G.smooth(-0.05, 0.35, elev);   // 0 notte → 1 giorno
    const duskT = 1 - G.smooth(0.0, 0.3, Math.abs(elev - 0.05)); // picco all'alba/tramonto
    for (const k in tc) {
      mix3(k, SKY.night, SKY.day, dayT);
      tc[k].lerp(SKY.dusk[k], duskT * 0.75);
    }
    const u = G.sky.material.uniforms;
    u.top.value.copy(tc.top);
    u.horizon.value.copy(tc.hor);
    u.bottom.value.copy(tc.bot);
    u.sunDir.value.copy(sd);
    u.sunCol.value.copy(tc.sun).multiplyScalar(elev > -0.1 ? 1 : 0);
    u.moonDir.value.copy(sd).negate();
    G.scene.fog.color.copy(tc.fog);
    G.scene.fog.density = G.lerp(0.0034, 0.0024, dayT) + duskT * 0.0006;
    G.hemi.color.copy(tc.hemiS);
    G.hemi.groundColor.copy(tc.hemiG);
    G.hemi.intensity = G.lerp(0.35, 0.7, dayT);
    // di notte la luce direzionale diventa la luna (direzione opposta)
    const moon = elev < -0.02;
    G.sunLightDir = moon ? sd.clone().negate() : sd.clone();
    if (G.sunLightDir.y < 0.15) G.sunLightDir.y = 0.15;
    G.sunLightDir.normalize();
    G.sun.color.copy(tc.sun);
    G.sun.intensity = moon ? 0.35 : G.lerp(0.25, 2.4, G.smooth(0, 0.35, elev));
    G.nightFactor = 1 - G.smooth(-0.12, 0.12, elev);
    G.stars.material.opacity = G.smooth(0.3, 0.9, G.nightFactor);
    G.clouds.material.color.copy(tc.hor).lerp(new THREE.Color(1, 1, 1), dayT * 0.6);
    G.clouds.material.opacity = G.lerp(0.35, 0.8, dayT);
    for (const m of M.facades) m.emissiveIntensity = G.nightFactor * 1.1;
    M.lampGlow.emissiveIntensity = G.nightFactor * 3;
    if (G.lampGlow) G.lampGlow.opacity = G.nightFactor * 0.7;
    G.renderer.toneMappingExposure = G.lerp(1.35, 0.92, dayT);
  };
  G.updateWorldFx = (camPos) => {
    G.sky.position.copy(camPos);
    G.stars.position.copy(camPos);
    G.clouds.position.x = camPos.x;
    G.clouds.position.z = camPos.z;
    G.clouds.material.map.offset.x += G.dt * 0.0012;
    G.clouds.material.map.offset.y += G.dt * 0.0005;
    // ombre che seguono il giocatore (agganciate alla griglia dei texel per evitare sfarfallio)
    const L = G.sunLightDir || G.sunDir;
    const snap = 160 / G.sun.shadow.mapSize.x;
    const tx = Math.round(camPos.x / snap) * snap, tz = Math.round(camPos.z / snap) * snap;
    G.sun.target.position.set(tx, camPos.y, tz);
    G.sun.position.set(tx + L.x * 250, camPos.y + L.y * 250, tz + L.z * 250);
    if (G.flag) { // bandiera al vento
      const p = G.flag.geometry.attributes.position;
      if (!G.flag.userData.base) G.flag.userData.base = Float32Array.from(p.array);
      const b = G.flag.userData.base;
      for (let i = 0; i < p.count; i++) {
        const x = b[i * 3] + 1.2;
        p.setZ(i, Math.sin(G.time * 5 + x * 2.5) * 0.12 * x);
      }
      p.needsUpdate = true;
    }
    if (G.towerLight) G.towerLight.visible = Math.sin(G.time * 3) > 0;
  };

  /* ============================================================== MAPPA 2D */
  function buildMapCanvas() {
    const S = 1024;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const x = cv.getContext('2d');
    const img = x.createImageData(S, S);
    const k = (HALF * 2) / S;
    for (let py = 0; py < S; py++) {
      for (let px = 0; px < S; px++) {
        const wx = -HALF + px * k, wz = -HALF + py * k;
        const h = G.heightAt(wx, wz);
        const hx = G.heightAt(wx + 2, wz) - h, hz = G.heightAt(wx, wz + 2) - h;
        const shade = G.clamp(1 - (hx + hz) * 0.12, 0.6, 1.3);
        let r, g, b;
        if (h < G.WATER) { r = 40; g = 70; b = 85; }
        else {
          const t = G.clamp(h / 70, 0, 1);
          r = G.lerp(78, 120, t); g = G.lerp(88, 112, t); b = G.lerp(55, 90, t);
        }
        // curve di livello
        if (h > G.WATER && Math.abs((h % 10) - 5) < 0.25) { r *= 0.8; g *= 0.8; b *= 0.8; }
        const i = (py * S + px) * 4;
        img.data[i] = r * shade; img.data[i + 1] = g * shade; img.data[i + 2] = b * shade; img.data[i + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
    const m = (v) => (v + HALF) / k;
    // alberi
    for (const c of G.mapShapes.circles) {
      x.fillStyle = c.color;
      x.beginPath();
      x.arc(m(c.x), m(c.z), Math.max(1, c.r / k), 0, 6.283);
      x.fill();
    }
    // città
    x.fillStyle = '#6d6b64';
    x.fillRect(m(-CITY - 5), m(-CITY - 5), (CITY * 2 + 10) / k, (CITY * 2 + 10) / k);
    // strade
    x.lineCap = 'square';
    for (const r of G.roads) {
      x.strokeStyle = '#cfc8b0';
      x.lineWidth = r.w / k + 1.5;
      x.beginPath(); x.moveTo(m(r.x1), m(r.z1)); x.lineTo(m(r.x2), m(r.z2)); x.stroke();
    }
    for (const r of G.roads) {
      x.strokeStyle = '#2d2d2b';
      x.lineWidth = r.w / k - 0.5;
      x.beginPath(); x.moveTo(m(r.x1), m(r.z1)); x.lineTo(m(r.x2), m(r.z2)); x.stroke();
    }
    for (const rc of G.mapShapes.rects) {
      x.fillStyle = rc.color;
      x.fillRect(m(rc.x - rc.w / 2), m(rc.z - rc.d / 2), rc.w / k, rc.d / k);
      x.strokeStyle = 'rgba(0,0,0,0.5)';
      x.lineWidth = 1;
      x.strokeRect(m(rc.x - rc.w / 2), m(rc.z - rc.d / 2), rc.w / k, rc.d / k);
    }
    G.mapCanvas = cv;
    G.mapScale = k;
  }

  /* ================================================ BATCHING STATICO
     Fonde le mesh statiche con lo stesso materiale in blocchi da 120 m:
     centinaia di draw call in meno, mantenendo il frustum culling. */
  function batchStatics() {
    root.updateMatrixWorld(true);
    const groups = new Map();
    const remove = [];
    const wp = new V();
    root.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material) || o.userData.keep) return;
      wp.setFromMatrixPosition(o.matrixWorld);
      const k = o.material.uuid + '|' + Math.floor(wp.x / 120) + ',' + Math.floor(wp.z / 120);
      if (!groups.has(k)) groups.set(k, { mat: o.material, items: [], cast: false });
      const gr = groups.get(k);
      gr.items.push({ geo: o.geometry, matrix: o.matrixWorld.clone() });
      gr.cast = gr.cast || o.castShadow;
      remove.push(o);
    });
    for (const o of remove) o.parent.remove(o);
    for (const gr of groups.values()) {
      const m = new THREE.Mesh(G.mergeGeos(gr.items), gr.mat);
      m.castShadow = gr.cast;
      m.receiveShadow = true;
      root.add(m);
    }
  }

  /* ============================================================ BUILD */
  G.vehicleSpawns = [];
  G.buildWorld = async (progress) => {
    const step = async (label, p, fn) => {
      progress(label, p);
      await new Promise((r) => setTimeout(r, 16));
      fn();
    };
    root = new THREE.Group();
    await step('Generazione del terreno...', 0.12, () => { G.buildHeights(); makeMaterials(); });
    await step('Modellazione del paesaggio...', 0.25, buildTerrain);
    await step('Costruzione delle strade...', 0.33, buildRoads);
    await step('Costruzione della città...', 0.42, buildCity);
    await step('Base militare nemica...', 0.52, buildBase);
    await step('Villaggio e avamposto...', 0.6, () => { buildVillage(); buildOutpost(); buildRoadblocks(); buildRadioTower(); });
    await step('Vegetazione...', 0.72, () => { buildVegetation(); buildPowerLines(); flushInstances(); });
    await step('Cielo e illuminazione...', 0.82, buildSky);
    await step('Cartografia...', 0.9, buildMapCanvas);
    batchStatics();
    G.scene.add(root);
    // ottimizzazione: gli oggetti statici non aggiornano la matrice ogni frame
    root.traverse((o) => { o.updateMatrix(); o.matrixAutoUpdate = false; });
    root.updateMatrixWorld(true);
  };
})();
