'use strict';
/* =========================================================================
   EFFETTI: particelle (GPU points), traccianti, fori di proiettile,
   esplosioni, bossoli, luci lampo, scossa della telecamera.
   ========================================================================= */
G.fx = (function () {
  const V = THREE.Vector3;
  const MAX = 2500;

  function makeSystem(additive, tex) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(MAX * 3), col = new Float32Array(MAX * 4), size = new Float32Array(MAX), rot = new Float32Array(MAX);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('pcolor', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('psize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('prot', new THREE.BufferAttribute(rot, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, scale: { value: 600 }, fogColor: { value: new THREE.Color() }, fogDensity: { value: 0 } },
      vertexShader: `
        attribute vec4 pcolor; attribute float psize; attribute float prot;
        varying vec4 vCol; varying float vRot; varying float vFog;
        uniform float scale; uniform float fogDensity;
        void main(){
          vCol = pcolor; vRot = prot;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = psize * scale / max(-mv.z, 0.1);
          gl_Position = projectionMatrix * mv;
          float d = length(mv.xyz);
          vFog = 1.0 - exp(-fogDensity * fogDensity * d * d);
        }`,
      fragmentShader: `
        uniform sampler2D map; uniform vec3 fogColor;
        varying vec4 vCol; varying float vRot; varying float vFog;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float s = sin(vRot), co = cos(vRot);
          c = vec2(c.x*co - c.y*s, c.x*s + c.y*co) + 0.5;
          vec4 t = texture2D(map, c);
          vec4 col = vec4(vCol.rgb * t.rgb, vCol.a * t.a);
          ${additive ? 'col.rgb *= (1.0 - vFog); col.rgb *= col.a;' : 'col.rgb = mix(col.rgb, fogColor, vFog);'}
          if (col.a < 0.004) discard;
          gl_FragColor = col;
        }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    if (additive) {
      mat.blending = THREE.CustomBlending;
      mat.blendSrc = THREE.OneFactor;
      mat.blendDst = THREE.OneFactor;
    }
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = additive ? 3 : 2;
    G.scene.add(pts);
    const parts = [];
    return { geo, mat, pts, parts, pos, col, size, rot };
  }

  let add, norm;
  const bulletHoles = [];
  let holeIdx = 0;
  const tracers = [];
  const shells = [];
  let flashLight, boomLight;
  let shake = 0;
  const lights = [];

  function init() {
    add = makeSystem(true, G.tex.soft);
    norm = makeSystem(false, G.tex.smoke);
    // pool fori proiettile
    const hm = new THREE.MeshBasicMaterial({ map: G.tex.hole, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const hg = new THREE.PlaneGeometry(0.22, 0.22);
    for (let i = 0; i < 160; i++) {
      const m = new THREE.Mesh(hg, hm);
      m.visible = false;
      G.scene.add(m);
      bulletHoles.push(m);
    }
    // traccianti
    const tg = new THREE.CylinderGeometry(0.02, 0.02, 1, 4, 1, true);
    tg.translate(0, 0.5, 0);
    tg.rotateX(Math.PI / 2);
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: 0xffd28a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      m.visible = false;
      G.scene.add(m);
      tracers.push({ m, life: 0, from: new V(), to: new V(), speed: 0, t: 0 });
    }
    // bossoli
    const sg = new THREE.CylinderGeometry(0.012, 0.012, 0.05, 6);
    const sm = G.std(0xc9a040, 0.3, 0.9);
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(sg, sm);
      m.visible = false;
      G.scene.add(m);
      shells.push({ m, v: new V(), life: 0, spin: new V() });
    }
    flashLight = new THREE.PointLight(0xffb060, 0, 12, 2);
    G.scene.add(flashLight);
    boomLight = new THREE.PointLight(0xff8a3a, 0, 60, 2);
    G.scene.add(boomLight);
  }

  /* ---- particelle */
  function spawn(sys, p) {
    if (sys.parts.length >= MAX) sys.parts.shift();
    sys.parts.push(p);
  }
  // opts: pos, vel, life, size, grow, color [r,g,b], alpha, drag, grav, rot
  function particle(additive, o) {
    spawn(additive ? add : norm, {
      p: o.pos.clone(), v: o.vel ? o.vel.clone() : new V(), life: o.life, max: o.life,
      size: o.size, grow: o.grow || 0, c: o.color || [1, 1, 1], a: o.alpha ?? 1,
      drag: o.drag ?? 1, grav: o.grav ?? 0, r: Math.random() * 6.28, rv: o.rv ?? (Math.random() - 0.5) * 1.5,
      fadeIn: o.fadeIn || 0,
    });
  }
  const rv = (s) => new V((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s);

  function updateSystem(sys, dt) {
    const P = sys.parts;
    let n = 0;
    for (let i = 0; i < P.length; i++) {
      const q = P[i];
      q.life -= dt;
      if (q.life <= 0) continue;
      q.v.y -= q.grav * dt;
      if (q.drag !== 1) q.v.multiplyScalar(Math.pow(q.drag, dt));
      q.p.addScaledVector(q.v, dt);
      q.size += q.grow * dt;
      q.r += q.rv * dt;
      P[n++] = q;
    }
    P.length = n;
    for (let i = 0; i < n; i++) {
      const q = P[i];
      const t = q.life / q.max;
      let a = q.a * Math.min(1, t * 2.5);
      if (q.fadeIn) a *= Math.min(1, (1 - t) / q.fadeIn);
      sys.pos[i * 3] = q.p.x; sys.pos[i * 3 + 1] = q.p.y; sys.pos[i * 3 + 2] = q.p.z;
      sys.col[i * 4] = q.c[0]; sys.col[i * 4 + 1] = q.c[1]; sys.col[i * 4 + 2] = q.c[2]; sys.col[i * 4 + 3] = a;
      sys.size[i] = q.size;
      sys.rot[i] = q.r;
    }
    sys.geo.setDrawRange(0, n);
    for (const k of ['position', 'pcolor', 'psize', 'prot']) sys.geo.attributes[k].needsUpdate = true;
    sys.mat.uniforms.scale.value = G.renderer.domElement.height / (2 * Math.tan((G.camera.fov * Math.PI) / 360));
    sys.mat.uniforms.fogColor.value.copy(G.scene.fog.color);
    sys.mat.uniforms.fogDensity.value = G.scene.fog.density;
  }

  /* ---- effetti composti */
  function impact(point, normal, mat) {
    const n = normal || new V(0, 1, 0);
    if (mat === 'water') {
      for (let i = 0; i < 8; i++) particle(false, { pos: point, vel: new V((Math.random() - 0.5) * 2, 3 + Math.random() * 3, (Math.random() - 0.5) * 2), life: 0.7, size: 0.35, grow: 0.8, color: [0.8, 0.85, 0.9], alpha: 0.7, grav: 9 });
      G.audio.splash(point);
      return;
    }
    if (mat === 'flesh') {
      for (let i = 0; i < 6; i++) particle(false, { pos: point, vel: n.clone().multiplyScalar(1.5).add(rv(2)), life: 0.45, size: 0.18, grow: 0.5, color: [0.35, 0.02, 0.02], alpha: 0.9, grav: 6 });
      return;
    }
    const dusty = mat === 'terrain' || mat === 'sand' || mat === 'wood' || mat === 'concrete';
    const dc = mat === 'terrain' || mat === 'sand' ? [0.45, 0.38, 0.28] : mat === 'wood' ? [0.5, 0.4, 0.28] : [0.6, 0.58, 0.55];
    if (dusty) {
      for (let i = 0; i < 4; i++) particle(false, { pos: point.clone().addScaledVector(n, 0.05), vel: n.clone().multiplyScalar(1 + Math.random() * 2).add(rv(1)), life: 0.9 + Math.random() * 0.5, size: 0.25, grow: 1.2, color: dc, alpha: 0.6, drag: 0.2, grav: 0.3 });
      for (let i = 0; i < 5; i++) particle(false, { pos: point, vel: n.clone().multiplyScalar(3).add(rv(4)), life: 0.5, size: 0.05, color: [0.2, 0.18, 0.15], alpha: 1, grav: 12 });
    }
    if (mat === 'metal' || mat === 'concrete' || mat === 'vehicle') {
      for (let i = 0; i < 7; i++) particle(true, { pos: point, vel: n.clone().multiplyScalar(3).add(rv(7)), life: 0.25 + Math.random() * 0.2, size: 0.07, color: [1, 0.75, 0.35], grav: 9 });
    }
    G.audio.impact(point, mat === 'terrain' || mat === 'sand');
    if (mat !== 'terrain' && mat !== 'vehicle') decal(point, n);
  }
  function decal(point, n) {
    const m = bulletHoles[holeIdx++ % bulletHoles.length];
    m.visible = true;
    m.position.copy(point).addScaledVector(n, 0.012);
    m.lookAt(point.x + n.x, point.y + n.y, point.z + n.z);
    m.rotateZ(Math.random() * 6.28);
    const s = 0.8 + Math.random() * 0.5;
    m.scale.set(s, s, s);
  }
  function tracer(from, to, speed = 700) {
    const t = tracers.find((x) => x.life <= 0) || tracers[0];
    t.from.copy(from);
    t.to.copy(to);
    t.len = from.distanceTo(to);
    t.t = 0;
    t.speed = speed;
    t.life = t.len / speed + 0.02;
    t.m.visible = true;
  }
  function muzzleLight(pos) {
    flashLight.position.copy(pos);
    flashLight.intensity = 3;
    flashLight.userData.t = 0.05;
  }
  function muzzleSmoke(pos, dir) {
    particle(false, { pos, vel: dir.clone().multiplyScalar(1.2).add(new V(0, 0.4, 0)), life: 0.8, size: 0.12, grow: 0.7, color: [0.7, 0.7, 0.7], alpha: 0.25, drag: 0.3 });
  }
  function shell(pos, vel) {
    const s = shells.find((x) => x.life <= 0) || shells[0];
    s.m.visible = true;
    s.m.position.copy(pos);
    s.v.copy(vel);
    s.spin.set(Math.random() * 20, Math.random() * 20, Math.random() * 20);
    s.life = 2.5;
    s.bounced = false;
  }
  function explosion(pos, scale = 1) {
    boomLight.position.copy(pos).y += 1.5;
    boomLight.intensity = 25 * scale;
    boomLight.userData.t = 0.35;
    for (let i = 0; i < 26 * scale; i++) // palla di fuoco
      particle(true, { pos: pos.clone().add(rv(1.5 * scale)), vel: rv(10 * scale).add(new V(0, 4, 0)), life: 0.5 + Math.random() * 0.5, size: (1.2 + Math.random() * 1.5) * scale, grow: 3 * scale, color: [1, 0.55 + Math.random() * 0.2, 0.2], drag: 0.05 });
    for (let i = 0; i < 20 * scale; i++) // fumo nero
      particle(false, { pos: pos.clone().add(rv(2 * scale)), vel: rv(5 * scale).add(new V(0, 3 + Math.random() * 3, 0)), life: 3 + Math.random() * 3, size: (1.5 + Math.random()) * scale, grow: 2.2 * scale, color: [0.1, 0.09, 0.08], alpha: 0.8, drag: 0.4, grav: -0.3, fadeIn: 0.1 });
    for (let i = 0; i < 30 * scale; i++) // schegge incandescenti
      particle(true, { pos, vel: rv(26 * scale).add(new V(0, 8, 0)), life: 0.8 + Math.random() * 0.8, size: 0.12, color: [1, 0.7, 0.3], grav: 14, drag: 0.6 });
    for (let i = 0; i < 12 * scale; i++) // detriti/terra
      particle(false, { pos, vel: rv(14 * scale).add(new V(0, 10, 0)), life: 1.4, size: 0.2, color: [0.2, 0.17, 0.13], alpha: 1, grav: 16 });
    // bruciatura a terra
    const gy = G.heightAt(pos.x, pos.z);
    if (Math.abs(pos.y - gy) < 3) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(6 * scale, 6 * scale), new THREE.MeshBasicMaterial({ map: G.tex.scorch, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
      s.rotation.x = -Math.PI / 2;
      s.position.set(pos.x, gy + 0.1, pos.z);
      G.scene.add(s);
    }
    G.audio.explosion(pos, scale);
    const d = G.camera.position.distanceTo(pos);
    addShake(G.clamp((1 - d / (60 * scale)) * 1.4, 0, 1.4));
  }
  function fire(pos, intensity = 1) { // fuoco persistente (veicoli distrutti)
    if (Math.random() < 0.6 * intensity)
      particle(true, { pos: pos.clone().add(rv(1)), vel: new V((Math.random() - 0.5), 2 + Math.random() * 2, (Math.random() - 0.5)), life: 0.6, size: 0.9 * intensity, grow: -0.5, color: [1, 0.5, 0.15], drag: 0.5 });
    if (Math.random() < 0.35 * intensity)
      particle(false, { pos: pos.clone().add(new V(0, 1, 0)), vel: new V((Math.random() - 0.5) * 0.5 + 1, 2.5 + Math.random(), (Math.random() - 0.5) * 0.5), life: 4, size: 1, grow: 1.5, color: [0.08, 0.08, 0.08], alpha: 0.55, drag: 0.8, fadeIn: 0.1 });
  }
  function smoke(pos, dark = 0.4, amount = 1) {
    if (Math.random() < 0.4 * amount)
      particle(false, { pos, vel: new V(0.6, 1.5 + Math.random(), (Math.random() - 0.5) * 0.4), life: 2.5, size: 0.5, grow: 1, color: [dark, dark, dark], alpha: 0.5, drag: 0.7, fadeIn: 0.15 });
  }
  function dust(pos, vel, color = [0.5, 0.43, 0.33], size = 0.6) {
    particle(false, { pos, vel, life: 1.4, size, grow: 1.8, color, alpha: 0.35, drag: 0.4, fadeIn: 0.1 });
  }
  function addShake(v) { shake = Math.min(2, shake + v); }

  function update(dt) {
    updateSystem(add, dt);
    updateSystem(norm, dt);
    for (const t of tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.t += t.speed * dt;
      const segLen = Math.min(12, t.len);
      const head = Math.min(t.t, t.len);
      const tail = Math.max(0, head - segLen);
      const dir = new V().subVectors(t.to, t.from).normalize();
      t.m.position.copy(t.from).addScaledVector(dir, tail);
      t.m.lookAt(t.m.position.clone().add(dir));
      t.m.scale.set(1, 1, Math.max(0.01, head - tail));
      if (t.life <= 0 || head >= t.len) { t.life = 0; t.m.visible = false; }
    }
    for (const s of shells) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.v.y -= 12 * dt;
      s.m.position.addScaledVector(s.v, dt);
      s.m.rotation.x += s.spin.x * dt;
      s.m.rotation.y += s.spin.y * dt;
      const gy = G.heightAt(s.m.position.x, s.m.position.z);
      if (s.m.position.y < gy + 0.02) {
        s.m.position.y = gy + 0.02;
        if (!s.bounced && s.v.y < -1) { G.audio.click(5000 + Math.random() * 2000, 0.05, 0, 0.03); s.bounced = true; }
        s.v.multiplyScalar(0.3);
        s.v.y = Math.abs(s.v.y) * 0.3;
        s.spin.multiplyScalar(0.5);
      }
      if (s.life <= 0) s.m.visible = false;
    }
    for (const L of [flashLight, boomLight]) {
      if (L.intensity > 0) {
        L.userData.t -= dt;
        if (L.userData.t <= 0) L.intensity = Math.max(0, L.intensity - dt * (L === boomLight ? 80 : 200));
      }
    }
    shake = Math.max(0, shake - dt * 2.2);
  }

  return {
    init, update, particle, impact, decal, tracer, muzzleLight, muzzleSmoke, shell, explosion, fire, smoke, dust, addShake,
    get shake() { return shake; },
  };
})();
