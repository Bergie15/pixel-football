'use strict';
// ---------------------------------------------------------------------------
// League: rosters, schedule, standings, simulated games, save/load.
// ---------------------------------------------------------------------------

const SAVE_KEY = 'borderbowl-save-v1';
const SETTINGS_KEY = 'borderbowl-settings-v1';
const REG_WEEKS = 9;
const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function store(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* storage blocked */ } }
function load(key) { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
function wipe(key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } }

// ---- Roster ------------------------------------------------------------------
const POSITIONS = [
  { key: 'QB',   label: 'QB',  attrs: ['arm', 'acc'], num: [1, 19] },
  { key: 'RB',   label: 'RB',  attrs: ['spd', 'pow'], num: [20, 39] },
  { key: 'WR1',  label: 'WR',  attrs: ['spd', 'hnd'], num: [1, 19] },
  { key: 'WR2',  label: 'WR',  attrs: ['spd', 'hnd'], num: [80, 89] },
  { key: 'SLOT', label: 'SLOT',attrs: ['spd', 'hnd'], num: [1, 19] },
  { key: 'TE',   label: 'TE',  attrs: ['spd', 'hnd'], num: [80, 89] },
  { key: 'K',    label: 'K',   attrs: ['leg', 'acc'], num: [30, 49] },
];
const ATTR_NAMES = { arm: 'ARM', acc: 'ACC', spd: 'SPD', pow: 'POW', hnd: 'HANDS', leg: 'LEG' };

function genPlayer(pos, base, year) {
  const p = { name: pick(FIRST_NAMES) + ' ' + pick(LAST_NAMES), num: pos.num[0] + Math.floor(Math.random() * (pos.num[1] - pos.num[0] + 1)), year: year || 1 + Math.floor(Math.random() * 4) };
  for (const a of pos.attrs) p[a] = clamp(Math.round(base + gauss() * 0.7), 1, 5);
  return p;
}

function genRoster(team) {
  const r = {};
  for (const pos of POSITIONS) r[pos.key] = genPlayer(pos, team.off - 0.3);
  return r;
}

function rosterOffense(roster, units) {
  let sum = 0, n = 0;
  for (const pos of POSITIONS) for (const a of pos.attrs) { sum += roster[pos.key][a]; n++; }
  return clamp((sum / n) * 0.75 + units.ol * 0.25, 1, 5);
}

// ---- League ------------------------------------------------------------------
function newLeague(userId) {
  const teams = {};
  for (const t of TEAMS) teams[t.id] = { id: t.id, off: t.off, def: t.def };
  const ut = TEAM_BY_ID[userId];
  const L = {
    v: 1, userId, season: 1, week: 0, cp: 3,
    teams,
    roster: genRoster(ut),
    units: { ol: clamp(Math.round(ut.off), 1, 5), def: clamp(Math.round(ut.def), 1, 5) },
    schedule: [], post: [], champion: null, history: [], log: [],
  };
  makeSchedule(L);
  syncUserRating(L);
  return L;
}

function syncUserRating(L) {
  const u = L.teams[L.userId];
  u.off = rosterOffense(L.roster, L.units);
  u.def = L.units.def;
}

function roundRobin(ids) {
  const a = ids.slice();
  if (a.length % 2) a.push(null);
  const n = a.length, rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const games = []; let bye = null;
    for (let i = 0; i < n / 2; i++) {
      const x = a[i], y = a[n - 1 - i];
      if (x === null) bye = y; else if (y === null) bye = x;
      else games.push((r + i) % 2 ? [x, y] : [y, x]);
    }
    rounds.push({ games, bye });
    a.splice(1, 0, a.pop());
  }
  return rounds;
}

// 9 weeks: conference round robin; each week's MIAC and WIAC bye teams meet
// in a cross-border game.
function makeSchedule(L) {
  const miac = shuffle(TEAMS.filter(t => t.conf === 'MIAC').map(t => t.id));
  const wiac = shuffle(TEAMS.filter(t => t.conf === 'WIAC').map(t => t.id));
  const mr = shuffle(roundRobin(miac)).slice(0, REG_WEEKS);
  const wr = shuffle(roundRobin(wiac)).slice(0, REG_WEEKS);
  L.schedule = [];
  for (let w = 0; w < REG_WEEKS; w++) {
    const games = [];
    for (const [h, a] of mr[w].games) games.push({ h, a, conf: true });
    for (const [h, a] of wr[w].games) games.push({ h, a, conf: true });
    const bm = mr[w].bye, bw = wr[w].bye;
    if (bm && bw) games.push(Math.random() < 0.5 ? { h: bm, a: bw, conf: false, border: true } : { h: bw, a: bm, conf: false, border: true });
    L.schedule.push(games);
  }
  L.post = [];
  L.champion = null;
}

// Expected scoring from a series of drives.
function simScore(off, def, homeBoost) {
  let pts = 0;
  const pTD = clamp(0.2 + 0.065 * (off - def) + homeBoost, 0.04, 0.6);
  const pFG = 0.13;
  for (let i = 0; i < 11; i++) {
    const r = Math.random();
    if (r < pTD) pts += Math.random() < 0.95 ? 7 : 6;
    else if (r < pTD + pFG) pts += 3;
  }
  return pts;
}

function simGame(L, g) {
  const H = L.teams[g.h], A = L.teams[g.a];
  let hs = simScore(H.off, A.def, 0.025), as = simScore(A.off, H.def, 0);
  while (hs === as) { if (Math.random() < 0.5 + (H.off - A.off) * 0.08) hs += pick([3, 7]); else as += pick([3, 7]); }
  g.hs = hs; g.as = as; g.done = true;
}

function userGameOfWeek(L) {
  const games = L.week < REG_WEEKS ? L.schedule[L.week] : (L.post[L.week - REG_WEEKS] || []);
  return games.find(g => g.h === L.userId || g.a === L.userId) || null;
}

function allPlayedGames(L) { return L.schedule.flat().filter(g => g.done); }

function standings(L, conf) {
  const rows = {};
  for (const t of TEAMS) if (t.conf === conf) rows[t.id] = { id: t.id, w: 0, l: 0, cw: 0, cl: 0, pf: 0, pa: 0 };
  for (const g of allPlayedGames(L)) {
    for (const [me, op, ms, os] of [[g.h, g.a, g.hs, g.as], [g.a, g.h, g.as, g.hs]]) {
      const r = rows[me]; if (!r) continue;
      const win = ms > os;
      if (win) r.w++; else r.l++;
      if (g.conf) { if (win) r.cw++; else r.cl++; }
      r.pf += ms; r.pa += os;
    }
  }
  const pct = (w, l) => (w + l ? w / (w + l) : 0);
  return Object.values(rows).sort((a, b) => pct(b.cw, b.cl) - pct(a.cw, a.cl) || pct(b.w, b.l) - pct(a.w, a.l) || (b.pf - b.pa) - (a.pf - a.pa));
}

function record(L, id) {
  let w = 0, l = 0;
  for (const g of L.schedule.flat().concat(L.post.flat())) {
    if (!g.done) continue;
    if (g.h === id) (g.hs > g.as ? w++ : l++);
    else if (g.a === id) (g.as > g.hs ? w++ : l++);
  }
  return { w, l };
}

// After the user's game (or a bye), simulate the rest of the week and advance.
function finishWeek(L) {
  const games = L.week < REG_WEEKS ? L.schedule[L.week] : L.post[L.week - REG_WEEKS];
  for (const g of games) if (!g.done) simGame(L, g);
  // Rating drift through the season
  for (const id in L.teams) if (id !== L.userId) { const t = L.teams[id]; t.off = clamp(t.off + gauss() * 0.05, 1, 5); t.def = clamp(t.def + gauss() * 0.05, 1, 5); }
  L.week++;
  if (L.week === REG_WEEKS) {
    // Conference title games: 1 vs 2
    const m = standings(L, 'MIAC'), w = standings(L, 'WIAC');
    L.post[0] = [
      { h: m[0].id, a: m[1].id, conf: false, title: 'MIAC CHAMPIONSHIP' },
      { h: w[0].id, a: w[1].id, conf: false, title: 'WIAC CHAMPIONSHIP' },
    ];
  } else if (L.week === REG_WEEKS + 1) {
    const [mg, wg] = L.post[0];
    const mw = mg.hs > mg.as ? mg.h : mg.a, ww = wg.hs > wg.as ? wg.h : wg.a;
    L.confChamps = [mw, ww];
    const home = Math.random() < 0.5 ? mw : ww;
    L.post[1] = [{ h: home, a: home === mw ? ww : mw, conf: false, title: 'BORDER BOWL', neutral: true }];
  } else if (L.week === REG_WEEKS + 2) {
    const g = L.post[1][0];
    L.champion = g.hs > g.as ? g.h : g.a;
    const rec = record(L, L.userId);
    L.history.push({ season: L.season, w: rec.w, l: rec.l, champ: L.champion, won: L.champion === L.userId, conf: (L.confChamps || []).includes(L.userId) });
  }
}

function seasonOver(L) {
  if (L.week >= REG_WEEKS + 2) return true;
  // user missed the postseason: we still sim it, but nothing left to play
  return false;
}

function userInPost(L) {
  const g = userGameOfWeek(L);
  return !!g;
}

// ---- Stats ------------------------------------------------------------------
function addGameStats(L, st) {
  const bump = (p, k, v) => { if (!p || !v) return; for (const o of [p.ss || (p.ss = {}), p.cs || (p.cs = {})]) o[k] = (o[k] || 0) + v; };
  const R = L.roster;
  for (const k of ['comp', 'att', 'pyds', 'ptd', 'int']) bump(R.QB, k, st[k]);
  for (const [k, r] of Object.entries(st.rush || {})) { bump(R[k], 'ratt', r.att); bump(R[k], 'ryds', r.yds); bump(R[k], 'rtd', r.td); }
  for (const [k, r] of Object.entries(st.rec || {})) { bump(R[k], 'rec', r.rec); bump(R[k], 'recyds', r.yds); bump(R[k], 'rectd', r.td); }
  bump(R.K, 'fg', st.fg); bump(R.K, 'fga', st.fga);
  for (const pos of POSITIONS) { const p = R[pos.key]; (p.ss || (p.ss = {})).gp = (p.ss.gp || 0) + 1; (p.cs || (p.cs = {})).gp = (p.cs.gp || 0) + 1; }
}

function statLine(key, s) {
  s = s || {};
  const n = k => s[k] || 0;
  const rush = n('ratt') ? `${n('ratt')} car, ${n('ryds')} yds, ${n('rtd')} TD` : '';
  const rec = n('rec') ? `${n('rec')} rec, ${n('recyds')} yds, ${n('rectd')} TD` : '';
  if (key === 'QB') return [n('att') ? `${n('comp')}/${n('att')}, ${n('pyds')} yds, ${n('ptd')} TD, ${n('int')} INT` : '', rush].filter(Boolean).join(' · ');
  if (key === 'K') return n('fga') ? `${n('fg')}/${n('fga')} FG` : '';
  if (key === 'RB') return [rush, rec].filter(Boolean).join(' · ');
  return [rec, rush].filter(Boolean).join(' · ');
}

// ---- Offseason -------------------------------------------------------------
function nextSeason(L) {
  const report = { graduated: [], improved: [] };
  const rec = record(L, L.userId);
  L.recruits = [];
  for (const pos of POSITIONS) {
    const p = L.roster[pos.key];
    if (p.year >= 4) {
      const career = statLine(pos.key, p.cs);
      report.graduated.push(`${pos.label} ${p.name}${career ? ' (' + career + ')' : ''}`);
      // three recruits to choose from; a better season draws better recruits
      const base = 1.9 + rec.w / 9 * 1.2;
      const options = [0, 1, 2].map(i => genPlayer(pos, base + (i === 0 ? 0.6 : i === 1 ? 0 : -0.3) + Math.random() * 0.8, 1));
      L.roster[pos.key] = options[0];
      L.recruits.push({ pos: pos.key, options });
    } else {
      p.year++;
      p.ss = {};
      if (Math.random() < 0.6) {
        const a = pick(pos.attrs);
        if (p[a] < 5) { p[a]++; report.improved.push(`${p.name} +1 ${ATTR_NAMES[a]}`); }
      }
    }
  }
  for (const id in L.teams) if (id !== L.userId) {
    const t = L.teams[id], base = TEAM_BY_ID[id];
    t.off = clamp(lerp(t.off, base.off, 0.4) + gauss() * 0.35, 1, 5);
    t.def = clamp(lerp(t.def, base.def, 0.4) + gauss() * 0.35, 1, 5);
  }
  L.season++; L.week = 0; L.cp += 2;
  makeSchedule(L);
  syncUserRating(L);
  return report;
}

function upgradeCost(v) { return v; }
