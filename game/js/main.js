'use strict';
/* =========================================================================
   MAIN: renderer, ciclo di gioco, stati (menu/gioco/pausa/morte),
   menu impostazioni, interazioni, telecamera cinematica del menu.
   ========================================================================= */
(function () {
  const V = THREE.Vector3;
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');

  /* ------------------------------------------------------------ renderer */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.autoClear = false;
  G.renderer = renderer;
  G.scene = new THREE.Scene();
  G.camera = new THREE.PerspectiveCamera(G.settings.fov, innerWidth / innerHeight, 0.1, 1500);
  G.camera.rotation.order = 'YXZ';
  G.scene.add(G.camera);
  G.hour = G.settings.timeOfDay;
  G.playTime = 0;

  function applyQuality() {
    const q = G.settings.quality;
    const pr = q === 'bassa' ? 0.7 : q === 'media' ? Math.min(devicePixelRatio, 1) : Math.min(devicePixelRatio, 1.5);
    renderer.setPixelRatio(pr);
    renderer.setSize(innerWidth, innerHeight, false);
    if (G.sun) {
      const size = q === 'alta' ? 2048 : 1024;
      G.sun.castShadow = G.settings.shadows && q !== 'bassa';
      if (G.sun.shadow.mapSize.x !== size) {
        G.sun.shadow.mapSize.set(size, size);
        if (G.sun.shadow.map) { G.sun.shadow.map.dispose(); G.sun.shadow.map = null; }
      }
    }
    if (G.grassMesh) G.grassMesh.visible = q !== 'bassa';
    G.camera.far = q === 'bassa' ? 800 : 1500;
    G.camera.updateProjectionMatrix();
  }
  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    G.camera.aspect = innerWidth / innerHeight;
    G.camera.updateProjectionMatrix();
    if (G.vmCam) { G.vmCam.aspect = innerWidth / innerHeight; G.vmCam.updateProjectionMatrix(); }
  }
  addEventListener('resize', resize);

  /* ------------------------------------------------------------ stati */
  const screens = ['loading', 'menu', 'pause', 'death', 'settings', 'controls'];
  let settingsBack = 'menu';
  G.setState = (s) => {
    G.state = s;
    for (const id of screens) $(id).classList.toggle('show', false);
    $('hud').classList.toggle('show', s === 'playing' || s === 'dead');
    if (s === 'menu') $('menu').classList.add('show');
    if (s === 'paused') $('pause').classList.add('show');
    if (s === 'dead') { $('death').classList.add('show'); document.exitPointerLock && document.exitPointerLock(); }
    if (s === 'settings') $('settings').classList.add('show');
    if (s === 'controls') $('controls').classList.add('show');
    if (s !== 'playing') { G.audio.hornSet(false); }
    document.body.classList.toggle('playing', s === 'playing');
  };
  G.lockPointer = () => {
    try {
      const p = canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => { $('clickResume').classList.add('show'); });
    } catch (e) { $('clickResume').classList.add('show'); }
  };
  document.addEventListener('pointerlockchange', () => {
    G.pointerLocked = document.pointerLockElement === canvas;
    if (G.pointerLocked) $('clickResume').classList.remove('show');
    if (!G.pointerLocked && G.state === 'playing' && !G.mapOpen) pause();
  });
  $('clickResume').addEventListener('click', () => { G.lockPointer(); });
  canvas.addEventListener('click', () => { if (G.state === 'playing' && !G.pointerLocked && !G.mapOpen) G.lockPointer(); });

  let started = false;
  function startGame() {
    G.audio.init();
    G.audio.resume();
    G.audio.ui();
    if (!started) {
      started = true;
      G.player.reset(G.spawnPoint);
      G.hud.big('FRONTE VOSTOK', 'Operazione Tempesta d\'Acciaio — Avamposto Alleato');
      setTimeout(() => G.hud.notify('Obiettivo: ' + G.missions.text()), 3400);
    }
    G.setState('playing');
    G.lockPointer();
  }
  function pause() {
    if (G.state !== 'playing') return;
    G.setState('paused');
    G.audio.engineUpdate && G.vehicles.driving && G.audio.engineUpdate(0.1, 0, 0, false);
  }
  function respawn() {
    const P = G.player;
    P.reset(G.spawnPoint);
    G.weapons.refill();
    G.fx.addShake(0);
    G.setState('playing');
    G.lockPointer();
  }

  /* ------------------------------------------------------------ menu */
  const bind = (id, fn) => $(id).addEventListener('click', () => { G.audio.init(); G.audio.ui(); fn(); });
  bind('btnPlay', startGame);
  bind('btnSettings', () => { settingsBack = 'menu'; buildSettings(); G.setState('settings'); });
  bind('btnControls', () => { settingsBack = 'menu'; G.setState('controls'); });
  bind('btnResume', startGame);
  bind('btnPSettings', () => { settingsBack = 'paused'; buildSettings(); G.setState('settings'); });
  bind('btnPControls', () => { settingsBack = 'paused'; G.setState('controls'); });
  bind('btnQuit', () => { location.reload(); });
  bind('btnRespawn', respawn);
  bind('btnSetBack', () => { G.saveSettings(); applySettings(); G.setState(settingsBack); });
  bind('btnCtrlBack', () => G.setState(settingsBack));
  bind('btnSetReset', () => { Object.assign(G.settings, G.DEFAULTS); buildSettings(); applySettings(); });
  addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      if (G.mapOpen) { G.hud.toggleMap(false); return; }
      if (G.state === 'settings' || G.state === 'controls') { G.saveSettings(); applySettings(); G.setState(settingsBack); }
    }
    if (e.code === 'Enter' && G.state === 'dead') respawn();
  });

  /* ------------------------------------------------------------ impostazioni */
  const SCHEMA = [
    { sec: 'Controlli' },
    { k: 'sens', label: 'Sensibilità mouse', type: 'range', min: 0.1, max: 5, step: 0.05 },
    { k: 'adsSens', label: 'Sensibilità in mira (moltiplicatore)', type: 'range', min: 0.2, max: 1.5, step: 0.05 },
    { k: 'vehSens', label: 'Sensibilità telecamera veicolo', type: 'range', min: 0.2, max: 3, step: 0.05 },
    { k: 'invertY', label: 'Inverti asse verticale', type: 'check' },
    { sec: 'Gameplay' },
    { k: 'difficulty', label: 'Difficoltà', type: 'select', opts: ['facile', 'normale', 'veterano'] },
    { k: 'gravity', label: 'Gravità (m/s²)', type: 'range', min: 3, max: 40, step: 0.5 },
    { k: 'headBob', label: 'Oscillazione della visuale', type: 'check' },
    { k: 'hitmarkers', label: 'Hitmarker', type: 'check' },
    { k: 'crosshairColor', label: 'Colore mirino', type: 'color' },
    { sec: 'Grafica' },
    { k: 'fov', label: 'Campo visivo (FOV)', type: 'range', min: 60, max: 110, step: 1 },
    { k: 'quality', label: 'Qualità grafica', type: 'select', opts: ['bassa', 'media', 'alta'] },
    { k: 'shadows', label: 'Ombre dinamiche', type: 'check' },
    { k: 'dayCycle', label: 'Ciclo giorno/notte', type: 'check' },
    { k: 'timeOfDay', label: 'Ora del giorno', type: 'range', min: 0, max: 23.75, step: 0.25 },
    { k: 'showFps', label: 'Mostra FPS', type: 'check' },
    { sec: 'Audio' },
    { k: 'volume', label: 'Volume generale', type: 'range', min: 0, max: 1, step: 0.01 },
  ];
  function fmt(k, v) {
    if (k === 'timeOfDay') return String(Math.floor(v)).padStart(2, '0') + ':' + String(Math.round((v % 1) * 60)).padStart(2, '0');
    if (k === 'volume') return Math.round(v * 100) + '%';
    if (k === 'gravity') return v.toFixed(1) + (Math.abs(v - 9.8) < 0.3 ? ' (Terra)' : Math.abs(v - 1.6) < 0.3 ? ' (Luna)' : '');
    if (typeof v === 'number') return (Math.round(v * 100) / 100).toString();
    return v;
  }
  function buildSettings() {
    const box = $('settingsList');
    box.innerHTML = '';
    for (const s of SCHEMA) {
      if (s.sec) { const h = document.createElement('h3'); h.textContent = s.sec; box.appendChild(h); continue; }
      const row = document.createElement('label');
      row.className = 'setRow';
      const name = document.createElement('span');
      name.textContent = s.label;
      row.appendChild(name);
      const val = document.createElement('em');
      let input;
      const v = G.settings[s.k];
      if (s.type === 'range') {
        input = document.createElement('input');
        input.type = 'range';
        input.min = s.min; input.max = s.max; input.step = s.step; input.value = v;
        val.textContent = fmt(s.k, v);
        input.addEventListener('input', () => {
          G.settings[s.k] = parseFloat(input.value);
          val.textContent = fmt(s.k, G.settings[s.k]);
          if (s.k === 'timeOfDay') G.hour = G.settings.timeOfDay;
          applySettings();
        });
      } else if (s.type === 'check') {
        input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = !!v;
        input.addEventListener('change', () => { G.settings[s.k] = input.checked; applySettings(); });
      } else if (s.type === 'select') {
        input = document.createElement('select');
        for (const o of s.opts) {
          const op = document.createElement('option');
          op.value = o; op.textContent = o.toUpperCase();
          if (o === v) op.selected = true;
          input.appendChild(op);
        }
        input.addEventListener('change', () => { G.settings[s.k] = input.value; applySettings(); });
      } else if (s.type === 'color') {
        input = document.createElement('input');
        input.type = 'color';
        input.value = v;
        input.addEventListener('input', () => { G.settings[s.k] = input.value; });
      }
      row.appendChild(input);
      row.appendChild(val);
      box.appendChild(row);
    }
  }
  function applySettings() {
    G.audio.setVolume(G.settings.volume);
    applyQuality();
    G.saveSettings();
  }

  /* ------------------------------------------------------------ interazioni */
  function interactions() {
    const P = G.player;
    G.promptText = '';
    if (P.dead) return;
    if (P.vehicle) {
      if (G.wasPressed('KeyE')) G.vehicles.exit();
      return;
    }
    const v = G.vehicles.nearest(P.pos);
    // casse munizioni
    let crate = null;
    for (const a of G.ammoCrates) if (a.pos.distanceTo(P.eyePos()) < 2.6) crate = a;
    if (crate) {
      G.promptText = '<kbd>E</kbd> Rifornisci munizioni e granate';
      if (G.wasPressed('KeyE')) {
        G.weapons.refill();
        G.audio.pickup();
        G.hud.notify('Munizioni e granate rifornite');
      }
    } else if (v) {
      G.promptText = `<kbd>E</kbd> Guida: ${v.def.name}`;
      if (G.wasPressed('KeyE')) G.vehicles.enter(v);
    }
  }

  /* ------------------------------------------------------------ menu cinematico */
  let menuT = 0;
  function menuCamera(dt) {
    menuT += dt * 0.04;
    const r = 170;
    const c = G.camera;
    c.position.set(Math.cos(menuT) * r, 62 + Math.sin(menuT * 2) * 10, Math.sin(menuT) * r);
    c.lookAt(0, 18, 0);
    c.fov = 60;
    c.updateProjectionMatrix();
  }

  /* ------------------------------------------------------------ ciclo */
  const clock = new THREE.Clock();
  const tmp = new V();
  function frame() {
    requestAnimationFrame(frame);
    let dt = Math.min(clock.getDelta(), 0.05);
    G.dt = dt;
    const active = G.state === 'playing' || G.state === 'dead';
    if (G.state !== 'loading' && G.sky) {
      if (G.state === 'menu') {
        G.time += dt;
        menuCamera(dt);
        G.hour = G.settings.dayCycle ? (G.hour + dt * 0.02) % 24 : G.settings.timeOfDay;
        G.updateSky(G.hour);
        G.vehicles.update(dt);
        G.enemies.update(dt);
        G.fx.update(dt);
      } else if (active) {
        G.time += dt;
        G.playTime += dt;
        if (G.settings.dayCycle) G.hour = (G.hour + dt * (24 / (24 * 60))) % 24; // un giorno = 24 minuti
        else G.hour = G.settings.timeOfDay;
        G.updateSky(G.hour);
        G.player.update(dt);
        G.weapons.update(dt);
        G.vehicles.update(dt);
        G.enemies.update(dt);
        G.missions.update();
        interactions();
        for (let i = G.burning.length - 1; i >= 0; i--) {
          const b = G.burning[i];
          b.t -= dt;
          G.fx.fire(b.pos, b.i * G.clamp(b.t / 20, 0.2, 1));
          if (b.t <= 0) G.burning.splice(i, 1);
        }
        if (G.player.vehicle) G.vehicles.updateCamera(dt);
        else G.player.updateCamera(dt);
        G.fx.update(dt);
        G.hud.update(dt);
        // torcia
        const fl = G.flashlight;
        fl.intensity = G.player.flashlight && !G.player.vehicle ? 5 : 0;
        if (fl.intensity) {
          G.camera.getWorldPosition(fl.position);
          fl.position.y -= 0.2;
          fl.target.position.copy(fl.position).add(G.player.forward(tmp).multiplyScalar(10));
          fl.target.updateMatrixWorld();
        }
        // audio: ascoltatore
        G.audio.listener.pos.copy(G.camera.position);
        const cf = tmp.set(0, 0, -1).applyQuaternion(G.camera.quaternion);
        G.audio.listener.yaw = Math.atan2(-cf.x, -cf.z);
        const P = G.player;
        const pp = P.vehicle ? P.vehicle.pos : P.pos;
        G.audio.setWind(G.clamp((pp.y - 10) / 60, 0, 1) + (P.vehicle ? Math.hypot(P.vehicle.vel.x, P.vehicle.vel.z) / 60 : 0));
        G.audio.ambience(G.nightFactor > 0.6, G.forestDensity && G.forestDensity(pp.x, pp.z) > 0.05);
      }
      G.updateWorldFx(G.camera.position);
      // luci del viewmodel coerenti con la scena
      if (G.vmSun) {
        G.vmSun.color.copy(G.sun.color);
        G.vmSun.intensity = G.sun.intensity * 0.45;
        const inv = G.camera.quaternion.clone().invert();
        G.vmSun.position.copy(G.sunLightDir || G.sunDir).applyQuaternion(inv).multiplyScalar(5);
        G.vmHemi.color.copy(G.hemi.color);
        G.vmHemi.groundColor.copy(G.hemi.groundColor);
        G.vmHemi.intensity = G.hemi.intensity * 0.75 + (G.player.flashlight ? 0.5 : 0) + G.nightFactor * 0.15;
      }
    }
    renderer.clear();
    renderer.render(G.scene, G.camera);
    if (G.state === 'playing' && G.vmScene && !G.player.vehicle && !G.player.dead && !G.weapons.isScoped()) {
      renderer.clearDepth();
      renderer.render(G.vmScene, G.vmCam);
    }
    G.endFrameInput();
  }

  /* ------------------------------------------------------------ avvio */
  const TIPS = [
    'Accovacciati durante uno scatto [C] per scivolare dietro una copertura.',
    'Trattieni il respiro con [Shift] mentre usi il cannocchiale del fucile di precisione.',
    'Le casse gialle sulla minimappa riforniscono munizioni e granate.',
    'Il freno a mano [Spazio] permette derapate controllate con i veicoli.',
    'I nemici appaiono sulla minimappa quando sparano.',
    'Spara ai barili rossi per provocare esplosioni a catena.',
    'Apri la mappa [M] e clicca per impostare un punto di riferimento.',
    'Di notte usa la torcia [F] o i fari del veicolo [L], ma attenzione: ti rendono più visibile.',
  ];
  async function boot() {
    $('tip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
    G.setState('loading');
    const bar = $('loadFill'), lbl = $('loadLabel');
    const progress = (label, p) => { lbl.textContent = label; bar.style.width = p * 100 + '%'; };
    applyQuality();
    await G.buildWorld(progress);
    progress('Veicoli e forze nemiche...', 0.95);
    await new Promise((r) => setTimeout(r, 16));
    G.fx.init();
    G.weapons.init();
    G.vehicles.init();
    G.enemies.init();
    G.missions.init();
    G.hud.init();
    applyQuality();
    G.player.reset(G.spawnPoint);
    G.updateSky(G.hour);
    progress('Compilazione shader...', 1);
    await new Promise((r) => setTimeout(r, 16));
    renderer.compile(G.scene, G.camera);
    resize();
    G.setState('menu');
    clock.getDelta();
    frame();
  }
  boot().catch((e) => {
    console.error(e);
    $('loadLabel').textContent = 'Errore durante il caricamento: ' + e.message;
  });
})();
