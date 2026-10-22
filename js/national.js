'use strict';
// ---------------------------------------------------------------------------
// National Season: pick any Division III school, play a random 10-game
// schedule (conference games first), then the 32-team NCAA tournament:
// conference champions get automatic bids, the best of the rest get at-large
// bids, and five rounds end at the Stagg Bowl. Every other game is simulated.
// ---------------------------------------------------------------------------

const NAT_KEY = 'borderbowl-national-v1';
const NAT_WEEKS = 10;
const NAT_ROUNDS = ['FIRST ROUND', 'SECOND ROUND', 'QUARTERFINAL', 'SEMIFINAL', 'STAGG BOWL'];

const National = (() => {
  const $ = id => document.getElementById(id);
  const esc = s => UI.esc(s);
  let N = load(NAT_KEY);
  if (N && (N.v !== 1 || !TEAM_BY_ID[N.userId])) N = null;
  let tab = 'schedule';
  const T = id => TEAM_BY_ID[id];
  const confOf = id => (D3_TEAMS.find(t => t.id === id) || {}).d3conf;
  const save = () => store(NAT_KEY, N);

  // ---- league setup -----------------------------------------------------------
  function newNational(userId) {
    const teams = {};
    for (const t of D3_TEAMS) teams[t.id] = { id: t.id, off: t.off, def: t.def };
    const ut = T(userId);
    N = {
      v: 1, userId, season: 1, week: 0, cp: 3, teams,
      roster: genRoster(ut), units: { ol: clamp(Math.round(ut.off), 1, 5), def: clamp(Math.round(ut.def), 1, 5) },
      schedule: [], post: [], bracket: null, champion: null, history: [],
    };
    makeSchedule();
    sync();
    save();
  }

  function sync() { const u = N.teams[N.userId]; u.off = rosterOffense(N.roster, N.units); u.def = N.units.def; }

  // Ten weeks of random pairings: conference opponents first, then anyone.
  function makeSchedule() {
    const ids = D3_TEAMS.map(t => t.id);
    const played = Object.fromEntries(ids.map(id => [id, new Set()]));
    N.schedule = [];
    for (let w = 0; w < NAT_WEEKS; w++) {
      const open = new Set(shuffle(ids.slice()));
      const games = [];
      for (const id of [...open]) {
        if (!open.has(id)) continue;
        open.delete(id);
        const c = confOf(id);
        let pool = [...open].filter(o => !played[id].has(o));
        const conf = pool.filter(o => confOf(o) === c);
        // conference games go early so most teams finish their league slate
        const pick = conf.length && w < 9 ? pick1(conf) : pool.length ? pick1(pool) : null;
        if (!pick) continue;  // bye week
        open.delete(pick);
        played[id].add(pick); played[pick].add(id);
        const home = Math.random() < 0.5;
        games.push({ h: home ? id : pick, a: home ? pick : id, conf: confOf(pick) === c });
      }
      N.schedule.push(games);
    }
    N.post = []; N.bracket = null; N.champion = null;
  }
  const pick1 = a => a[Math.floor(Math.random() * a.length)];

  // ---- standings, rankings, bracket -----------------------------------------
  function records() {
    const r = {};
    for (const t of D3_TEAMS) r[t.id] = { id: t.id, w: 0, l: 0, cw: 0, cl: 0, pf: 0, pa: 0 };
    for (const g of N.schedule.flat()) {
      if (!g.done) continue;
      for (const [me, ms, os] of [[g.h, g.hs, g.as], [g.a, g.as, g.hs]]) {
        const x = r[me], win = ms > os;
        win ? x.w++ : x.l++;
        if (g.conf) win ? x.cw++ : x.cl++;
        x.pf += ms; x.pa += os;
      }
    }
    return r;
  }
  const pct = (w, l) => (w + l ? w / (w + l) : 0);
  function confStandings(conf, r) {
    return D3_TEAMS.filter(t => t.d3conf === conf).map(t => r[t.id])
      .sort((a, b) => pct(b.cw, b.cl) - pct(a.cw, a.cl) || pct(b.w, b.l) - pct(a.w, a.l) || (b.pf - b.pa) - (a.pf - a.pa));
  }
  // Power score for at-large bids, seeding and the Top 25
  function power(id, r) {
    const x = r[id], t = N.teams[id];
    return pct(x.w, x.l) * 3 + (x.pf - x.pa) / Math.max(1, x.w + x.l) * 0.02 + (t.off + t.def) * 0.15;
  }
  function top25(r) {
    return D3_TEAMS.map(t => t.id).sort((a, b) => power(b, r) - power(a, r)).slice(0, 25);
  }

  function buildBracket() {
    const r = records();
    const champs = Object.keys(D3_CONFS).filter(c => !D3_NO_PLAYOFFS.has(c)).map(c => ({ id: confStandings(c, r)[0].id, auto: c }));
    const autoIds = new Set(champs.map(c => c.id));
    const atLarge = D3_TEAMS.filter(t => !autoIds.has(t.id) && !D3_NO_PLAYOFFS.has(t.d3conf)).map(t => t.id)
      .sort((a, b) => power(b, r) - power(a, r)).slice(0, 32 - champs.length).map(id => ({ id, auto: null }));
    const field = champs.concat(atLarge).sort((a, b) => power(b.id, r) - power(a.id, r));
    field.forEach((f, i) => { f.seed = i + 1; });
    N.bracket = { field };
    // 1 v 32, 16 v 17, 8 v 25, 9 v 24 ... so the top seeds meet late
    const order = [1, 32, 16, 17, 8, 25, 9, 24, 4, 29, 13, 20, 5, 28, 12, 21, 2, 31, 15, 18, 7, 26, 10, 23, 3, 30, 14, 19, 6, 27, 11, 22];
    const games = [];
    for (let i = 0; i < 32; i += 2) {
      const a = field[order[i] - 1], b = field[order[i + 1] - 1];
      games.push({ h: a.id, a: b.id, title: NAT_ROUNDS[0], seeds: [a.seed, b.seed] });
    }
    N.post = [games];
  }
  const seedOf = id => { const f = N.bracket && N.bracket.field.find(x => x.id === id); return f ? f.seed : null; };

  function advanceBracket() {
    const prev = N.post[N.post.length - 1];
    const winners = prev.map(g => (g.hs > g.as ? g.h : g.a));
    if (winners.length === 1) {
      N.champion = winners[0];
      const r = records(), me = r[N.userId];
      const pw = N.post.flat().filter(g => (g.h === N.userId || g.a === N.userId) && g.done);
      const lastRound = pw.length ? NAT_ROUNDS[pw.length - 1] : null;
      const all = record(N, N.userId);
      N.history.push({ season: N.season, w: all.w, l: all.l, champ: N.champion, won: N.champion === N.userId, made: pw.length > 0, lastRound });
      return;
    }
    const round = NAT_ROUNDS[N.post.length];
    const games = [];
    for (let i = 0; i < winners.length; i += 2) {
      // better seed hosts; the Stagg Bowl is a neutral site
      const [x, y] = [winners[i], winners[i + 1]].sort((p, q) => seedOf(p) - seedOf(q));
      games.push({ h: x, a: y, title: round, seeds: [seedOf(x), seedOf(y)], neutral: round === 'STAGG BOWL' });
    }
    N.post.push(games);
  }

  function weekGames() { return N.week < NAT_WEEKS ? N.schedule[N.week] : (N.post[N.week - NAT_WEEKS] || []); }
  function myGame() { return weekGames().find(g => g.h === N.userId || g.a === N.userId) || null; }
  function over() { return !!N.champion; }

  function finishWeek() {
    for (const g of weekGames()) if (!g.done) simGame(N, g);
    for (const id in N.teams) if (id !== N.userId) { const t = N.teams[id]; t.off = clamp(t.off + gauss() * 0.04, 1, 5); t.def = clamp(t.def + gauss() * 0.04, 1, 5); }
    N.week++;
    if (N.week === NAT_WEEKS) buildBracket();
    else if (N.week > NAT_WEEKS) advanceBracket();
    save();
  }

  function weekLabel(w) { return w < NAT_WEEKS ? `WEEK ${w + 1}` : NAT_ROUNDS[w - NAT_WEEKS] || 'POSTSEASON'; }

  // ---- screens ------------------------------------------------------------------
  function open() { N ? hub() : pickTeam(); }

  function pickTeam(cb) {
    const confOpts = Object.entries(D3_CONFS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
    UI.show(`<h2>PICK YOUR SCHOOL</h2>
      <p class="fine">All ${D3_TEAMS.length} NCAA Division III football programs. Colors and ratings are approximate.</p>
      <div class="nat-filter"><input id="natQ" type="search" placeholder="Search schools" autocomplete="off">
        <select id="natConf"><option value="">All conferences</option>${confOpts}</select></div>
      <div class="nat-list" id="natList"></div>
      <div class="menu"><button class="btn" data-act="title">BACK</button></div>`);
    const draw = () => {
      const q = $('natQ').value.trim().toLowerCase(), c = $('natConf').value;
      const list = D3_TEAMS.filter(t => (!c || t.d3conf === c) && (!q || (t.name + ' ' + t.mascot + ' ' + t.state).toLowerCase().includes(q)));
      $('natList').innerHTML = list.slice(0, 80).map(t => `<button class="nat-team" data-id="${t.id}" style="--c1:${t.c1}">${UI.helmet(t.id)}
        <span><b>${esc(t.name)}</b><em>${esc(t.mascot)} · ${esc(D3_CONFS[t.d3conf])} · ${t.state || ''}</em></span>${UI.pips((t.off + t.def) / 2)}</button>`).join('')
        + (list.length > 80 ? `<p class="fine">${list.length - 80} more. Search or pick a conference.</p>` : '');
      $('natList').querySelectorAll('[data-id]').forEach(b => b.addEventListener('click', () => {
        UI.sfx('click');
        if (cb) return cb(b.dataset.id);
        newNational(b.dataset.id); tab = 'schedule'; hub();
      }));
    };
    $('natQ').addEventListener('input', draw);
    $('natConf').addEventListener('change', draw);
    draw();
  }

  function hub() {
    const me = T(N.userId), r = records(), reg = r[N.userId];
    const rec = Object.assign({}, reg, record(N, N.userId));  // overall includes playoff games
    let next;
    if (over()) {
      const won = N.champion === N.userId, h = N.history[N.history.length - 1];
      next = `<div class="box next ${won ? 'champ' : ''}"><div class="kicker">SEASON ${N.season} COMPLETE</div>
        <div class="ptitle">${won ? 'NATIONAL CHAMPIONS!' : esc(T(N.champion).name) + ' won the Stagg Bowl'}</div>
        <p>${esc(me.mascot)} finished ${rec.w}-${rec.l}${h && h.made ? ` and reached the ${esc(h.lastRound.toLowerCase())}` : ''}.</p>
        <div class="row"><button class="btn go" id="natNext">START SEASON ${N.season + 1}</button></div></div>`;
    } else {
      const g = myGame();
      if (g) {
        const home = g.h === N.userId, opp = T(home ? g.a : g.h), orec = r[opp.id];
        const sd = g.seeds ? ` · #${home ? g.seeds[0] : g.seeds[1]} vs #${home ? g.seeds[1] : g.seeds[0]}` : '';
        next = `<div class="box next"><div class="kicker">${esc(weekLabel(N.week))}${g.conf ? ' · ' + esc(D3_CONFS[confOf(N.userId)]) : g.title ? '' : ' · NON-CONFERENCE'}${sd}</div>
          <div class="matchup">${UI.helmet(opp.id)}<div><div class="ptitle">${home || g.neutral ? 'vs' : '@'} ${esc(opp.name)}</div>
          <p>${esc(opp.mascot)} · ${orec.w}-${orec.l} · ${esc(D3_CONFS[confOf(opp.id)])} · ${g.neutral ? 'Salem, Va.' : home ? 'Home' : 'Away'}</p></div></div>
          <div class="row"><button class="btn go" id="natPlay">PLAY GAME</button><button class="btn" id="natSim">SIM</button></div></div>`;
      } else {
        const inPost = N.week >= NAT_WEEKS;
        const out = inPost && N.post[0] && !N.post[0].some(x => x.h === N.userId || x.a === N.userId);
        next = `<div class="box next"><div class="kicker">${esc(weekLabel(N.week))}</div>
          <div class="ptitle">${!inPost ? 'BYE WEEK' : out ? 'NOT IN THE TOURNAMENT' : 'ELIMINATED'}</div>
          <p>${!inPost ? 'The rest of the country plays on.' : 'Watch the bracket play out.'}</p>
          <div class="row"><button class="btn go" id="natSim">${inPost ? 'SIM ' + esc(weekLabel(N.week)) : 'ADVANCE'}</button></div></div>`;
      }
    }
    const tabs = ['schedule', 'conference', 'top 25', N.bracket ? 'bracket' : null, 'roster'].filter(Boolean);
    const myRank = top25(r).indexOf(N.userId);
    UI.show(`<header class="teamhead" style="--c1:${me.c1};--c2:${me.c2}">${UI.helmet(me.id)}
        <div><div class="kicker">NATIONAL SEASON ${N.season} · ${esc(D3_CONFS[confOf(me.id)])}</div><h2>${myRank >= 0 ? '#' + (myRank + 1) + ' ' : ''}${esc(me.name)} ${esc(me.mascot)}</h2>
        <p>${rec.w}-${rec.l} overall · ${rec.cw}-${rec.cl} conference</p></div>
        <div class="cp"><b>${N.cp}</b><span>COACH PTS</span></div></header>
      ${next}
      <div class="tabs">${tabs.map(t => `<button class="tab ${tab === t ? 'on' : ''}" data-tab="${t}">${t.toUpperCase()}</button>`).join('')}</div>
      <section class="tabbody">${tab === 'conference' ? confHTML(r) : tab === 'top 25' ? topHTML(r) : tab === 'bracket' ? bracketHTML() : tab === 'roster' ? rosterHTML() : scheduleHTML(r)}</section>
      <div class="menu"><button class="btn" id="natNew">NEW NATIONAL SEASON</button><button class="btn" data-act="title">MAIN MENU</button></div>`);
    document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { UI.sfx('click'); tab = b.dataset.tab; hub(); }));
    const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', () => { UI.sfx('click'); fn(); }); };
    on('natPlay', play);
    on('natSim', simWeek);
    on('natNext', () => { nextSeason(); hub(); });
    on('natNew', () => { if (confirmNew()) pickTeam(); });
    document.querySelectorAll('[data-up]').forEach(b => b.addEventListener('click', () => upgrade(b.dataset.up)));
  }
  let armed = 0;
  function confirmNew() { if (Date.now() - armed < 4000) return true; armed = Date.now(); const b = $('natNew'); b.textContent = 'TAP AGAIN TO START OVER'; return false; }

  function scheduleHTML(r) {
    const rows = [];
    N.schedule.concat(N.post).forEach((games, w) => {
      const g = games.find(x => x.h === N.userId || x.a === N.userId);
      if (!g) { if (w < NAT_WEEKS) rows.push(`<tr><td>${w + 1}</td><td class="dim">BYE</td><td></td></tr>`); return; }
      const home = g.h === N.userId, opp = T(home ? g.a : g.h);
      let res = '';
      if (g.done) { const us = home ? g.hs : g.as, them = home ? g.as : g.hs; res = `<span class="${us > them ? 'win' : 'loss'}">${us > them ? 'W' : 'L'} ${us}-${them}</span>`; }
      else if (w === N.week) res = '<span class="dim">NEXT</span>';
      rows.push(`<tr class="${w === N.week ? 'cur' : ''}"><td>${w < NAT_WEEKS ? w + 1 : 'P'}</td><td>${home || g.neutral ? 'vs' : '@'} ${esc(opp.name)} <span class="dim">${r[opp.id].w}-${r[opp.id].l}</span>${g.title ? ` <span class="tag">${esc(g.title)}</span>` : g.conf ? '' : ' <span class="tag">NON-CONF</span>'}</td><td>${res}</td></tr>`);
    });
    return `<table class="tbl"><thead><tr><th>WK</th><th>OPPONENT</th><th>RESULT</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
  }

  function confHTML(r) {
    const c = confOf(N.userId);
    const all = Object.keys(D3_CONFS).map(k => `<option value="${k}" ${k === (N.viewConf || c) ? 'selected' : ''}>${esc(D3_CONFS[k])}</option>`).join('');
    const k = N.viewConf || c;
    setTimeout(() => { const s = $('natViewConf'); if (s) s.addEventListener('change', () => { N.viewConf = s.value; hub(); }); });
    return `<select id="natViewConf" class="nat-sel">${all}</select>
      ${D3_NO_PLAYOFFS.has(k) ? '<p class="fine">NESCAC teams don\'t play in the NCAA tournament.</p>' : '<p class="fine">The conference champion earns an automatic bid.</p>'}
      <table class="tbl"><thead><tr><th>#</th><th>TEAM</th><th>CONF</th><th>ALL</th><th>PF</th><th>PA</th></tr></thead><tbody>
      ${confStandings(k, r).map((x, i) => `<tr class="${x.id === N.userId ? 'cur' : ''}"><td>${i + 1}</td><td>${esc(T(x.id).name)}</td><td>${x.cw}-${x.cl}</td><td>${x.w}-${x.l}</td><td>${x.pf}</td><td>${x.pa}</td></tr>`).join('')}</tbody></table>`;
  }

  function topHTML(r) {
    return `<table class="tbl"><thead><tr><th>#</th><th>TEAM</th><th>REC</th><th>CONF</th></tr></thead><tbody>
      ${top25(r).map((id, i) => `<tr class="${id === N.userId ? 'cur' : ''}"><td>${i + 1}</td><td>${esc(T(id).name)}</td><td>${r[id].w}-${r[id].l}</td><td>${esc(D3_CONFS[confOf(id)])}</td></tr>`).join('')}</tbody></table>`;
  }

  function bracketHTML() {
    const name = id => `${seedOf(id) ? '<span class="dim">' + seedOf(id) + '</span> ' : ''}${esc(T(id).name)}`;
    return N.post.map((games, i) => `<h3>${esc(NAT_ROUNDS[i])}</h3><div class="nat-bracket">${games.map(g => {
      const hw = g.done && g.hs > g.as, aw = g.done && g.as > g.hs;
      return `<div class="nat-game ${g.h === N.userId || g.a === N.userId ? 'mine' : ''}">
        <div class="${hw ? 'win' : ''}">${name(g.h)}<b>${g.done ? g.hs : ''}</b></div>
        <div class="${aw ? 'win' : ''}">${name(g.a)}<b>${g.done ? g.as : ''}</b></div></div>`;
    }).join('')}</div>`).join('') + (N.bracket ? `<p class="fine">Automatic bids: ${N.bracket.field.filter(f => f.auto).length} conference champions. At-large: ${N.bracket.field.filter(f => !f.auto).length}.</p>` : '');
  }

  function rosterHTML() {
    const rows = POSITIONS.map(pos => {
      const p = N.roster[pos.key];
      return `<div class="prow"><div class="pid"><b>${pos.label}</b> #${p.num} ${esc(p.name)} <span class="dim">${['', 'FR', 'SO', 'JR', 'SR'][p.year]}</span></div>
        <div class="pattrs">${pos.attrs.map(a => `<span class="attr">${ATTR_NAMES[a]} ${UI.pips(p[a])}
        ${p[a] < 5 ? `<button class="plus" data-up="${pos.key}.${a}" ${N.cp < upgradeCost(p[a]) ? 'disabled' : ''}>+${upgradeCost(p[a])}</button>` : '<span class="max">MAX</span>'}</span>`).join('')}</div></div>`;
    }).join('');
    const unit = (k, label) => `<div class="prow"><div class="pid"><b>${label}</b></div><div class="pattrs"><span class="attr">${UI.pips(N.units[k])}
      ${N.units[k] < 5 ? `<button class="plus" data-up="unit.${k}" ${N.cp < N.units[k] + 1 ? 'disabled' : ''}>+${N.units[k] + 1}</button>` : '<span class="max">MAX</span>'}</span></div></div>`;
    return `<p class="fine">Coach points: 3 per win, 1 per loss, 5 per playoff win.</p>${rows}${unit('ol', 'O-LINE')}${unit('def', 'DEFENSE')}`;
  }

  function upgrade(arg) {
    const [k, a] = arg.split('.');
    if (k === 'unit') { const c = N.units[a] + 1; if (N.cp >= c && N.units[a] < 5) { N.cp -= c; N.units[a]++; } }
    else { const p = N.roster[k], c = upgradeCost(p[a]); if (N.cp >= c && p[a] < 5) { N.cp -= c; p[a]++; } }
    sync(); save(); hub();
  }

  // ---- games -------------------------------------------------------------------
  const teamData = id => Object.assign({}, T(id), { off: N.teams[id].off, def: N.teams[id].def, d3conf: confOf(id) });

  function play() {
    const g = myGame(), home = g.h === N.userId;
    sync();
    UI.startMatch({
      user: teamData(N.userId), opp: teamData(home ? g.a : g.h), userHome: home, neutral: g.neutral,
      roster: N.roster, units: N.units, title: g.title || weekLabel(N.week),
    }, {
      kind: 'national', game: g,
      onQuit: () => hub(),
      onEnd: m => {
        g.hs = home ? m.score.u : m.score.o; g.as = home ? m.score.o : m.score.u; g.done = true;
        addGameStats(N, m.st);
        const won = m.score.u > m.score.o, pts = won ? (g.title ? 5 : 3) : 1;
        N.cp += pts;
        const label = weekLabel(N.week);
        finishWeek();
        UI.postgame(m, { label, next: 'nhub', extra: `+${pts} coach points` });
      },
    });
  }

  function simWeek() {
    const g = myGame();
    if (g) {
      sync(); simGame(N, g);
      const won = g.h === N.userId ? g.hs > g.as : g.as > g.hs;
      N.cp += won ? (g.title ? 5 : 3) : 1;
    }
    finishWeek();
    hub();
  }

  function nextSeason() {
    for (const pos of POSITIONS) {
      const p = N.roster[pos.key];
      if (p.year >= 4) N.roster[pos.key] = genPlayer(pos, 2 + Math.random() * 1.5, 1);
      else { p.year++; p.ss = {}; if (Math.random() < 0.6) { const a = pick1(pos.attrs); if (p[a] < 5) p[a]++; } }
    }
    for (const id in N.teams) if (id !== N.userId) {
      const t = N.teams[id], base = D3_TEAMS.find(x => x.id === id);
      t.off = clamp(lerp(t.off, base.off, 0.4) + gauss() * 0.3, 1, 5); t.def = clamp(lerp(t.def, base.def, 0.4) + gauss() * 0.3, 1, 5);
    }
    N.season++; N.week = 0; N.cp += 2;
    makeSchedule(); sync(); save();
  }

  return { open, hub, newNational, state: () => N, records, buildBracket, finishWeek, myGame };
})();
