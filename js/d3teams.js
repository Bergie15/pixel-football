'use strict';
// ---------------------------------------------------------------------------
// Every NCAA Division III football program, by conference, for National
// Season mode. MIAC and WIAC schools reuse the entries in data.js.
// Colors and ratings are approximate. Format:
//   ID|School|Mascot|Conf|State|primary|secondary|rating (1-5)
// ---------------------------------------------------------------------------

const D3_CONFS = {
  ARC: 'American Rivers', CCIW: 'CCIW', MIAC: 'MIAC', WIAC: 'WIAC', MWC: 'Midwest', NACC: 'NACC', UMAC: 'UMAC',
  OAC: 'Ohio Athletic', NCAC: 'North Coast', PAC: "Presidents'", HCAC: 'Heartland', MIAA: 'Michigan', LL: 'Liberty League',
  E8: 'Empire 8', NJAC: 'NJAC', CC: 'Centennial', MACC: 'Middle Atlantic', NEWMAC: 'NEWMAC', NESCAC: 'NESCAC',
  CCC: 'Commonwealth Coast', MASCAC: 'MASCAC', ODAC: 'Old Dominion', USAS: 'USA South', SAA: 'Southern', ASC: 'American Southwest',
  NWC: 'Northwest', SCIAC: 'SCIAC', ECFC: 'Eastern Collegiate',
};
// NESCAC schools don't take part in the NCAA playoffs
const D3_NO_PLAYOFFS = new Set(['NESCAC']);

const D3_RAW = `
BVU|Buena Vista|Beavers|ARC|IA|#003da5|#ffc72c|2.3
CENT|Central|Dutch|ARC|IA|#a6192e|#f4f4f4|3.2
COE|Coe|Kohawks|ARC|IA|#8a1538|#c4a23b|2.9
DBQ|Dubuque|Spartans|ARC|IA|#002855|#f4f4f4|2.4
LOR|Loras|Duhawks|ARC|IA|#4f2c1d|#c99700|2.4
LUTH|Luther|Norse|ARC|IA|#002f6c|#f4f4f4|2.1
NWU|Nebraska Wesleyan|Prairie Wolves|ARC|NE|#111111|#ffc72c|2.4
SIM|Simpson|Storm|ARC|IA|#a6192e|#ffc72c|2.0
WART|Wartburg|Knights|ARC|IA|#ff6900|#111111|3.8
AUGI|Augustana|Vikings|CCIW|IL|#003da5|#ffc72c|2.8
CARR|Carroll|Pioneers|CCIW|WI|#ff6600|#f4f4f4|2.4
CRTH|Carthage|Firebirds|CCIW|WI|#a6192e|#111111|2.4
ELM|Elmhurst|Bluejays|CCIW|IL|#003da5|#f4f4f4|2.2
IWU|Illinois Wesleyan|Titans|CCIW|IL|#00843d|#f4f4f4|2.6
MILL|Millikin|Big Blue|CCIW|IL|#003da5|#f4f4f4|2.3
NCC|North Central|Cardinals|CCIW|IL|#c8102e|#f4f4f4|4.8
NPU|North Park|Vikings|CCIW|IL|#003da5|#ffc72c|1.5
WASHU|Washington U.|Bears|CCIW|MO|#a51417|#007360|2.8
WHEA|Wheaton|Thunder|CCIW|IL|#ff6b00|#002855|3.4
BEL|Beloit|Buccaneers|MWC|WI|#002855|#ffc72c|1.6
CHI|Chicago|Maroons|MWC|IL|#800000|#f4f4f4|2.3
CORN|Cornell College|Rams|MWC|IA|#5f2167|#f4f4f4|1.7
GRIN|Grinnell|Pioneers|MWC|IA|#c8102e|#111111|1.5
ILC|Illinois College|Blueboys|MWC|IL|#003da5|#f4f4f4|2.0
KNOX|Knox|Prairie Fire|MWC|IL|#4f2683|#ffc72c|1.5
LFC|Lake Forest|Foresters|MWC|IL|#c8102e|#111111|2.4
LAWR|Lawrence|Vikings|MWC|WI|#003da5|#f4f4f4|1.6
MONM|Monmouth (IL)|Fighting Scots|MWC|IL|#c8102e|#f4f4f4|2.6
RIP|Ripon|Red Hawks|MWC|WI|#c8102e|#f4f4f4|2.0
SNC|St. Norbert|Green Knights|MWC|WI|#006747|#ffc72c|2.7
AUR|Aurora|Spartans|NACC|IL|#002855|#a2aaad|2.8
BEN|Benedictine (IL)|Eagles|NACC|IL|#c8102e|#f4f4f4|2.3
CUC|Concordia Chicago|Cougars|NACC|IL|#800000|#ffc72c|1.6
CUW|Concordia Wisconsin|Falcons|NACC|WI|#003da5|#f4f4f4|2.0
EUR|Eureka|Red Devils|NACC|IL|#7a1f2b|#ffc72c|1.6
LAKE|Lakeland|Muskies|NACC|WI|#00205b|#ffc72c|1.9
ROCK|Rockford|Regents|NACC|IL|#c8102e|#f4f4f4|1.3
WLC|Wisconsin Lutheran|Warriors|NACC|WI|#002855|#ffc72c|1.9
CROWN|Crown|Storm|UMAC|MN|#002855|#ffc72c|1.5
GRV|Greenville|Panthers|UMAC|IL|#ff6600|#111111|1.8
MLC|Martin Luther|Knights|UMAC|MN|#003da5|#f4f4f4|1.4
UMM|Minnesota Morris|Cougars|UMAC|MN|#7a0019|#ffcc33|1.8
UNW|Northwestern (MN)|Eagles|UMAC|MN|#c8102e|#111111|2.0
WMO|Westminster (MO)|Blue Jays|UMAC|MO|#002855|#f4f4f4|1.5
BW|Baldwin Wallace|Yellow Jackets|OAC|OH|#4e3629|#ffc72c|3.0
CAP|Capital|Crusaders|OAC|OH|#4f2683|#f4f4f4|1.8
HEID|Heidelberg|Student Princes|OAC|OH|#c8102e|#111111|2.4
JCU|John Carroll|Blue Streaks|OAC|OH|#002855|#ffc72c|3.3
MAR|Marietta|Pioneers|OAC|OH|#002855|#f4f4f4|1.9
MTU|Mount Union|Purple Raiders|OAC|OH|#4f2683|#f4f4f4|4.9
MUSK|Muskingum|Fighting Muskies|OAC|OH|#111111|#d0006f|2.0
ONU|Ohio Northern|Polar Bears|OAC|OH|#ff6600|#111111|2.7
OTT|Otterbein|Cardinals|OAC|OH|#c8102e|#c4a77d|2.3
WILM|Wilmington (OH)|Quakers|OAC|OH|#006747|#f4f4f4|1.6
DEN|Denison|Big Red|NCAC|OH|#c8102e|#f4f4f4|3.0
DPU|DePauw|Tigers|NCAC|IN|#111111|#ffc72c|2.6
KEN|Kenyon|Owls|NCAC|OH|#4f2683|#f4f4f4|1.5
OBE|Oberlin|Yeomen|NCAC|OH|#c8102e|#ffc72c|1.3
OWU|Ohio Wesleyan|Battling Bishops|NCAC|OH|#c8102e|#111111|1.9
WAB|Wabash|Little Giants|NCAC|IN|#a6192e|#f4f4f4|3.0
WITT|Wittenberg|Tigers|NCAC|OH|#c8102e|#f4f4f4|2.6
WOO|Wooster|Fighting Scots|NCAC|OH|#111111|#ffc72c|2.2
ALLE|Allegheny|Gators|PAC|PA|#003da5|#ffc72c|1.7
BETW|Bethany (WV)|Bison|PAC|WV|#006747|#f4f4f4|1.4
CMU|Carnegie Mellon|Tartans|PAC|PA|#c41230|#f4f4f4|2.6
CWRU|Case Western Reserve|Spartans|PAC|OH|#0a304e|#f4f4f4|2.6
GEN|Geneva|Golden Tornadoes|PAC|PA|#c99700|#f4f4f4|1.8
GCC|Grove City|Wolverines|PAC|PA|#c8102e|#f4f4f4|2.4
HIR|Hiram|Terriers|PAC|OH|#c8102e|#002855|1.4
SVC|Saint Vincent|Bearcats|PAC|PA|#006747|#ffc72c|2.0
THI|Thiel|Tomcats|PAC|PA|#002855|#ffc72c|1.5
WJ|Washington & Jefferson|Presidents|PAC|PA|#c8102e|#111111|2.7
WPA|Westminster (PA)|Titans|PAC|PA|#003da5|#f4f4f4|1.9
WAYN|Waynesburg|Yellow Jackets|PAC|PA|#ff6600|#111111|1.6
ANDR|Anderson|Ravens|HCAC|IN|#ff6600|#111111|1.5
BLUF|Bluffton|Beavers|HCAC|OH|#4f2683|#f4f4f4|1.6
DEF|Defiance|Yellow Jackets|HCAC|OH|#4f2683|#ffc72c|1.4
FRAN|Franklin|Grizzlies|HCAC|IN|#002855|#ffc72c|2.8
HAN|Hanover|Panthers|HCAC|IN|#c8102e|#003da5|2.4
MANC|Manchester|Spartans|HCAC|IN|#111111|#ffc72c|1.8
MSJ|Mount St. Joseph|Lions|HCAC|OH|#002855|#ffc72c|1.9
RHIT|Rose-Hulman|Fightin' Engineers|HCAC|IN|#800000|#f4f4f4|2.2
ADR|Adrian|Bulldogs|MIAA|MI|#111111|#ffc72c|2.0
ALB|Albion|Britons|MIAA|MI|#4f2683|#ffc72c|2.2
ALMA|Alma|Scots|MIAA|MI|#800000|#c99700|2.2
HOPE|Hope|Flying Dutchmen|MIAA|MI|#ff6600|#002855|2.3
KZOO|Kalamazoo|Hornets|MIAA|MI|#ff6600|#111111|1.4
OLIV|Olivet|Comets|MIAA|MI|#c8102e|#f4f4f4|1.6
TRI|Trine|Thunder|MIAA|IN|#006747|#002855|2.8
HOB|Hobart|Statesmen|LL|NY|#4f2683|#ff6600|2.6
ITH|Ithaca|Bombers|LL|NY|#003da5|#ffc72c|3.2
RPI|RPI|Engineers|LL|NY|#c8102e|#f4f4f4|2.3
ROCH|Rochester|Yellowjackets|LL|NY|#002855|#ffc72c|2.0
SLU|St. Lawrence|Saints|LL|NY|#8a1538|#4e3629|1.9
UNI|Union|Garnet Chargers|LL|NY|#822433|#f4f4f4|2.3
WPI|WPI|Engineers|LL|MA|#c8102e|#a2aaad|2.1
ALF|Alfred|Saxons|E8|NY|#4f2683|#ffc72c|2.0
BROC|Brockport|Golden Eagles|E8|NY|#006747|#ffc72c|2.7
CORT|Cortland|Red Dragons|E8|NY|#c8102e|#f4f4f4|3.4
HART|Hartwick|Hawks|E8|NY|#003da5|#f4f4f4|1.6
MORR|Morrisville|Mustangs|E8|NY|#006747|#f4f4f4|1.6
SJF|St. John Fisher|Cardinals|E8|NY|#c8102e|#ffc72c|2.6
UTI|Utica|Pioneers|E8|NY|#ff6600|#002855|2.2
CNU|Christopher Newport|Captains|NJAC|VA|#003da5|#a2aaad|2.8
FRST|Frostburg State|Bobcats|NJAC|MD|#c8102e|#111111|2.0
KEAN|Kean|Cougars|NJAC|NJ|#003da5|#c99700|2.4
MSU|Montclair State|Red Hawks|NJAC|NJ|#c8102e|#f4f4f4|2.6
ROW|Rowan|Profs|NJAC|NJ|#4e3629|#ffc72c|2.6
SAL|Salisbury|Sea Gulls|NJAC|MD|#8a1538|#ffc72c|3.6
TCNJ|TCNJ|Lions|NJAC|NJ|#003da5|#ffc72c|2.0
WPU|William Paterson|Pioneers|NJAC|NJ|#ff6600|#111111|1.6
DICK|Dickinson|Red Devils|CC|PA|#c8102e|#f4f4f4|2.0
FM|Franklin & Marshall|Diplomats|CC|PA|#002855|#f4f4f4|2.0
GETT|Gettysburg|Bullets|CC|PA|#ff6600|#002855|1.8
JHU|Johns Hopkins|Blue Jays|CC|MD|#002d72|#68ace5|3.8
JUN|Juniata|Eagles|CC|PA|#002855|#ffc72c|1.5
MCD|McDaniel|Green Terror|CC|MD|#006747|#ffc72c|1.7
MORA|Moravian|Greyhounds|CC|PA|#002855|#a2aaad|2.4
MUH|Muhlenberg|Mules|CC|PA|#c8102e|#a2aaad|3.2
SUSQ|Susquehanna|River Hawks|CC|PA|#800000|#ff6600|2.3
URS|Ursinus|Bears|CC|PA|#c8102e|#ffc72c|1.9
ALBR|Albright|Lions|MACC|PA|#c8102e|#f4f4f4|1.8
DELV|Delaware Valley|Aggies|MACC|PA|#006747|#ffc72c|3.6
FDU|FDU-Florham|Devils|MACC|NJ|#002855|#c8102e|1.5
KING|King's (PA)|Monarchs|MACC|PA|#c8102e|#ffc72c|2.0
LVC|Lebanon Valley|Flying Dutchmen|MACC|PA|#003da5|#f4f4f4|2.0
LYC|Lycoming|Warriors|MACC|PA|#003da5|#ffc72c|1.9
MIS|Misericordia|Cougars|MACC|PA|#002855|#ffc72c|1.7
STEV|Stevenson|Mustangs|MACC|MD|#006747|#111111|2.2
WID|Widener|Pride|MACC|PA|#002855|#ffc72c|2.3
WILK|Wilkes|Colonels|MACC|PA|#002855|#ffc72c|2.0
CUA|Catholic|Cardinals|NEWMAC|DC|#c8102e|#111111|1.8
USCG|Coast Guard|Bears|NEWMAC|CT|#002855|#ff6600|2.0
MIT|MIT|Engineers|NEWMAC|MA|#a31f34|#8a8b8c|1.8
USMMA|Merchant Marine|Mariners|NEWMAC|NY|#002855|#a2aaad|2.1
NOR|Norwich|Cadets|NEWMAC|VT|#800000|#ffc72c|2.0
SPR|Springfield|Pride|NEWMAC|MA|#800000|#f4f4f4|2.6
AMH|Amherst|Mammoths|NESCAC|MA|#4f2683|#f4f4f4|3.0
BATE|Bates|Bobcats|NESCAC|ME|#881124|#111111|1.5
BOW|Bowdoin|Polar Bears|NESCAC|ME|#111111|#f4f4f4|1.4
COLB|Colby|Mules|NESCAC|ME|#002855|#a2aaad|1.7
HAMI|Hamilton|Continentals|NESCAC|NY|#002f86|#c99700|1.8
MIDD|Middlebury|Panthers|NESCAC|VT|#002855|#f4f4f4|2.6
TRIN|Trinity (CT)|Bantams|NESCAC|CT|#002855|#ffc72c|3.0
TUFT|Tufts|Jumbos|NESCAC|MA|#3e8ede|#4e3629|2.6
WES|Wesleyan|Cardinals|NESCAC|CT|#c8102e|#111111|2.4
WILL|Williams|Ephs|NESCAC|MA|#4f2683|#ffc72c|2.6
CURR|Curry|Colonels|CCC|MA|#4f2683|#f4f4f4|1.9
END|Endicott|Gulls|CCC|MA|#006747|#002855|2.0
HUS|Husson|Eagles|CCC|ME|#002855|#ffc72c|2.0
NICH|Nichols|Bison|CCC|MA|#006747|#111111|1.6
SALV|Salve Regina|Seahawks|CCC|RI|#002855|#f4f4f4|1.8
WNE|Western New England|Golden Bears|CCC|MA|#002855|#c99700|2.2
BSU|Bridgewater State|Bears|MASCAC|MA|#c8102e|#f4f4f4|2.0
FSU|Fitchburg State|Falcons|MASCAC|MA|#006747|#ffc72c|1.3
FRAM|Framingham State|Rams|MASCAC|MA|#111111|#ffc72c|1.8
MMA|Mass Maritime|Buccaneers|MASCAC|MA|#002855|#ffc72c|1.8
PSU|Plymouth State|Panthers|MASCAC|NH|#006747|#f4f4f4|1.8
UMD|UMass Dartmouth|Corsairs|MASCAC|MA|#002855|#ffc72c|2.0
WCSU|Western Connecticut|Colonials|MASCAC|CT|#002855|#c8102e|1.8
WSU|Westfield State|Owls|MASCAC|MA|#003da5|#f4f4f4|1.7
WOR|Worcester State|Lancers|MASCAC|MA|#003da5|#ffc72c|1.5
BCVA|Bridgewater (VA)|Eagles|ODAC|VA|#8a1538|#c99700|2.4
FERR|Ferrum|Panthers|ODAC|VA|#111111|#ffc72c|1.6
GUIL|Guilford|Quakers|ODAC|NC|#8a1538|#a2aaad|1.5
HSC|Hampden-Sydney|Tigers|ODAC|VA|#8a1538|#a2aaad|2.4
RMC|Randolph-Macon|Yellow Jackets|ODAC|VA|#111111|#ffc72c|2.8
SHEN|Shenandoah|Hornets|ODAC|VA|#c8102e|#002855|2.0
WLU|Washington and Lee|Generals|ODAC|VA|#003da5|#f4f4f4|2.4
AVER|Averett|Cougars|USAS|VA|#002855|#c99700|1.6
BREV|Brevard|Tornados|USAS|NC|#8a1538|#111111|1.7
GBO|Greensboro|Pride|USAS|NC|#006747|#ffc72c|1.5
HUNT|Huntingdon|Hawks|USAS|AL|#c8102e|#a2aaad|2.3
LAG|LaGrange|Panthers|USAS|GA|#c8102e|#111111|1.6
MARY|Maryville|Scots|USAS|TN|#ff6600|#002855|2.3
METH|Methodist|Monarchs|USAS|NC|#006747|#ffc72c|2.0
NCWU|NC Wesleyan|Battling Bishops|USAS|NC|#003da5|#ffc72c|2.1
BELH|Belhaven|Blazers|USAS|MS|#006747|#f4f4f4|2.0
BERRY|Berry|Vikings|SAA|GA|#002855|#a2aaad|2.3
CENTR|Centre|Colonels|SAA|KY|#c99700|#f4f4f4|2.2
HEND|Hendrix|Warriors|SAA|AR|#ff6600|#111111|2.2
MILS|Millsaps|Majors|SAA|MS|#4f2683|#f4f4f4|1.8
RHOD|Rhodes|Lynx|SAA|TN|#c8102e|#111111|2.0
SEW|Sewanee|Tigers|SAA|TN|#4f2683|#ffc72c|1.5
AUST|Austin College|Kangaroos|ASC|TX|#8a1538|#c99700|1.6
ETBU|East Texas Baptist|Tigers|ASC|TX|#002855|#ffc72c|2.4
HSU|Hardin-Simmons|Cowboys|ASC|TX|#4f2683|#ffc72c|3.5
HPU|Howard Payne|Yellow Jackets|ASC|TX|#002855|#ffc72c|2.0
MCM|McMurry|War Hawks|ASC|TX|#8a1538|#f4f4f4|1.5
UMHB|Mary Hardin-Baylor|Crusaders|ASC|TX|#4f2683|#ffc72c|4.8
SWU|Southwestern|Pirates|ASC|TX|#111111|#ffc72c|1.8
TLU|Texas Lutheran|Bulldogs|ASC|TX|#111111|#ffc72c|2.2
TRTX|Trinity (TX)|Tigers|ASC|TX|#800000|#f4f4f4|2.4
GFU|George Fox|Bruins|NWC|OR|#002855|#ffc72c|2.0
LCC|Lewis & Clark|Pioneers|NWC|OR|#ff6600|#111111|1.4
LINF|Linfield|Wildcats|NWC|OR|#4f2683|#c8102e|3.8
PACU|Pacific (OR)|Boxers|NWC|OR|#c8102e|#111111|1.6
PLU|Pacific Lutheran|Lutes|NWC|WA|#111111|#ffc72c|2.4
UPS|Puget Sound|Loggers|NWC|WA|#8a1538|#f4f4f4|1.8
WHIT|Whitworth|Pirates|NWC|WA|#c8102e|#111111|2.6
WILA|Willamette|Bearcats|NWC|OR|#c8102e|#ffc72c|1.8
CLU|Cal Lutheran|Kingsmen|SCIAC|CA|#4f2683|#ffc72c|2.4
CHAP|Chapman|Panthers|SCIAC|CA|#c8102e|#111111|2.2
CMS|Claremont-Mudd-Scripps|Stags|SCIAC|CA|#8a1538|#ffc72c|2.4
ULV|La Verne|Leopards|SCIAC|CA|#006747|#ff6600|1.8
PP|Pomona-Pitzer|Sagehens|SCIAC|CA|#003da5|#ff6600|1.8
RED|Redlands|Bulldogs|SCIAC|CA|#8a1538|#a2aaad|2.6
ALFS|Alfred State|Pioneers|ECFC|NY|#002855|#ffc72c|1.6
AMC|Anna Maria|Amcats|ECFC|MA|#c8102e|#f4f4f4|1.2
DEAN|Dean|Bulldogs|ECFC|MA|#c8102e|#002855|1.3
GALL|Gallaudet|Bison|ECFC|DC|#003da5|#ffc72c|1.6
KEYS|Keystone|Giants|ECFC|PA|#002855|#f4f4f4|1.3
MARI|SUNY Maritime|Privateers|ECFC|NY|#002855|#c8102e|1.4
VTSU|Vermont State Castleton|Spartans|ECFC|VT|#006747|#f4f4f4|1.4
`;

// MIAC/WIAC football members from data.js, with Macalester in the Midwest
// Conference (where it plays football). Saint Mary's and UW-Superior don't
// sponsor football, so they sit out National Season.
const D3_FROM_BASE = { AUG: 'MIAC', BETH: 'MIAC', CARL: 'MIAC', CORD: 'MIAC', GUST: 'MIAC', HAM: 'MIAC', SJU: 'MIAC', OLAF: 'MIAC', CSS: 'MIAC',
  MAC: 'MWC', UWEC: 'WIAC', UWL: 'WIAC', UWO: 'WIAC', UWP: 'WIAC', UWRF: 'WIAC', UWSP: 'WIAC', STOUT: 'WIAC', UWW: 'WIAC' };

const D3_TEAMS = (() => {
  const out = [];
  const jitter = (id, k) => (hash2(id.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7) | 0, k) - 0.5) * 0.5;
  for (const line of D3_RAW.trim().split('\n')) {
    const [id, name, mascot, conf, state, c1, c2, r] = line.split('|');
    const t = { id, name, mascot, conf, state, c1, c2, off: +(+r + jitter(id, 1)).toFixed(2), def: +(+r + jitter(id, 2)).toFixed(2) };
    out.push(t);
    TEAM_BY_ID[id] = t;
  }
  for (const [id, conf] of Object.entries(D3_FROM_BASE)) out.push(Object.assign({}, TEAM_BY_ID[id], { d3conf: conf }));
  for (const t of out) if (!t.d3conf) t.d3conf = t.conf;
  return out.sort((a, b) => a.name.localeCompare(b.name));
})();
