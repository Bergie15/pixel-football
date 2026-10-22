'use strict';
// ---------------------------------------------------------------------------
// On-field engine: one live play at a time. The user always has the ball and
// drives toward x = 100. Defense is AI.
// ---------------------------------------------------------------------------

const rnd = Math.random;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) / 0.577;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a, b, t) => a + (b - a) * t;

const BASE_SPEED = { QB: 6.7, RB: 7.8, WR: 8.0, TE: 7.1, OL: 5.4, DL: 6.4, LB: 7.1, CB: 7.8, S: 7.6 };
const TACKLE_R = 1.0;
const CARRIER_LATERAL = 1.8;  // sideways speed boost for a runner you're steering
let RQ = 1;  // render sub-pixel quantum, set by the UI to its canvas scale
// Throw shape follows the pull: short throws are flat, fast line drives;
// long ones become high, softer lobs a receiver can run under.
const throwPeak = d => 0.6 + 0.04 * d + 0.0038 * d * d;          // apex height, yards
const throwSpeed = (arm, d) => (19 + 3.2 * arm) * lerp(1.12, 0.85, clamp(d / 45, 0, 1));
// The ball reaches the aim spot at catch height (not the grass), then keeps
// carrying a little further while it drops, so a late receiver can still get it.
const BALL_CATCH_H = 1.2, BALL_CARRY_T = 0.4, BALL_CARRY_D = 2.4;   // seconds, yards past the spot
const ballEnd = b => 1 + BALL_CARRY_T / b.dur;                     // flight progress when it hits the grass
function ballAt(b, u) {
  if (u <= 1) return { x: lerp(b.fx, b.tx, u), y: lerp(b.fy, b.ty, u), h: 1.8 * (1 - u) + 4 * b.peak * u * (1 - u) + BALL_CATCH_H * u };
  const k = Math.min(1, (u - 1) * b.dur / BALL_CARRY_T), d = Math.hypot(b.tx - b.fx, b.ty - b.fy) || 1;
  const s = BALL_CARRY_D * k * (1 - 0.3 * k) / d;
  return { x: b.tx + (b.tx - b.fx) * s, y: b.ty + (b.ty - b.fy) * s, h: BALL_CATCH_H * (1 - k * k) };
}
const throwDur = (arm, d) => 0.18 + d / throwSpeed(arm, d);

class Play {
  // opts: { def: playbook entry, los, ballY, roster, units:{ol}, oppDef, offKit, defKit, goalLine }
  constructor(opts) {
    Object.assign(this, opts);
    this.t = 0;
    this.phase = 'presnap';
    this.ents = [];
    this.ball = null;
    this.carrier = null;
    this.userTook = false;
    this.result = null;
    this.deadT = 0;
    this.aim = null;
    this.events = [];  // sfx / ui cues consumed by the UI
    this.camX = this.los + 13;
    this.setup();
  }

  // ---- setup ---------------------------------------------------------------
  mk(side, role, kind, x, y, speed, accel) {
    const e = {
      side, role, kind, x, y, vx: 0, vy: 0, maxSp: speed, accel,
      homeY: y, anim: rnd() * 10, skin: SKINS[Math.floor(rnd() * SKINS.length)],
      stunUntil: 0, shedImmune: 0, reactAt: 0, aimErr: gauss() * 0.7,
      blockedBy: null, engaged: null, bt: null,
    };
    this.ents.push(e);
    return e;
  }

  setup() {
    const R = this.roster, los = this.los, by = this.ballY;
    const sf = s => 0.9 + 0.035 * s;            // star speed factor
    const ol = this.units.ol;
    const dr = this.oppDef;
    this.dr = dr;

    this.off = [];
    for (let i = -2; i <= 2; i++) this.off.push(this.mk('off', 'OL', 'OL', los - 0.8, by + i * 2.3, BASE_SPEED.OL * sf(ol), 16));
    this.qb = this.mk('off', 'QB', 'QB', los - 5, by, BASE_SPEED.QB * sf(R.QB.acc * 0.5 + 1.5), 20);
    this.rb = this.mk('off', 'RB', 'RB', los - 5, by - 2.6, BASE_SPEED.RB * sf(R.RB.spd), 24);
    const wr1y = Math.max(3, by - 17), wr2y = Math.min(FIELD_W - 3, by + 17);
    const sloty = clamp(by - 10, wr1y + 4, by - 6);
    this.wr1 = this.mk('off', 'WR1', 'WR', los - 0.8, wr1y, BASE_SPEED.WR * sf(R.WR1.spd), 26);
    this.slot = this.mk('off', 'SLOT', 'WR', los - 1.2, sloty, BASE_SPEED.WR * sf(R.SLOT.spd), 26);
    this.te = this.mk('off', 'TE', 'TE', los - 1.0, by + 6, BASE_SPEED.TE * sf(R.TE.spd), 22);
    this.wr2 = this.mk('off', 'WR2', 'WR', los - 0.8, wr2y, BASE_SPEED.WR * sf(R.WR2.spd), 26);
    this.off.push(this.qb, this.rb, this.wr1, this.slot, this.te, this.wr2);
    this.receivers = [this.wr1, this.slot, this.te, this.wr2, this.rb];
    for (const e of this.receivers) e.player = R[e.role];
    this.qb.player = R.QB;
    this.qb.hasBall = true;

    // Defense: 4 DL, 2 LB, 2 CB, nickel, 2 safeties
    const dsp = k => BASE_SPEED[k] * sf(dr);
    const dac = 11 + 2.5 * dr;
    const dmax = x => Math.min(x, 109);
    this.def = [];
    for (const off of [-5.4, -1.8, 1.8, 5.4]) this.def.push(this.mk('def', 'DL', 'DL', los + 1.1, by + off, dsp('DL'), dac));
    const lb1 = this.mk('def', 'LB1', 'LB', dmax(los + 5), this.te.y, dsp('LB'), dac);
    const lb2 = this.mk('def', 'LB2', 'LB', dmax(los + 5), by - 3.5, dsp('LB'), dac);
    const s2 = this.mk('def', 'S2', 'S', dmax(los + 12), by + 9, dsp('S'), dac);
    const cb1 = this.mk('def', 'CB1', 'CB', dmax(los + 6.5), this.wr1.y, dsp('CB'), dac + 2);
    const cb2 = this.mk('def', 'CB2', 'CB', dmax(los + 6.5), this.wr2.y, dsp('CB'), dac + 2);
    const nb = this.mk('def', 'NB', 'CB', dmax(los + 5), this.slot.y, dsp('CB'), dac + 2);
    const s = this.mk('def', 'S', 'S', dmax(los + 12), by - 9, dsp('S'), dac);
    lb1.man = this.te; lb2.man = this.rb; cb1.man = this.wr1; cb2.man = this.wr2; nb.man = this.slot;
    this.def.push(lb1, lb2, cb1, cb2, nb, s, s2);
    this.safeties = [s, s2];

    // Routes
    const routes = this.def_routes = this.playDef.routes || {};
    for (const e of this.receivers) {
      const name = routes[e.role] || 'block';
      const r = ROUTES[name];
      e.routeName = name;
      e.block = !r;
      if (r) {
        const inside = e.y < by ? 1 : -1;
        e.route = r.pts.map(([f, i]) => ({ x: e.x + f, y: clamp(e.y + inside * i, 1.2, FIELD_W - 1.2) }));
        e.routeStop = !!r.stop;
        e.routeIdx = 0;
      }
    }
    // Run play path for the RB
    if (this.playDef.type === 'run') {
      const p = this.playDef.run === 'dive'
        ? [{ x: los - 3.6, y: by - 0.6 }, { x: los + 0.5, y: by + 1.2 }, { x: los + 8, y: by + 1.2 }]
        : [{ x: los - 4.2, y: by + 5 }, { x: los - 1, y: by + 12 }, { x: los + 8, y: by + 13.5 }];
      this.rb.path = p; this.rb.pathIdx = 0;
      this.rb.block = false;
    }
    // OL assignments: nearest DL, center picks up whoever comes free
    const dls = this.def.filter(d => d.kind === 'DL');
    [0, 1, 3, 4].forEach((oi, k) => { this.off[oi].bt = dls[k]; });
    this.off[2].bt = null;
    // Run blocking: TE + WRs block their nearest defender
    if (this.playDef.type === 'run') {
      this.off[2].bt = lb2;
      this.wr1.bt = cb1; this.wr2.bt = cb2; this.slot.bt = nb; this.te.bt = lb1;
    }
    this.ball = { x: los, y: by, h: 0, holder: this.qb };
  }

  // ---- input from UI -------------------------------------------------------
  snap() {
    if (this.phase !== 'presnap') return;
    this.phase = this.playDef.type === 'run' ? 'handoff' : 'pocket';
    this.events.push('hike');
  }

  canThrow() { return this.phase === 'pocket' && this.qb.hasBall; }

  scramble() {
    if (!this.canThrow()) return;
    this.makeRunner(this.qb);
    this.userTook = true;
  }

  juke() {
    const c = this.carrier;
    if (!c || this.phase !== 'run' || this.t < (c.jukeCD || 0)) return;
    c.jukeUntil = this.t + 0.38;
    c.jukeCD = this.t + 1.0;
    // hop sideways relative to current lateral motion
    const side = Math.abs(c.vy) > 0.5 ? Math.sign(c.vy) : (rnd() < 0.5 ? -1 : 1);
    c.vy += side * 4.5;
    this.events.push('juke');
  }

  // Swipe forward: lay out for extra yards. The play ends where he lands.
  dive() {
    const c = this.carrier;
    if (!c || this.phase !== 'run' || c.diving) return;
    this.userTook = true;
    c.diving = true; c.diveEnd = this.t + 0.38;
    const sp = Math.max(Math.hypot(c.vx, c.vy), c.maxSp * 0.8) * 1.25;
    c.vx = sp; c.vy *= 0.3;
    this.events.push('dive');
  }

  // Swipe backward: plant and back-step so the tackler flies past.
  backstep() {
    const c = this.carrier;
    if (!c || this.phase !== 'run' || this.t < (c.jukeCD || 0)) return;
    this.userTook = true;
    c.jukeUntil = this.t + 0.45; c.jukeCD = this.t + 0.9;
    c.backUntil = this.t + 0.28;
    c.vx = -2.5;
    for (const d of this.def) if (dist(d, c) < 2.6 && this.isFree(d)) { d.stunUntil = this.t + 0.75; d.vx *= 1.3; }
    this.events.push('juke');
  }

  // Hold: lower the shoulder. Slower, but tacklers bounce off.
  setTruck(on) {
    const c = this.carrier;
    if (c && c.truck !== on && on) this.events.push('truckon');
    if (c) c.truck = on && this.phase === 'run';
  }

  // A quick swipe: hard cut in the swipe direction, with a juke if it's ready.
  cut(dx, dy) {
    const c = this.carrier;
    if (!c || this.phase !== 'run') return;
    this.userTook = true;
    if (dx < -0.2) dx = -0.2;  // a cut never turns the runner fully around
    const m = Math.hypot(dx, dy) || 1;
    c.cutDx = dx / m; c.cutDy = dy / m; c.cutUntil = this.t + 0.9;
    c.vy += c.cutDy * 5;  // the cut starts right away
    if (this.t >= (c.jukeCD || 0)) {
      c.jukeUntil = this.t + 0.3; c.jukeCD = this.t + 1.0;
      c.vx += c.cutDx * 3; c.vy += c.cutDy * 3;
      this.events.push('juke');
    }
  }

  // Aim assist: if the aim point is near a receiver, move it to where that
  // receiver will be when the ball arrives (two passes of lead prediction).
  assistAim(tx, ty) {
    const q = this.qb, P = this.roster.QB;
    const maxD = 34 + 6 * P.arm;
    // Light touch only: the ball goes where you aim (like Retro Bowl), nudged
    // a little toward a receiver's path when you're within a few yards of it.
    let best = null, bd = 4;
    for (const r of this.receivers) {
      if (r.block) continue;
      const dur = throwDur(P.arm, Math.hypot(r.x - q.x, r.y - q.y));
      const dd = Math.hypot(r.x + r.vx * dur - tx, r.y + r.vy * dur - ty);
      if (dd < bd) { bd = dd; best = r; }
    }
    let x = tx, y = ty;
    if (best) {
      let lx = best.x, ly = best.y;
      for (let i = 0; i < 3; i++) {
        const dur = throwDur(P.arm, Math.hypot(lx - q.x, ly - q.y));
        lx = best.x + best.vx * dur * 0.7; ly = best.y + best.vy * dur * 0.7;
      }
      ly = clamp(ly, 0.8, FIELD_W - 0.8);
      const pull = clamp(1 - bd / 4, 0, 1) * 0.4;
      x = lerp(tx, lx, pull); y = lerp(ty, ly, pull);
    }
    const d = Math.hypot(x - q.x, y - q.y);
    if (d > maxD) { x = q.x + (x - q.x) / d * maxD; y = q.y + (y - q.y) / d * maxD; }
    return { x, y, r: best };
  }

  throwTo(tx, ty) {
    if (!this.canThrow()) return false;
    const q = this.qb, P = this.roster.QB;
    const aim = this.assistAim(tx, ty);
    tx = aim.x; ty = aim.y;
    const d = Math.hypot(tx - q.x, ty - q.y);
    if (d < 2) return false;
    let pressure = 0;
    for (const e of this.def) {
      if (e.blockedBy || this.t < e.stunUntil) continue;
      const dd = dist(e, q);
      if (dd < 3) pressure = Math.max(pressure, (3 - dd) / 3);
    }
    // small scatter: better QBs, short throws and a clean pocket are tighter
    const sigma = 0.08 + d * (0.02 - 0.003 * P.acc) + pressure * 0.8;
    tx += gauss() * sigma; ty += gauss() * sigma * 0.7;
    const dur = throwDur(P.arm, d);
    this.ball = { x: q.x, y: q.y, h: 1.8, fx: q.x, fy: q.y, tx, ty, t0: this.t, dur, peak: throwPeak(d), holder: null, air: true };
    q.hasBall = false;
    this.phase = 'air';
    this.throwDist = d;
    // The intended receiver goes for the ball
    let best = aim.r;
    if (!best) {
      let bd = 9;
      for (const r of this.receivers) {
        if (r.block) continue;
        const dd = Math.hypot(r.x + r.vx * dur * 0.7 - tx, r.y + r.vy * dur * 0.7 - ty);
        if (dd < bd) { bd = dd; best = r; }
      }
    }
    if (best) best.track = true;
    // anyone else who can get there breaks off his route for the ball too
    for (const r of this.receivers) {
      if (r.block || r === best) continue;
      const dd = Math.hypot(r.x - tx, r.y - ty);
      if (dd < Math.min(14, r.maxSp * dur + 3)) r.track = true;
    }
    // Defenders who can get there react after a beat
    for (const e of this.def) {
      if (e.kind === 'DL') continue;
      const dd = Math.hypot(e.x - tx, e.y - ty);
      if (dd < e.maxSp * dur + 3 && dd < 12) { e.ballReact = true; e.reactAt = this.t + 0.3 + rnd() * 0.25 - 0.03 * this.dr; }
    }
    this.events.push('throw');
    return true;
  }

  // ---- helpers -------------------------------------------------------------
  steer(e, tx, ty, dt, spScale = 1, arrive = 0.6) {
    const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
    let sp = e.maxSp * spScale;
    if (e.slowUntil > this.t) sp *= 0.55;
    if (d < arrive) sp *= d / arrive;
    const ux = d > 1e-4 ? dx / d : 0, uy = d > 1e-4 ? dy / d : 0;
    this.accelTo(e, ux * sp, uy * sp, dt);
  }
  accelTo(e, wvx, wvy, dt) {
    let ax = wvx - e.vx, ay = wvy - e.vy;
    const m = Math.hypot(ax, ay), lim = e.accel * dt;
    if (m > lim) { ax *= lim / m; ay *= lim / m; }
    e.vx += ax; e.vy += ay;
  }
  holder() { return this.ball && this.ball.holder; }
  isFree(d) { return !d.blockedBy && this.t >= d.stunUntil; }

  makeRunner(e) {
    if (this.ball.holder) this.ball.holder.hasBall = false;
    e.hasBall = true;
    this.ball.holder = e;
    this.ball.air = false;
    this.carrier = e;
    this.phase = 'run';
    for (const d of this.def) {
      const base = d.kind === 'DL' ? 0 : d.kind === 'LB' ? 0.1 : 0.15;
      d.reactAt = this.t + base + rnd() * 0.2 - 0.03 * this.dr;
      d.ballReact = false;
    }
    // Everyone else becomes a blocker
    for (const o of this.off) {
      if (o === e) continue;
      o.track = false;
      if (!o.openField) o.accel *= 1.35;
      o.openField = true;
      if (!o.engaged) o.bt = null;
    }
  }

  // ---- update ----------------------------------------------------------------
  update(dt) {
    if (this.phase === 'presnap') { this.updateCam(dt); return; }
    this.t += dt;
    if (this.phase === 'dead') {
      this.deadT += dt;
      for (const e of this.ents) { e.vx *= 0.9; e.vy *= 0.9; e.x += e.vx * dt; e.y += e.vy * dt; e.anim += dt * Math.hypot(e.vx, e.vy); }
      if (this.ball.holder) { this.ball.x = this.ball.holder.x; this.ball.y = this.ball.holder.y; }
      this.updateCam(dt);
      return;
    }

    const t = this.t;
    // run play handoff
    if (this.phase === 'handoff') {
      const rb = this.rb;
      if (t > 0.45 && dist(rb, this.qb) < 2.2 || t > 0.8) {
        this.makeRunner(rb);
        this.events.push('handoff');
      }
    }

    for (const o of this.off) this.updateOff(o, dt);
    for (const d of this.def) this.updateDef(d, dt);
    this.updateBlocks(dt);

    for (const e of this.ents) {
      if (!e.engaged && !e.blockedBy) { e.x += e.vx * dt; e.y += e.vy * dt; }
      e.anim += dt * Math.hypot(e.vx, e.vy);
    }

    // ball
    const b = this.ball;
    if (b.air) this.updateBall(dt);
    else if (b.holder) { b.x = b.holder.x; b.y = b.holder.y; b.h = 1.1; }

    if (this.phase !== 'dead') this.checkContact();
    this.updateCam(dt);
  }

  updateCam(dt) {
    let target = this.los + 13;
    // aiming deep: slide downfield so the target stays in view
    if (this.phase === 'pocket' && this.aim && this.aimFollow) target = Math.max(target, Math.min(this.aim.x, this.qb.x + 70) - 10);
    if (this.phase === 'air') target = this.ball.x + 6;
    else if (this.phase === 'run' || this.phase === 'dead') target = (this.carrier ? this.carrier.x : this.ball.x) + 7;
    this.camX += (target - this.camX) * Math.min(1, dt * 3.2);
  }

  updateOff(o, dt) {
    const t = this.t;
    if (o.engaged) return;
    if (o === this.carrier) return this.updateCarrier(o, dt);
    if (t < o.stunUntil) { this.steer(o, o.x, o.y, dt, 0.2); return; }

    if (o === this.qb) {
      if (this.phase === 'pocket') {
        let ty = this.ballY, tx = this.los - 7;
        // slide away from the nearest free rusher
        let near = null, nd = 5;
        for (const d of this.def) if (this.isFree(d)) { const dd = dist(d, o); if (dd < nd) { nd = dd; near = d; } }
        if (near && t > 0.7) { ty = clamp(o.y + Math.sign(o.y - near.y || 1) * 3, this.ballY - 5, this.ballY + 5); tx = Math.max(this.los - 9, o.x - 1); }
        this.steer(o, tx, ty, dt, t < 0.8 ? 0.85 : 0.35, 0.4);
      } else if (this.phase === 'handoff' || (this.phase === 'run' && this.playDef.type === 'run' && t < 1.5)) {
        // fake bootleg away from the run
        this.steer(o, this.los - 6, this.ballY + (this.playDef.run === 'toss' ? -5 : -3), dt, 0.5);
      } else {
        this.steer(o, o.x, o.y, dt, 0.3);
      }
      return;
    }

    // Running back before the handoff
    if (o.path && this.phase === 'handoff') { this.followPath(o, dt); return; }

    // Ball in the air: intended receiver goes to the spot
    if (this.phase === 'air' && o.track) {
      const b = this.ball, tCatch = b.t0 + b.dur, tGround = b.t0 + b.dur + BALL_CARRY_T;
      if (o.diving) { o.vx *= Math.pow(0.15, dt); o.vy *= Math.pow(0.15, dt); return; }
      // the ball is coming down: lay out if he won't get there on his feet
      const remG = Math.max(0.05, tGround - t);
      const dBall = Math.hypot(b.x - o.x, b.y - o.y);
      const shortBy = dBall - Math.hypot(o.vx, o.vy) * remG;
      if (t > tCatch - 0.15 && b.h < 1.5 && shortBy > 1.2 && dBall > 1.6 && dBall < 4.6) {
        o.diving = true;
        const s = Math.min(14, dBall / Math.min(remG, 0.35));
        o.vx = (b.x - o.x) / dBall * s; o.vy = (b.y - o.y) / dBall * s;
        return;
      }
      if (t < tCatch) {
        // time the run so he meets the ball at the aim spot instead of waiting under it
        const rem = Math.max(0.05, tCatch - t), d = Math.hypot(b.tx - o.x, b.ty - o.y);
        const need = clamp(d / rem, 0, o.maxSp) / o.maxSp;
        this.steer(o, b.tx, b.ty, dt, Math.max(need, d > 0.5 ? 0.35 : 0), 0.1);
      } else {
        // it's past the spot and still carrying: chase it down
        const g = ballAt(b, ballEnd(b));
        this.steer(o, g.x, g.y, dt, 1, 0);
      }
      return;
    }

    // Blocking duty
    if (o.openField || o.kind === 'OL' || o.block || (o.routeName === 'fake' && t > 0.7)) {
      this.blockerAI(o, dt);
      return;
    }
    if (o.routeName === 'fake') { this.steer(o, this.los - 1, this.ballY + 1.5, dt, 0.8); return; }

    // Route running
    if (o.route) {
      if (o.routeIdx < o.route.length) {
        const p = o.route[o.routeIdx];
        this.steer(o, p.x, p.y, dt, 1, 0);
        if (Math.hypot(p.x - o.x, p.y - o.y) < 0.7) o.routeIdx++;
      } else if (o.routeStop) {
        const p = o.route[o.route.length - 1];
        this.steer(o, p.x - 0.3, p.y, dt, 0.4, 1);
      } else {
        const a = o.route.length > 1 ? o.route[o.route.length - 2] : { x: o.x - 1, y: o.y };
        const p = o.route[o.route.length - 1];
        const dx = p.x - a.x, dy = p.y - a.y, m = Math.hypot(dx, dy) || 1;
        let ty = clamp(o.y + dy / m * 10, 1.5, FIELD_W - 1.5);
        this.steer(o, o.x + dx / m * 10, ty, dt, 1, 0);
      }
    }
  }

  followPath(o, dt) {
    if (o.pathIdx < o.path.length) {
      const p = o.path[o.pathIdx];
      this.steer(o, p.x, p.y, dt, 1, 0);
      if (Math.hypot(p.x - o.x, p.y - o.y) < 0.8) o.pathIdx++;
      return true;
    }
    return false;
  }

  updateCarrier(c, dt) {
    if (c.diving) {
      // airborne: no steering, a little drag, then down at the spot
      c.vx *= Math.pow(0.5, dt); c.vy *= Math.pow(0.3, dt);
      if (this.t >= c.diveEnd) {
        c.down = true;
        if (c.x >= 100) return this.endPlay('td', 'TOUCHDOWN!');
        return this.endPlay('tackle', 'DIVE', clamp(c.x, 0.5, 99.5));
      }
      return;
    }
    if (this.t < (c.backUntil || 0)) { this.accelTo(c, -2.5, c.vy * 0.5, dt); return; }
    const inp = this.input;
    if (inp && inp.active && inp.mag > 0.2) this.userTook = true;
    let dx = 1, dy = 0;
    if (this.userTook && inp && inp.active && inp.mag > 0.2) { dx = inp.dx; dy = inp.dy; c.lastDy = dy; }
    else if (this.t < (c.cutUntil || 0)) { dx = c.cutDx; dy = c.cutDy; c.lastDy = dy; }
    else if (!this.userTook && c.path && c.pathIdx < c.path.length) { this.followPath(c, dt); return; }
    else if (this.userTook) { dy = (c.lastDy || 0) * 0.8; dx = 1; c.lastDy = (c.lastDy || 0) * Math.pow(0.35, dt); }
    const m = Math.hypot(dx, dy) || 1;
    let sp = c.maxSp * (this.t < (c.jukeUntil || 0) ? 1.12 : 1);
    if (c.slowUntil > this.t) sp *= 0.55;
    if (c.truck) sp *= 0.85;
    // The field is drawn squashed top to bottom, so sideways yards look tiny on
    // screen. When you steer, sideways movement gets a boost so it reads.
    let vx = dx / m * sp, vy = dy / m * sp;
    if (this.userTook) {
      vy *= CARRIER_LATERAL;
      const v = Math.hypot(vx, vy), cap = sp * 1.35;
      if (v > cap) { vx *= cap / v; vy *= cap / v; }
    }
    this.accelTo(c, vx, vy, dt * (this.userTook ? 1.4 : 1));
  }

  // Downfield blockers get a burst so they can stay ahead of the runner
  blockBoost(o) { return o.kind === 'OL' ? 1.4 : o.kind === 'TE' ? 1.18 : 1.1; }

  // Pick and engage a defender
  blockerAI(o, dt) {
    const t = this.t;
    const h = this.holder() || this.qb;
    if (o.bt && (o.bt.blockedBy || t < o.bt.shedImmune || t < o.bt.stunUntil)) o.bt = null;
    if (!o.bt) {
      // nearest free defender threatening the ball
      let best = null, bd = o.openField ? 9 : 7;
      for (const d of this.def) {
        if (!this.isFree(d) || t < d.shedImmune) continue;
        if (this.def.some(x => x !== d && false)) continue;
        if (this.off.some(x => x !== o && x.bt === d)) continue;
        const dd = dist(d, o) + dist(d, h) * 0.5;
        if (dd < bd) { bd = dd; best = d; }
      }
      o.bt = best;
    }
    if (!o.bt) {
      // hold the pocket / lead the way
      // nobody to block: get out in front of the ball carrier
      if (o.openField && this.carrier) this.steer(o, this.carrier.x + 4 + this.carrier.vx * 0.3, this.carrier.y + (o.y > this.carrier.y ? 2 : -2), dt, this.blockBoost(o));
      else this.steer(o, o.kind === 'OL' && this.phase === 'pocket' ? this.los - 1.5 : o.x, o.y, dt, 0.4);
      return;
    }
    const d = o.bt;
    const gx = h.x - d.x, gy = h.y - d.y, gm = Math.hypot(gx, gy) || 1;
    // get between the defender and the ball
    this.steer(o, d.x + gx / gm * 0.9, d.y + gy / gm * 0.9, dt, o.openField ? this.blockBoost(o) : 1, 0.2);
    if (dist(o, d) < 1.15 && this.isFree(d) && t >= d.shedImmune) {
      const diff = this.units.ol - this.dr;
      let shed;
      if (o.openField) shed = 0.5 + rnd() * 0.9 + 0.15 * diff;
      else if (this.playDef.type === 'run') shed = 0.9 + rnd() * 1.2 + 0.3 * diff;
      else shed = 2.2 + rnd() * 1.6 + 0.45 * diff;
      if (o.kind === 'WR') shed *= 0.6;
      d.blockedBy = o; o.engaged = d;
      d.shedAt = t + Math.max(0.35, shed);
    }
  }

  updateBlocks(dt) {
    const t = this.t;
    const h = this.holder() || (this.ball.air ? { x: this.ball.tx, y: this.ball.ty } : this.qb);
    for (const d of this.def) {
      const o = d.blockedBy;
      if (!o) continue;
      const fleeing = this.carrier && dist(d, this.carrier) > 7 && this.carrier.x > d.x + 2;
      if (t >= d.shedAt || this.phase === 'dead') {
        d.blockedBy = null; o.engaged = null; o.bt = null;
        o.stunUntil = t + 0.5; d.shedImmune = t + 0.9;
        continue;
      }
      // the pair drifts toward the ball, slowly; run blocks drive the defender back
      const gx = h.x - d.x, gy = h.y - d.y, gm = Math.hypot(gx, gy) || 1;
      let sp = this.playDef.type === 'run' || o.openField ? 0.4 + 0.25 * (this.dr - this.units.ol) : 0.75;
      if (fleeing) sp = 0.2;
      d.vx = gx / gm * sp; d.vy = gy / gm * sp;
      d.x += d.vx * dt; d.y += d.vy * dt;
      o.x = d.x - gx / gm * 0.85; o.y = d.y - gy / gm * 0.85;
      o.vx = d.vx; o.vy = d.vy;
    }
  }

  updateDef(d, dt) {
    const t = this.t;
    if (d.blockedBy) return;
    if (t < d.stunUntil) { this.steer(d, d.x, d.y, dt, 0.15); return; }
    const los = this.los;

    if (this.phase === 'air') {
      if (d.ballReact && t >= d.reactAt) { this.steer(d, this.ball.tx, this.ball.ty, dt, 1, 0.2); return; }
      if (d.man) return this.cover(d, dt);
      if (d.kind === 'DL') return this.steer(d, this.qb.x, this.qb.y, dt, 0.5);
      return this.zone(d, dt);
    }
    if (this.phase === 'run' && this.carrier) {
      if (t >= d.reactAt) return this.pursue(d, this.carrier, dt);
      if (d.man) return this.cover(d, dt);
      return this.zone(d, dt);
    }
    if (this.phase === 'handoff') {
      if (d.kind === 'DL') return this.pursue(d, this.rb, dt);
      if (d.kind === 'LB') return this.steer(d, los + 3, d.y, dt, 0.5);
      return this.cover(d, dt);
    }
    // pocket
    if (d.kind === 'DL') return this.pursue(d, this.qb, dt);
    if (this.playDef.playAction && t < 0.75 && d.kind === 'LB') return this.steer(d, los + 2, d.y, dt, 0.9);
    if (d.man && !d.man.block && d.man.routeName !== 'fake') return this.cover(d, dt);
    if (d.man && (d.man.block || d.man.routeName === 'fake') && d.kind === 'LB' && t > 1.4) return this.pursue(d, this.qb, dt, 0.9); // delayed blitz
    return this.zone(d, dt);
  }

  cover(d, dt) {
    const m = d.man;
    if (!m || m.block) return this.zone(d, dt);
    // Defenders read the receiver's motion with a lag, so sharp cuts create separation.
    const k = Math.min(1, dt / (0.34 - 0.045 * this.dr));
    d.seenVx = lerp(d.seenVx || 0, m.vx, k);
    d.seenVy = lerp(d.seenVy || 0, m.vy, k);
    const lead = 0.3;
    // Press-bail cushion early, then trail the receiver once he's past ~7 yards.
    const cushion = m.x > this.los + 7 ? -0.7 : (d.kind === 'CB' ? 1.6 : 0.8);
    const inside = Math.sign(this.ballY - m.y) * 0.5;
    const tx = Math.min(m.x + d.seenVx * lead + cushion, 109.5);
    const ty = m.y + d.seenVy * lead + inside;
    this.steer(d, tx, ty, dt, 1, 0.5);
  }

  zone(d, dt) {
    const los = this.los;
    if (d.kind === 'S') {
      // two-deep: each safety keeps the deepest threat on his half over the top
      const top = d.homeY < this.ballY;
      let deep = null;
      for (const r of this.receivers) if (!r.block && (r.y < this.ballY + 2) === top && (!deep || r.x > deep.x)) deep = r;
      const tx = Math.min(Math.max(los + 11, (deep ? deep.x : los) + 3.5), 109);
      const ty = lerp(d.homeY, deep ? deep.y : d.homeY, 0.5);
      return this.steer(d, tx, ty, dt, 0.95, 1);
    }
    const tx = Math.min(los + (d.kind === 'CB' ? 8 : 6), 108);
    const ty = lerp(d.homeY, this.qb.y, 0.35);
    this.steer(d, tx, ty, dt, 0.7, 1);
  }

  pursue(d, c, dt, sc = 1) {
    const dd = dist(d, c);
    const tl = clamp(dd / d.maxSp, 0, 1.1) * 0.85;
    const tx = c.x + c.vx * tl;
    const ty = c.y + c.vy * tl + (dd > 3 ? d.aimErr : 0);
    this.steer(d, tx, ty, dt, sc, 0);
  }

  updateBall(dt) {
    const b = this.ball, u = (this.t - b.t0) / b.dur;
    const end = ballEnd(b);
    const at = ballAt(b, Math.min(u, end));
    b.x = at.x; b.y = at.y; b.h = at.h;
    (b.trail || (b.trail = [])).push({ x: b.x, y: b.y, h: b.h });
    if (b.trail.length > 7) b.trail.shift();
    if (u < 0.72 || b.h > 2.3) return;
    // Receivers can reach a bit higher than a defender jumping into the lane.
    const rR = u >= 0.95 ? 1.9 : 1.3, dR = u >= 1 ? 1.0 : (b.h < 1.2 ? 0.55 : 0);
    let r = null, rd = rR, dfd = null, ddd = dR;
    for (const e of this.receivers) { if (e.block && !e.track) continue; const k = Math.hypot(e.x - b.x, e.y - b.y); if (k < rd) { rd = k; r = e; } }
    for (const e of this.def) { if (e.blockedBy) continue; const k = Math.hypot(e.x - b.x, e.y - b.y); if (k < ddd) { ddd = k; dfd = e; } }
    if (!r && !dfd && u >= end) {
      // just out of reach: the receiver lays out for it
      let dv = null, dvd = 4.4;
      for (const e of this.receivers) { if (e.block && !e.track) continue; const k = Math.hypot(e.x - b.x, e.y - b.y); if (k < dvd) { dvd = k; dv = e; } }
      if (dv) return this.divingCatch(dv, dvd);
      return this.endPlay('inc', 'INCOMPLETE');
    }
    if (!r && !dfd) return;
    this.resolveCatch(r, rd, dfd, ddd);
  }

  resolveCatch(r, rd, d, dd) {
    const b = this.ball;
    if (r && r.diving && (!d || rd <= dd + 0.35)) return this.divingCatch(r, rd);
    const oob = b.y < 0 || b.y > FIELD_W || b.x > 110;
    if (r && (!d || rd <= dd + 0.35)) {
      let contest = 0;
      for (const e of this.def) if (!e.blockedBy && dist(e, r) < 1.5) contest += 1 - dist(e, r) / 1.5;
      const hands = (r.player && r.player.hnd) || 3;
      const p = 0.97 + 0.03 * (hands - 3) - 0.08 * (rd / 1.9) - contest * 0.3 * (1 + 0.1 * (this.dr - 3));
      if (rnd() < p) {
        if (oob) return this.endPlay('inc', 'OUT OF BOUNDS');
        r.x = b.x * 0.5 + r.x * 0.5; r.y = b.y * 0.5 + r.y * 0.5;
        this.catcher = r;
        this.makeRunner(r);
        this.events.push('catch');
        this.pop = { text: 'CAUGHT!', e: r, t0: this.t };
        if (r.x >= 100) this.endPlay('td', 'TOUCHDOWN!');
        return;
      }
      if (d && dd < 1.0 && rnd() < 0.12) return this.intercept(d);
      return this.endPlay('inc', contest > 0.2 ? 'BROKEN UP' : 'DROPPED');
    }
    const pInt = 0.16 + 0.05 * (this.dr - 3) - (r ? 0.08 : 0);
    if (!oob && rnd() < pInt) return this.intercept(d);
    this.endPlay('inc', 'BROKEN UP');
  }

  // A dive: the receiver ends up on the ground at the spot, with the ball or not.
  divingCatch(r, k) {
    const b = this.ball;
    let contest = 0;
    for (const e of this.def) if (!e.blockedBy && dist(e, b) < 1.6) contest += 1 - dist(e, b) / 1.6;
    const hands = (r.player && r.player.hnd) || 3;
    const p = 0.86 + 0.05 * (hands - 3) - Math.max(0, k - 1.9) * 0.1 - contest * 0.35;
    r.x = b.x; r.y = clamp(b.y, -0.5, FIELD_W + 0.5); r.vx *= 0.3; r.vy *= 0.3; r.down = true;
    if (b.y < 0 || b.y > FIELD_W || b.x > 110 || rnd() > p) return this.endPlay('inc', 'INCOMPLETE');
    this.catcher = r;
    this.carrier = r; r.hasBall = true; b.air = false; b.holder = r;
    this.events.push('catch');
    this.pop = { text: 'DIVING CATCH!', e: r, t0: this.t };
    if (r.x >= 100) return this.endPlay('td', 'TOUCHDOWN!');
    this.endPlay('tackle', 'DIVING CATCH!', clamp(r.x, 0.5, 99.5));
  }

  intercept(d) {
    this.ball.air = false; this.ball.holder = d; d.hasBall = true;
    this.endPlay('int', 'INTERCEPTED!', clamp(this.ball.x, 0, 100));
  }

  checkContact() {
    const c = this.holder();
    if (!c || c.side !== 'off') return;
    const t = this.t;
    const inPocket = c === this.qb && this.phase === 'pocket';
    for (const d of this.def) {
      if (!this.isFree(d)) {
        // engaged defenders can still grab a runner who brushes past
        if (d.blockedBy && !d.armTried && dist(d, c) < 0.7 && c !== this.qb) { d.armTried = true; if (rnd() < 0.2) return this.tackle(c, d); }
        continue;
      }
      if (dist(d, c) > TACKLE_R) continue;
      if (c.diving) continue;
      if (t < (c.jukeUntil || 0)) { d.stunUntil = t + 0.9; this.events.push('whiff'); continue; }
      if (inPocket) return this.tackle(c, d, true);
      if (t < (d.bouncedUntil || 0)) continue;
      const pow = c.player ? (c.player.pow || c.player.spd || 3) : 3;
      let pBreak = (c === this.qb ? 0.05 : 0.1) + 0.04 * (pow - 3) - 0.03 * (this.dr - 3);
      if (c.truck) pBreak = clamp(0.5 + 0.08 * (pow - 3) - 0.05 * (this.dr - 3), 0.25, 0.8);
      if (rnd() < pBreak) {
        d.stunUntil = t + (c.truck ? 1.2 : 0.8); d.bouncedUntil = t + 1.2;
        if (c.truck) { d.down = true; d.vx = 3; d.downUntil = t + 1.2; }
        c.slowUntil = t + (c.truck ? 0.15 : 0.3);
        this.events.push(c.truck ? 'truck' : 'break');
        continue;
      }
      return this.tackle(c, d);
    }
    // sideline / goal line
    if (c.y < 0 || c.y > FIELD_W) {
      if (c.x >= 100 && !inPocket) return this.endPlay('td', 'TOUCHDOWN!');
      return this.endPlay('oob', 'OUT OF BOUNDS', clamp(c.x, 0, 100));
    }
    if (c.x >= 100 && !inPocket) return this.endPlay('td', 'TOUCHDOWN!');
  }

  tackle(c, d, sack) {
    c.down = true; d.down = rnd() < 0.5;
    let spot = c.x + (c.vx > 1 ? 0.5 : 0);
    this.events.push('tackle');
    if (spot <= 0) return this.endPlay('safety', 'SAFETY!', 0);
    if (sack) return this.endPlay('sack', 'SACKED!', spot);
    this.endPlay('tackle', '', Math.min(spot, 99.5));
  }

  endPlay(type, label, spot) {
    if (this.phase === 'dead') return;
    const c = this.carrier;
    if (spot === undefined) spot = type === 'inc' ? this.los : c ? clamp(c.x, 0, 100) : this.los;
    if (type === 'td') spot = 100;
    this.phase = 'dead';
    this.ball.air = this.ball.air && type === 'inc';
    if (type === 'inc') { this.ball.air = false; this.ball.holder = null; this.ball.h = 0; }
    this.result = {
      type, label, spot, yards: Math.round(spot - this.los), time: this.t,
      carrier: c, catcher: this.catcher, passed: !!this.throwDist,
      isRun: !this.throwDist && !!c,
    };
    if (type === 'td') this.events.push('td');
    else if (type === 'int') this.events.push('int');
    else if (type === 'inc') this.events.push('inc');
  }

  // ---- draw ------------------------------------------------------------------
  // Positions are snapped to 1/RQ of an art pixel (the canvas is drawn RQ times
  // larger than the art), so movement glides instead of stepping a whole pixel.
  draw(ctx, W, fieldStrip, fd) {
    const cam = clamp(this.camX, FIELD_XMIN + W / 2 / SX, FIELD_XMAX - W / 2 / SX);
    const q = v => Math.round(v * RQ) / RQ;
    const sx = x => q((x - cam) * SX + W / 2);
    const sy = y => q(FIELD_TOP + y * SY);
    ctx.drawImage(fieldStrip, (cam - FIELD_XMIN) * SX - W / 2, 0, W, VIEW_H, 0, 0, W, VIEW_H);

    // line of scrimmage + line to gain
    const top = FIELD_TOP, bot = sy(FIELD_W);
    if (this.noLines) fd = null;
    else { ctx.fillStyle = 'rgba(70,140,255,0.85)'; ctx.fillRect(sx(this.los), top, 1, bot - top); }
    if (fd && fd < 100) { ctx.fillStyle = 'rgba(255,224,60,0.9)'; ctx.fillRect(sx(fd), top, 1, bot - top); }
    // chain gang on the near sideline
    if (!this.noLines) { ctx.fillStyle = '#ff7a1a'; ctx.fillRect(sx(this.los) - 1, bot + 3, 3, 5); }
    if (fd && fd < 100) { ctx.fillStyle = '#ffd23c'; ctx.fillRect(sx(fd) - 1, bot + 3, 3, 5); }

    // the called routes, shown before the snap and fading just after it
    const routeAlpha = this.phase === 'presnap' ? 1 : (this.phase === 'pocket' ? clamp(1 - this.t / 0.9, 0, 1) : 0);
    if (routeAlpha > 0 && !this.kickoff) this.drawRoutes(ctx, sx, sy, routeAlpha);

    // aim guide
    let target = null;
    if (this.aim && this.canThrow()) target = this.drawAim(ctx, sx, sy);

    // players sorted by depth
    const list = this.ents.slice().sort((a, b) => a.y - b.y);
    for (const e of list) {
      const px = sx(e.x), py = sy(e.y);
      if (px < -12 || px > W + 12) continue;
      if (e === target || (e === this.qb && this.aim && this.canThrow())) this.ring(ctx, px, py, '#ffffff');
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(px - 5, py, 11, 2);
      const kit = e.side === 'off' ? this.offKit : this.defKit;
      const sp = Math.hypot(e.vx, e.vy);
      let facing = e.side === 'off' ? 1 : -1;
      if (e.vx < -0.8) facing = -1; else if (e.vx > 0.8) facing = 1;
      // stride rate follows speed (anim accumulates yards travelled)
      const step = Math.floor(e.anim * 1.7) % 4;
      const pose = sp < 0.6 ? 'stand' : 'run' + step;
      const spr = getSprite(kit, e.skin, pose, facing);
      const bob = sp >= 0.6 && step % 2 ? 1 : 0;  // up a pixel on the passing steps
      if ((e.down && this.phase === 'dead') || e.diving || (e.downUntil && this.t < e.downUntil)) {
        blitRot(ctx, spr, px, py - 3, facing > 0 ? 1 : 3);
      } else {
        const flash = e === this.carrier && this.t < (e.jukeUntil || 0);
        ctx.globalAlpha = flash ? 0.6 : 1;
        ctx.drawImage(spr, px - SPR_W / 2, py - SPR_H + 1 - bob);
        ctx.globalAlpha = 1;
      }
      // openness dot for receivers while the QB has the ball
      if (this.phase === 'pocket' && e.side === 'off' && this.receivers.includes(e) && !e.block) {
        let sep = 99;
        for (const d of this.def) sep = Math.min(sep, dist(d, e));
        ctx.fillStyle = sep > 3 ? '#38e06a' : sep > 1.6 ? '#ffd23c' : '#ff4a3d';
        ctx.fillRect(px - 1, py - SPR_H - 3, 3, 2);
      }
      if (e === this.carrier && this.phase === 'run') {
        ctx.fillStyle = '#ffe14a';
        const ty = py - SPR_H - 4;
        ctx.fillRect(px - 2, ty, 5, 1); ctx.fillRect(px - 1, ty + 1, 3, 1); ctx.fillRect(px, ty + 2, 1, 1);
      }
    }

    // ball (with a short streak while it's in the air)
    const b = this.ball;
    if (b && b.air && b.trail) {
      b.trail.forEach((p, i) => {
        ctx.fillStyle = `rgba(255,255,255,${0.08 + i * 0.05})`;
        ctx.fillRect(sx(p.x) - 0.5, sy(p.y) - p.h * POST_H - 0.5, 1, 1);
      });
    }
    if (b) {
      let bx = sx(b.x), by = sy(b.y);
      if (b.holder) { bx += (b.holder.vx < -0.8 ? -4 : 4); by -= 9; }
      else {
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(bx - 1, by, 3, 1);
        by -= q(b.h * POST_H);
      }
      if (!(b.holder && b.holder.down && this.phase === 'dead')) {
        ctx.fillStyle = '#7a3b12'; ctx.fillRect(bx - 1.5, by - 1, 3, 2);
        ctx.fillStyle = '#f2e6d0'; ctx.fillRect(bx - 0.5, by - 1, 1, 0.5);
      }
    }
    // "Caught!" floats up over the receiver
    if (this.pop && this.t - this.pop.t0 < 1.3) {
      const k = this.t - this.pop.t0, e = this.pop.e;
      const w = textWidth(this.pop.text, 1);
      const tx = Math.round(sx(e.x) - w / 2), ty = Math.round(sy(e.y) - SPR_H - 9 - k * 6);
      ctx.globalAlpha = k > 0.9 ? (1.3 - k) / 0.4 : 1;
      drawText(ctx, this.pop.text, tx + 1, ty + 1, 1, '#0b0b0b');
      drawText(ctx, this.pop.text, tx, ty, 1, '#ffffff');
      ctx.globalAlpha = 1;
    }
  }

  // Pixel ellipse under a player
  ring(ctx, px, py, color) {
    ctx.fillStyle = color;
    for (let i = 0; i < 28; i++) {
      const a = i / 28 * Math.PI * 2;
      ctx.fillRect(Math.round(px + Math.cos(a) * 6), Math.round(py + 0.5 + Math.sin(a) * 2.5), 1, 1);
    }
  }

  drawRoutes(ctx, sx, sy, alpha) {
    const colors = ['#5ee07a', '#5fb4ff', '#f4f4f4', '#ffd23c', '#ff8a4a'];
    ctx.globalAlpha = alpha;
    this.receivers.forEach((r, i) => {
      let pts;
      if (r.route) {
        pts = [{ x: r.x, y: r.y }].concat(r.route);
        if (!r.routeStop) {
          const a = pts[pts.length - 2], p = pts[pts.length - 1], m = Math.hypot(p.x - a.x, p.y - a.y) || 1;
          const ext = Math.min(8, Math.max(0, 30 - (p.x - r.x)));
          if (ext > 0) pts.push({ x: p.x + (p.x - a.x) / m * ext, y: clamp(p.y + (p.y - a.y) / m * ext, 1, FIELD_W - 1) });
        }
        // trim long go routes so the picture stays readable
        pts = pts.map(p => ({ x: Math.min(p.x, r.x + 30), y: p.y }));
      } else if (r.path) pts = [{ x: r.x, y: r.y }].concat(r.path);
      else return;
      ctx.fillStyle = colors[i % colors.length];
      for (let k = 1; k < pts.length; k++) {
        const x0 = sx(pts[k - 1].x), y0 = sy(pts[k - 1].y), x1 = sx(pts[k].x), y1 = sy(pts[k].y);
        const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
        for (let s = 0; s <= n; s++) ctx.fillRect(Math.round(lerp(x0, x1, s / n)), Math.round(lerp(y0, y1, s / n)) - 1, 1, 1);
      }
      const end = pts[pts.length - 1];
      ctx.fillRect(Math.round(sx(end.x)) - 1, Math.round(sy(end.y)) - 2, 3, 3);
    });
    ctx.globalAlpha = 1;
  }

  drawAim(ctx, sx, sy) {
    const q = this.qb;
    const a = this.assistAim(this.aim.x, this.aim.y);
    const tx = a.x, ty = a.y;
    const peak = throwPeak(Math.hypot(tx - q.x, ty - q.y));
    const n = Math.max(7, Math.round(Math.hypot(tx - q.x, ty - q.y) / 2.2));
    // the ball's shadow track along the ground
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (let i = 1; i < n; i++) { const u = i / n; ctx.fillRect(sx(lerp(q.x, tx, u)) - 0.75, sy(lerp(q.y, ty, u)) - 0.5, 1.5, 1); }
    // the flight itself: bold dots with a dark edge so they read on the turf
    for (let i = 1; i < n; i++) {
      const u = i / n;
      const x = lerp(q.x, tx, u), y = lerp(q.y, ty, u), h = 1.8 * (1 - u) + 4 * peak * u * (1 - u) + BALL_CATCH_H * u;
      const px = sx(x), py = sy(y) - h * POST_H;
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(px - 1, py - 0.5, 2.5, 2.5);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(px - 1, py - 1, 2, 2);
    }
    // landing spot
    const cx = sx(tx), cy = sy(ty);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(cx - 2, cy - 1, 4, 2); ctx.fillRect(cx - 1, cy - 1.5, 2, 3);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Kickoff return. The opponent kicks from their 35 (x = 65) toward x = 0;
// the user's returner fields it and runs it back.
// ---------------------------------------------------------------------------
class KickoffPlay extends Play {
  setup() {
    this.kickoff = true;
    this.noLines = true;
    this.playDef = { type: 'kick', routes: {} };
    const R = this.roster, dr = this.dr = this.oppDef;
    const sf = s => 0.9 + 0.035 * s;
    this.off = []; this.def = []; this.receivers = [];
    // Return team: front line, second line, two deep
    for (const y of [7, 17, 26.7, 36.3, 46.3]) this.off.push(this.mk('off', 'KR', 'TE', 50, y, BASE_SPEED.TE * sf(3), 20));
    for (const y of [11, 21.5, 31.8, 42]) this.off.push(this.mk('off', 'KR', 'WR', 36, y, BASE_SPEED.WR * sf(3), 22));
    this.returner = this.mk('off', 'RB', 'RB', 5, 26.7, BASE_SPEED.RB * sf(R.RB.spd), 24);
    this.returner.player = R.RB;
    const up = this.mk('off', 'KR', 'WR', 14, 22, BASE_SPEED.WR * sf(3), 22);
    this.off.push(this.returner, up);
    this.qb = this.returner;  // what blockers protect before the catch
    // Kicking team: ten across at their 35, kicker a few yards back
    for (let i = 0; i < 10; i++) {
      const y = 3.5 + i * (FIELD_W - 7) / 9;
      if (Math.abs(y - FIELD_W / 2) < 2.5) continue;
      this.def.push(this.mk('def', 'KC', 'LB', 65, y, BASE_SPEED.LB * sf(dr), 11 + 2.5 * dr));
    }
    this.def.push(this.mk('def', 'KC', 'LB', 65, FIELD_W / 2 + 6, BASE_SPEED.LB * sf(dr), 11 + 2.5 * dr));
    this.kicker = this.mk('def', 'K', 'LB', 71, FIELD_W / 2 - 1, BASE_SPEED.S * sf(dr), 14);
    this.def.push(this.kicker);
    for (const o of this.off) { o.setX = o.x; o.openField = true; o.accel *= 1.35; }
    for (const d of this.def) d.lane = d.y;
    this.ball = { x: 65, y: FIELD_W / 2, h: 0.3, holder: null, air: false };
    this.camX = 40;
  }

  snap() {
    if (this.phase !== 'presnap') return;
    this.phase = 'approach';
    this.events.push('hike');
  }

  canThrow() { return false; }

  updateCam(dt) {
    let target = 40;
    if (this.phase === 'air') target = this.ball.x + 4;
    else if (this.phase === 'run' || this.phase === 'dead') target = (this.carrier ? this.carrier.x : this.ball.x) + 7;
    this.camX += (target - this.camX) * Math.min(1, dt * 2.6);
  }

  update(dt) {
    if (this.phase === 'presnap') { this.updateCam(dt); return; }
    if (this.phase === 'dead') return super.update(dt);
    this.t += dt;
    const t = this.t, b = this.ball;
    // kicker approach, then the kick
    if (this.phase === 'approach') {
      this.steer(this.kicker, b.x, b.y, dt, 0.8, 0);
      for (const d of this.def) if (d !== this.kicker) this.steer(d, b.x - 0.5, d.lane, dt, 0.5, 0);
      if (dist(this.kicker, b) < 0.8 || t > 1.2) {
        const leg = 52 + this.dr * 2.5 + gauss() * 4;
        b.fx = b.x; b.fy = b.y; b.tx = clamp(b.x - leg, -6, 20); b.ty = clamp(FIELD_W / 2 + gauss() * 7, 8, FIELD_W - 8);
        b.t0 = t; b.dur = 2.9; b.peak = 18; b.air = true;
        this.phase = 'air';
        this.events.push('kick');
      }
    }
    if (this.phase === 'air') {
      const u = Math.min(1, (t - b.t0) / b.dur);
      b.x = lerp(b.fx, b.tx, u); b.y = lerp(b.fy, b.ty, u); b.h = 4 * b.peak * u * (1 - u) + 0.3 * (1 - u);
      // the returner settles under it, the rest set up a wall
      this.steer(this.returner, b.tx - 0.3, b.ty, dt, 1, 0.8);
      for (const o of this.off) if (o !== this.returner && !o.engaged) {
        if (t - b.t0 > 1.4) this.blockerAI(o, dt);
        else this.steer(o, Math.min(o.setX, b.tx + 22) - (t - b.t0) * 4, o.y, dt, 0.7, 0.5);
      }
      for (const d of this.def) if (!d.blockedBy) this.steer(d, b.tx + 6, lerp(d.lane, b.ty, 0.35), dt, d === this.kicker ? 0.7 : 1, 0);
      if (u >= 1) {
        this.returner.x = b.tx; this.returner.y = b.ty;
        this.makeRunner(this.returner);
        this.events.push('catch');
      }
      this.updateBlocks(dt);
      for (const e of this.ents) {
        if (!e.engaged && !e.blockedBy) { e.x += e.vx * dt; e.y += e.vy * dt; }
        e.anim += dt * Math.hypot(e.vx, e.vy);
      }
      this.updateCam(dt);
      return;
    }
    if (this.phase === 'approach') {
      for (const e of this.ents) { e.x += e.vx * dt; e.y += e.vy * dt; e.anim += dt * Math.hypot(e.vx, e.vy); }
      this.updateCam(dt);
      return;
    }
    super.update(dt);  // the return itself plays like any other run
  }

  updateOff(o, dt) {
    if (o.engaged) return;
    if (o === this.carrier) return this.updateCarrier(o, dt);
    if (this.t < o.stunUntil) { this.steer(o, o.x, o.y, dt, 0.2); return; }
    this.blockerAI(o, dt);
  }

  updateDef(d, dt) {
    if (d.blockedBy) return;
    if (this.t < d.stunUntil) { this.steer(d, d.x, d.y, dt, 0.15); return; }
    if (this.carrier && this.t >= d.reactAt) return this.pursue(d, this.carrier, dt);
    this.steer(d, d.x - 5, d.lane, dt, 1, 0);
  }

  tackle(c, d) {
    c.down = true;
    this.events.push('tackle');
    if (c.x <= 0) return this.endPlay('tackle', 'TOUCHBACK', 25);
    this.endPlay('tackle', '', Math.min(c.x + (c.vx > 1 ? 0.5 : 0), 99.5));
  }

  endPlay(type, label, spot) {
    if (type === 'oob' && spot !== undefined && spot <= 0) { type = 'tackle'; label = 'TOUCHBACK'; spot = 25; }
    super.endPlay(type, label, spot);
    if (this.result) this.result.kickoff = true;
  }
}

// ---------------------------------------------------------------------------
// Opponent possession simulation.
// startYd: yards from the opponent's own goal line.
// ---------------------------------------------------------------------------
// Opponent drives are simulated snap by snap, Retro Bowl style: each play
// picks one of your defensive groups, rolls it against their offense, and the
// margin decides between a takeaway, a stop and a gain.
const DEF_GROUPS = { DL: 'line', LB: 'linebackers', DB: 'secondary' };
function simDefSnap(off, def, pass) {
  const roll = rnd();
  const group = pass ? (roll < 0.3 ? 'DL' : roll < 0.5 ? 'LB' : 'DB') : (roll < 0.45 ? 'DL' : roll < 0.85 ? 'LB' : 'DB');
  const m = 0.11 * (def - off) + gauss() * 0.95 - 0.15;   // > 0: the defense wins the snap
  if (m > 1.75) {
    if (pass && group !== 'DL') return { group, kind: 'INTERCEPTION', yards: 0 };
    if (rnd() < 0.5) return { group, kind: 'FUMBLE', yards: pass ? -6 : 1 };
  }
  if (m > 0) {
    if (pass) return group === 'DL' && rnd() < 0.55 ? { group, kind: 'sack', yards: -Math.round(4 + rnd() * 5) } : { group, kind: 'inc', yards: 0 };
    return { group, kind: 'stuff', yards: Math.round(-2 + rnd() * 4) };
  }
  const big = rnd() < (pass ? 0.07 : 0.035) + 0.04 * clamp(-m - 1, 0, 2);
  const yards = pass ? 6 + -m * 6 + rnd() * 6 + (big ? 15 + rnd() * 30 : 0) : 2 + -m * 3.5 + rnd() * 3 + (big ? 12 + rnd() * 30 : 0);
  return { group, kind: pass ? 'catch' : 'run', yards: Math.round(yards) };
}

function simOppDrive(opp, userDef, startYd, ctx) {
  const scale = ctx.scale || 1;
  let yd = startYd, down = 1, togo = 10, plays = 0, time = 0, result = null, key = null;
  const ownGoal = y => 100 - y;   // yards to the end zone
  const fgMake = y => clamp(1.02 - 0.012 * Math.max(0, ownGoal(y) + 17 - 20), 0.15, 0.97);
  while (!result && plays < 18) {
    // 4th down: kick, punt or go for it
    if (down === 4) {
      const fgDist = ownGoal(yd) + 17;
      const needTD = ctx.ot && ctx.need === 'TD';
      if (!needTD && fgDist <= 52 && !(togo <= 2 && ownGoal(yd) <= 5)) {
        plays++; time += 6;
        result = rnd() < fgMake(yd) ? 'FG' : 'MISSED FG';
        break;
      }
      const goForIt = ctx.ot || ctx.clutch === 'hurry' || (togo <= 2 && yd >= 45) || (togo <= 1 && yd >= 35);
      if (!goForIt) { plays++; time += 8; result = 'PUNT'; break; }
    }
    const pass = rnd() < (togo >= 7 ? 0.68 : togo <= 2 ? 0.3 : 0.52) + (ctx.clutch === 'hurry' ? 0.2 : 0);
    const s = simDefSnap(opp.off, userDef, pass);
    plays++;
    time += s.kind === 'inc' ? 8 : ctx.clutch === 'hurry' ? 18 : 38 + rnd() * 10;
    if (s.kind === 'INTERCEPTION' || s.kind === 'FUMBLE') {
      yd = clamp(yd + s.yards, 1, 99); result = s.kind; key = s; break;
    }
    if (s.kind === 'sack' || (down >= 3 && s.yards < togo)) { key = s; s.down = down; }
    yd += s.yards;
    if (yd >= 100) { result = 'TD'; yd = 100; break; }
    if (yd <= 0) { result = 'SAFETY'; yd = 0; break; }
    togo -= s.yards;
    if (togo <= 0) { down = 1; togo = Math.min(10, ownGoal(yd)); }
    else if (++down > 4) { result = 'DOWNS'; break; }
  }
  if (!result) result = 'PUNT';
  if (result === 'PUNT' && ctx.ot) result = 'DOWNS';

  time = Math.round(time * scale);
  if (ctx.clutch === 'protect') time = Math.round(time * 1.35);
  const yards = yd - startYd;
  let userStart;
  if (result === 'TD' || result === 'FG') userStart = 25;
  else if (result === 'SAFETY') userStart = 40;   // free kick after the safety
  else if (result === 'PUNT') userStart = clamp(Math.round(100 - yd - 38 - gauss() * 6), 6, 40);
  else if (result === 'MISSED FG') userStart = clamp(100 - yd - 7, 20, 99);
  else userStart = clamp(100 - yd, 1, 99);
  if (userStart > 80 && result === 'PUNT') userStart = 20;
  return { result, plays, yards, time, userStart, startYd, key };
}

// One line for the drive card naming the group that made the key play.
function defKeyLine(res) {
  const k = res.key;
  if (!k || res.result === 'TD') return '';
  const g = { DL: 'D-line', LB: 'Linebackers', DB: 'Secondary' }[k.group];
  if (k.kind === 'INTERCEPTION') return k.group === 'LB' ? 'Linebacker picked it off' : 'Secondary picked it off';
  if (k.kind === 'FUMBLE') return `${g} forced a fumble`;
  if (k.kind === 'sack') return `${g} sack for -${-k.yards} yds`;
  const dn = k.down === 4 ? '4th' : '3rd';
  if (k.kind === 'stuff') return `${g} stuffed ${dn} down`;
  if (k.kind === 'inc') return `${g} broke up ${dn} down`;
  return `${g} held on ${dn} down`;
}
