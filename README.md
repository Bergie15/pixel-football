# Border Bowl

A Retro Bowl–style pixel football game for the browser, built for phones held sideways. Every school in the **MIAC** (Minnesota) and **WIAC** (Wisconsin) is playable.

No build step and no dependencies: open `index.html`, or serve the folder with any static host (GitHub Pages works).

```sh
npx serve .          # or: python3 -m http.server
```

## How to play

- **Call a play.** Six pass concepts (Four Verts, Slants, Mesh, Curl Flat, Smash, PA Post) and two runs (HB Dive, HB Toss). On 4th down you can also punt or kick a field goal.
- **Kickoffs.** When you receive, both teams line up and you tap **Kick Off**. Then return it yourself.
- **Snap.** The ball is snapped a moment after you call the play. Tap to snap it sooner.
- **Throw.** Touch anywhere and pull back like a slingshot, then let go to throw. Aim near a receiver and the throw locks onto where he's headed: he gets a white ring, and the dotted arc shows where the ball will land. Receivers dive for balls just out of reach. The dot over each receiver turns green when he's open. If you'd rather point at the spot, switch the aim style in Settings.
- **Run.** On run plays and after a catch, drag to steer, swipe to make a hard cut, and tap to juke. You can put your thumb down during the handoff. Hit **RUN** to scramble with the quarterback.
- **Kick.** Tap when the needle is in the green, then watch it fly at the uprights.
- **Difficulty.** Easy, Normal or Hard in Settings. This changes how good opposing defenses and offenses are.

You play offense. Each opponent drive is simulated from your defense rating against their offense, and the result shows on a scorecard.

Keyboard works too: Space snaps the ball or jukes, the arrow keys steer the runner, and the mouse throws.

## Season mode

- A 9-week schedule built from a conference round robin. Every week the MIAC and WIAC bye teams meet in a cross-border game.
- The top two teams in each conference play a title game, and the two champions meet in the **Border Bowl**.
- Wins earn coach points. Spend them to raise player attributes (arm, accuracy, speed, power, hands, leg) and your O-line and defense units.
- Season stats for every player, a player of the game after each win or loss, and a history tab with a trophy case and past champions.
- Seniors graduate and returning players develop between seasons. For each open spot you pick one of three recruits, and a better record draws better ones.
- Progress saves to `localStorage`.

## Live Game

**LIVE GAME** on the main menu acts out a real game's play-by-play on the pixel field. You get the score, clock, down and distance, with each run, pass, sack, interception, punt, field goal and kickoff animated. A ticker shows just the result, with no player names: `SJU RUN +5 YDS`, `UWRF PASS COMPLETE +12 YDS · 1ST DOWN`, `PUNT 41 YDS`, `PENALTY ON SJU · 5 YDS`, `PLAY UNDER REVIEW`. It reads the standard college play-by-play format that Saint John's and UW-River Falls live stats pages use, for example `1st and 10 at SJU25 J. Smith rush for 5 yards to the SJU30`.

Plays can come from three places:

- **Live stats link.** The page checks the school's play-by-play page every 20 seconds. The defaults are `gojohnnies.com/sidearmstats/football/play-by-play` and `uwrfsports.com/sidearmstats/football/play-by-play`. Browsers only let a page read another site when that site allows it, so this needs the game hosted somewhere you control, such as GitHub Pages, plus the small relay in `tools/live-relay-worker.js`, a free Cloudflare Worker. The claude.ai link can't load other websites at all, so use Paste there.
- **Paste plays.** Copy the play-by-play from the live stats page and paste it in. Tap **+ PLAYS** during the game to add newer plays. This works everywhere, including the claude.ai link on a phone.
- **Demo game.** A made-up first quarter of Saint John's vs. UW-River Falls, labeled as a demo.

**Jump to latest** catches up silently and starts with the most recent plays. **Replay from kickoff** animates every play.

## Teams

| MIAC (Minnesota) | WIAC (Wisconsin) |
|---|---|
| Augsburg Auggies | UW-Eau Claire Blugolds |
| Bethel Royals | UW-La Crosse Eagles |
| Carleton Knights | UW-Oshkosh Titans |
| Concordia-Moorhead Cobbers | UW-Platteville Pioneers |
| Gustavus Adolphus Golden Gusties | UW-River Falls Falcons |
| Hamline Pipers | UW-Stevens Point Pointers |
| Macalester Scots | UW-Stout Blue Devils |
| Saint John's Johnnies | UW-Superior Yellowjackets |
| Saint Mary's Cardinals | UW-Whitewater Warhawks |
| St. Olaf Oles | |
| St. Scholastica Saints | |

Saint Mary's and UW-Superior don't field football teams in real life, but they're included so every co-ed conference member is playable. Team ratings are rough estimates. Schools appear only by name and colors, with no logos.

## Code layout

| File | What it does |
|---|---|
| `js/data.js` | Teams, routes, playbook, 3×5 pixel font |
| `js/render.js` | Sprites, stadium and field rendering |
| `js/engine.js` | Live play simulation: routes, blocking, coverage, pursuit, catches, tackles; opponent drive sim |
| `js/match.js` | Game flow: downs, clock, kicks, conversions, halftime, overtime |
| `js/league.js` | Schedule, standings, sim games, roster, offseason, saves |
| `js/ui.js` | Menus, HUD, touch input, sound, main loop |
| `js/live.js` | Live Game: play-by-play parser and scripted replays |
| `tools/live-relay-worker.js` | Optional relay so a hosted copy can read live stats pages |
| `tools/bundle.js` | Inlines everything into one HTML file |
