'use strict';
/* =========================================================================
   HUD: bussola, minimappa, mappa tattica, salute, munizioni, mirino dinamico,
   hitmarker, indicatori di danno, killfeed, notifiche, HUD veicolo,
   cannocchiale, marker obiettivo 3D, schermata statistiche.
   ========================================================================= */
G.hud = (function () {
  const V = THREE.Vector3;
  const $ = (id) => document.getElementById(id);
  let el = {};
  let compassCtx, miniCtx, mapCtx;
  let hitT = 0, hitKill = false;
  const dmgInds = [];
  let fpsAcc = 0, fpsN = 0, fpsShow = 0;
  let spottedT = 0;
  G.waypoint = null;
  G.mapOpen = false;

  function init() {
    el = {
      hud: $('hud'), health: $('healthFill'), healthTxt: $('healthTxt'), stamina: $('staminaFill'),
      wname: $('wname'), ammo: $('ammo'), reserve: $('reserve'), mode: $('fmode'), gren: $('grenades'),
      cross: $('crosshair'), hit: $('hitmarker'), vign: $('vignette'), blood: $('blood'), prompt: $('prompt'),
      obj: $('objective'), feed: $('killfeed'), notify: $('notify'), big: $('bigmsg'), score: $('score'),
      veh: $('vehHud'), vspeed: $('vspeed'), vgear: $('vgear'), vhp: $('vhpFill'), vname: $('vname'), vlights: $('vlights'),
      scope: $('scope'), fps: $('fps'), marker: $('objMarker'), markerDist: $('objDist'), wmarker: $('wpMarker'), wmarkerDist: $('wpDist'),
      map: $('mapScreen'), tab: $('tabScreen'), tabStats: $('tabStats'), tabObj: $('tabObj'), dmgWrap: $('dmgDirs'),
      clock: $('clock'), weaponPanel: $('weaponPanel'), spotted: $('spotted'), reloadHint: $('reloadHint'),
      breath: $('breath'), zone: $('zoneName'), flash: $('flashIcon'),
    };
    compassCtx = $('compass').getContext('2d');
    miniCtx = $('minimap').getContext('2d');
    mapCtx = $('mapCanvas').getContext('2d');
    $('mapCanvas').addEventListener('mousedown', (e) => {
      const r = e.target.getBoundingClientRect();
      const s = mapView();
      const wx = (e.clientX - r.left - s.ox) / s.k - G.HALF, wz = (e.clientY - r.top - s.oy) / s.k - G.HALF;
      if (e.button === 2) G.waypoint = null;
      else if (Math.abs(wx) < G.HALF && Math.abs(wz) < G.HALF) { G.waypoint = new V(wx, G.heightAt(wx, wz), wz); G.audio.ui(); }
      drawBigMap();
    });
  }

  /* ---------------------------------------------------------- utilità */
  const heading = (yaw) => ((-yaw * 180) / Math.PI + 720) % 360;
  const bearing = (from, to) => ((Math.atan2(to.x - from.x, -(to.z - from.z)) * 180) / Math.PI + 360) % 360;
  function playerPos() { return G.player.vehicle ? G.player.vehicle.pos : G.player.pos; }
  function viewYaw() {
    // yaw della visuale in stile giocatore (0 = nord)
    const f = new V(0, 0, -1).applyQuaternion(G.camera.quaternion);
    return Math.atan2(-f.x, -f.z);
  }

  /* ---------------------------------------------------------- bussola */
  function drawCompass(yaw) {
    const c = compassCtx, W = 560, H = 46;
    c.clearRect(0, 0, W, H);
    const hd = heading(yaw);
    const pxPerDeg = 3.4;
    c.textAlign = 'center';
    c.font = '600 13px Rajdhani, Oswald, sans-serif';
    for (let d = -90; d <= 90; d += 5) {
      const deg = Math.round(hd / 5) * 5 + d;
      const x = W / 2 + (deg - hd) * pxPerDeg;
      if (x < 0 || x > W) continue;
      const dd = ((deg % 360) + 360) % 360;
      const fade = 1 - Math.abs(x - W / 2) / (W / 2);
      c.globalAlpha = fade * 0.9;
      c.fillStyle = '#fff';
      if (dd % 45 === 0) {
        const lbl = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SO', 270: 'O', 315: 'NO' }[dd];
        c.font = dd % 90 === 0 ? '700 17px Rajdhani, Oswald, sans-serif' : '600 13px Rajdhani, Oswald, sans-serif';
        c.fillStyle = dd === 0 ? '#e8c547' : '#fff';
        c.fillText(lbl, x, 20);
        c.fillRect(x - 1, 26, 2, 10);
      } else if (dd % 15 === 0) {
        c.font = '500 11px Rajdhani, Oswald, sans-serif';
        c.fillText(dd, x, 18);
        c.fillRect(x - 0.5, 28, 1, 7);
      } else c.fillRect(x - 0.5, 31, 1, 4);
    }
    c.globalAlpha = 1;
    // marker obiettivo e waypoint
    const pp = playerPos();
    const markers = [];
    const m = G.missions.current;
    if (m && m.pos) markers.push({ p: m.pos, col: '#e8c547', shape: 'diamond' });
    if (G.waypoint) markers.push({ p: G.waypoint, col: '#5fd3ff', shape: 'drop' });
    for (const mk of markers) {
      let delta = bearing(pp, mk.p) - hd;
      delta = ((delta + 540) % 360) - 180;
      const x = G.clamp(W / 2 + delta * pxPerDeg, 8, W - 8);
      c.fillStyle = mk.col;
      c.beginPath();
      if (mk.shape === 'diamond') { c.moveTo(x, 36); c.lineTo(x + 6, 41); c.lineTo(x, 46); c.lineTo(x - 6, 41); }
      else { c.arc(x, 41, 4.5, 0, 6.28); }
      c.fill();
    }
    // nemici che sparano (rossi)
    for (const e of G.enemies.list) {
      if (e.dead || !(G.time - (e.lastShot || -99) < 1.5)) continue;
      if (e.pos.distanceTo(pp) > 150) continue;
      let delta = bearing(pp, e.pos) - hd;
      delta = ((delta + 540) % 360) - 180;
      if (Math.abs(delta) > 80) continue;
      c.fillStyle = '#ff3b30';
      c.fillRect(W / 2 + delta * pxPerDeg - 2, 2, 4, 4);
    }
    c.fillStyle = '#e8c547';
    c.beginPath();
    c.moveTo(W / 2 - 6, 0); c.lineTo(W / 2 + 6, 0); c.lineTo(W / 2, 7);
    c.fill();
    $('heading').textContent = Math.round(hd).toString().padStart(3, '0');
  }

  /* ---------------------------------------------------------- minimappa */
  function drawMini(yaw) {
    const c = miniCtx, S = 210, R = S / 2;
    const pp = playerPos();
    const inVeh = !!G.player.vehicle;
    const worldR = inVeh ? 200 : 110;
    const k = R / worldR; // pixel per metro
    c.clearRect(0, 0, S, S);
    c.save();
    c.beginPath();
    c.arc(R, R, R - 2, 0, 6.283);
    c.clip();
    c.fillStyle = '#1b1e18';
    c.fillRect(0, 0, S, S);
    c.translate(R, R);
    c.rotate(yaw);
    const mk = 1 / G.mapScale; // pixel della mappa per metro
    const sx = (pp.x + G.HALF) * mk, sz = (pp.z + G.HALF) * mk;
    c.globalAlpha = 0.95;
    c.drawImage(G.mapCanvas, sx - worldR * mk * 1.5, sz - worldR * mk * 1.5, worldR * mk * 3, worldR * mk * 3, -worldR * 1.5 * k, -worldR * 1.5 * k, worldR * 3 * k, worldR * 3 * k);
    c.globalAlpha = 1;
    const toM = (p) => [(p.x - pp.x) * k, (p.z - pp.z) * k];
    // casse munizioni
    for (const a of G.ammoCrates) {
      const [x, y] = toM(a.pos);
      if (x * x + y * y > R * R * 2.5) continue;
      c.fillStyle = '#e8c547';
      c.fillRect(x - 3, y - 3, 6, 6);
    }
    // veicoli
    for (const v of G.vehicles.list) {
      if (v === G.player.vehicle) continue;
      const [x, y] = toM(v.pos);
      if (x * x + y * y > R * R * 2.5) continue;
      c.save();
      c.translate(x, y);
      c.rotate(-v.yaw);
      c.fillStyle = v.dead ? '#555' : '#5fa8ff';
      c.fillRect((-v.def.W / 2) * k * 1.4, (-v.def.L / 2) * k * 1.4, v.def.W * k * 1.4, v.def.L * k * 1.4);
      c.restore();
    }
    // nemici: visibili quando sparano o se molto vicini (radar)
    for (const e of G.enemies.list) {
      if (e.dead) continue;
      const recent = G.time - (e.lastShot || -99) < 2.5;
      const d = e.pos.distanceTo(pp);
      if (!recent && d > 18) continue;
      const [x, y] = toM(e.pos);
      c.fillStyle = '#ff3b30';
      c.beginPath();
      c.arc(x, y, 3.5, 0, 6.283);
      c.fill();
    }
    // obiettivo
    const m = G.missions.current;
    const drawEdge = (p, col, star) => {
      let [x, y] = toM(p);
      const d = Math.hypot(x, y);
      if (d > R - 12) { x *= (R - 12) / d; y *= (R - 12) / d; }
      c.save();
      c.translate(x, y);
      c.rotate(-yaw);
      c.fillStyle = col;
      c.strokeStyle = '#000';
      c.beginPath();
      if (star) { c.moveTo(0, -7); c.lineTo(6, 0); c.lineTo(0, 7); c.lineTo(-6, 0); }
      else c.arc(0, 0, 5, 0, 6.283);
      c.closePath();
      c.fill();
      c.stroke();
      c.restore();
    };
    if (m && m.pos) drawEdge(m.pos, '#e8c547', true);
    if (G.waypoint) drawEdge(G.waypoint, '#5fd3ff', false);
    c.restore();
    // giocatore
    c.fillStyle = '#fff';
    c.beginPath();
    c.moveTo(R, R - 8); c.lineTo(R + 6, R + 6); c.lineTo(R, R + 3); c.lineTo(R - 6, R + 6);
    c.closePath();
    c.fill();
    // cono visivo
    const g = c.createRadialGradient(R, R, 0, R, R, 70);
    g.addColorStop(0, 'rgba(255,255,255,0.18)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(R, R);
    c.arc(R, R, 70, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55);
    c.fill();
    // bordo e punti cardinali
    c.strokeStyle = 'rgba(255,255,255,0.35)';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(R, R, R - 2, 0, 6.283);
    c.stroke();
    c.fillStyle = '#e8c547';
    c.font = '700 13px Rajdhani, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    // il nord ruota con la mappa: (0,-r) ruotato di yaw
    c.fillText('N', R + Math.sin(yaw) * (R - 11), R - Math.cos(yaw) * (R - 11));
  }

  /* ---------------------------------------------------------- mappa tattica */
  function mapView() {
    const cv = $('mapCanvas');
    const size = Math.min(cv.width, cv.height) - 20;
    const k = size / (G.HALF * 2);
    return { k, ox: (cv.width - size) / 2, oy: (cv.height - size) / 2, size };
  }
  function drawBigMap() {
    const cv = $('mapCanvas');
    cv.width = cv.clientWidth;
    cv.height = cv.clientHeight;
    const c = mapCtx;
    const s = mapView();
    c.fillStyle = '#0d0f0b';
    c.fillRect(0, 0, cv.width, cv.height);
    c.drawImage(G.mapCanvas, s.ox, s.oy, s.size, s.size);
    // griglia
    c.strokeStyle = 'rgba(255,255,255,0.08)';
    c.lineWidth = 1;
    c.font = '600 12px Rajdhani, sans-serif';
    c.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i <= 12; i++) {
      const p = i * (s.size / 12);
      c.beginPath(); c.moveTo(s.ox + p, s.oy); c.lineTo(s.ox + p, s.oy + s.size); c.stroke();
      c.beginPath(); c.moveTo(s.ox, s.oy + p); c.lineTo(s.ox + s.size, s.oy + p); c.stroke();
      if (i < 12) {
        c.fillText(String.fromCharCode(65 + i), s.ox + p + s.size / 24 - 3, s.oy + 14);
        c.fillText(i + 1, s.ox + 4, s.oy + p + s.size / 24 + 4);
      }
    }
    const P = (x, z) => [s.ox + (x + G.HALF) * s.k, s.oy + (z + G.HALF) * s.k];
    // nomi delle zone
    c.textAlign = 'center';
    for (const key in G.zones) {
      const z = G.zones[key];
      const [x, y] = P(z.x, z.z);
      c.font = '700 15px Rajdhani, sans-serif';
      c.fillStyle = 'rgba(0,0,0,0.6)';
      c.fillText(z.name.toUpperCase(), x + 1, y - z.r * s.k * 0.4 + 1);
      c.fillStyle = key === 'outpost' ? '#9fd356' : key === 'city' ? '#fff' : '#ff8a7a';
      c.fillText(z.name.toUpperCase(), x, y - z.r * s.k * 0.4);
    }
    for (const a of G.ammoCrates) { const [x, y] = P(a.pos.x, a.pos.z); c.fillStyle = '#e8c547'; c.fillRect(x - 3, y - 3, 6, 6); }
    for (const v of G.vehicles.list) {
      if (v.dead) continue;
      const [x, y] = P(v.pos.x, v.pos.z);
      c.fillStyle = '#5fa8ff';
      c.beginPath(); c.arc(x, y, 4, 0, 6.28); c.fill();
    }
    const m = G.missions.current;
    if (m && m.pos) {
      const [x, y] = P(m.pos.x, m.pos.z);
      c.fillStyle = '#e8c547';
      c.strokeStyle = '#000';
      c.beginPath(); c.moveTo(x, y - 10); c.lineTo(x + 8, y); c.lineTo(x, y + 10); c.lineTo(x - 8, y); c.closePath(); c.fill(); c.stroke();
    }
    if (G.waypoint) {
      const [x, y] = P(G.waypoint.x, G.waypoint.z);
      c.fillStyle = '#5fd3ff';
      c.beginPath(); c.arc(x, y, 7, 0, 6.28); c.fill();
      c.strokeStyle = '#000'; c.stroke();
    }
    // giocatore
    const pp = playerPos();
    const [px, py] = P(pp.x, pp.z);
    const yaw = viewYaw();
    c.save();
    c.translate(px, py);
    c.rotate(-yaw);
    c.fillStyle = '#fff';
    c.strokeStyle = '#000';
    c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -11); c.lineTo(8, 8); c.lineTo(0, 4); c.lineTo(-8, 8); c.closePath();
    c.stroke(); c.fill();
    c.restore();
    c.textAlign = 'left';
  }
  function toggleMap(open) {
    G.mapOpen = open;
    el.map.classList.toggle('show', open);
    if (open) {
      drawBigMap();
      document.exitPointerLock && document.exitPointerLock();
    } else if (G.state === 'playing') G.lockPointer();
  }

  /* ---------------------------------------------------------- marker 3D */
  const tmpV = new V();
  function placeMarker(node, distNode, p, hOff) {
    if (!p) { node.style.display = 'none'; return; }
    tmpV.set(p.x, (p.y || G.heightAt(p.x, p.z)) + hOff, p.z);
    const d = playerPos().distanceTo(tmpV);
    tmpV.project(G.camera);
    const behind = tmpV.z > 1;
    let x = (tmpV.x * 0.5 + 0.5) * innerWidth, y = (-tmpV.y * 0.5 + 0.5) * innerHeight;
    if (behind) { x = innerWidth - x; y = innerHeight - 40; }
    x = G.clamp(x, 40, innerWidth - 40);
    y = G.clamp(y, 60, innerHeight - 60);
    node.style.display = 'block';
    node.style.transform = `translate(${x}px, ${y}px)`;
    distNode.textContent = Math.round(d) + ' m';
    node.style.opacity = G.weapons.isScoped() ? 0.3 : 1;
  }

  /* ---------------------------------------------------------- update */
  let lastHp = 100;
  function update(dt) {
    const P = G.player, W = G.weapons, w = W.current();
    const yaw = viewYaw();
    drawCompass(yaw);
    drawMini(yaw);
    if (G.mapOpen) drawBigMap();
    // salute
    const hp = Math.max(0, P.health);
    el.health.style.width = hp + '%';
    el.health.classList.toggle('low', hp < 35);
    el.healthTxt.textContent = Math.ceil(hp);
    el.stamina.style.width = P.stamina * 100 + '%';
    el.stamina.parentNode.style.opacity = P.stamina < 0.99 ? 1 : 0;
    // vignetta danno
    const dmgA = G.clamp((100 - hp) / 100, 0, 1);
    el.blood.style.opacity = Math.pow(dmgA, 1.4) * 0.95;
    if (hp < lastHp - 0.5) el.vign.style.opacity = 1;
    lastHp = hp;
    el.vign.style.opacity = Math.max(0, parseFloat(el.vign.style.opacity || 0) - dt * 2);
    // armi
    el.wname.textContent = w.name;
    el.ammo.textContent = w.ammo;
    el.ammo.classList.toggle('low', w.ammo <= Math.ceil(w.mag * 0.25));
    el.reserve.textContent = w.reserveAmmo;
    el.mode.textContent = w.modes[w.modeIdx || 0];
    el.gren.textContent = W.grenades;
    el.reloadHint.style.display = w.ammo <= Math.ceil(w.mag * 0.25) && !W.reloading() && w.reserveAmmo > 0 && !P.vehicle ? 'block' : 'none';
    el.reloadHint.textContent = w.ammo === 0 ? 'RICARICA [R]' : 'MUNIZIONI SCARSE';
    if (w.reserveAmmo === 0 && w.ammo === 0) el.reloadHint.textContent = 'MUNIZIONI ESAURITE';
    el.weaponPanel.style.display = P.vehicle ? 'none' : 'block';
    el.flash.style.opacity = P.flashlight ? 1 : 0.25;
    // mirino dinamico
    const scoped = W.isScoped();
    el.scope.classList.toggle('show', !!scoped);
    el.breath.style.display = scoped ? 'block' : 'none';
    const showCross = !P.vehicle && !P.dead && P.ads < 0.5 && !(P.sprint && W.state.sprintBlend > 0.5);
    el.cross.style.opacity = showCross ? 1 : 0;
    const sp = W.spread();
    const px = (Math.tan(sp) * (innerHeight / 2)) / Math.tan((G.camera.fov * Math.PI) / 360);
    el.cross.style.setProperty('--gap', 5 + px + 'px');
    el.cross.style.setProperty('--cc', G.settings.crosshairColor);
    // hitmarker
    hitT -= dt;
    el.hit.style.opacity = hitT > 0 ? Math.min(1, hitT * 6) : 0;
    el.hit.classList.toggle('kill', !!hitKill);
    // indicatori di danno
    for (let i = dmgInds.length - 1; i >= 0; i--) {
      const d = dmgInds[i];
      d.t -= dt;
      if (d.t <= 0) { d.el.remove(); dmgInds.splice(i, 1); continue; }
      let ang = 0;
      if (d.from) {
        const pp = playerPos();
        ang = ((bearing(pp, d.from) - heading(yaw)) * Math.PI) / 180;
      }
      d.el.style.transform = `translate(-50%,-50%) rotate(${ang}rad)`;
      d.el.style.opacity = Math.min(1, d.t);
    }
    // interazione
    el.prompt.style.display = G.promptText ? 'block' : 'none';
    if (G.promptText) el.prompt.innerHTML = G.promptText;
    // obiettivo
    el.obj.textContent = G.missions.text();
    el.score.textContent = P.score;
    // veicolo
    const v = P.vehicle;
    el.veh.style.display = v ? 'block' : 'none';
    if (v) {
      const kmh = Math.round(Math.hypot(v.vel.x, v.vel.z) * 3.6);
      el.vspeed.textContent = kmh;
      el.vgear.textContent = v.gear;
      el.vhp.style.width = (v.hp / v.def.hp) * 100 + '%';
      el.vhp.classList.toggle('low', v.hp < v.def.hp * 0.35);
      el.vname.textContent = v.def.name;
      el.vlights.style.opacity = v.lightsOn ? 1 : 0.3;
    }
    // marker 3D
    const m = G.missions.current;
    placeMarker(el.marker, el.markerDist, m && m.pos ? m.pos : null, 3);
    placeMarker(el.wmarker, el.wmarkerDist, G.waypoint, 2);
    // orologio
    const hr = G.hour;
    el.clock.textContent = String(Math.floor(hr)).padStart(2, '0') + ':' + String(Math.floor((hr % 1) * 60)).padStart(2, '0');
    // FPS
    fpsAcc += dt;
    fpsN++;
    if (fpsAcc > 0.5) { fpsShow = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
    el.fps.style.display = G.settings.showFps ? 'block' : 'none';
    el.fps.textContent = fpsShow + ' FPS';
    // avviso "sei stato individuato"
    spottedT -= dt;
    el.spotted.style.opacity = spottedT > 0 ? Math.min(1, spottedT) : 0;
    // zona corrente
    const pp = playerPos();
    let zn = 'Territorio Aperto';
    for (const k in G.zones) { const z = G.zones[k]; if (Math.hypot(pp.x - z.x, pp.z - z.z) < z.r + 15) zn = z.name; }
    if (el.zone.textContent !== zn) {
      el.zone.textContent = zn;
      el.zone.classList.remove('flash');
      void el.zone.offsetWidth;
      el.zone.classList.add('flash');
    }
    // schede
    if (G.wasPressed('KeyM') && !P.dead) toggleMap(!G.mapOpen);
    const tab = !!G.keys.Tab;
    el.tab.classList.toggle('show', tab);
    if (tab) drawTab();
  }

  function drawTab() {
    const P = G.player;
    const acc = P.shotsFired ? Math.round((P.shotsHit / P.shotsFired) * 100) : 0;
    const t = Math.floor(G.playTime);
    el.tabStats.innerHTML = [
      ['Punteggio', P.score], ['Uccisioni', P.kills], ['Colpi alla testa', P.headshots], ['Morti', P.deaths],
      ['K/D', (P.kills / Math.max(1, P.deaths)).toFixed(2)], ['Precisione', acc + '%'],
      ['Tempo di gioco', `${Math.floor(t / 60)}m ${t % 60}s`], ['Nemici attivi', G.enemies.list.filter((e) => !e.dead).length],
    ].map(([a, b]) => `<div class="row"><span>${a}</span><b>${b}</b></div>`).join('');
    el.tabObj.innerHTML = G.missions.all.map((m, i) => {
      const cls = i < G.missions.index ? 'done' : i === G.missions.index ? 'cur' : '';
      return `<li class="${cls}">${m.text}${m.hint && i === G.missions.index ? `<small>${m.hint}</small>` : ''}</li>`;
    }).join('');
  }

  /* ---------------------------------------------------------- eventi */
  function hitmarker(head, kill, vehicle) {
    if (!G.settings.hitmarkers) return;
    hitT = kill ? 0.45 : 0.22;
    hitKill = !!kill || head;
    el.hit.style.transform = `translate(-50%,-50%) scale(${kill ? 1.35 : 1})`;
  }
  function damage(from, amt) {
    const d = document.createElement('div');
    d.className = 'dmgInd';
    el.dmgWrap.appendChild(d);
    dmgInds.push({ el: d, t: 1.3, from: from ? from.clone() : null });
    if (!from) d.classList.add('all');
    el.vign.style.opacity = 1;
  }
  function killfeed(text, pts) {
    const d = document.createElement('div');
    d.className = 'kf';
    d.innerHTML = `<span class="me">TU</span> <span class="wp">[${text}]</span> <span class="en">Ostile</span> <span class="pts">+${pts}</span>`;
    el.feed.prepend(d);
    setTimeout(() => d.classList.add('out'), 4000);
    setTimeout(() => d.remove(), 4600);
    while (el.feed.children.length > 6) el.feed.lastChild.remove();
    // popup punti al centro
    const p = document.createElement('div');
    p.className = 'ptsPop';
    p.textContent = '+' + pts;
    document.getElementById('ptsWrap').appendChild(p);
    setTimeout(() => p.remove(), 1200);
  }
  let notifyTimer = null;
  function notify(msg) {
    el.notify.textContent = msg;
    el.notify.classList.add('show');
    clearTimeout(notifyTimer);
    notifyTimer = setTimeout(() => el.notify.classList.remove('show'), 3200);
  }
  let bigTimer = null;
  function big(title, sub) {
    el.big.innerHTML = `<h2>${title}</h2><p>${sub || ''}</p>`;
    el.big.classList.add('show');
    clearTimeout(bigTimer);
    bigTimer = setTimeout(() => el.big.classList.remove('show'), 3200);
  }
  function showDeath(cause) {
    $('deathCause').textContent = 'Causa: ' + cause;
    $('deathStats').textContent = `Uccisioni: ${G.player.kills}   ·   Punteggio: ${G.player.score}`;
    G.setState('dead');
  }
  function spotted() {
    if (spottedT <= 0) spottedT = 2.2;
  }

  return { init, update, hitmarker, damage, killfeed, notify, big, showDeath, spotted, toggleMap };
})();
