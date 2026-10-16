'use strict';
// ---------------------------------------------------------------------------
// Static data: schools, names, routes, playbook, pixel font.
// Ratings are 1-5 "stars" (floats for opponents) and only loosely based on
// recent on-field results. Saint Mary's and UW-Superior don't sponsor football
// in real life; they're included so every conference member is playable.
// ---------------------------------------------------------------------------

const TEAMS = [
  // MIAC — Minnesota Intercollegiate Athletic Conference
  { id: 'AUG',   name: 'Augsburg',           mascot: 'Auggies',       conf: 'MIAC', city: 'Minneapolis, MN',   c1: '#7a1f2b', c2: '#a2a6a8', off: 2.4, def: 2.3 },
  { id: 'BETH',  name: 'Bethel',             mascot: 'Royals',        conf: 'MIAC', city: 'Arden Hills, MN',   c1: '#00427a', c2: '#f2a900', off: 3.9, def: 3.8 },
  { id: 'CARL',  name: 'Carleton',           mascot: 'Knights',       conf: 'MIAC', city: 'Northfield, MN',    c1: '#0b2341', c2: '#f6c13a', off: 2.5, def: 2.3 },
  { id: 'CORD',  name: 'Concordia-Moorhead', mascot: 'Cobbers',       conf: 'MIAC', city: 'Moorhead, MN',      c1: '#6c1d45', c2: '#d4a10f', off: 3.0, def: 2.9 },
  { id: 'GUST',  name: 'Gustavus Adolphus',  mascot: 'Gusties',       conf: 'MIAC', city: 'St. Peter, MN',     c1: '#1a1a1a', c2: '#e6b711', off: 3.1, def: 3.2 },
  { id: 'HAM',   name: 'Hamline',            mascot: 'Pipers',        conf: 'MIAC', city: 'Saint Paul, MN',    c1: '#a6192e', c2: '#a2aaad', off: 2.0, def: 1.9 },
  { id: 'MAC',   name: 'Macalester',         mascot: 'Scots',         conf: 'MIAC', city: 'Saint Paul, MN',    c1: '#d44500', c2: '#01426a', off: 1.8, def: 1.8 },
  { id: 'SJU',   name: "Saint John's",       mascot: 'Johnnies',      conf: 'MIAC', city: 'Collegeville, MN',  c1: '#c8102e', c2: '#ffffff', off: 4.6, def: 4.4 },
  { id: 'SMU',   name: "Saint Mary's",       mascot: 'Cardinals',     conf: 'MIAC', city: 'Winona, MN',        c1: '#b5121b', c2: '#f3f3f3', off: 1.7, def: 1.8 },
  { id: 'OLAF',  name: 'St. Olaf',           mascot: 'Oles',          conf: 'MIAC', city: 'Northfield, MN',    c1: '#111111', c2: '#f1be48', off: 2.5, def: 2.4 },
  { id: 'CSS',   name: 'St. Scholastica',    mascot: 'Saints',        conf: 'MIAC', city: 'Duluth, MN',        c1: '#00447c', c2: '#ffc72c', off: 2.8, def: 2.6 },
  // WIAC — Wisconsin Intercollegiate Athletic Conference
  { id: 'UWEC',  name: 'UW-Eau Claire',      mascot: 'Blugolds',      conf: 'WIAC', city: 'Eau Claire, WI',    c1: '#002855', c2: '#ffc72c', off: 2.8, def: 2.9 },
  { id: 'UWL',   name: 'UW-La Crosse',       mascot: 'Eagles',        conf: 'WIAC', city: 'La Crosse, WI',     c1: '#7d1d2e', c2: '#9ea2a2', off: 4.2, def: 4.3 },
  { id: 'UWO',   name: 'UW-Oshkosh',         mascot: 'Titans',        conf: 'WIAC', city: 'Oshkosh, WI',       c1: '#141414', c2: '#ffb81c', off: 3.9, def: 4.0 },
  { id: 'UWP',   name: 'UW-Platteville',     mascot: 'Pioneers',      conf: 'WIAC', city: 'Platteville, WI',   c1: '#0c2a5b', c2: '#f47321', off: 3.2, def: 3.3 },
  { id: 'UWRF',  name: 'UW-River Falls',     mascot: 'Falcons',       conf: 'WIAC', city: 'River Falls, WI',   c1: '#c8102e', c2: '#f4f4f4', off: 4.0, def: 3.8 },
  { id: 'UWSP',  name: 'UW-Stevens Point',   mascot: 'Pointers',      conf: 'WIAC', city: 'Stevens Point, WI', c1: '#4f2683', c2: '#ffb81c', off: 2.7, def: 2.7 },
  { id: 'STOUT', name: 'UW-Stout',           mascot: 'Blue Devils',   conf: 'WIAC', city: 'Menomonie, WI',     c1: '#1c3a7a', c2: '#f4f4f4', off: 2.5, def: 2.6 },
  { id: 'UWS',   name: 'UW-Superior',        mascot: 'Yellowjackets', conf: 'WIAC', city: 'Superior, WI',      c1: '#1a1a1a', c2: '#f5c400', off: 1.7, def: 1.7 },
  { id: 'UWW',   name: 'UW-Whitewater',      mascot: 'Warhawks',      conf: 'WIAC', city: 'Whitewater, WI',    c1: '#4b1c74', c2: '#f4f4f4', off: 4.6, def: 4.5 },
];
const TEAM_BY_ID = Object.fromEntries(TEAMS.map(t => [t.id, t]));

const FIRST_NAMES = ['Jake','Tyler','Ben','Sam','Nick','Luke','Josh','Matt','Cole','Brady','Logan','Carson','Mason','Eli','Owen','Gus','Nate','Ryan','Will','Jack','Tanner','Bjorn','Erik','Anders','Kyle','Drew','Marcus','Jalen','DeShawn','Isaiah','Andre','Malik','Trey','Caleb','Henry','Leo','Ole','Sven','Dante','Xavier','Kou','Pao','Tou','Mateo','Jonah','Hunter','Brett','Ty'];
const LAST_NAMES = ['Olson','Johnson','Anderson','Nelson','Larson','Peterson','Swanson','Lindqvist','Schultz','Mueller','Kowalski','Schmidt','Becker','Hoffman','Wagner','Novak','Jensen','Hanson','Berg','Lund','Dahl','Krueger','Weber','Fischer','Brandt','Koch','Thompson','Williams','Jackson','Brooks','Carter','Ellis','Haugen','Sorensen','Vang','Xiong','Yang','Moua','Thao','Ramirez','Okafor','Lindgren','Halvorson','Kuchar','Zielinski','Gunderson'];

// Routes are waypoints of [forward, inside] yards relative to where the
// receiver lines up. "inside" points toward the middle of the field.
// stop: settle at the last point. Otherwise keep running the last direction.
const ROUTES = {
  go:       { pts: [[45, 0]] },
  seam:     { pts: [[45, 1]] },
  slant:    { pts: [[3, 0], [12, 9]] },
  out:      { pts: [[8, 0], [8, -14]] },
  in:       { pts: [[9, 0], [9, 16]] },
  post:     { pts: [[11, 0], [26, 9]] },
  corner:   { pts: [[11, 0], [24, -9]] },
  curl:     { pts: [[11, 0], [9, 1]], stop: true },
  comeback: { pts: [[13, 0], [11, -3]], stop: true },
  hitch:    { pts: [[6, 0], [5, 0]], stop: true },
  flat:     { pts: [[1, -4], [3, -14]] },
  drag:     { pts: [[3, 0], [5, 24]] },
  drag2:    { pts: [[6, 0], [7, 24]] },
  wheel:    { pts: [[1, -6], [4, -10], [30, -10]] },
  block:    null,
  fake:     null,
};

// Formation: WR1 top wide, SLOT top inside, TE bottom tight, WR2 bottom wide,
// RB offset top of the QB (shotgun).
const PLAYS = [
  { id: 'verts',  name: 'FOUR VERTS', type: 'pass', routes: { WR1: 'go', SLOT: 'seam', TE: 'seam', WR2: 'go', RB: 'flat' } },
  { id: 'slants', name: 'SLANTS',     type: 'pass', routes: { WR1: 'slant', SLOT: 'out', TE: 'block', WR2: 'slant', RB: 'flat' } },
  { id: 'mesh',   name: 'MESH',       type: 'pass', routes: { WR1: 'post', SLOT: 'drag', TE: 'drag2', WR2: 'corner', RB: 'wheel' } },
  { id: 'curls',  name: 'CURL FLAT',  type: 'pass', routes: { WR1: 'curl', SLOT: 'flat', TE: 'hitch', WR2: 'curl', RB: 'block' } },
  { id: 'smash',  name: 'SMASH',      type: 'pass', routes: { WR1: 'hitch', SLOT: 'corner', TE: 'in', WR2: 'comeback', RB: 'flat' } },
  { id: 'pa',     name: 'PA POST',    type: 'pass', playAction: true, routes: { WR1: 'post', SLOT: 'go', TE: 'block', WR2: 'in', RB: 'fake' } },
  { id: 'dive',   name: 'HB DIVE',    type: 'run', run: 'dive', routes: { WR1: 'block', SLOT: 'block', TE: 'block', WR2: 'block' } },
  { id: 'toss',   name: 'HB TOSS',    type: 'run', run: 'toss', routes: { WR1: 'block', SLOT: 'block', TE: 'block', WR2: 'block' } },
];

// 3x5 pixel font.
const FONT = {
  'A':['010','101','111','101','101'],'B':['110','101','110','101','110'],'C':['011','100','100','100','011'],
  'D':['110','101','101','101','110'],'E':['111','100','110','100','111'],'F':['111','100','110','100','100'],
  'G':['011','100','101','101','011'],'H':['101','101','111','101','101'],'I':['111','010','010','010','111'],
  'J':['001','001','001','101','010'],'K':['101','101','110','101','101'],'L':['100','100','100','100','111'],
  'M':['101','111','111','101','101'],'N':['110','101','101','101','101'],'O':['010','101','101','101','010'],
  'P':['110','101','110','100','100'],'Q':['010','101','101','110','011'],'R':['110','101','110','101','101'],
  'S':['011','100','010','001','110'],'T':['111','010','010','010','010'],'U':['101','101','101','101','111'],
  'V':['101','101','101','101','010'],'W':['101','101','111','111','101'],'X':['101','101','010','101','101'],
  'Y':['101','101','010','010','010'],'Z':['111','001','010','100','111'],
  '0':['111','101','101','101','111'],'1':['010','110','010','010','111'],'2':['110','001','010','100','111'],
  '3':['110','001','010','001','110'],'4':['101','101','111','001','001'],'5':['111','100','110','001','110'],
  '6':['011','100','111','101','111'],'7':['111','001','010','010','010'],'8':['111','101','111','101','111'],
  '9':['111','101','111','001','110'],' ':['000','000','000','000','000'],'-':['000','000','111','000','000'],
  "'":['010','010','000','000','000'],'.':['000','000','000','000','010'],'!':['010','010','010','000','010'],
};
