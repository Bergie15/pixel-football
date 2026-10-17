'use strict';
// ---------------------------------------------------------------------------
// Live Game: replays real play-by-play with the game's field and players.
//
// Reads the standard college play-by-play text that StatCrew/Sidearm live
// stats pages publish ("1st and 10 at SJU25  J. Smith rush for 5 yards to the
// SJU30"), keeps score, clock, possession and down, and animates each play.
// Sources: a live stats URL (polled), pasted play-by-play, or a demo game.
// It reuses Play, KickoffPlay, the field strip and the UI loop untouched.
// ---------------------------------------------------------------------------

const LIVE_KEY = 'borderbowl-live-v1';
const LIVE_ROSTER = {
  QB: { arm: 3, acc: 4, num: 7, name: '' }, RB: { spd: 3, pow: 3 }, WR1: { spd: 3, hnd: 4 }, WR2: { spd: 3, hnd: 4 },
  SLOT: { spd: 3, hnd: 4 }, TE: { spd: 3, hnd: 4 }, K: { leg: 3, acc: 3 },
};
const LIVE_URLS = {
  SJU: 'https://gojohnnies.com/sidearmstats/football/play-by-play',
  UWRF: 'https://uwrfsports.com/sidearmstats/football/play-by-play',
};
// Extra abbreviations stat crews use, beyond the ones derived from names
const LIVE_ALIASES = {
  SJU: ['SJU', 'SJ', 'STJ', 'SJUMN', 'JOHNNIES'],
  UWRF: ['UWRF', 'RF', 'UWR', 'RIVERF', 'FALCONS'],
};

// A demo so the viewer can be tried any day. Not a real game.
const LIVE_DEMO = `DEMO GAME - NOT A REAL RESULT
1st Quarter
D. Lund kickoff 62 yards to the RF3, T. Moua return 21 yards to the RF24 (A. Berg).
1st and 10 at RF24 M. Olson pass complete to D. Brooks for 9 yards to the RF33 (B. Haugen).
2nd and 1 at RF33 K. Ellis rush for 4 yards to the RF37, 1ST DOWN RF (L. Krueger).
1st and 10 at RF37 M. Olson pass incomplete to D. Brooks (B. Haugen).
2nd and 10 at RF37 K. Ellis rush for 6 yards to the RF43 (L. Krueger).
3rd and 4 at RF43 M. Olson sacked for loss of 7 yards to the RF36 (E. Schmidt).
4th and 11 at RF36 P. Vang punt 41 yards to the SJU23, J. Thao return 6 yards to the SJU29 (C. Novak).
1st and 10 at SJU29 A. Lindgren rush for 12 yards to the SJU41, 1ST DOWN SJU (S. Weber), clock 11:02.
1st and 10 at SJU41 B. Halvorson pass complete to C. Jensen for 23 yards to the RF36, 1ST DOWN SJU (S. Weber).
1st and 10 at RF36 A. Lindgren rush for 3 yards to the RF33 (M. Koch).
2nd and 7 at RF33 B. Halvorson pass complete to E. Dahl for 33 yards to the RF0, TOUCHDOWN, clock 09:41.
D. Lund kick attempt good.
D. Lund kickoff 65 yards to the RF0, touchback.
1st and 10 at RF25 K. Ellis rush for 2 yards to the RF27 (L. Krueger).
2nd and 8 at RF27 M. Olson pass complete to J. Carter for 31 yards to the SJU42, 1ST DOWN RF (B. Haugen), clock 07:55.
1st and 10 at SJU42 K. Ellis rush for 8 yards to the SJU34 (A. Berg).
2nd and 2 at SJU34 K. Ellis rush for 5 yards to the SJU29, 1ST DOWN RF (L. Krueger).
1st and 10 at SJU29 M. Olson pass intercepted by B. Haugen at the SJU12, B. Haugen return 18 yards to the SJU30 (J. Carter), clock 06:10.
1st and 10 at SJU30 A. Lindgren rush for loss of 2 yards to the SJU28 (T. Fischer).
2nd and 12 at SJU28 B. Halvorson pass complete to C. Jensen for 15 yards to the SJU43, 1ST DOWN SJU (S. Weber).
1st and 10 at SJU43 B. Halvorson pass complete to E. Dahl for 19 yards to the RF38, 1ST DOWN SJU (M. Koch).
1st and 10 at RF38 A. Lindgren rush for 7 yards to the RF31 (M. Koch).
2nd and 3 at RF31 A. Lindgren rush for 2 yards to the RF29 (T. Fischer).
3rd and 1 at RF29 B. Halvorson pass incomplete to C. Jensen.
4th and 1 at RF29 D. Lund field goal attempt from 46 GOOD, clock 02:18.
D. Lund kickoff 64 yards to the RF1, T. Moua return 28 yards to the RF29 (A. Berg).
1st and 10 at RF29 M. Olson pass complete to D. Brooks for 12 yards to the RF41, 1ST DOWN RF (B. Haugen).
1st and 10 at RF41 K. Ellis rush for 59 yards to the SJU0, TOUCHDOWN, clock 00:47.
P. Vang kick attempt good.
End of 1st Quarter`;

const Live = (() => {
  const $ = id => document.getElementById(id);
  const saved = Object.assign({ home: 'SJU', away: 'UWRF', source: 'demo', url: LIVE_URLS.SJU, proxy: '', paste: '', mode: 'latest' }, load(LIVE_KEY) || {});

  // ---- setup screen ----------------------------------------------------------
  function setup() {
    const opts = sel => TEAMS.map(t => `<option value="${t.id}" ${t.id === sel ? 'selected' : ''}>${UI.esc(t.name)}</option>`).join('');
    const src = (v, label) => `<button class="opt ${saved.source === v ? 'on' : ''}" data-src="${v}">${label}</button>`;
    UI.show(`<h2>LIVE GAME</h2>
      <p class="fine">Watch a real game's play-by-play acted out on the pixel field.</p>
      <div class="box help live-setup">
        <h3>Matchup</h3>
        <div class="live-row"><label for="lvAway">Away</label><select id="lvAway">${opts(saved.away)}</select>
          <label for="lvHome">Home</label><select id="lvHome">${opts(saved.home)}</select></div>
        <h3>Plays from</h3>
        <div class="opts">${src('url', 'LIVE STATS LINK')}${src('paste', 'PASTE PLAYS')}${src('demo', 'DEMO GAME')}</div>
        <div class="live-src" data-for="url" ${saved.source === 'url' ? '' : 'hidden'}>
          <label for="lvUrl">Live stats play-by-play page</label>
          <input id="lvUrl" type="url" value="${UI.esc(saved.url)}" spellcheck="false">
          <label for="lvProxy">Relay (optional, see README)</label>
          <input id="lvProxy" type="url" placeholder="https://your-relay.workers.dev/?url=" value="${UI.esc(saved.proxy)}" spellcheck="false">
          <p class="dim">Checks for new plays every 20 seconds. Only works where the page is allowed to load other websites.</p>
        </div>
        <div class="live-src" data-for="paste" ${saved.source === 'paste' ? '' : 'hidden'}>
          <label for="lvPaste">Copy the play-by-play from the school's live stats page and paste it here</label>
          <textarea id="lvPaste" rows="6" spellcheck="false" placeholder="1st and 10 at SJU25 J. Smith rush for 5 yards to the SJU30">${UI.esc(saved.paste)}</textarea>
          <p class="dim">You can paste again during the game to add new plays.</p>
        </div>
        <div class="live-src" data-for="demo" ${saved.source === 'demo' ? '' : 'hidden'}>
          <p class="dim">A made-up first quarter of Saint John's vs. UW-River Falls, to show how it works.</p>
        </div>
        <h3>Start</h3>
        <div class="opts"><button class="opt ${saved.mode === 'latest' ? 'on' : ''}" data-mode="latest">JUMP TO LATEST</button><button class="opt ${saved.mode === 'replay' ? 'on' : ''}" data-mode="replay">REPLAY FROM KICKOFF</button></div>
        <p class="live-err" id="lvErr" hidden></p>
      </div>
      <div class="menu"><button class="btn go" id="lvGo">WATCH</button><button class="btn" data-act="title">BACK</button></div>`);
    const root = $('screen');
    root.querySelectorAll('[data-src]').forEach(b => b.addEventListener('click', () => {
      saved.source = b.dataset.src;
      root.querySelectorAll('[data-src]').forEach(x => x.classList.toggle('on', x === b));
      root.querySelectorAll('.live-src').forEach(x => { x.hidden = x.dataset.for !== saved.source; });
    }));
    root.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
      saved.mode = b.dataset.mode;
      root.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x === b));
    }));
    $('lvHome').addEventListener('change', () => { const u = LIVE_URLS[$('lvHome').value]; if (u) $('lvUrl').value = u; });
    $('lvGo').addEventListener('click', () => {
      UI.sfx('click');
      Object.assign(saved, { home: $('lvHome').value, away: $('lvAway').value, url: $('lvUrl').value.trim(), proxy: $('lvProxy').value.trim(), paste: $('lvPaste').value });
      if (saved.home === saved.away) return err('Pick two different teams.');
      store(LIVE_KEY, saved);
      const lm = new LiveMatch(TEAM_BY_ID[saved.home], TEAM_BY_ID[saved.away], saved);
      if (saved.source === 'demo') lm.feed(LIVE_DEMO, true);
      else if (saved.source === 'paste') { if (!lm.feed(saved.paste)) return err('No plays found in that text. Copy the play-by-play lines, like "1st and 10 at SJU25 ... rush for 5 yards".'); }
      UI.startLive(lm);
    });
  }
  function err(msg) { const e = $('lvErr'); e.textContent = msg; e.hidden = false; }

  // ---- parsing -----------------------------------------------------------------
  const ORDW = { '1st': 1, '2nd': 2, '3rd': 3, '4th': 4 };
  const PLAY_RE = /(kickoff|punt|rush|pass|sacked|field goal|kick attempt|penalty|fumble|timeout|end of|start of|quarter|touchback|kneel|two-point|2-point|conversion)/i;

  // Turn pasted text or a fetched HTML page into candidate play lines.
  function toLines(text) {
    if (/<\s*(html|table|tr|div)/i.test(text)) {
      const doc = new DOMParser().parseFromString(text, 'text/html');
      const rows = [...doc.querySelectorAll('tr')].map(tr => [...tr.children].map(td => td.textContent.trim()).filter(Boolean).join('  '));
      text = rows.length > 5 ? rows.join('\n') : (doc.body ? doc.body.textContent : text);
    }
    return text.split(/\r?\n/).map(s => s.replace(/\s+/g, ' ').trim()).filter(s => s && PLAY_RE.test(s));
  }

  // ---- the viewer ---------------------------------------------------------------
  class LiveMatch {
    constructor(home, away, cfg) {
      this.cfg = cfg;
      this.homeT = home; this.awayT = away;
      // what UI.hudUpdate expects
      this.user = home; this.opp = away; this.userHome = true;
      this.score = { u: 0, o: 0 };
      this.q = 1; this.clock = 900; this.ot = false; this.mode = null;
      this.strip = buildFieldStrip(home, away);
      this.kits = { H: makeKit(home, true), A: makeKit(away, false) };
      this.camX = 50;
      this.lines = []; this.idx = 0;
      this.codes = {};
      this.poss = null; this.ballA = 35; this.down = 1; this.togo = 10;
      this.busy = false;
      this.demo = false;
    }

    // Add text; returns how many play lines it now has.
    feed(text, demo) {
      if (demo) this.demo = true;
      const lines = toLines(text);
      // keep order, ignore lines we already have (e.g. a scoring summary repeat)
      const seen = new Set(this.lines);
      let start = 0;
      if (!this.lines.length) { const k = lines.findIndex(l => /kickoff/i.test(l)); if (k > 0) start = k; }
      for (const l of lines.slice(start)) if (!seen.has(l)) { this.lines.push(l); seen.add(l); }
      return this.lines.length;
    }

    start() {
      this.ticker();
      UI.hudUpdate(this);
      if (this.cfg.source === 'url' && !this.demo) this.poll();
      if (this.cfg.mode === 'latest' && !this.demo) this.fastForward();
      this.next();
    }

    onQuit() {
      clearTimeout(this.pollT); this.quit = true;
      const t = $('liveTicker'); if (t) t.hidden = true;
    }

    alive() { return !this.quit && UI.currentMatch() === this; }

    async poll() {
      if (!this.alive()) return;
      const target = this.cfg.proxy ? this.cfg.proxy + encodeURIComponent(this.cfg.url) : this.cfg.url;
      try {
        const res = await fetch(target, { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const before = this.lines.length;
        this.feed(await res.text());
        this.status = this.lines.length ? `LIVE · ${this.lines.length} plays` : 'Waiting for the first play';
        this.lastOk = Date.now();
        if (this.lines.length > before && !this.busy) { if (this.cfg.mode === 'latest') this.fastForward(); this.next(); }
      } catch (e) {
        this.status = "Can't reach the live stats page from here. Use PASTE PLAYS, or host the game with the relay.";
      }
      this.ticker();
      this.pollT = setTimeout(() => this.poll(), 20000);
    }

    // Skip quickly through older plays, keeping the last couple to watch.
    fastForward() {
      while (this.lines.length - this.idx > 2) this.apply(this.parse(this.lines[this.idx++]));
      UI.hudUpdate(this);
    }

    // ---- team codes and spots ----
    sideOf(code) {
      code = code.toUpperCase();
      if (this.codes[code]) return this.codes[code];
      for (const [side, t] of [['H', this.homeT], ['A', this.awayT]]) {
        const words = t.name.replace(/^UW-/, 'UW ').split(/[\s-]+/);
        const al = new Set([t.id, ...(LIVE_ALIASES[t.id] || []), words.map(w => w[0]).join('').toUpperCase(),
          words.length > 1 ? words.slice(1).map(w => w[0]).join('').toUpperCase() : '', t.name.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase()]);
        if (al.has(code) && !Object.values(this.codes).includes(side)) return (this.codes[code] = side);
        if (al.has(code)) return (this.codes[code] = side);
      }
      // unknown code: give it to whichever side has no code yet
      const used = Object.values(this.codes);
      const side = !used.includes('A') ? 'A' : !used.includes('H') ? 'H' : 'A';
      return (this.codes[code] = side);
    }
    // yards from the home goal line
    absSpot(code, n) { if (code === '' || code === undefined) return n; return this.sideOf(code) === 'H' ? n : 100 - n; }
    frame(side, a) { return side === 'H' ? a : 100 - a; }  // offense-going-right coordinates

    // ---- one line → an event ----
    parse(line) {
      const ev = { line, raw: line };
      const L = line.toLowerCase();
      const dd = line.match(/\b(1st|2nd|3rd|4th)\s*(?:and|&)\s*(\d+|goal|inches)\s+at\s+([A-Za-z]{1,6})?\s*(\d{1,2})\b/i);
      if (dd) { ev.down = ORDW[dd[1].toLowerCase()]; ev.togo = /\d/.test(dd[2]) ? +dd[2] : dd[2].toLowerCase() === 'inches' ? 1 : 0; ev.atA = this.absSpot(dd[3] || '', +dd[4]); }
      const clk = line.match(/clock\s*(\d{1,2}):(\d{2})/i) || line.match(/^\(?(\d{1,2}):(\d{2})\)?\s/);
      if (clk) ev.clock = +clk[1] * 60 + +clk[2];
      const qm = line.match(/(?:start of|end of|^)\s*(1st|2nd|3rd|4th)\s+(?:quarter|qtr)/i);
      if (qm) ev.quarterMark = { q: ORDW[qm[1].toLowerCase()], end: /end of/i.test(line) };
      if (/end of game|final/i.test(L) && !/final drive/i.test(L)) ev.final = true;
      // every "to the XXX##" / "at the XXX##" spot in order
      ev.spots = [...line.matchAll(/\b(?:to|at)\s+the\s+([A-Za-z]{1,6})?\s*(\d{1,2})\b/gi)].map(m => this.absSpot(m[1] || '', +m[2]));
      const first = line.match(/1st down\s+([A-Za-z]{1,6})/i);
      if (first) ev.firstDownSide = this.sideOf(first[1]);
      const rec = line.match(/recovered by\s+([A-Za-z]{1,6})\b/i);
      if (rec && rec[1].length <= 6 && /^[A-Z]+$/.test(rec[1])) ev.recoverSide = this.sideOf(rec[1]);
      ev.td = /touchdown/i.test(L);
      ev.noPlay = /no play/i.test(L);
      const yds = (re) => { const m = line.match(re); return m ? +m[1] : null; };
      if (/kickoff/i.test(L)) ev.kind = 'kickoff';
      else if (/\bpunt\b/i.test(L)) ev.kind = 'punt';
      else if (/field goal/i.test(L)) { ev.kind = 'fg'; ev.good = /\bgood\b/i.test(L) && !/no good/i.test(L); ev.dist = yds(/from\s+(\d+)/i); }
      else if (/kick attempt|pat\b|extra point/i.test(L)) { ev.kind = 'pat'; ev.good = /good/i.test(L) && !/no good|failed|blocked/i.test(L); }
      else if (/two-point|2-point|conversion/i.test(L)) { ev.kind = 'two'; ev.good = /good|success/i.test(L) && !/failed|no good/i.test(L); }
      else if (/penalty/i.test(L)) ev.kind = 'penalty';
      else if (/pass intercepted|intercepted by/i.test(L)) ev.kind = 'int';
      else if (/pass incomplete|incomplete/i.test(L)) ev.kind = 'inc';
      else if (/sacked/i.test(L)) ev.kind = 'sack';
      else if (/pass complete|pass .* complete/i.test(L)) ev.kind = 'pass';
      else if (/\brush|kneel|scramble|run\b/i.test(L)) ev.kind = 'run';
      else if (/timeout/i.test(L)) ev.kind = 'timeout';
      else ev.kind = 'info';
      if (ev.kind === 'penalty' && !ev.noPlay) {
        // penalties during a play are listed after it; treat the play part if present
        if (/rush/i.test(L)) ev.kind = 'run'; else if (/pass complete/i.test(L)) ev.kind = 'pass';
      }
      if (/\bfumble/i.test(L)) ev.fumble = true;
      ev.gain = yds(/for\s+(\d+)\s+yards?/i);
      const loss = yds(/loss of\s+(\d+)/i);
      if (loss !== null) ev.gain = -loss;
      if (/no gain/i.test(L)) ev.gain = 0;
      ev.kickYds = yds(/(?:kickoff|punt)\s+(\d+)\s+yards?/i);
      ev.touchback = /touchback/i.test(L);
      return ev;
    }

    // ---- state change for an event; returns what to animate ----
    apply(ev) {
      if (ev.clock !== undefined) this.clock = ev.clock;
      if (ev.quarterMark) {
        if (ev.quarterMark.end) { this.q = Math.min(4, ev.quarterMark.q + 1); this.clock = 900; }
        else { this.q = ev.quarterMark.q; this.clock = 900; }
      }
      if (ev.down) { this.down = ev.down; this.togo = ev.togo || Math.max(1, Math.round((this.poss === 'H' ? 100 - ev.atA : ev.atA))); this.ballA = ev.atA; }
      if (ev.firstDownSide && !this.poss) this.poss = ev.firstDownSide;
      const off = this.poss || 'H', def = off === 'H' ? 'A' : 'H';
      const startA = ev.atA !== undefined ? ev.atA : this.ballA;
      const lastSpot = ev.spots.length ? ev.spots[ev.spots.length - 1] : null;
      const anim = { ev, off, startA };
      const add = (side, n) => { if (side === 'H') this.score.u += n; else this.score.o += n; };

      switch (ev.kind) {
        case 'kickoff': {
          // the landing spot is in the receiving team's half
          const land = ev.spots.length ? ev.spots[0] : (off === 'H' ? 95 : 5);
          const recv = ev.touchback ? (land > 50 ? 'A' : 'H') : (land > 50 ? 'A' : 'H');
          anim.recv = recv; anim.landA = land;
          let endA = ev.touchback ? (recv === 'H' ? 25 : 75) : (lastSpot !== null ? lastSpot : land);
          this.poss = recv;
          if (ev.recoverSide) this.poss = ev.recoverSide;
          if (ev.td) { add(this.poss, 6); endA = this.poss === 'H' ? 100 : 0; }
          anim.endA = endA; this.ballA = endA; this.down = 1; this.togo = 10;
          break;
        }
        case 'punt': {
          const land = ev.spots.length ? ev.spots[0] : startA + (off === 'H' ? 1 : -1) * (ev.kickYds || 40);
          anim.landA = land;
          let endA = ev.touchback ? (off === 'H' ? 80 : 20) : (lastSpot !== null ? lastSpot : land);
          this.poss = ev.recoverSide || def;
          if (ev.td) { add(this.poss, 6); endA = this.poss === 'H' ? 100 : 0; }
          anim.endA = endA; this.ballA = endA; this.down = 1; this.togo = 10;
          break;
        }
        case 'fg':
          if (ev.good) add(off, 3);
          else { this.poss = def; this.ballA = startA; this.down = 1; this.togo = 10; }
          break;
        case 'pat': if (ev.good) add(off, 1); break;
        case 'two': if (ev.good) add(off, 2); break;
        case 'int': {
          this.poss = def;
          let endA = lastSpot !== null ? lastSpot : startA;
          if (ev.td) { add(def, 6); endA = def === 'H' ? 100 : 0; }
          anim.catchA = ev.spots.length ? ev.spots[0] : endA;
          anim.endA = endA; this.ballA = endA; this.down = 1; this.togo = 10;
          break;
        }
        case 'run': case 'pass': case 'sack': case 'inc': {
          let endA = ev.kind === 'inc' ? startA : lastSpot !== null ? lastSpot : startA + (off === 'H' ? 1 : -1) * (ev.gain || 0);
          if (ev.td) endA = off === 'H' ? 100 : 0;
          anim.endA = endA;
          const gained = (endA - startA) * (off === 'H' ? 1 : -1);
          if (ev.td) { add(ev.recoverSide && ev.recoverSide !== off ? def : off, 6); }
          if (ev.fumble && ev.recoverSide && ev.recoverSide !== off) { this.poss = ev.recoverSide; this.down = 1; this.togo = 10; }
          else if (ev.firstDownSide || gained >= this.togo) { this.down = 1; this.togo = 10; }
          else if (!ev.td) {
            this.down++; this.togo = Math.max(1, this.togo - gained);
            if (this.down > 4) { this.poss = def; this.down = 1; this.togo = 10; }
          }
          // safety
          if (!ev.td && (off === 'H' ? endA <= 0 : endA >= 100) && /safety/i.test(ev.line)) add(def, 2);
          this.ballA = endA;
          break;
        }
        case 'penalty':
          if (lastSpot !== null) this.ballA = lastSpot;
          if (ev.firstDownSide) { this.down = 1; this.togo = 10; }
          break;
      }
      if (ev.firstDownSide && ['run', 'pass', 'penalty'].includes(ev.kind)) this.poss = ev.firstDownSide;
      return anim;
    }

    // ---- UI.hudUpdate support ----
    situation() {
      const x = this.frame(this.poss || 'H', this.ballA);
      const goal = this.togo >= 100 - x;
      return `${ORD[this.down] || '1st'} & ${goal ? 'GOAL' : Math.max(1, Math.round(this.togo))} · ${ballOn(x)}`;
    }
    scoreLine() { return `${this.awayT.id} ${this.score.o} — ${this.homeT.id} ${this.score.u}`; }
    get fd() { const x = this.frame(this.poss || 'H', this.ballA); return Math.min(100, x + this.togo); }

    // ---- play loop ----
    next() {
      if (!this.alive()) return;
      if (this.idx >= this.lines.length) {
        this.busy = false;
        this.status = this.demo ? 'DEMO · end of the demo quarter' : this.cfg.source === 'paste' ? 'Caught up · paste more plays to keep watching' : this.status;
        this.ticker();
        return;
      }
      this.busy = true;
      const ev = this.parse(this.lines[this.idx++]);
      const before = { u: this.score.u, o: this.score.o };
      const anim = this.apply(ev);
      this.current = ev;
      this.ticker(ev.line);
      this.animate(anim, () => {
        UI.hudUpdate(this);
        const scored = this.score.u !== before.u || this.score.o !== before.o;
        const done = () => setTimeout(() => this.next(), 500);
        if (ev.final) return this.finalCard();
        if (scored) {
          const who = this.score.u !== before.u ? this.homeT : this.awayT;
          const pts = this.score.u - before.u + this.score.o - before.o;
          return UI.banner(pts >= 6 ? 'TOUCHDOWN!' : pts === 3 ? 'FIELD GOAL' : pts === 2 && ev.kind !== 'two' ? 'SAFETY' : pts === 1 ? 'EXTRA POINT' : 'TWO-POINT GOOD!', who.mascot, done, pts >= 6 ? 'td' : 'good');
        }
        if (ev.kind === 'int') return UI.banner('INTERCEPTED!', '', done, 'bad');
        if (ev.fumble && ev.recoverSide) return UI.banner('FUMBLE!', '', done, 'bad');
        if (ev.quarterMark && ev.quarterMark.end) return UI.banner(`END OF ${ORD[ev.quarterMark.q].toUpperCase()} QUARTER`, '', done);
        done();
      });
    }

    finalCard() {
      this.busy = false;
      UI.card({
        kicker: 'FINAL', title: this.scoreLine(), lines: [this.demo ? 'Demo game' : 'From the live play-by-play'],
        buttons: [{ label: 'MAIN MENU', cls: 'go', fn: () => { this.onQuit(); UI.title(); } }],
      });
    }

    // Build the scene for an event and run it; cb when it's over.
    animate(anim, cb) {
      const ev = anim.ev;
      const base = (side, x, PlayCls, def, extra) => new PlayCls(Object.assign({
        playDef: def, los: clamp(x, 1, 99), ballY: FIELD_W / 2, roster: LIVE_ROSTER, units: { ol: 3 }, oppDef: 3,
        offKit: this.kits[side], defKit: this.kits[side === 'H' ? 'A' : 'H'],
      }, extra || {}));
      const off = anim.off, x0 = this.frame(off, anim.startA);
      this.onEnd = cb;
      switch (ev.kind) {
        case 'run': case 'pass': case 'inc': case 'sack': case 'int': {
          const passKinds = ['pass', 'inc', 'int', 'sack'];
          const pool = passKinds.includes(ev.kind) ? PLAYS.filter(p => p.type === 'pass') : PLAYS.filter(p => p.type === 'run');
          const def = pool[Math.floor(Math.random() * pool.length)];
          const target = ev.kind === 'int' ? this.frame(off, anim.catchA) : this.frame(off, anim.endA);
          this.play = base(off, x0, LivePlay, def, { live: { kind: ev.kind, target, td: ev.td && ev.kind !== 'int' } });
          this.camX = this.play.camX;
          return;
        }
        case 'kickoff': {
          const recv = anim.recv;
          this.play = new LiveKick({
            los: 0, ballY: FIELD_W / 2, roster: LIVE_ROSTER, units: { ol: 3 }, oppDef: 3,
            offKit: this.kits[recv], defKit: this.kits[recv === 'H' ? 'A' : 'H'],
            live: { land: this.frame(recv, anim.landA), target: this.frame(recv, anim.endA), touchback: ev.touchback, td: ev.td },
          });
          return;
        }
        case 'punt': {
          const p = base(off, x0, Play, PLAYS[0]);
          this.play = p; p.ball = null;
          const land = this.frame(off, anim.landA);
          this.kickAnim = { t: 0, fx: x0 - 12, fy: FIELD_W / 2, tx: clamp(land, x0, 108), ty: FIELD_W / 2 + gauss() * 6, peak: 16, dur: 2.2, cb: () => this.endScene() };
          return;
        }
        case 'fg': case 'pat': {
          const from = ev.kind === 'pat' ? 90 : clamp(117 - (ev.dist || 100 - x0 + 17), 50, 98) - 7;
          const p = base(off, from + 7, Play, PLAYS[0]);
          this.play = p; p.ball = null;
          const mid = FIELD_W / 2;
          const ty = ev.good ? mid + gauss() * 0.8 : mid + (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 3);
          this.kickAnim = { t: 0, fx: from, fy: mid, tx: 114, ty, peak: 13, dur: 1.2 + (114 - from) / 90, cb: () => this.endScene() };
          return;
        }
        default:
          // nothing to act out: hold on the formation for a beat
          this.play = null;
          this.camX = clamp(this.frame(this.poss || 'H', this.ballA) + 10, 20, 80);
          setTimeout(() => this.endScene(), ev.kind === 'info' && !ev.quarterMark ? 200 : 1400);
      }
    }

    endScene() {
      const cb = this.onEnd; this.onEnd = null;
      // leave the field set for the next snap
      if (cb) cb();
    }

    // UI loop calls this when a LivePlay/LiveKick ends
    onPlayEnd() { this.endScene(); }

    ticker(text) {
      let t = $('liveTicker');
      if (!t) {
        t = document.createElement('div');
        t.id = 'liveTicker';
        t.innerHTML = '<div class="lt-play"></div><div class="lt-status"></div><button type="button" class="lt-add" hidden>+ PLAYS</button>';
        document.body.appendChild(t);
        t.querySelector('.lt-add').addEventListener('click', () => this.addPlays());
      }
      t.hidden = false;
      if (text !== undefined) t.querySelector('.lt-play').textContent = text;
      t.querySelector('.lt-status').textContent = this.status || (this.demo ? 'DEMO GAME · not a real result' : this.cfg.source === 'paste' ? `${this.lines.length} plays pasted` : 'Connecting to live stats…');
      t.querySelector('.lt-add').hidden = this.cfg.source !== 'paste';
      t.querySelector('.lt-add').onclick = () => this.addPlays();
    }

    addPlays() {
      UI.card({
        title: 'ADD PLAYS', lines: ['Paste the latest play-by-play. Plays you already have are skipped.'],
        buttons: [
          { label: 'ADD', cls: 'go', fn: () => { const v = $('lvMore') ? $('lvMore').value : ''; this.feed(v); this.status = `${this.lines.length} plays pasted`; this.ticker(); if (!this.busy) { if (this.cfg.mode === 'latest') this.fastForward(); this.next(); } } },
          { label: 'CANCEL', fn: () => {} },
        ],
      });
      const panel = document.querySelector('#card .panel');
      const ta = document.createElement('textarea');
      ta.id = 'lvMore'; ta.rows = 5; ta.className = 'lv-more';
      panel.insertBefore(ta, panel.querySelector('.row'));
      ta.focus();
    }
  }

  return { setup, LiveMatch, toLines };
})();

// ---------------------------------------------------------------------------
// Scripted plays: same players and AI, but the result is decided by the feed.
// ---------------------------------------------------------------------------
function liveRunEnd(p) {
  const c = p.carrier, L = p.live;
  if (!c || p.phase !== 'run') return;
  if (L.td && c.x >= 100) return p.endPlay('td', 'TOUCHDOWN!');
  const gain = L.target > p.runFrom + 0.5;
  if (!L.td && gain && c.x >= L.target) return p.endPlay('tackle', '', L.target);
  if (!L.td && !gain && p.t - p.runStart > 0.7) return p.endPlay('tackle', '', L.target);
  if (p.t - p.runStart > 7) return p.endPlay('tackle', '', L.target);
}

class LivePlay extends Play {
  // the viewer only watches: no aiming, throwing or scrambling by touch
  canThrow() { return !!this.liveThrowing && this.phase === 'pocket' && this.qb.hasBall; }
  update(dt) {
    if (this.phase === 'presnap') {
      this.wait = (this.wait || 0) + dt;
      if (this.wait > 0.55) this.snap();
      this.updateCam(dt);
      return;
    }
    if (this.phase === 'pocket') {
      if (this.live.kind === 'sack') {
        if (this.t > 1.7) { this.qb.down = true; this.events.push('tackle'); return this.endPlay('sack', 'SACKED!', this.live.target); }
      } else if (this.t > 1.25 && !this.thrown) { this.thrown = true; this.liveThrow(); }
    }
    super.update(dt);
    liveRunEnd(this);
  }
  liveThrow() {
    const L = this.live;
    // catch point: most of the gain in the air on longer completions
    const gain = L.target - this.los;
    const cx = L.kind === 'int' ? L.target : L.kind === 'inc' ? this.los + 12 : this.los + (gain > 6 ? gain * 0.65 : Math.max(gain, 1));
    let best = null, bd = 1e9;
    for (const r of this.receivers) { if (r.block) continue; const d = Math.abs(r.x + 4 - cx) + Math.abs(r.y - FIELD_W / 2) * 0.1; if (d < bd) { bd = d; best = r; } }
    if (!best) best = this.wr1;
    this.liveThrowing = true;
    this.throwTo(clamp(cx, this.qb.x + 3, 108), best.y + best.vy * 0.6);
    this.liveThrowing = false;
    this.liveTarget = best;
    best.track = true;
  }
  // the outcome comes from the feed, not the dice
  updateBall(dt) {
    const b = this.ball, u = (this.t - b.t0) / b.dur;
    const uu = Math.min(u, 1);
    b.x = lerp(b.fx, b.tx, uu); b.y = lerp(b.fy, b.ty, uu);
    b.h = 1.8 * (1 - uu) + 4 * b.peak * uu * (1 - uu);
    if (u < 1) return;
    const L = this.live;
    if (L.kind === 'inc') return this.endPlay('inc', 'INCOMPLETE');
    if (L.kind === 'int') {
      let d = null, dd = 1e9;
      for (const e of this.def) { const k = Math.hypot(e.x - b.x, e.y - b.y); if (k < dd) { dd = k; d = e; } }
      d.x = b.x; d.y = b.y;
      return this.intercept(d);
    }
    const r = this.receivers.find(e => e.track) || this.liveTarget || this.wr1;
    r.x = b.x; r.y = clamp(b.y, 0.5, FIELD_W - 0.5);
    this.catcher = r;
    this.makeRunner(r);
    this.events.push('catch');
  }
  makeRunner(e) { super.makeRunner(e); this.runStart = this.t; this.runFrom = e.x; }
  updateCarrier(c, dt) {
    const L = this.live;
    if (c.path && c.pathIdx < Math.min(2, c.path.length)) { this.followPath(c, dt); return; }
    const tx = L.td ? 110 : L.target;
    const ahead = tx > c.x;
    this.steer(c, ahead ? tx + 3 : tx, clamp(c.y, 6, FIELD_W - 6), dt, ahead ? 1 : 0.6, 0);
  }
  checkContact() {
    const c = this.carrier;
    if (c) c.y = clamp(c.y, 0.5, FIELD_W - 0.5);
  }
}

class LiveKick extends KickoffPlay {
  update(dt) {
    if (this.phase === 'presnap') {
      this.wait = (this.wait || 0) + dt;
      if (this.wait > 0.6) this.snap();
      this.updateCam(dt);
      return;
    }
    const before = this.phase;
    super.update(dt);
    if (before === 'approach' && this.phase === 'air') {
      const b = this.ball;
      b.tx = clamp(this.live.land, -8, 45); b.ty = clamp(FIELD_W / 2 + gauss() * 5, 8, FIELD_W - 8);
    }
    if (this.phase === 'run' && this.live.touchback) return this.endPlay('tackle', 'TOUCHBACK', 25);
    liveRunEnd(this);
  }
  makeRunner(e) { super.makeRunner(e); this.runStart = this.t; this.runFrom = e.x; }
  updateCarrier(c, dt) {
    const tx = this.live.td ? 110 : this.live.target;
    this.steer(c, tx > c.x ? tx + 3 : tx, clamp(c.y, 6, FIELD_W - 6), dt, 1, 0);
  }
  checkContact() {
    const c = this.carrier;
    if (c) c.y = clamp(c.y, 0.5, FIELD_W - 0.5);
  }
}
