'use strict';
// ---------------------------------------------------------------------------
// Playbook: draw your own pass plays. Tap a player, then tap or drag on the
// field to lay out his route. Saved plays join the play-call menu and run
// through the same engine as the built-in routes (ROUTES / PLAYS).
// ---------------------------------------------------------------------------

const PLAYBOOK_KEY = 'borderbowl-playbook-v1';
const PB_MAX = 8;
// Formation, matching Play.setup: forward yards from the line, y across the field
const PB_MID = FIELD_W / 2;
const PB_FORM = {
  WR1: { f: -0.8, y: PB_MID - 17, label: 'WR' }, SLOT: { f: -1.2, y: PB_MID - 10, label: 'SL' },
  TE: { f: -1.0, y: PB_MID + 6, label: 'TE' }, WR2: { f: -0.8, y: PB_MID + 17, label: 'WR' }, RB: { f: -5, y: PB_MID - 2.6, label: 'RB' },
};
const PB_ROLES = ['WR1', 'SLOT', 'TE', 'WR2', 'RB'];
const PB_COLORS = { WR1: '#5ee07a', SLOT: '#5fb4ff', TE: '#f4f4f4', WR2: '#ffd23c', RB: '#ff8a4a' };

const Playbook = (() => {
  const $ = id => document.getElementById(id);
  const esc = s => UI.esc(s);
  let plays = load(PLAYBOOK_KEY) || [];
  if (!Array.isArray(plays)) plays = [];

  // ---- register saved plays with the engine ----
  // A route is stored as absolute points {f, y}; the engine wants [forward, inside].
  function toEngine(role, r) {
    const s = PB_FORM[role], top = s.y < PB_MID ? 1 : -1;
    return { pts: r.pts.map(p => [p.f - s.f, (p.y - s.y) * top]), stop: !!r.stop };
  }
  function register() {
    for (let i = PLAYS.length - 1; i >= 0; i--) if (PLAYS[i].custom) PLAYS.splice(i, 1);
    for (const p of plays) {
      const routes = {};
      for (const role of PB_ROLES) {
        const r = p.routes[role];
        if (r && r.pts && r.pts.length) { const key = `${p.id}_${role}`; ROUTES[key] = toEngine(role, r); routes[role] = key; }
        else routes[role] = 'block';
      }
      PLAYS.push({ id: p.id, name: p.name.toUpperCase().slice(0, 14) || 'MY PLAY', type: 'pass', custom: true, routes });
    }
  }
  function persist() { store(PLAYBOOK_KEY, plays); register(); }
  register();

  // ---- list screen ----
  function open() {
    UI.show(`<h2>PLAYBOOK</h2>
      <p class="fine">Design your own pass plays. They show up in the play-call menu during games.</p>
      <div class="pb-list">${plays.map(p => `<button class="playcard pb-item" data-id="${p.id}"><canvas width="96" height="60" data-mini="${p.id}"></canvas><span class="pname">${esc(p.name.toUpperCase())}</span></button>`).join('')}
        ${plays.length < PB_MAX ? '<button class="playcard special" id="pbNew"><span class="pname">+ NEW PLAY</span><span class="psub">Draw your routes</span></button>' : ''}</div>
      <div class="menu"><button class="btn" data-act="title">BACK</button></div>`);
    document.querySelectorAll('[data-mini]').forEach(c => mini(c, plays.find(p => p.id === c.dataset.mini)));
    document.querySelectorAll('.pb-item').forEach(b => b.addEventListener('click', () => { UI.sfx('click'); edit(plays.find(p => p.id === b.dataset.id)); }));
    const nb = $('pbNew');
    if (nb) nb.addEventListener('click', () => { UI.sfx('click'); edit(null); });
  }

  function mini(c, p) {
    const g = c.getContext('2d'), W = c.width, H = c.height;
    g.fillStyle = '#2c6a27'; g.fillRect(0, 0, W, H);
    const X = f => 14 + f * 2, Y = y => y / FIELD_W * H;
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(X(0), 0, 1, H);
    for (const role of PB_ROLES) {
      const s = PB_FORM[role], r = p.routes[role];
      g.strokeStyle = PB_COLORS[role]; g.lineWidth = 1.5;
      if (r && r.pts.length) { g.beginPath(); g.moveTo(X(s.f), Y(s.y)); for (const q of r.pts) g.lineTo(X(Math.min(q.f, 38)), Y(q.y)); g.stroke(); }
      g.fillStyle = '#fff'; g.fillRect(X(s.f) - 2, Y(s.y) - 2, 4, 4);
    }
  }

  // ---- editor ----
  let cur = null, sel = 'WR1', drawing = false;
  const EW = 480, EH = 300;              // canvas units
  const F0 = -8, F1 = 40;                // forward yards shown
  const ex = f => (f - F0) / (F1 - F0) * EW;
  const ey = y => y / FIELD_W * EH;
  const fx = x => x / EW * (F1 - F0) + F0;
  const fy = y => y / EH * FIELD_W;

  function edit(p) {
    cur = p ? JSON.parse(JSON.stringify(p)) : { id: 'cp' + Date.now().toString(36), name: 'My Play ' + (plays.length + 1), routes: { WR1: { pts: [], stop: false }, SLOT: { pts: [], stop: false }, TE: null, WR2: { pts: [], stop: false }, RB: null } };
    sel = 'WR1';
    UI.show(`<h2>${p ? 'EDIT PLAY' : 'NEW PLAY'}</h2>
      <div class="box help pb-edit"><div class="pb-grid">
        <canvas id="pbCanvas" width="${EW}" height="${EH}"></canvas>
        <div class="pb-side">
          <div class="pb-roles">${PB_ROLES.map(r => `<button class="opt" data-role="${r}" style="--rc:${PB_COLORS[r]}">${r}</button>`).join('')}</div>
          <p class="dim" id="pbHint">Pick a player, then tap the field to add route points or drag to draw.</p>
          <div class="opts">
            <button class="opt" id="pbUndo">UNDO</button>
            <button class="opt" id="pbClear">CLEAR</button>
            <button class="opt" id="pbBlock">BLOCK</button>
            <button class="opt" id="pbStop">SIT AT END</button>
          </div>
          <label for="pbName">Play name</label><input id="pbName" maxlength="14" value="${esc(cur.name)}">
        </div>
      </div></div>
      <div class="menu"><button class="btn go" id="pbSave">SAVE PLAY</button>
        ${p ? '<button class="btn" id="pbDel">DELETE PLAY</button>' : ''}
        <button class="btn" id="pbBack">BACK</button></div>`);
    const cv = $('pbCanvas');
    const pos = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * EW / r.width, y: (e.clientY - r.top) * EH / r.height }; };
    const near = pt => PB_ROLES.find(role => { const s = PB_FORM[role]; return Math.hypot(ex(s.f) - pt.x, ey(s.y) - pt.y) < 16; });
    const addPoint = (pt, minGap) => {
      let r = cur.routes[sel];
      if (!r) r = cur.routes[sel] = { pts: [], stop: false };
      const f = clamp(fx(pt.x), -6, 45), y = clamp(fy(pt.y), 1.5, FIELD_W - 1.5);
      const last = r.pts[r.pts.length - 1] || PB_FORM[sel];
      if (Math.hypot(f - last.f, y - last.y) < minGap) return;
      if (r.pts.length >= 6) r.pts[r.pts.length - 1] = { f, y }; else r.pts.push({ f, y });
      draw();
    };
    cv.addEventListener('pointerdown', e => {
      e.preventDefault();
      const pt = pos(e), who = near(pt);
      if (who) { sel = who; draw(); return; }
      drawing = true; cv.setPointerCapture(e.pointerId);
      addPoint(pt, 1.5);
    });
    cv.addEventListener('pointermove', e => { if (drawing) addPoint(pos(e), 5); });
    const up = () => { drawing = false; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    document.querySelectorAll('[data-role]').forEach(b => b.addEventListener('click', () => { sel = b.dataset.role; draw(); }));
    $('pbUndo').addEventListener('click', () => { const r = cur.routes[sel]; if (r && r.pts.length) r.pts.pop(); draw(); });
    $('pbClear').addEventListener('click', () => { cur.routes[sel] = { pts: [], stop: false }; draw(); });
    $('pbBlock').addEventListener('click', () => { cur.routes[sel] = null; draw(); });
    $('pbStop').addEventListener('click', () => { const r = cur.routes[sel]; if (r) { r.stop = !r.stop; draw(); } });
    $('pbBack').addEventListener('click', () => { UI.sfx('click'); open(); });
    if ($('pbDel')) $('pbDel').addEventListener('click', () => {
      const b = $('pbDel');
      if (b.dataset.armed) { plays = plays.filter(x => x.id !== cur.id); persist(); open(); }
      else { b.dataset.armed = '1'; b.textContent = 'TAP AGAIN TO DELETE'; }
    });
    $('pbSave').addEventListener('click', () => {
      cur.name = ($('pbName').value || '').trim() || 'My Play';
      if (!PB_ROLES.some(r => cur.routes[r] && cur.routes[r].pts.length)) { $('pbHint').textContent = 'Give at least one player a route before saving.'; return; }
      const i = plays.findIndex(x => x.id === cur.id);
      if (i >= 0) plays[i] = cur; else plays.push(cur);
      persist();
      UI.sfx('good');
      open();
    });
    draw();
  }

  function draw() {
    const cv = $('pbCanvas');
    if (!cv) return;
    const g = cv.getContext('2d');
    // turf, yard lines every 5, line of scrimmage
    for (let f = F0; f < F1; f += 5) { g.fillStyle = Math.floor(f / 5) % 2 ? '#3f8c36' : '#45953b'; g.fillRect(ex(f), 0, ex(f + 5) - ex(f), EH); }
    g.fillStyle = 'rgba(255,255,255,0.5)';
    for (let f = 5; f < F1; f += 5) g.fillRect(ex(f), 0, 1, EH);
    g.font = '12px ui-monospace, monospace'; g.fillStyle = 'rgba(255,255,255,0.7)';
    for (let f = 10; f < F1; f += 10) g.fillText('+' + f, ex(f) + 3, EH - 6);
    g.fillStyle = 'rgba(70,140,255,0.95)'; g.fillRect(ex(0), 0, 2, EH);
    // offensive line
    g.fillStyle = '#9aa0a6';
    for (let i = -2; i <= 2; i++) g.fillRect(ex(-0.8) - 5, ey(PB_MID + i * 2.3) - 5, 10, 10);
    g.fillRect(ex(-5) - 5, ey(PB_MID) - 5, 10, 10);
    // routes
    for (const role of PB_ROLES) {
      const s = PB_FORM[role], r = cur.routes[role], c = PB_COLORS[role], on = role === sel;
      if (r && r.pts.length) {
        g.strokeStyle = c; g.lineWidth = on ? 4 : 2.5; g.lineJoin = 'round';
        g.beginPath(); g.moveTo(ex(s.f), ey(s.y));
        for (const p of r.pts) g.lineTo(ex(p.f), ey(p.y));
        g.stroke();
        const a = r.pts.length > 1 ? r.pts[r.pts.length - 2] : s, b = r.pts[r.pts.length - 1];
        if (r.stop) { g.fillStyle = c; g.fillRect(ex(b.f) - 6, ey(b.y) - 6, 12, 12); }
        else {
          const ang = Math.atan2(ey(b.y) - ey(a.y), ex(b.f) - ex(a.f));
          g.fillStyle = c; g.beginPath();
          g.moveTo(ex(b.f) + Math.cos(ang) * 10, ey(b.y) + Math.sin(ang) * 10);
          g.lineTo(ex(b.f) + Math.cos(ang + 2.4) * 9, ey(b.y) + Math.sin(ang + 2.4) * 9);
          g.lineTo(ex(b.f) + Math.cos(ang - 2.4) * 9, ey(b.y) + Math.sin(ang - 2.4) * 9);
          g.fill();
        }
        for (const p of r.pts) { g.fillStyle = '#0b0b0b'; g.fillRect(ex(p.f) - 3, ey(p.y) - 3, 6, 6); g.fillStyle = c; g.fillRect(ex(p.f) - 2, ey(p.y) - 2, 4, 4); }
      } else if (!r) {
        g.strokeStyle = c; g.lineWidth = 3; g.beginPath(); g.moveTo(ex(s.f) + 10, ey(s.y) - 7); g.lineTo(ex(s.f) + 10, ey(s.y) + 7); g.stroke();
      }
      // player marker
      g.fillStyle = on ? c : '#ffffff'; g.beginPath(); g.arc(ex(s.f), ey(s.y), on ? 10 : 8, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#0b0b0b'; g.font = 'bold 9px ui-monospace, monospace'; g.textAlign = 'center'; g.fillText(PB_FORM[role].label, ex(s.f), ey(s.y) + 3); g.textAlign = 'left';
    }
    document.querySelectorAll('[data-role]').forEach(b => b.classList.toggle('on', b.dataset.role === sel));
    const r = cur.routes[sel];
    $('pbBlock').classList.toggle('on', !r);
    $('pbStop').classList.toggle('on', !!(r && r.stop));
  }

  return { open, register, plays: () => plays };
})();
