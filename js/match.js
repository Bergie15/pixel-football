'use strict';
// ---------------------------------------------------------------------------
// Match flow: downs, clock, scoring, special teams, opponent drives, OT.
// Talks to the screen through the UI object defined in ui.js.
// ---------------------------------------------------------------------------

const ORD = ['', '1st', '2nd', '3rd', '4th'];

function fmtClock(s) {
  s = Math.max(0, Math.ceil(s));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
function ballOn(los) {
  los = Math.round(los);
  if (los === 50) return 'MIDFIELD';
  return los < 50 ? 'OWN ' + los : 'OPP ' + (100 - los);
}

class Match {
  // opts: { user, opp (team data objects with off/def), userHome, neutral, roster, units, qlen, title, onFinish }
  constructor(opts) {
    Object.assign(this, opts);
    this.score = { u: 0, o: 0 };
    this.q = 1;
    this.clock = this.qlen;
    this.los = 25; this.down = 1; this.fd = 35; this.ballY = FIELD_W / 2;
    this.play = null;
    this.ot = false;
    this.mode = null;  // 'two' during a 2-point try
    this.st = { comp: 0, att: 0, pyds: 0, ptd: 0, int: 0, ratt: 0, ryds: 0, rtd: 0, sacks: 0, fg: 0, fga: 0, rec: {} };
    const homeT = this.userHome ? this.user : this.opp, awayT = this.userHome ? this.opp : this.user;
    this.homeT = homeT; this.awayT = awayT;
    this.userKit = makeKit(this.user, this.userHome);
    this.oppKit = makeKit(this.opp, !this.userHome);
    // clash check: if both teams' jerseys read alike, away goes white anyway (already) — fine
    this.strip = buildFieldStrip(homeT, awayT);
    this.camX = 25;
  }

  // ---- lifecycle ------------------------------------------------------------
  start() {
    this.userReceivedFirst = Math.random() < 0.5;
    const who = this.userReceivedFirst ? this.user : this.opp;
    UI.hudUpdate(this);
    UI.card({
      title: 'GET READY!',
      lines: [this.title || `${this.awayT.name} at ${this.homeT.name}`, `${who.mascot} win the toss and receive.`],
      buttons: [{ label: 'KICK OFF', cls: 'go', fn: () => (this.userReceivedFirst ? this.beginDrive(25) : this.oppPossession(25)) }],
    });
  }

  beginDrive(los) {
    this.los = clamp(los, 1, 99);
    this.down = 1;
    this.fd = Math.min(this.los + 10, 100);
    this.ballY = FIELD_W / 2;
    this.nextSnap();
  }

  situation() {
    if (this.mode === 'two') return '2-PT TRY';
    const togo = this.fd >= 100 ? 'GOAL' : Math.max(1, Math.round(this.fd - this.los));
    return `${ORD[this.down]} & ${togo} · ${ballOn(this.los)}`;
  }

  nextSnap() {
    this.play = this.makePlay(PLAYS[0]);  // formation preview
    this.camX = this.play.camX;
    UI.hudUpdate(this);
    const kickDist = Math.round(100 - this.los + 17);
    const special = [];
    const lateHalf = !this.ot && (this.q === 2 || this.q === 4) && this.clock <= 45;
    if (this.mode !== 'two') {
      if (this.down === 4 && !this.ot) special.push({ id: 'punt', name: 'PUNT', sub: 'Pin them deep' });
      if ((this.down === 4 || lateHalf) && kickDist <= 62) special.push({ id: 'fg', name: 'FIELD GOAL', sub: `${kickDist} yards` });
    }
    UI.playSelect(this, special, choice => this.choose(choice));
  }

  makePlay(def) {
    return new Play({
      playDef: def, los: this.los, ballY: this.ballY, roster: this.roster, units: this.units,
      oppDef: this.opp.def, offKit: this.userKit, defKit: this.oppKit,
    });
  }

  choose(choice) {
    if (choice === 'punt') return this.punt();
    if (choice === 'fg') return this.fieldGoal(false);
    this.play = this.makePlay(choice);
    UI.presnap(this);
  }

  // ---- play results -----------------------------------------------------------
  onPlayEnd(r) {
    const p = this.play;
    const st = this.st;
    const yds = r.yards;
    // stats
    if (p.throwDist) {
      st.att++;
      if (r.type === 'int') st.int++;
      else if (p.catcher && r.type !== 'inc') {
        st.comp++; st.pyds += yds;
        const k = p.catcher.role, rec = st.rec[k] || (st.rec[k] = { rec: 0, yds: 0, td: 0 });
        rec.rec++; rec.yds += yds;
        if (r.type === 'td') { rec.td++; st.ptd++; }
      }
    } else if (r.type === 'sack') st.sacks++;
    else if (r.carrier && r.type !== 'inc') {
      st.ratt++; st.ryds += yds;
      if (r.type === 'td') st.rtd++;
    }

    if (this.mode === 'two') {
      this.mode = null;
      const good = r.type === 'td';
      if (good) this.score.u += 2;
      UI.hudUpdate(this);
      return UI.banner(good ? 'TWO-POINT GOOD!' : 'TWO-POINT FAILED', '', () => this.afterUserScore(), good ? 'td' : 'bad');
    }

    // clock
    const live = r.type === 'tackle' || r.type === 'sack';
    const hurry = (this.q === 2 || this.q === 4) && this.clock <= 120 && this.score.u <= this.score.o;
    if (!this.ot) this.clock -= Math.ceil(r.time) + (live ? Math.round((hurry ? 8 : 26) * this.qlen / 600) : 0);

    const who = r.carrier && r.carrier.player ? `#${r.carrier.player.num} ${r.carrier.player.name}` : '';
    switch (r.type) {
      case 'td':
        this.score.u += 6;
        UI.hudUpdate(this);
        return UI.banner('TOUCHDOWN!', who, () => this.conversion(), 'td');
      case 'safety':
        this.score.o += 2;
        UI.hudUpdate(this);
        return UI.banner('SAFETY', `${this.opp.mascot} +2`, () => this.afterClock(() => this.possessionOver(35 + Math.round(Math.random() * 10))), 'bad');
      case 'int':
        return UI.banner('INTERCEPTED!', 'Turnover', () => this.afterClock(() => this.possessionOver(r.spot >= 100 ? 25 : clamp(100 - r.spot, 1, 99))), 'bad');
    }

    const newLos = r.type === 'inc' ? this.los : clamp(r.spot, 0.5, 99.5);
    let label = r.label, sub = '', tone = '';
    if (r.type === 'inc') { sub = r.label === 'INCOMPLETE' ? 'Clock stops' : 'Incomplete'; }
    else if (r.type === 'sack') { label = 'SACKED'; sub = `Loss of ${Math.abs(yds)}`; tone = 'bad'; }
    else { label = yds > 0 ? `GAIN OF ${yds}` : yds === 0 ? 'NO GAIN' : `LOSS OF ${-yds}`; sub = who; }

    if (newLos >= this.fd) {
      this.los = newLos; this.down = 1; this.fd = Math.min(this.los + 10, 100);
      label = 'FIRST DOWN!'; tone = 'good'; sub = (yds > 0 ? `+${yds} · ` : '') + who;
    } else {
      this.los = newLos; this.down++;
    }
    if (r.type === 'oob' || r.type === 'tackle') this.ballY = clamp(r.carrier ? r.carrier.y : FIELD_W / 2, 20, FIELD_W - 20);
    if (r.type === 'inc') this.ballY = this.ballY; // ball goes back to previous spot

    if (this.down > 4) {
      UI.hudUpdate(this);
      return UI.banner('TURNOVER ON DOWNS', '', () => this.afterClock(() => this.possessionOver(clamp(100 - this.los, 1, 99))), 'bad');
    }
    UI.hudUpdate(this);
    UI.banner(label, sub, () => this.afterClock(() => this.nextSnap()), tone);
  }

  // If the clock expired during the play, handle the quarter break first.
  afterClock(next) {
    if (!this.ot && this.clock <= 0) return this.endQuarter(next);
    next();
  }

  endQuarter(cont) {
    this.clock = 0;
    UI.hudUpdate(this);
    if (this.q === 1 || this.q === 3) {
      this.q++; this.clock = this.qlen;
      UI.hudUpdate(this);
      return UI.banner(`END OF ${this.q === 2 ? '1ST' : '3RD'} QUARTER`, '', cont);
    }
    if (this.q === 2) {
      this.q = 3; this.clock = this.qlen;
      return UI.card({
        title: 'HALFTIME',
        lines: [this.scoreLine(), this.statLine()],
        buttons: [{ label: '2ND HALF', cls: 'go', fn: () => { UI.hudUpdate(this); this.userReceivedFirst ? this.oppPossession(25) : this.beginDrive(25); } }],
      });
    }
    // end of regulation
    if (this.score.u !== this.score.o) return this.finish();
    this.q = 5; this.ot = true; this.otRound = 1;
    UI.hudUpdate(this);
    UI.card({
      title: 'OVERTIME',
      lines: ['Tied after four. College rules:', 'each team gets a possession from the 25.'],
      buttons: [{ label: 'START OT', cls: 'go', fn: () => this.userOT() }],
    });
  }

  scoreLine() { return `${this.user.id} ${this.score.u} — ${this.opp.id} ${this.score.o}`; }
  statLine() { const s = this.st; return `${s.comp}/${s.att} passing, ${s.pyds} yds · ${s.ratt} rushes, ${s.ryds} yds`; }

  // ---- scoring + kicks ----------------------------------------------------------
  conversion() {
    UI.card({
      title: 'EXTRA POINT',
      lines: ['Kick it for one or go for two from the 3.'],
      buttons: [
        { label: 'KICK PAT', cls: 'go', fn: () => this.kickPAT() },
        { label: 'GO FOR 2', fn: () => { this.mode = 'two'; this.los = 97; this.down = 1; this.fd = 100; this.ballY = FIELD_W / 2; this.nextSnap(); } },
      ],
    });
  }

  kickPAT() {
    const K = this.roster.K;
    const zone = clamp(0.36 + (K.acc - 3) * 0.04, 0.18, 0.5);
    UI.meter({ title: 'EXTRA POINT', sub: `#${K.num} ${K.name}`, zone, speed: 1.0 }, v => {
      const good = Math.abs(v - 0.5) < zone / 2;
      if (good) this.score.u += 1;
      UI.hudUpdate(this);
      UI.banner(good ? "IT'S GOOD!" : 'NO GOOD', good ? 'PAT +1' : (v < 0.5 ? 'Wide left' : 'Wide right'), () => this.afterUserScore(), good ? 'good' : 'bad');
    });
  }

  afterUserScore() {
    if (this.ot) return this.oppOT();
    this.afterClock(() => this.oppPossession(25));
  }

  fieldGoal() {
    const K = this.roster.K;
    const d = Math.round(100 - this.los + 17);
    let zone = clamp(0.42 - (d - 20) * 0.0075 + (K.acc - 3) * 0.035, 0.06, 0.45);
    if (d > 44 + 4 * K.leg) zone *= 0.4;
    UI.meter({ title: `${d}-YARD FIELD GOAL`, sub: `#${K.num} ${K.name}`, zone, speed: 0.8 + d / 55 }, v => {
      this.st.fga++;
      const good = Math.abs(v - 0.5) < zone / 2;
      if (!this.ot) this.clock -= 5;
      if (good) { this.score.u += 3; this.st.fg++; }
      UI.hudUpdate(this);
      UI.banner(good ? "IT'S GOOD!" : 'NO GOOD', good ? `${d}-yard field goal` : (v < 0.5 ? 'Wide left' : 'Wide right'), () => {
        if (this.ot) return this.oppOT();
        this.afterClock(() => this.possessionOver(good ? 25 : Math.max(20, 100 - (this.los - 7))));
      }, good ? 'good' : 'bad');
    });
  }

  punt() {
    const K = this.roster.K;
    UI.meter({ title: 'PUNT', sub: `#${K.num} ${K.name}`, zone: 0.3, speed: 1.1, punt: true }, v => {
      const quality = 1 - Math.abs(v - 0.5) * 2;
      const d = Math.round(28 + 22 * quality + 1.5 * (K.leg - 3) + gauss() * 2);
      const land = this.los + d;
      let start, sub;
      if (land >= 100) { start = 20; sub = 'Touchback'; }
      else { start = clamp(Math.round(100 - land + Math.random() * 8), 1, 99); sub = `Fielded at the ${100 - land < 50 ? 100 - land : land}`; }
      if (!this.ot) this.clock -= 8;
      UI.hudUpdate(this);
      UI.banner(`PUNT ${d} YDS`, sub, () => this.afterClock(() => this.possessionOver(start)));
    });
  }

  possessionOver(oppStart) {
    if (this.ot) return this.oppOT();
    this.oppPossession(oppStart);
  }

  // ---- opponent ----------------------------------------------------------------
  oppPossession(startYd) {
    startYd = Math.round(clamp(startYd, 1, 99));
    this.play = null;
    this.camX = clamp(100 - startYd, 20, 80);
    let clutch = null;
    if (this.q === 4 && this.clock < 300) clutch = this.score.o > this.score.u ? 'protect' : this.score.o < this.score.u ? 'hurry' : null;
    if (this.q === 2 && this.clock < 120) clutch = 'hurry';
    const res = simOppDrive(this.opp, this.units.def, startYd, { clutch, scale: this.qlen / 600 });
    let resultLabel = res.result;
    const before = this.clock;
    if (res.time >= this.clock) {
      if (this.q === 1 || this.q === 3) {
        this.q++; this.clock = Math.max(30, this.qlen - (res.time - before));
      } else {
        // ran out of time before finishing the drive?
        const scoring = res.result === 'TD' || res.result === 'FG';
        if (!scoring || Math.random() > before / res.time + 0.25) {
          resultLabel = this.q === 2 ? 'END OF HALF' : 'END OF GAME';
          if (this.q === 4 && this.score.o > this.score.u) resultLabel = 'VICTORY FORMATION';
        }
        this.clock = 0;
      }
    } else this.clock -= res.time;

    let pts = 0;
    if (resultLabel === 'TD') pts = Math.random() < 0.95 ? 7 : 6;
    else if (resultLabel === 'FG') pts = 3;
    this.score.o += pts;
    UI.hudUpdate(this);
    const names = { TD: 'TOUCHDOWN', FG: 'FIELD GOAL', 'MISSED FG': 'MISSED FIELD GOAL', PUNT: 'PUNT', INTERCEPTION: 'INTERCEPTION!', FUMBLE: 'FUMBLE RECOVERED!', DOWNS: 'STOPPED ON DOWNS' };
    const good = ['PUNT', 'INTERCEPTION', 'FUMBLE', 'MISSED FG', 'DOWNS'].includes(resultLabel);
    UI.card({
      kicker: `${this.opp.mascot.toUpperCase()} BALL`,
      title: names[resultLabel] || resultLabel,
      tone: pts ? 'bad' : good ? 'good' : '',
      lines: [
        `Took over at ${startYd < 50 ? 'their own ' + startYd : startYd === 50 ? 'midfield' : 'your ' + (100 - startYd)}`,
        `${res.plays} plays · ${res.yards} yds · ${fmtClock(Math.min(res.time, before))}`,
        pts === 6 ? 'Extra point blocked!' : '',
      ],
      buttons: [{ label: 'CONTINUE', cls: 'go', fn: () => this.afterClock(() => this.beginDrive(res.userStart)) }],
    });
    UI.sfx(pts ? 'oppscore' : good ? 'good' : 'tick');
  }

  // ---- overtime -----------------------------------------------------------------
  userOT() {
    this.otStartScore = this.score.u;
    UI.banner(this.otRound > 1 ? `OVERTIME ${this.otRound}` : 'OVERTIME', 'Your ball at the 25', () => this.beginDrive(75));
  }

  oppOT() {
    const lead = this.score.u - this.score.o;
    const need = lead >= 6 ? 'TD' : lead >= 1 ? 'FG' : null;
    const res = simOppDrive(this.opp, this.units.def, 75, { ot: true, need });
    let pts = res.result === 'TD' ? 7 : res.result === 'FG' ? 3 : 0;
    if (pts === 7 && lead === 8) pts = Math.random() < 0.45 ? 8 : 6;
    this.score.o += pts;
    UI.hudUpdate(this);
    const names = { TD: 'TOUCHDOWN', FG: 'FIELD GOAL', 'MISSED FG': 'MISSED FIELD GOAL', INTERCEPTION: 'INTERCEPTION!', FUMBLE: 'FUMBLE!', DOWNS: 'STOPPED ON DOWNS', PUNT: 'STOPPED' };
    UI.card({
      kicker: `${this.opp.mascot.toUpperCase()} BALL · OT`,
      title: names[res.result] || res.result,
      tone: pts ? 'bad' : 'good',
      lines: [`${res.plays} plays · ${res.yards} yds`, this.scoreLine()],
      buttons: [{
        label: 'CONTINUE', cls: 'go', fn: () => {
          if (this.score.u !== this.score.o) return this.finish();
          this.otRound++; this.q = 5;
          this.userOT();
        },
      }],
    });
  }

  finish() {
    this.play = null;
    UI.hudUpdate(this);
    this.onFinish && this.onFinish(this);
  }
}
