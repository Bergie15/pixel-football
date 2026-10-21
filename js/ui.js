'use strict';
// ---------------------------------------------------------------------------
// UI: menus, HUD, overlays, input, sound and the main loop.
// ---------------------------------------------------------------------------

const UI = (() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let cv, ctx, W = 500;
  const settings = Object.assign({ sound: true, aim: 'pull', qlen: 300, diff: 'normal' }, load(SETTINGS_KEY) || {});
  let league = load(SAVE_KEY);
  if (league && (league.v !== 1 || !TEAM_BY_ID[league.userId])) league = null;
  let match = null, matchCtx = null, paused = false;
  let attract = { strip: null, cam: 20 };

  // ---- sound ---------------------------------------------------------------
  let ac = null;
  function ensureAudio() {
    if (!settings.sound) return;
    try {
      if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
    } catch (e) { ac = null; }
  }
  function tone(f, d, type = 'square', v = 0.05, at = 0, slide = 0) {
    if (!ac || !settings.sound) return;
    const t = ac.currentTime + at, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.linearRampToValueAtTime(f + slide, t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d + 0.02);
  }
  function noise(d, v = 0.08, at = 0) {
    if (!ac || !settings.sound) return;
    const n = Math.floor(ac.sampleRate * d), buf = ac.createBuffer(1, n, ac.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = ac.createBufferSource(), g = ac.createGain();
    s.buffer = buf; g.gain.value = v; s.connect(g).connect(ac.destination); s.start(ac.currentTime + at);
  }
  function buzz(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* unsupported */ } }
  function sfx(name) {
    switch (name) {
      case 'hike': tone(1400, 0.07, 'square', 0.04); tone(1900, 0.09, 'square', 0.04, 0.08); break;
      case 'throw': noise(0.18, 0.05); break;
      case 'catch': tone(660, 0.05); tone(990, 0.08, 'square', 0.05, 0.05); break;
      case 'handoff': tone(440, 0.05, 'triangle', 0.08); break;
      case 'tackle': noise(0.12, 0.22); tone(90, 0.12, 'triangle', 0.15); buzz(35); break;
      case 'juke': tone(900, 0.06, 'triangle', 0.06, 0, 500); break;
      case 'whiff': tone(500, 0.08, 'triangle', 0.05, 0, -250); break;
      case 'break': noise(0.08, 0.18); tone(300, 0.1, 'square', 0.05, 0.02, 200); break;
      case 'td': [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.14, 'square', 0.05, i * 0.11)); buzz([40, 60, 40]); break;
      case 'good': tone(660, 0.08); tone(880, 0.12, 'square', 0.05, 0.08); break;
      case 'inc': tone(330, 0.1, 'square', 0.04); tone(247, 0.16, 'square', 0.04, 0.1); break;
      case 'int': case 'bad': tone(392, 0.12, 'sawtooth', 0.04); tone(330, 0.12, 'sawtooth', 0.04, 0.12); tone(262, 0.22, 'sawtooth', 0.04, 0.24); break;
      case 'oppscore': tone(220, 0.18, 'triangle', 0.1); tone(165, 0.3, 'triangle', 0.1, 0.18); break;
      case 'kick': noise(0.06, 0.25); tone(140, 0.1, 'triangle', 0.15); break;
      case 'tick': tone(880, 0.03, 'square', 0.03); break;
      case 'click': tone(1200, 0.025, 'square', 0.025); break;
    }
  }

  // ---- canvas ----------------------------------------------------------------
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    W = Math.max(240, Math.round(VIEW_H * w / h));
    // Draw the art RQ times larger than its pixels so things can move by a
    // fraction of an art pixel; that's what makes motion glide.
    RQ = clamp(Math.ceil(h * (window.devicePixelRatio || 1) / VIEW_H), 1, 4);
    cv.width = W * RQ; cv.height = VIEW_H * RQ;
    ctx.setTransform(RQ, 0, 0, RQ, 0, 0);
    ctx.imageSmoothingEnabled = false;
    $('rotate').hidden = !(match && h > w * 1.05);
  }

  function toInternal(e) {
    const r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * VIEW_H / r.height, k: r.height / VIEW_H };
  }

  // ---- input -------------------------------------------------------------------
  const input = { active: false, dx: 1, dy: 0, mag: 0 };
  let aiming = null, stick = null;
  const keys = {};

  function viewCam(p) { return clamp(p.camX, FIELD_XMIN + W / 2 / SX, FIELD_XMAX - W / 2 / SX); }

  function aimFrom(p, pt) {
    const cam = viewCam(p);
    let sx, sy;
    if (settings.aim === 'pull') {
      const qx = (p.qb.x - cam) * SX + W / 2, qy = FIELD_TOP + p.qb.y * SY;
      sx = qx + (aiming.ax - pt.x) * 2.6; sy = qy + (aiming.ay - pt.y) * 2.6;
      aiming.len = Math.hypot(aiming.ax - pt.x, aiming.ay - pt.y);
    } else { sx = pt.x; sy = pt.y; aiming.len = 99; }
    p.aim = { x: cam + (sx - W / 2) / SX, y: (sy - FIELD_TOP) / SY };
  }

  function onDown(e) {
    ensureAudio();
    if (!match || paused) return;
    const p = match.play;
    if (!p) return;
    const pt = toInternal(e);
    if (p.phase === 'presnap' && match.awaitSnap) {
      match.awaitSnap = false; p.snap(); return;
    }
    if (p.canThrow()) {
      aiming = { id: e.pointerId, ax: pt.x, ay: pt.y, len: 0 };
      aimFrom(p, pt);
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      return;
    }
    // You can put your thumb down during the handoff; steering starts once the runner has the ball
    if ((p.phase === 'run' && p.carrier) || p.phase === 'handoff' || (p.kickoff && (p.phase === 'air' || p.phase === 'approach'))) {
      stick = { id: e.pointerId, ax: pt.x, ay: pt.y, x0: pt.x, y0: pt.y, t0: performance.now(), moved: false, k: pt.k };
      input.active = true; input.mag = 0;
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    }
  }
  function onMove(e) {
    if (!match || !match.play) return;
    const p = match.play, pt = toInternal(e);
    if (aiming && aiming.id === e.pointerId) {
      if (!p.canThrow()) { aiming = null; p.aim = null; return; }
      aimFrom(p, pt);
    } else if (stick && stick.id === e.pointerId) {
      const dx = pt.x - stick.ax, dy = pt.y - stick.ay, len = Math.hypot(dx, dy);
      if (len * stick.k > 8) stick.moved = true;
      if (len > 2) {
        const wx = dx / SX, wy = dy / SY, m = Math.hypot(wx, wy);
        input.dx = wx / m; input.dy = wy / m; input.mag = Math.min(1, len / 14);
      }
      // re-anchor so the stick follows the thumb
      if (len > 28) { stick.ax = pt.x - dx / len * 28; stick.ay = pt.y - dy / len * 28; }
    }
  }
  function onUp(e) {
    if (!match || !match.play) { aiming = stick = null; return; }
    const p = match.play;
    if (aiming && aiming.id === e.pointerId) {
      if (p.canThrow() && aiming.len > 5 && p.aim) p.throwTo(p.aim.x, p.aim.y);
      p.aim = null; aiming = null;
    } else if (stick && stick.id === e.pointerId) {
      const pt = toInternal(e), held = performance.now() - stick.t0;
      const sdx = pt.x - stick.x0, sdy = pt.y - stick.y0, slen = Math.hypot(sdx, sdy) * stick.k;
      if (!stick.moved && held < 260) p.juke();
      else if (held < 450 && slen > 18) p.cut(sdx / SX, sdy / SY);  // swipe = cut

      stick = null; input.active = false; input.mag = 0;
    }
  }

  function keyInput() {
    if (stick) return;
    const x = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
    const y = (keys.ArrowDown || keys.KeyS ? 1 : 0) - (keys.ArrowUp || keys.KeyW ? 1 : 0);
    if (x || y) { const m = Math.hypot(x, y); input.active = true; input.dx = x / m; input.dy = y / m; input.mag = 1; }
    else if (input.active && !stick) { input.active = false; input.mag = 0; }
  }

  // ---- overlays ----------------------------------------------------------------
  let bannerDone = null, bannerTimer = 0;
  function banner(title, sub, cb, tone = '') {
    hideSheet();
    const b = $('banner');
    $('bTitle').textContent = title;
    $('bSub').textContent = sub || '';
    b.className = 'overlay tone-' + (tone || 'plain');
    b.hidden = false;
    bannerDone = () => { b.hidden = true; bannerDone = null; clearTimeout(bannerTimer); cb && cb(); };
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => bannerDone && bannerDone(), tone === 'td' ? 2200 : 1500);
  }

  function card(o) {
    hideSheet();
    const c = $('card');
    c.className = 'overlay tone-' + (o.tone || 'plain');
    c.innerHTML = `<div class="box panel">
      ${o.kicker ? `<div class="kicker">${esc(o.kicker)}</div>` : ''}
      <div class="ptitle">${esc(o.title)}</div>
      ${(o.lines || []).filter(Boolean).map(l => `<p>${esc(l)}</p>`).join('')}
      <div class="row">${o.buttons.map((b, i) => `<button class="btn ${b.cls || ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div>
    </div>`;
    c.hidden = false;
    c.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => {
      sfx('click');
      c.hidden = true;
      o.buttons[+btn.dataset.i].fn();
    }));
  }

  function hideSheet() { $('sheet').hidden = true; }

  function playSelect(m, special, cb) {
    const s = $('sheet');
    const items = special.map(sp => ({ special: true, ...sp })).concat(PLAYS.map(p => ({ play: p })));
    s.innerHTML = `<div class="sheet-head"><span>${esc(m.situation())}</span><span class="dim">${m.ot ? 'OVERTIME' : esc(ORD[Math.min(m.q, 4)] + ' QTR ' + fmtClock(m.clock))}</span></div>
      <div class="plays">${items.map((it, i) => it.special
        ? `<button class="playcard special" data-i="${i}"><span class="pname">${esc(it.name)}</span><span class="psub">${esc(it.sub)}</span></button>`
        : `<button class="playcard" data-i="${i}"><canvas width="64" height="40" data-play="${it.play.id}"></canvas><span class="pname">${esc(it.play.name)}</span></button>`).join('')}</div>`;
    s.querySelectorAll('canvas[data-play]').forEach(c => drawDiagram(c, PLAYS.find(p => p.id === c.dataset.play)));
    s.querySelectorAll('.playcard').forEach(btn => btn.addEventListener('click', () => {
      sfx('click');
      const it = items[+btn.dataset.i];
      s.hidden = true;
      cb(it.special ? it.id : it.play);
    }));
    s.hidden = false;
  }

  function drawDiagram(c, play) {
    const g = c.getContext('2d');
    g.fillStyle = '#2c6a27'; g.fillRect(0, 0, 64, 40);
    const ox = 12, px = f => Math.round(ox + f * 1.7), py = y => Math.round(20 + y);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(ox, 0, 1, 40);
    const start = { WR1: [0, -17], SLOT: [-0.4, -10], TE: [-0.2, 6], WR2: [0, 17], RB: [-4.2, -2.6] };
    g.fillStyle = '#ffd23c'; g.strokeStyle = '#ffd23c';
    const line = pts => { for (let i = 1; i < pts.length; i++) seg(pts[i - 1], pts[i]); };
    const seg = (a, b) => {
      const n = Math.max(Math.abs(px(b[0]) - px(a[0])), Math.abs(py(b[1]) - py(a[1])), 1);
      for (let k = 0; k <= n; k++) g.fillRect(Math.round(lerp(px(a[0]), px(b[0]), k / n)), Math.round(lerp(py(a[1]), py(b[1]), k / n)), 1, 1);
    };
    for (const role in start) {
      const [f, y] = start[role];
      const rn = play.routes && play.routes[role];
      const r = rn && ROUTES[rn];
      if (r) {
        const inside = y < 0 ? 1 : -1;
        const pts = [[f, y]].concat(r.pts.map(([a, b]) => [f + Math.min(a, 26), clamp(y + inside * b, -19, 19)]));
        line(pts);
      }
    }
    if (play.type === 'run') {
      g.fillStyle = '#ff7a4a';
      line(play.run === 'dive' ? [[-4.2, -2.6], [-2, -0.6], [0.5, 1.2], [12, 1.2]] : [[-4.2, -2.6], [-4.2, 5], [-1, 12], [12, 13.5]]);
    }
    g.fillStyle = '#ffffff';
    for (const role in start) { const [f, y] = start[role]; g.fillRect(px(f) - 1, py(y) - 1, 3, 3); }
    for (let i = -2; i <= 2; i++) g.fillRect(px(-0.8) - 1, py(i * 2.3) - 1, 2, 2);
    g.fillRect(px(-4.2) - 1, py(0) - 1, 3, 3);
  }

  // The ball is snapped automatically a beat after the play call; a tap snaps it sooner.
  function presnap(m) {
    m.awaitSnap = true;
    const p = m.play;
    setTimeout(() => { if (match === m && m.awaitSnap && m.play === p && !paused) { m.awaitSnap = false; p.snap(); } }, 700);
  }

  // "GET READY!" + Kick Off, like the real thing
  function ready(fn) {
    hideSheet();
    const r = $('ready');
    r.hidden = false;
    const btn = r.querySelector('button');
    btn.onclick = () => { sfx('click'); ensureAudio(); r.hidden = true; fn(); };
  }

  function meter(cfg, cb) {
    const el = $('meter');
    el.innerHTML = `<div class="box panel">
      <div class="ptitle">${esc(cfg.title)}</div><p>${esc(cfg.sub)}</p>
      <div class="bar"><div class="zone" style="left:${(0.5 - cfg.zone / 2) * 100}%;width:${cfg.zone * 100}%"></div><div class="needle"></div></div>
      <p class="blink">${cfg.punt ? 'TAP IN THE GREEN FOR A BOOMING PUNT' : 'TAP WHEN THE NEEDLE IS IN THE GREEN'}</p></div>`;
    el.hidden = false;
    const needle = el.querySelector('.needle');
    const t0 = performance.now();
    let stopped = false, v = 0;
    const tick = () => {
      if (stopped) return;
      const t = (performance.now() - t0) / 1000 * cfg.speed;
      const ph = t % 2; v = ph < 1 ? ph : 2 - ph;
      needle.style.left = (v * 100) + '%';
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const stop = () => {
      if (stopped) return;
      stopped = true;
      sfx('kick');
      el.removeEventListener('pointerdown', stop);
      setTimeout(() => { el.hidden = true; cb(v); }, 550);
    };
    setTimeout(() => el.addEventListener('pointerdown', stop), 250);
  }

  function hudUpdate(m) {
    const away = m.userHome ? m.opp : m.user, home = m.userHome ? m.user : m.opp;
    const as = m.userHome ? m.score.o : m.score.u, hs = m.userHome ? m.score.u : m.score.o;
    $('hAway').textContent = `${away.id} ${as}`;
    $('hHome').textContent = `${home.id} ${hs}`;
    $('hAway').classList.toggle('me', !m.userHome);
    $('hHome').classList.toggle('me', m.userHome);
    $('hClock').textContent = m.ot ? (m.otRound > 1 ? `OT${m.otRound}` : 'OT') : `${ORD[Math.min(m.q, 4)]} Qtr ${fmtClock(m.clock)}`;
    $('hDown').textContent = m.play && !m.play.kickoff && !m.kickAnim ? m.situation().split(' · ')[0] : '';
  }

  // ---- main loop ---------------------------------------------------------------
  function drawStrip(strip, camX) {
    const cam = clamp(camX, FIELD_XMIN + W / 2 / SX, FIELD_XMAX - W / 2 / SX);
    ctx.drawImage(strip, (cam - FIELD_XMIN) * SX - W / 2, 0, W, VIEW_H, 0, 0, W, VIEW_H);
    return cam;
  }
  function drawLooseBall(camX, x, y, h, spin) {
    const cam = clamp(camX, FIELD_XMIN + W / 2 / SX, FIELD_XMAX - W / 2 / SX);
    const q = v => Math.round(v * RQ) / RQ;
    const bx = q((x - cam) * SX + W / 2), gy = q(FIELD_TOP + y * SY), by = gy - q(h * POST_H);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(bx - 1, gy, 3, 1);
    ctx.fillStyle = '#7a3b12';
    if (Math.floor(spin) & 1) ctx.fillRect(bx - 1, by - 1, 2, 3); else ctx.fillRect(bx - 1, by - 1, 3, 2);
    ctx.fillStyle = '#f2e6d0'; ctx.fillRect(bx, by - 1, 1, 1);
  }

  // Touchdown confetti in the scoring team's colors, in screen space
  let confetti = [];
  function confettiBurst(team) {
    const cols = [team.c1, team.c2, '#ffd23c', '#f4f4f4'];
    for (let i = 0; i < 140; i++) {
      confetti.push({ x: Math.random() * W, y: -10 - Math.random() * 60, vx: (Math.random() - 0.5) * 30, vy: 30 + Math.random() * 50, c: cols[i % cols.length], life: 2.2 + Math.random() });
    }
  }
  function drawConfetti(dt) {
    if (!confetti.length) return;
    for (const c of confetti) {
      c.life -= dt; c.x += c.vx * dt; c.y += c.vy * dt; c.vx += (Math.random() - 0.5) * 60 * dt;
      ctx.fillStyle = c.c; ctx.fillRect(Math.round(c.x), Math.round(c.y), 2, (c.life * 10 | 0) & 1 ? 2 : 1);
    }
    confetti = confetti.filter(c => c.life > 0 && c.y < VIEW_H);
  }

  function driveAnim(from, to, cb) {
    if (!match) return cb();
    match.driveAnim = { from, to, t: 0, dur: clamp(Math.abs(to - from) / 45, 0.8, 1.8), cb };
  }

  let last = 0;
  function frame(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000 || 0);
    last = ts;
    keyInput();
    if (match) {
      const p = match.play, k = match.kickAnim, dv = match.driveAnim;
      $('btnScramble').hidden = !(p && !k && p.canThrow());
      if (k) {
        // kick in flight
        k.t += dt;
        const u = Math.min(1, k.t / k.dur);
        const bx = lerp(k.fx, k.tx, u), by = lerp(k.fy, k.ty, u), h = 4 * k.peak * u * (1 - u) + 0.5 * (1 - u);
        let cam;
        if (p) { p.camX += (bx + 3 - p.camX) * Math.min(1, dt * 4); p.draw(ctx, W, match.strip, null); cam = p.camX; }
        else { match.camX = bx; drawStrip(match.strip, bx); cam = bx; }
        drawLooseBall(cam, bx, by, h, k.t * 14);
        if (u >= 1) { match.kickAnim = null; k.cb(); }
      } else if (p) {
        p.input = input;
        if (!paused) p.update(dt);
        while (p.events.length) { const ev = p.events.shift(); sfx(ev); if (ev === 'td') confettiBurst(match.user); }
        if (p.phase === 'dead' && p.deadT > 0.9 && !p.reported) {
          p.reported = true;
          aiming = null; stick = null; input.active = false;
          match.onPlayEnd(p.result);
        }
        p.draw(ctx, W, match.strip, match.mode === 'two' ? null : match.fd);
      } else if (dv) {
        // opponent drive: the ball marches toward the user's end zone
        dv.t += dt;
        const u = Math.min(1, dv.t / dv.dur), e = u * u * (3 - 2 * u);
        const bx = lerp(dv.from, dv.to, e);
        match.camX += (bx - 8 - match.camX) * Math.min(1, dt * 4);
        const cam = drawStrip(match.strip, match.camX);
        const sx = x => Math.round(((x - cam) * SX + W / 2) * RQ) / RQ, top = FIELD_TOP, bot = FIELD_TOP + FIELD_W * SY;
        ctx.fillStyle = 'rgba(255,90,74,0.25)';
        ctx.fillRect(Math.min(sx(dv.from), sx(bx)), top, Math.abs(sx(dv.from) - sx(bx)), bot - top);
        ctx.fillStyle = 'rgba(70,140,255,0.9)'; ctx.fillRect(sx(dv.from), top, 1, bot - top);
        ctx.fillStyle = '#ff5a4a'; ctx.fillRect(sx(bx), top, 1, bot - top);
        drawLooseBall(cam, bx, FIELD_W / 2, 0.4 + Math.abs(Math.sin(dv.t * 9)) * 0.6, 0);
        if (u >= 1 && !dv.done) { dv.done = true; setTimeout(() => { match && (match.driveAnim = null); dv.cb(); }, 250); }
      } else {
        drawStrip(match.strip, match.camX);
      }
    } else {
      if (!attract.strip) {
        const h = TEAM_BY_ID[league ? league.userId : 'SJU'], a = TEAM_BY_ID[league ? 'UWW' : 'UWW'];
        attract.strip = buildFieldStrip(h, h.id === a.id ? TEAM_BY_ID.SJU : a);
      }
      attract.cam += dt * 3;
      if (attract.cam > 100) attract.cam = 0;
      drawStrip(attract.strip, attract.cam);
    }
    drawConfetti(dt);
    requestAnimationFrame(frame);
  }

  // ---- menus -------------------------------------------------------------------
  const helmetCache = {};
  function helmet(id) {
    if (!helmetCache[id]) helmetCache[id] = getSprite(makeKit(TEAM_BY_ID[id], true), SKINS[3], 'front', 1).toDataURL();
    return `<img class="helm" src="${helmetCache[id]}" alt="">`;
  }
  function pips(v, max = 5) {
    const n = Math.round(v);
    let s = '<span class="pips" aria-label="' + n + ' of 5">';
    for (let i = 1; i <= max; i++) s += `<i class="${i <= n ? 'on' : ''}"></i>`;
    return s + '</span>';
  }
  function show(html) {
    const s = $('screen');
    s.innerHTML = `<div class="wrap">${html}</div>`;
    s.hidden = false;
    s.scrollTop = 0;
    s.querySelectorAll('[data-act]').forEach(el => el.addEventListener('click', ev => {
      sfx('click'); ensureAudio();
      actions[el.dataset.act](el.dataset.arg, ev);
    }));
  }
  function hideScreen() { $('screen').hidden = true; }

  function title() {
    match = null; $('hud').hidden = true; $('chip').hidden = true;
    const rec = league ? record(league, league.userId) : null;
    show(`
      <header class="logo">
        <div class="logo-top">MIAC <span>×</span> WIAC</div>
        <h1>BORDER<br>BOWL</h1>
        <div class="logo-sub">Pixel football · Minnesota vs. Wisconsin D-III</div>
      </header>
      <nav class="menu">
        ${league ? `<button class="btn go" data-act="hub">CONTINUE<small>${esc(TEAM_BY_ID[league.userId].name)} · Season ${league.season} · ${rec.w}-${rec.l}</small></button>` : ''}
        <button class="btn ${league ? '' : 'go'}" data-act="newSeason">NEW SEASON</button>
        <button class="btn" data-act="quick">QUICK GAME</button>
        <button class="btn" data-act="live">LIVE GAME<small>Johnnies &amp; Falcons: live, next home game, last score</small></button>
        <div class="row2">
          <button class="btn" data-act="howto">HOW TO PLAY</button>
          <button class="btn" data-act="settings">SETTINGS</button>
        </div>
      </nav>
      <p class="fine">20 schools · 9-week season · conference title games · the Border Bowl.<br>Plays best with your phone turned sideways.</p>`);
  }

  function teamGrid(heading, exclude) {
    const confs = [['MIAC', 'Minnesota'], ['WIAC', 'Wisconsin']];
    return `<h2>${esc(heading)}</h2>` + confs.map(([c, st]) => `
      <h3>${c} <span class="dim">· ${st}</span></h3>
      <div class="teams">${TEAMS.filter(t => t.conf === c && t.id !== exclude).map(t => `
        <button class="team" data-act="pickTeam" data-arg="${t.id}" style="--c1:${t.c1};--c2:${t.c2}">
          ${helmet(t.id)}
          <span class="tname">${esc(t.name)}</span>
          <span class="tmasc">${esc(t.mascot)}</span>
          <span class="trate"><b>OFF</b>${pips(t.off)}<b>DEF</b>${pips(t.def)}</span>
        </button>`).join('')}</div>`).join('') + `<div class="menu"><button class="btn" data-act="title">BACK</button></div>`;
  }

  let pickCb = null;
  function chooseTeam(heading, exclude, cb) { pickCb = cb; show(teamGrid(heading, exclude)); }

  function teamData(id) {
    const base = TEAM_BY_ID[id];
    return league && league.teams[id] ? Object.assign({}, base, { off: league.teams[id].off, def: league.teams[id].def }) : Object.assign({}, base);
  }

  function weekLabel(w) { return w < REG_WEEKS ? `WEEK ${w + 1}` : w === REG_WEEKS ? 'CONFERENCE TITLE GAME' : 'BORDER BOWL'; }

  let hubTab = 'schedule';
  function hub() {
    match = null; $('hud').hidden = true; $('chip').hidden = true;
    const L = league, me = TEAM_BY_ID[L.userId], rec = record(L, L.userId);
    const crow = standings(L, me.conf).find(r => r.id === me.id);
    let next = '';
    if (L.week >= REG_WEEKS + 2) {
      const ch = TEAM_BY_ID[L.champion];
      next = `<div class="box next ${L.champion === L.userId ? 'champ' : ''}">
        <div class="kicker">SEASON ${L.season} COMPLETE</div>
        <div class="ptitle">${L.champion === L.userId ? 'BORDER BOWL CHAMPIONS!' : esc(ch.name) + ' won the Border Bowl'}</div>
        <p>${esc(me.mascot)} finished ${rec.w}-${rec.l}.</p>
        <div class="row"><button class="btn go" data-act="nextSeason">START SEASON ${L.season + 1}</button></div></div>`;
    } else {
      const g = userGameOfWeek(L);
      if (g) {
        const home = g.h === L.userId, opp = TEAM_BY_ID[home ? g.a : g.h], orec = record(L, opp.id);
        next = `<div class="box next">
          <div class="kicker">${esc(weekLabel(L.week))}${g.border ? ' · BORDER BATTLE' : ''}${g.title && g.title !== 'BORDER BOWL' ? ' · ' + esc(g.title) : ''}</div>
          <div class="matchup">${helmet(opp.id)}<div><div class="ptitle">${home || g.neutral ? 'vs' : '@'} ${esc(opp.name)}</div>
          <p>${esc(opp.mascot)} · ${orec.w}-${orec.l} · ${g.neutral ? 'Neutral site' : home ? 'Home' : 'Away'}</p></div></div>
          <div class="row"><button class="btn go" data-act="playWeek">PLAY GAME</button><button class="btn" data-act="simWeek">SIM</button></div></div>`;
      } else {
        next = `<div class="box next"><div class="kicker">${esc(weekLabel(L.week))}</div>
          <div class="ptitle">${L.week < REG_WEEKS ? 'BYE WEEK' : 'YOU MISSED THE POSTSEASON'}</div>
          <p>${L.week < REG_WEEKS ? 'Rest up. The rest of the league plays on.' : 'Top two in each conference play for the title.'}</p>
          <div class="row"><button class="btn go" data-act="simWeek">${L.week < REG_WEEKS ? 'ADVANCE' : 'SIM ' + esc(weekLabel(L.week))}</button></div></div>`;
      }
    }
    const tabs = ['schedule', 'standings', 'roster', 'history'];
    show(`
      <header class="teamhead" style="--c1:${me.c1};--c2:${me.c2}">
        ${helmet(me.id)}
        <div><div class="kicker">SEASON ${L.season} · ${me.conf}</div><h2>${esc(me.name)} ${esc(me.mascot)}</h2>
        <p>${rec.w}-${rec.l} overall · ${crow ? crow.cw + '-' + crow.cl : '0-0'} ${me.conf}</p></div>
        <div class="cp"><b>${L.cp}</b><span>COACH PTS</span></div>
      </header>
      ${next}
      ${L.week === 0 ? recruitHTML() : ''}
      <div class="tabs">${tabs.map(t => `<button class="tab ${hubTab === t ? 'on' : ''}" data-act="tab" data-arg="${t}">${t.toUpperCase()}</button>`).join('')}</div>
      <section class="tabbody">${hubTab === 'schedule' ? scheduleHTML() : hubTab === 'standings' ? standingsHTML() : hubTab === 'history' ? historyHTML() : rosterHTML()}</section>
      <div class="menu"><button class="btn" data-act="title">MAIN MENU</button></div>`);
  }

  function scheduleHTML() {
    const L = league, rows = [];
    const all = L.schedule.concat(L.post);
    all.forEach((games, w) => {
      const g = games.find(x => x.h === L.userId || x.a === L.userId);
      if (!g) { if (w < REG_WEEKS) rows.push(`<tr><td>${w + 1}</td><td class="dim">BYE</td><td></td></tr>`); return; }
      const home = g.h === L.userId, opp = TEAM_BY_ID[home ? g.a : g.h];
      let res = '';
      if (g.done) {
        const us = home ? g.hs : g.as, them = home ? g.as : g.hs;
        res = `<span class="${us > them ? 'win' : 'loss'}">${us > them ? 'W' : 'L'} ${us}-${them}</span>`;
      } else if (w === L.week) res = '<span class="dim">NEXT</span>';
      rows.push(`<tr class="${w === L.week ? 'cur' : ''}"><td>${w < REG_WEEKS ? w + 1 : w === REG_WEEKS ? 'CG' : 'BB'}</td><td>${home || g.neutral ? 'vs' : '@'} ${esc(opp.name)}${g.border ? ' <span class="tag">BORDER</span>' : ''}${g.title ? ` <span class="tag">${esc(g.title)}</span>` : ''}</td><td>${res}</td></tr>`);
    });
    return `<table class="tbl"><thead><tr><th>WK</th><th>OPPONENT</th><th>RESULT</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
  }

  function standingsHTML() {
    return ['MIAC', 'WIAC'].map(c => `<h3>${c}</h3><table class="tbl"><thead><tr><th>#</th><th>TEAM</th><th>CONF</th><th>ALL</th><th>PF</th><th>PA</th></tr></thead><tbody>
      ${standings(league, c).map((r, i) => `<tr class="${r.id === league.userId ? 'cur' : ''}"><td>${i + 1}</td><td>${esc(TEAM_BY_ID[r.id].name)}</td><td>${r.cw}-${r.cl}</td><td>${r.w}-${r.l}</td><td>${r.pf}</td><td>${r.pa}</td></tr>`).join('')}
      </tbody></table>`).join('');
  }

  const YEARS = ['', 'FR', 'SO', 'JR', 'SR'];
  function rosterHTML() {
    const L = league;
    const rows = POSITIONS.map(pos => {
      const p = L.roster[pos.key];
      const sl = statLine(pos.key, p.ss);
      return `<div class="prow"><div class="pid"><b>${pos.label}</b> #${p.num} ${esc(p.name)} <span class="dim">${YEARS[p.year]}</span>${sl ? `<div class="pstat">${esc(sl)}</div>` : ''}</div>
        <div class="pattrs">${pos.attrs.map(a => `<span class="attr">${ATTR_NAMES[a]} ${pips(p[a])}
        ${p[a] < 5 ? `<button class="plus" data-act="upgrade" data-arg="${pos.key}.${a}" ${L.cp < upgradeCost(p[a]) ? 'disabled' : ''}>+${upgradeCost(p[a])}</button>` : '<span class="max">MAX</span>'}</span>`).join('')}</div></div>`;
    }).join('');
    const unit = (k, label, desc) => `<div class="prow"><div class="pid"><b>${label}</b> <span class="dim">${desc}</span></div>
      <div class="pattrs"><span class="attr">${pips(L.units[k])}${L.units[k] < 5 ? `<button class="plus" data-act="upgrade" data-arg="unit.${k}" ${L.cp < L.units[k] + 1 ? 'disabled' : ''}>+${L.units[k] + 1}</button>` : '<span class="max">MAX</span>'}</span></div></div>`;
    return `<p class="fine">Spend coach points to develop players. Win games to earn more (3 per win, 1 per loss, 5 for a title game win).</p>
      ${rows}${unit('ol', 'O-LINE', 'pass protection + run blocking')}${unit('def', 'DEFENSE', 'how often opponents score')}`;
  }

  let offseasonReport = null;
  function offseason(rep) {
    offseasonReport = rep;
    show(`<h2>OFFSEASON · SEASON ${league.season}</h2><div class="box help">
        <h3>Graduated</h3><p>${rep.graduated.length ? rep.graduated.map(esc).join('<br>') : 'Nobody. A young team returns intact.'}</p>
        <h3>Offseason gains</h3><p>${rep.improved.length ? rep.improved.map(esc).join('<br>') : 'None this year.'}</p>
        <p class="dim">+2 coach points for the new season.</p></div>
        ${recruitHTML()}
        <div class="menu"><button class="btn go" data-act="toSeason">TO SEASON ${league.season}</button></div>`);
  }

  function recruitHTML() {
    const L = league;
    if (!L.recruits || !L.recruits.length) return '';
    return `<h3>RECRUITING</h3><p class="fine">Pick one freshman for each open spot. A better record draws better recruits.</p>` +
      L.recruits.map((r, i) => {
        const pos = POSITIONS.find(p => p.key === r.pos);
        return `<div class="prow recruit"><div class="pid"><b>${pos.label}</b> <span class="dim">replacing a senior</span></div>
          <div class="ropts">${r.options.map((p, j) => `<button class="ropt ${(r.chosen || 0) === j ? 'on' : ''}" data-act="recruit" data-arg="${i}.${j}">
            <span>${esc(p.name)}</span>${pos.attrs.map(a => `<span class="attr">${ATTR_NAMES[a]} ${pips(p[a])}</span>`).join('')}</button>`).join('')}</div></div>`;
      }).join('');
  }

  function historyHTML() {
    const L = league, H = L.history || [];
    const titles = H.filter(h => h.won).length, confs = H.filter(h => h.conf).length;
    const allTime = H.reduce((a, h) => ({ w: a.w + h.w, l: a.l + h.l }), { w: 0, l: 0 });
    const leaders = POSITIONS.map(pos => { const p = L.roster[pos.key], s = statLine(pos.key, p.ss); return s ? `<tr><td>${pos.label}</td><td>${esc(p.name)}</td><td>${esc(s)}</td></tr>` : ''; }).join('');
    return `<div class="box help trophies"><h3>TROPHY CASE</h3>
        <p>${titles} Border Bowl title${titles === 1 ? '' : 's'} · ${confs} conference title${confs === 1 ? '' : 's'} · ${allTime.w}-${allTime.l} all-time</p></div>
      <h3>SEASON ${L.season} STATS</h3>
      ${leaders ? `<table class="tbl"><tbody>${leaders}</tbody></table>` : '<p class="fine">No games played yet this season.</p>'}
      <h3>PAST SEASONS</h3>
      ${H.length ? `<table class="tbl"><thead><tr><th>YEAR</th><th>RECORD</th><th>CHAMPION</th></tr></thead><tbody>${H.slice().reverse().map(h => `<tr><td>${h.season}</td><td>${h.w}-${h.l}${h.won ? ' <span class="tag">BORDER BOWL</span>' : h.conf ? ' <span class="tag">CONF CHAMP</span>' : ''}</td><td>${esc(TEAM_BY_ID[h.champ].name)}</td></tr>`).join('')}</tbody></table>` : '<p class="fine">Your first season is underway.</p>'}`;
  }

  function howto() {
    show(`<h2>HOW TO PLAY</h2>
      <div class="box help">
        <h3>Offense is yours</h3><p>You call every play on offense. The defense is simulated and you'll see each opponent drive play out on a scorecard.</p>
        <h3>Snap</h3><p>Pick a play, then tap the field to snap the ball.</p>
        <h3>Throw</h3><p>Touch anywhere and <b>pull back</b> like a slingshot. The dotted arc shows where the ball will land. Let go to throw. Lead your receiver: the dots above their heads are green when they're open.</p>
        <p>Prefer pointing at the target? Switch the aim style in Settings.</p>
        <h3>Run</h3><p>After a catch or handoff, drag in any direction to steer the ball carrier. Let go and he keeps running upfield. <b>Tap</b> to juke past a tackler.</p>
        <p>Pressure coming? Hit <b>RUN</b> to scramble with the quarterback.</p>
        <h3>Kicks</h3><p>On 4th down you can punt or kick a field goal. Tap when the needle is in the green.</p>
        <h3>Season</h3><p>Nine weeks of conference play plus one Border Battle against the other state. The top two in the MIAC and WIAC meet in conference title games, and the champions play in the Border Bowl.</p>
        <h3>Keyboard</h3><p>Space to snap or juke, arrow keys to run, mouse to throw.</p>
      </div>
      <div class="menu"><button class="btn" data-act="title">BACK</button></div>`);
  }

  function settingsScreen() {
    const opt = (k, v, label) => `<button class="opt ${settings[k] === v ? 'on' : ''}" data-act="set" data-arg="${k}:${v}">${label}</button>`;
    show(`<h2>SETTINGS</h2>
      <div class="box help">
        <h3>Sound</h3><div class="opts">${opt('sound', true, 'ON')}${opt('sound', false, 'OFF')}</div>
        <h3>Difficulty</h3><div class="opts">${opt('diff', 'easy', 'EASY')}${opt('diff', 'normal', 'NORMAL')}${opt('diff', 'hard', 'HARD')}</div>
        <h3>Aim style</h3><div class="opts">${opt('aim', 'pull', 'PULL BACK')}${opt('aim', 'touch', 'TOUCH TARGET')}</div>
        <h3>Quarter length</h3><div class="opts">${opt('qlen', 180, '3 MIN')}${opt('qlen', 300, '5 MIN')}${opt('qlen', 480, '8 MIN')}</div>
        ${league ? `<h3>Saved season</h3><div class="opts"><button class="opt danger" data-act="reset">${resetArmed ? 'TAP AGAIN TO DELETE' : 'DELETE SAVE'}</button></div>` : ''}
      </div>
      <div class="menu"><button class="btn" data-act="title">BACK</button></div>`);
  }
  let resetArmed = false;

  // Best performer from one game's box score
  function playerOfGame(m) {
    const s = m.st, by = {};
    const g = k => by[k] || (by[k] = {});
    Object.assign(g('QB'), { comp: s.comp, att: s.att, pyds: s.pyds, ptd: s.ptd, int: s.int });
    for (const [k, r] of Object.entries(s.rush)) Object.assign(g(k), { ratt: r.att, ryds: r.yds, rtd: r.td });
    for (const [k, r] of Object.entries(s.rec)) Object.assign(g(k), { rec: r.rec, recyds: r.yds, rectd: r.td });
    Object.assign(g('K'), { fg: s.fg, fga: s.fga });
    let best = null, bv = 3;
    for (const [k, o] of Object.entries(by)) {
      const v = (o.pyds || 0) / 25 + (o.ptd || 0) * 4 - (o.int || 0) * 2 + ((o.ryds || 0) + (o.recyds || 0)) / 10 + ((o.rtd || 0) + (o.rectd || 0)) * 6 + (o.fg || 0) * 3;
      if (v > bv) { bv = v; best = k; }
    }
    if (!best) return '';
    const p = m.roster[best];
    return `#${p.num} ${p.name} · ${statLine(best, by[best])}`;
  }

  function postgame(m, info) {
    const s = m.st, won = m.score.u > m.score.o;
    const potg = playerOfGame(m);
    const recs = Object.entries(s.rec).sort((a, b) => b[1].yds - a[1].yds).slice(0, 3)
      .map(([role, r]) => { const p = m.roster[role]; return `<tr><td>${esc(p.name)}</td><td>${r.rec} rec</td><td>${r.yds} yds</td><td>${r.td} TD</td></tr>`; }).join('');
    show(`<div class="box final ${won ? 'won' : 'lost'}">
        <div class="kicker">${esc(info.label || 'FINAL')}${m.ot ? ' · OT' : ''}</div>
        <div class="finalscore">
          <div>${helmet(m.user.id)}<b>${m.score.u}</b><span>${esc(m.user.mascot)}</span></div>
          <div class="dash">–</div>
          <div>${helmet(m.opp.id)}<b>${m.score.o}</b><span>${esc(m.opp.mascot)}</span></div>
        </div>
        <div class="ptitle">${won ? 'VICTORY' : 'DEFEAT'}</div>
        ${potg ? `<p class="potg"><span class="kicker">PLAYER OF THE GAME</span><br>${esc(potg)}</p>` : ''}
        ${info.extra ? `<p>${esc(info.extra)}</p>` : ''}
      </div>
      <h3>BOX SCORE</h3>
      <table class="tbl"><tbody>
        <tr><td>Passing</td><td>${s.comp}/${s.att}</td><td>${s.pyds} yds</td><td>${s.ptd} TD · ${s.int} INT</td></tr>
        <tr><td>Rushing</td><td>${s.ratt} att</td><td>${s.ryds} yds</td><td>${s.rtd} TD</td></tr>
        ${s.fga ? `<tr><td>Kicking</td><td>${s.fg}/${s.fga} FG</td><td></td><td></td></tr>` : ''}
        ${recs}
      </tbody></table>
      <div class="menu"><button class="btn go" data-act="${esc(info.next)}">CONTINUE</button></div>`);
  }

  // ---- starting games -------------------------------------------------------------
  function tryFullscreen() {
    if (!matchMedia('(pointer: coarse)').matches) return;
    const el = document.documentElement;
    try {
      const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : null;
      if (p && p.then) p.then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* unsupported */ } }).catch(() => {});
    } catch (e) { /* not allowed here */ }
  }

  function startMatch(opts, ctxInfo) {
    tryFullscreen();
    hideScreen();
    $('hud').hidden = false;
    paused = false;
    matchCtx = ctxInfo;
    match = new Match(Object.assign({ qlen: settings.qlen, diff: settings.diff, onFinish: m => endMatch(m) }, opts));
    resize();
    match.start();
  }

  // Live play-by-play viewer (js/live.js) drives the same field, HUD and loop.
  function startLive(lm) {
    tryFullscreen();
    hideScreen();
    $('hud').hidden = false;
    paused = false;
    matchCtx = { kind: 'live' };
    match = lm;
    resize();
    lm.start();
  }

  function endMatch(m) {
    $('hud').hidden = true; $('chip').hidden = true; $('btnScramble').hidden = true; $('tapHint').hidden = true; $('ready').hidden = true;
    $('rotate').hidden = true;
    match = null;
    const won = m.score.u > m.score.o;
    sfx(won ? 'td' : 'bad');
    if (matchCtx.kind === 'quick') return postgame(m, { label: 'FINAL', next: 'title' });
    const L = league, g = matchCtx.game;
    const home = g.h === L.userId;
    g.hs = home ? m.score.u : m.score.o; g.as = home ? m.score.o : m.score.u; g.done = true;
    addGameStats(L, m.st);
    const earned = applyResult(L, g, won);
    const label = weekLabel(L.week);
    finishWeek(L);
    store(SAVE_KEY, L);
    postgame(m, { label, next: 'hub', extra: `+${earned} coach points` });
  }

  function applyResult(L, g, won) {
    let pts = won ? 3 : 1;
    if (won && g.title) pts = 5;
    L.cp += pts;
    return pts;
  }

  // ---- actions ---------------------------------------------------------------------
  const actions = {
    title: () => title(),
    toSeason: () => { offseasonReport = null; hubTab = 'schedule'; hub(); },
    hub: () => hub(),
    howto: () => howto(),
    settings: () => { resetArmed = false; settingsScreen(); },
    set: arg => {
      const [k, v] = arg.split(':');
      settings[k] = v === 'true' ? true : v === 'false' ? false : isNaN(+v) ? v : +v;
      store(SETTINGS_KEY, settings);
      if (k === 'sound' && settings.sound) ensureAudio();
      settingsScreen();
    },
    reset: () => {
      if (!resetArmed) { resetArmed = true; return settingsScreen(); }
      wipe(SAVE_KEY); league = null; resetArmed = false; attract.strip = null; title();
    },
    newSeason: () => chooseTeam('PICK YOUR SCHOOL', null, id => {
      league = newLeague(id);
      store(SAVE_KEY, league);
      attract.strip = null;
      hubTab = 'schedule';
      hub();
    }),
    live: () => GameDay.open(),
    quick: () => chooseTeam('YOUR TEAM', null, me => chooseTeam('OPPONENT', me, opp => {
      const ut = Object.assign({}, TEAM_BY_ID[me]), ot = Object.assign({}, TEAM_BY_ID[opp]);
      startMatch({ user: ut, opp: ot, userHome: true, roster: genRoster(ut), units: { ol: clamp(Math.round(ut.off), 1, 5), def: clamp(Math.round(ut.def), 1, 5) }, title: 'Exhibition' }, { kind: 'quick' });
    })),
    pickTeam: id => pickCb && pickCb(id),
    tab: t => { hubTab = t; hub(); },
    playWeek: () => {
      const L = league, g = userGameOfWeek(L);
      const home = g.h === L.userId;
      syncUserRating(L);
      startMatch({
        user: teamData(L.userId), opp: teamData(home ? g.a : g.h), userHome: home, neutral: g.neutral,
        roster: L.roster, units: L.units, title: g.title || (g.border ? 'Border Battle' : weekLabel(L.week)),
      }, { kind: 'season', game: g });
    },
    simWeek: () => {
      const L = league, g = userGameOfWeek(L);
      if (g) {
        syncUserRating(L);
        simGame(L, g);
        const home = g.h === L.userId, won = home ? g.hs > g.as : g.as > g.hs;
        applyResult(L, g, won);
      }
      finishWeek(L);
      store(SAVE_KEY, L);
      hub();
    },
    nextSeason: () => {
      const rep = nextSeason(league);
      store(SAVE_KEY, league);
      offseason(rep);
    },
    recruit: arg => {
      const L = league, [i, j] = arg.split('.').map(Number), r = L.recruits[i];
      if (!r) return;
      r.chosen = j; L.roster[r.pos] = r.options[j];
      syncUserRating(L); store(SAVE_KEY, L);
      if (offseasonReport) offseason(offseasonReport); else hub();
    },
    upgrade: arg => {
      const L = league, [k, a] = arg.split('.');
      if (k === 'unit') {
        const c = L.units[a] + 1;
        if (L.cp >= c && L.units[a] < 5) { L.cp -= c; L.units[a]++; }
      } else {
        const p = L.roster[k], c = upgradeCost(p[a]);
        if (L.cp >= c && p[a] < 5) { L.cp -= c; p[a]++; }
      }
      syncUserRating(L);
      store(SAVE_KEY, L);
      hub();
    },
  };

  function quitMatch() {
    if (match && match.onQuit) match.onQuit();
    paused = false; match = null;
    for (const id of ['hud', 'chip', 'tapHint', 'btnScramble', 'sheet', 'rotate', 'ready']) $(id).hidden = true;
    matchCtx && matchCtx.kind === 'season' ? hub() : title();
  }

  // ---- boot --------------------------------------------------------------------------
  function init() {
    cv = $('cv'); ctx = cv.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => setTimeout(resize, 200));
    cv.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    $('banner').addEventListener('pointerdown', () => bannerDone && bannerDone());
    $('btnScramble').addEventListener('pointerdown', e => { e.stopPropagation(); if (match && match.play) match.play.scramble(); });
    $('btnPause').addEventListener('click', () => {
      if (!match || paused || !$('card').hidden || !$('meter').hidden || !$('banner').hidden) return;
      paused = true;
      const wasSheet = !$('sheet').hidden;
      card({
        title: 'PAUSED', lines: [match.scoreLine()],
        buttons: [
          { label: 'RESUME', cls: 'go', fn: () => { paused = false; if (wasSheet) $('sheet').hidden = false; } },
          { label: 'QUIT GAME', fn: quitMatch },
        ],
      });
    });
    window.addEventListener('keydown', e => {
      keys[e.code] = true;
      if (e.code === 'Space') {
        e.preventDefault();
        if (bannerDone) return bannerDone();
        const p = match && match.play;
        if (!p) return;
        if (p.phase === 'presnap' && match.awaitSnap) { match.awaitSnap = false; p.snap(); }
        else p.juke();
      }
    });
    window.addEventListener('keyup', e => { keys[e.code] = false; });
    document.addEventListener('pointerdown', ensureAudio, { once: false, passive: true });
    title();
    requestAnimationFrame(frame);
  }

  return { init, card, banner, playSelect, presnap, ready, meter, hudUpdate, sfx, driveAnim, settings, show, startLive, helmet, esc, title, currentMatch: () => match };
})();

window.addEventListener('DOMContentLoaded', UI.init);
