'use strict';
/* =========================================================================
   MISSIONI: catena di obiettivi con marker su bussola, minimappa e schermo.
   ========================================================================= */
G.missions = (function () {
  const V = THREE.Vector3;
  let list = [];
  let idx = 0;
  let progress = 0;
  const cleared = new Set();

  function init() {
    const Z = G.zones;
    list = [
      { id: 'vehicle', text: 'Sali su un veicolo all\'avamposto', hint: 'Avvicinati alla Jeep e premi [E]', type: 'vehicle', pos: new V(18, 0, 445) },
      { id: 'city', text: 'Raggiungi la Città di Vostok', hint: 'Segui la strada principale verso nord', type: 'reach', pos: new V(0, 0, 205), r: 35 },
      { id: 'cityclear', text: 'Elimina le forze nemiche in città', type: 'kills', zone: 'city', need: 10, pos: new V(0, 0, 0) },
      { id: 'tower', text: 'Neutralizza i cecchini della Torre Radio', type: 'kills', zone: 'tower', need: 3, pos: new V(Z.tower.x, 0, Z.tower.z) },
      { id: 'base', text: 'Infiltrati nella Base Militare nemica', hint: 'Il cancello è sul lato sud', type: 'reach', pos: new V(400, 0, -335), r: 30 },
      { id: 'fuel', text: 'Distruggi i serbatoi di carburante', hint: 'Spara ai serbatoi o usa le granate [G]', type: 'fuel', need: 4, pos: new V(357, 0, -374) },
      { id: 'village', text: 'Libera il Villaggio di Krasnaya', type: 'kills', zone: 'village', need: 6, pos: new V(Z.village.x, 0, Z.village.z) },
      { id: 'free', text: 'Missione compiuta — esplorazione libera', type: 'final', pos: null },
    ];
    idx = 0;
    progress = 0;
  }
  const cur = () => list[idx];

  function complete() {
    const m = cur();
    if (m.zone) cleared.add(m.zone);
    G.player.score += 500;
    G.hud.big('OBIETTIVO COMPLETATO', m.text + '   +500');
    G.audio.pickup();
    idx = Math.min(idx + 1, list.length - 1);
    progress = 0;
    const n = cur();
    if (n.type === 'final') setTimeout(() => G.hud.big('MISSIONE COMPIUTA', 'Il mondo è tuo: esplora liberamente'), 3500);
    else setTimeout(() => G.hud.notify('Nuovo obiettivo: ' + n.text), 2500);
  }

  function event(type, data) {
    const m = cur();
    if (!m) return;
    if (m.type === 'vehicle' && type === 'vehicle') complete();
    else if (m.type === 'kills' && type === 'kill' && data.zone === m.zone) {
      progress++;
      if (progress >= m.need) complete();
    } else if (m.type === 'fuel' && type === 'fuel') {
      progress++;
      if (progress >= m.need) complete();
    }
    // i serbatoi distrutti prima dell'obiettivo contano comunque
    if (type === 'fuel' && m.type !== 'fuel') {
      const f = list.find((x) => x.type === 'fuel');
      f.pre = (f.pre || 0) + 1;
    }
  }

  function update() {
    const m = cur();
    if (m.type === 'reach') {
      const p = G.player.vehicle ? G.player.vehicle.pos : G.player.pos;
      if (Math.hypot(p.x - m.pos.x, p.z - m.pos.z) < m.r) complete();
    }
    if (m.type === 'fuel' && m.pre) { progress += m.pre; m.pre = 0; if (progress >= m.need) complete(); }
    if (m.type === 'kills') {
      // se non restano nemici nella zona l'obiettivo si completa
      if (G.enemies.aliveIn(m.zone) === 0 && progress > 0) complete();
    }
  }

  function text() {
    const m = cur();
    if (!m) return '';
    let s = m.text;
    if (m.need) s += `  [${progress}/${m.need}]`;
    return s;
  }

  return {
    init, event, update, text,
    get current() { return cur(); },
    get all() { return list; },
    get index() { return idx; },
    cleared: (z) => cleared.has(z),
  };
})();
