'use strict';
// ---------------------------------------------------------------------------
// Pixel rendering: font, player sprites, the pre-rendered stadium/field strip.
// World units are yards. x runs along the field (0 = user's goal line,
// 100 = opponent goal line), y runs sideline to sideline (0 = far sideline).
// The view is a squashed 3/4 side-on camera: along-field yards are wider
// on screen than across-field yards.
// ---------------------------------------------------------------------------

const SX = 9.5;          // screen px per yard along the field
const SY = 2.8;          // screen px per yard across the field
const FIELD_W = 53.333;  // sideline to sideline
const FIELD_TOP = 37;    // internal px where the far sideline sits
const VIEW_H = 196;      // internal canvas height (art pixels)
const FIELD_XMIN = -26, FIELD_XMAX = 136;

function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  return c;
}

// Small deterministic hash for scenery.
function hash2(a, b) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ---- Pixel font ------------------------------------------------------------
function textWidth(str, s) { return str.length * 4 * s - s; }

function drawText(ctx, str, x, y, s, color) {
  ctx.fillStyle = color;
  str = String(str).toUpperCase();
  for (let i = 0; i < str.length; i++) {
    const g = FONT[str[i]] || FONT[' '];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
      if (g[r][c] === '1') ctx.fillRect(x + (i * 4 + c) * s, y + r * s, s, s);
    }
  }
}

// Text with a 1px outline, rendered to its own canvas so it can be rotated.
function textCanvas(str, s, fill, outline) {
  const w = textWidth(str, s) + 2, h = 5 * s + 2;
  const c = mkCanvas(w, h), x = c.getContext('2d');
  if (outline) {
    for (const [dx, dy] of [[0, 0], [2, 0], [0, 2], [2, 2], [1, 0], [0, 1], [2, 1], [1, 2]]) drawText(x, str, dx, dy, s, outline);
  }
  drawText(x, str, 1, 1, s, fill);
  return c;
}

// Bigger 5x7 digits for the painted yard numbers.
const DIGITS57 = {
  '0': [' ### ', '#   #', '#  ##', '# # #', '##  #', '#   #', ' ### '],
  '1': ['  #  ', ' ##  ', '  #  ', '  #  ', '  #  ', '  #  ', ' ### '],
  '2': [' ### ', '#   #', '    #', '   # ', '  #  ', ' #   ', '#####'],
  '3': ['#####', '   # ', '  #  ', '   # ', '    #', '#   #', ' ### '],
  '4': ['   # ', '  ## ', ' # # ', '#  # ', '#####', '   # ', '   # '],
  '5': ['#####', '#    ', '#### ', '    #', '    #', '#   #', ' ### '],
};
function yardNumberCanvas(str, color) {
  const s = 2, gap = 2;
  const c = mkCanvas(str.length * (5 * s + gap) - gap, 7 * s), g = c.getContext('2d');
  g.fillStyle = color;
  [...str].forEach((ch, i) => DIGITS57[ch].forEach((row, y) => [...row].forEach((v, x) => {
    if (v === '#') g.fillRect(i * (5 * s + gap) + x * s, y * s, s, s);
  })));
  return c;
}

// Draw a canvas centred at (cx, cy) rotated by quarter turns.
function blitRot(ctx, img, cx, cy, quarter) {
  ctx.save();
  ctx.translate(Math.round(cx), Math.round(cy));
  ctx.rotate(quarter * Math.PI / 2);
  ctx.drawImage(img, -Math.round(img.width / 2), -Math.round(img.height / 2));
  ctx.restore();
}

// ---- Colors -----------------------------------------------------------------
function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
function shade(h, f) { const [r, g, b] = hexToRgb(h); return f < 0 ? rgbToHex(r * (1 + f), g * (1 + f), b * (1 + f)) : rgbToHex(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f); }
function lum(h) { const [r, g, b] = hexToRgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }

const SKINS = ['#f1c27d', '#c68642', '#8d5524', '#e0ac69', '#5c3a21', '#ffdbac'];

// Uniform for a team. Home teams wear their color, away teams wear white.
function makeKit(team, home) {
  const white = '#f2f2f2';
  const c2IsLight = lum(team.c2) > 0.85;
  // Some schools wear a helmet that isn't their primary color (Saint John's: white)
  const helmet = team.helmet || team.c1, stripe = team.stripe || team.c2;
  return home
    ? { helmet, stripe, jersey: team.c1, num: team.c2, pants: c2IsLight ? '#e6e6e6' : team.c2, sock: team.c1 }
    : { helmet, stripe, jersey: white, num: team.c1, pants: c2IsLight ? team.c1 : team.c2, sock: white };
}

// ---- Player sprites ----------------------------------------------------------
// 12x19 sprites. H helmet, h helmet stripe, S skin, F facemask, J jersey,
// N number/trim, P pants, L socks, B shoes.
// Side view is built from a head, a torso (arm swing) and legs, so the run
// cycle can pump arms against legs like Retro Bowl's runners.
const SPR_HEAD = [
  '....HHHH....',
  '...HHhhHHH..',
  '..HHHhhHHHH.',
  '..HHHHHHSSF.',
  '..HHHHHSSSF.',
  '...HHHHSSF..',
  '....HHSS....',
];
const SPR_TORSO = {
  stand: ['...JJJJJJ...', '..JJJJJJJJ..', '.JJJJNNJJJS.', '.SJJJNNJJJS.', '..JJJNNJJ...', '..JJJJJJJ...'],
  fwd:   ['...JJJJJJ...', '..JJJJJJJJS.', '.JJJJNNJJJS.', 'SJJJJNNJJJ..', 'S.JJJNNJJ...', '..JJJJJJJ...'],
  mid:   ['...JJJJJJ...', '..JJJJJJJJ..', '..JJJNNJJJ..', '..JJSNNJJS..', '..JJJNNJJ...', '..JJJJJJJ...'],
  back:  ['...JJJJJJ...', 'S.JJJJJJJJ..', 'SJJJJNNJJJ..', '.JJJJNNJJJS.', '..JJJNNJJ.S.', '..JJJJJJJ...'],
};
const SPR_LEGS = {
  stand:   ['..PPPPPPP...', '..PPPPPPP...', '..PPP.PPP...', '..LL...LL...', '..LL...LL...', '..BBB..BBB..'],
  strideA: ['..PPPPPPP...', '.PPPP.PPPP..', 'PPP.....PPP.', 'LL.......LL.', 'L.........LL', 'B.........BB'],
  passA:   ['..PPPPPPP...', '...PPPPPP...', '...PP..PPP..', '...LL...LL..', '...LL.......', '...BB.......'],
  strideB: ['..PPPPPPP...', '.PPPP.PPPP..', '.PP.....PPP.', '.LL......LL.', 'LL.......LL.', 'BB.......BBB'],
  passB:   ['..PPPPPPP...', '...PPPPPP...', '..PPP..PP...', '..LL...LL...', '.......LL...', '.......BB...'],
};
// four-step run cycle: stride, pass, stride, pass (arms opposite the legs)
const RUN_CYCLE = [['fwd', 'strideA'], ['mid', 'passA'], ['back', 'strideB'], ['mid', 'passB']];
const lean = row => '.' + row.slice(0, -1);  // runners lean into it
function sideRows(pose) {
  if (pose === 'stand') return SPR_HEAD.concat(SPR_TORSO.stand, SPR_LEGS.stand);
  const n = pose === 'runA' ? 0 : pose === 'runB' ? 2 : +pose.slice(3) || 0;
  const [t, l] = RUN_CYCLE[n % 4];
  return SPR_HEAD.map(lean).concat(SPR_TORSO[t].map((row, i) => (i < 2 ? lean(row) : row)), SPR_LEGS[l]);
}
const SPR_FRONT = [
  '....HHHH....',
  '...HHhhHH...',
  '..HHHhhHHH..',
  '..HSSSSSSH..',
  '..HFFFFFFH..',
  '...SSSSSS...',
  '....SSSS....',
  '..JJJJJJJJ..',
  '.JJJJJJJJJJ.',
  'SJJJJNNJJJJS',
  'SJJJJNNJJJJS',
  'S.JJJNNJJJ.S',
  '..JJJJJJJJ..',
  '..PPPPPPPP..',
  '..PPPPPPPP..',
];
// people on the sideline: hair instead of a helmet, no facemask
const SPR_CIV = SPR_FRONT.map(r => r.replace(/F/g, 'S'));
const LEGS = {
  front: ['..PPP..PPP..', '..LLL..LLL..', '..LLL..LLL..', '..BBB..BBB..'],
};
const SPR_W = 12, SPR_H = 19;
const spriteCache = new Map();

function getSprite(kit, skin, pose, facing) {
  const key = kit.jersey + kit.helmet + kit.stripe + kit.pants + skin + pose + facing;
  let c = spriteCache.get(key);
  if (c) return c;
  const rows = pose === 'front' ? SPR_FRONT.concat(LEGS.front) : pose === 'civ' ? SPR_CIV.concat(LEGS.front) : sideRows(pose);
  c = mkCanvas(SPR_W, rows.length);
  const x = c.getContext('2d');
  const pal = { H: kit.helmet, h: kit.stripe, S: skin, F: '#a9adb3', J: kit.jersey, N: kit.num, P: kit.pants, L: kit.sock, B: '#191919' };
  rows.forEach((row, r) => {
    for (let i = 0; i < SPR_W; i++) {
      const side = pose !== 'front' && pose !== 'civ';
      const ch = row[facing < 0 && side ? SPR_W - 1 - i : i];
      if (ch !== '.') { x.fillStyle = pal[ch]; x.fillRect(i, r, 1, 1); }
    }
  });
  spriteCache.set(key, c);
  return c;
}

// Conference abbreviation painted on the field (internal codes → what's printed)
const CONF_FIELD_LABEL = { MACC: 'MAC', USAS: 'USA S' };
function confLabel(team) {
  const c = team.d3conf || team.conf || team.id;
  return CONF_FIELD_LABEL[c] || c;
}

// ---- Stadium + field strip ----------------------------------------------------
// Pre-rendered once per game: crowd, sideline, turf, lines, numbers, end zones.
function buildFieldStrip(home, away) {
  const W = (FIELD_XMAX - FIELD_XMIN) * SX;
  const c = mkCanvas(W, VIEW_H), g = c.getContext('2d');
  const fx = x => Math.round((x - FIELD_XMIN) * SX);
  const fy = y => Math.round(FIELD_TOP + y * SY);
  const yBot = fy(FIELD_W);

  // Surrounding turf
  g.fillStyle = '#3e8a35'; g.fillRect(0, 0, W, VIEW_H);

  // Stands: a thin band of fans (the score bar covers the top of it)
  g.fillStyle = '#3b3f47'; g.fillRect(0, 0, W, 17);
  const fanColors = [home.c1, home.c1, home.c2, away.c1, '#d9d9d9', '#2f5fa8', home.c1, '#b33'];
  for (let col = 0; col < W / 3; col++) {
    for (let row = 0; row < 4; row++) {
      const r = hash2(col, row);
      if (r < 0.12) continue;
      const px = col * 3 + (row & 1), py = 1 + row * 4;
      g.fillStyle = fanColors[Math.floor(hash2(col + 999, row) * fanColors.length)];
      g.fillRect(px, py + 2, 2, 2);
      g.fillStyle = SKINS[Math.floor(r * 100) % SKINS.length];
      g.fillRect(px, py, 2, 2);
    }
  }
  // Wall + ad boards
  g.fillStyle = '#c9ccd1'; g.fillRect(0, 16, W, 3);
  g.fillStyle = '#7d828a'; g.fillRect(0, 19, W, 1);
  for (let x = -20; x <= 130; x += 30) {
    g.fillStyle = home.c1; g.fillRect(fx(x) - 22, 15, 44, 5);
    drawText(g, home.id, fx(x) - Math.floor(textWidth(home.id, 1) / 2), 15, 1, lum(home.c1) > 0.6 ? '#222' : '#fff');
  }
  // Sideline strip
  g.fillStyle = '#4a9440'; g.fillRect(0, 20, W, FIELD_TOP - 22);
  for (let x = 0; x < W; x += 6) { g.fillStyle = '#e8d24a'; g.fillRect(x, FIELD_TOP - 4, 3, 1); g.fillRect(x, yBot + 6, 3, 1); }

  // Turf stripes every 5 yards, end zones a touch darker
  for (let x = -10; x < 110; x += 5) {
    const ez = x < 0 || x >= 100;
    g.fillStyle = ez ? '#3a7f32' : ((x / 5) & 1 ? '#3f8c36' : '#45953b');
    g.fillRect(fx(x), FIELD_TOP, 5 * SX, yBot - FIELD_TOP);
  }
  // Turf texture
  for (let i = 0; i < W * 0.9; i++) {
    const px = Math.floor(hash2(i, 7) * W), py = 20 + Math.floor(hash2(i, 13) * (VIEW_H - 20));
    g.fillStyle = hash2(i, 3) < 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.07)';
    g.fillRect(px, py, 1, 1);
  }

  const LINE = '#eef2e9';
  // Sidelines and end lines (thick border like a real field)
  g.fillStyle = LINE;
  g.fillRect(fx(-10), FIELD_TOP - 2, fx(110) - fx(-10), 2);
  g.fillRect(fx(-10), yBot, fx(110) - fx(-10), 2);
  g.fillRect(fx(-10) - 2, FIELD_TOP - 2, 2, yBot - FIELD_TOP + 4);
  g.fillRect(fx(110), FIELD_TOP - 2, 2, yBot - FIELD_TOP + 4);
  // Yard lines every 5, goal lines doubled
  for (let x = 0; x <= 100; x += 5) {
    g.fillRect(fx(x), FIELD_TOP, 1, yBot - FIELD_TOP);
    if (x === 0 || x === 100) g.fillRect(fx(x) + (x === 0 ? -1 : 1), FIELD_TOP, 1, yBot - FIELD_TOP);
  }
  // Hash ticks every yard: both sidelines and the two college hash rows
  for (let x = 1; x < 100; x++) {
    if (x % 5 === 0) continue;
    g.fillRect(fx(x), FIELD_TOP, 1, 3);
    g.fillRect(fx(x), yBot - 3, 1, 3);
    g.fillRect(fx(x), fy(20) - 1, 1, 3);
    g.fillRect(fx(x), fy(FIELD_W - 20) - 1, 1, 3);
  }

  // Yard numbers: far side upside down, near side upright, arrows toward the closer goal
  const numColor = 'rgba(238,242,233,0.85)';
  for (let x = 10; x <= 90; x += 10) {
    const label = String(x <= 50 ? x : 100 - x);
    const t = yardNumberCanvas(label, numColor);
    const arrow = x === 50 ? 0 : (x < 50 ? -1 : 1);
    // near side (bottom), upright
    blitRot(g, t, fx(x) + 1, fy(FIELD_W - 11), 0);
    // far side (top), rotated 180
    blitRot(g, t, fx(x) + 1, fy(11), 2);
    if (arrow) {
      g.fillStyle = numColor;
      for (const yy of [fy(FIELD_W - 11), fy(11)]) {
        const ax = fx(x) + arrow * 15;
        for (let k = 0; k < 3; k++) g.fillRect(ax - arrow * k, yy - k, 1, 2 * k + 1);
      }
    }
  }

  // The home team's conference at the 25s, far side upside down like the real thing
  const logo = textCanvas(confLabel(home), 3, home.c1, '#f4f4f4');
  for (const x of [25, 75]) {
    blitRot(g, logo, fx(x), fy(4.5), 2);
    blitRot(g, logo, fx(x), fy(FIELD_W - 4.5), 0);
  }
  // Midfield circle
  const mid = textCanvas(home.id, 4, '#f4f4f4', home.c1);
  g.fillStyle = shade(home.c1, -0.1);
  g.beginPath(); g.ellipse(fx(50) + 0.5, fy(FIELD_W / 2), 30, 17, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = LINE; g.fillRect(fx(50), FIELD_TOP, 1, yBot - FIELD_TOP);
  blitRot(g, mid, fx(50) + 1, fy(FIELD_W / 2), 0);

  // End zone names, reading along the end line
  const ezText = home.mascot.toUpperCase();
  const ez = textCanvas(ezText, clamp(Math.floor((FIELD_W * SY - 8) / (ezText.length * 4)), 2, 4), home.c1, '#f4f4f4');
  blitRot(g, ez, fx(-5), fy(FIELD_W / 2), 3);
  blitRot(g, ez, fx(105), fy(FIELD_W / 2), 1);

  // Goal posts on the end lines. Height is drawn up the screen with a slight
  // lean so the uprights read separately from the crossbar.
  for (const [x, dir] of [[-10, -1], [110, 1]]) drawGoalpost(g, fx(x), fy, dir);

  // Pylons
  g.fillStyle = '#ff7a1a';
  for (const x of [0, 100, -10, 110]) { g.fillRect(fx(x) - 1, FIELD_TOP - 4, 3, 3); g.fillRect(fx(x) - 1, yBot + 1, 3, 3); }

  // Benches, coolers, then both teams standing on the far sideline
  g.fillStyle = '#5d6672';
  g.fillRect(fx(26), FIELD_TOP - 13, fx(46) - fx(26), 3); g.fillRect(fx(54), FIELD_TOP - 13, fx(74) - fx(54), 3);
  g.fillStyle = '#f07c1a';
  for (const x of [24, 47, 53, 76]) g.fillRect(fx(x), FIELD_TOP - 11, 4, 6);
  const hk = makeKit(home, true), ak = makeKit(away, false);
  const feet = FIELD_TOP - 3;
  for (let x = 22; x <= 78; x += 1.3) {
    if (Math.abs(x - 50) < 2.5) continue;
    const kit = x < 50 ? hk : ak, k = Math.round(x * 10);
    const s = getSprite(kit, SKINS[Math.floor(hash2(k, 5) * SKINS.length)], 'front', 1);
    g.drawImage(s, fx(x) - SPR_W / 2, feet - SPR_H - Math.floor(hash2(k, 9) * 3));
  }
  // Photographers, staff and cheer squads outside the team boxes
  const hair = ['#2b1d12', '#5a3a1e', '#d8b25a', '#111111', '#8a4b20'];
  const shirts = ['#2f5fa8', '#7d828a', '#1b1b1b', home.c1, home.c2, '#e9e9e9'];
  for (let x = -24; x <= 134; x += 2.2) {
    if (x > 19 && x < 81) continue;
    const k = Math.round(x * 10);
    if (hash2(k, 3) < 0.35) continue;
    const shirt = shirts[Math.floor(hash2(k, 4) * shirts.length)];
    const kit = { helmet: hair[Math.floor(hash2(k, 6) * hair.length)], stripe: hair[0], jersey: shirt, num: shirt, pants: '#2a2f3a', sock: '#2a2f3a' };
    kit.stripe = kit.helmet;
    g.drawImage(getSprite(kit, SKINS[Math.floor(hash2(k, 7) * SKINS.length)], 'civ', 1), fx(x) - SPR_W / 2, feet - SPR_H - Math.floor(hash2(k, 8) * 3));
  }
  return c;
}

const POST_H = 3.2;  // screen px per yard of height
function drawGoalpost(g, X, fy, dir) {
  const bar = Math.round(3.33 * POST_H), top = Math.round(10 * POST_H);
  const y1 = fy(FIELD_W / 2 - 3.08), y2 = fy(FIELD_W / 2 + 3.08), ym = fy(FIELD_W / 2);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(X + dir * 2, ym, 6 * dir, 2);
  g.fillStyle = '#c9a51d';
  g.fillRect(X + dir * 4, ym - bar, 2, bar);                 // stanchion
  g.fillRect(Math.min(X, X + dir * 4), ym - bar, 5, 2);      // gooseneck
  g.fillStyle = '#f2d335';
  g.fillRect(X, y1 - bar, 2, y2 - y1 + 2);                    // crossbar
  for (const yy of [y1, y2]) {                                // uprights
    for (let k = 0; k < top - bar; k++) g.fillRect(X + Math.round(k * 0.22) * dir, yy - bar - k, 2, 1);
  }
}
