# Border Bowl

A Retro Bowl–style pixel football game for the browser, built for phones held sideways. Every school in the **MIAC** (Minnesota) and **WIAC** (Wisconsin) is playable.

No build step and no dependencies: open `index.html`, or serve the folder with any static host (GitHub Pages works).

```sh
npx serve .          # or: python3 -m http.server
```

## How to play

- **Call a play.** Six pass concepts (Four Verts, Slants, Mesh, Curl Flat, Smash, PA Post) and two runs (HB Dive, HB Toss). On 4th down you can also punt or kick a field goal.
- **Kickoffs.** When you receive, both teams line up and you tap **Kick Off**. Then return it yourself.
- **Snap.** On pass plays, touching the screen to start pulling back snaps the ball, and the quarterback drops back while you aim. Run plays snap on their own a moment after the call, or tap to snap sooner.
- **Throw.** Touch anywhere and pull back like a slingshot, then let go to throw. A short pull throws a flat, fast line drive, and pulling further turns it into a higher, softer lob that a receiver can run under. The dotted arc shows the shape as you pull. Short pulls are precise and longer pulls reach deep: about a thumb's length throws 40+ yards, and the camera slides downfield while you aim. The ball reaches the end of the dotted arc about chest high, so you can throw it out in front of a receiver and he runs onto it. It keeps carrying a couple of yards past that spot as it comes down. Like Retro Bowl, the ball goes where you aim, with only a light nudge toward a receiver's path when you're within a few yards. A faint dot marks where your thumb went down and a ring shows your quarterback. Receivers go to the ball and dive for ones just out of reach, and "CAUGHT!" pops over the receiver. The dot over each receiver turns green when he's open. If you'd rather point at the spot, switch the aim style in Settings.
- **Run.** On run plays, kick returns and after a catch:
  - **Drag** to steer.
  - **Swipe forward** to dive for extra yards. The play ends where he lands, and a diving runner can't fumble.
  - **Press and hold** to truck: he's slower and tacklers bounce off, but the ball is easier to knock loose.
  - **Swipe backward** to back-step so the tackler whiffs.
  - **Swipe up or down** for a hard cut, or **tap** for a quick juke.

  - **Fumbles** are rare: about 1 in 100 tackles when running normally, and about 3 in 100 when trucking. Strong runners and sure-handed receivers fumble less, good defenses force more, and strip sacks and blindside hits are riskier. Your team falls on about a quarter of them.

  You can put your thumb down during the handoff. Hit **RUN** to scramble with the quarterback.
- **Catch.** Once the ball is in the air, every receiver who can reach it goes for it, and a receiver lays out for a diving catch when it's just out of reach.
- **Kick.** Tap when the needle is in the green, then watch it fly at the uprights.
- **Difficulty.** Easy, Normal or Hard in Settings. This changes how good opposing defenses and offenses are.

You play offense. Opponent drives are simulated one snap at a time, like Retro Bowl. Each snap picks your D-line, linebackers or secondary and rolls your defense rating against their offense, with difficulty raising their side. A big win for your defense is a takeaway, a smaller win is a stop, sack or incompletion, and a loss is a gain for them. The drive plays out through downs, with punts, field goals and 4th-down tries, and the scorecard shows the result and the play your defense made.

Keyboard works too: Space snaps the ball or jukes, the arrow keys steer the runner, and the mouse throws.

## Season mode

- A 9-week schedule built from a conference round robin. Every week the MIAC and WIAC bye teams meet in a cross-border game.
- The top two teams in each conference play a title game, and the two champions meet in the **Border Bowl**.
- Wins earn coach points. Spend them to raise player attributes (arm, accuracy, speed, power, hands, leg) and your O-line and defense units.
- Season stats for every player, a player of the game after each win or loss, and a history tab with a trophy case and past champions.
- Seniors graduate and returning players develop between seasons. For each open spot you pick one of three recruits, and a better record draws better ones.
- Progress saves to `localStorage`.

## D3 National Season

Pick any of the 232 NCAA Division III football programs, searchable by name and filterable by conference. Every school is in its real 2026 conference, 27 in all. You get a random 10-game schedule built conference-first, with non-conference games filling the gaps, and every game you don't play is simulated.

After week 10 comes the **NCAA tournament**:

- 32 teams.
- Every conference champion gets an automatic bid, except NESCAC, which skips the playoffs in real life too. The best remaining teams get at-large bids.
- Seeds 1 through 32 are bracketed so the top seeds meet late, and the better seed hosts.
- Five rounds end at the **Stagg Bowl**, a neutral-site game.

Tabs show your schedule, any conference's standings, a Top 25, the live bracket and your roster. School colors and ratings are approximate. Saint Mary's and UW-Superior stay in the Border Bowl season only, because they don't field football teams.

## Playbook

**PLAYBOOK** on the main menu lets you draw your own pass plays, up to 8:

1. Pick a player: WR, SLOT, TE, WR or RB.
2. Tap the field to add route points, or drag to draw. Use **UNDO**, **CLEAR**, **BLOCK** to keep him in to block, or **SIT AT END** to settle like a curl.
3. Name the play and save it.

Saved plays appear in the play-call menu in every mode. They run through the same engine as the built-in routes.

## Live Game

Tap **LIVE GAME** and the Game Day screen shows Saint John's and UW-River Falls side by side:

- **A game is on:** LIVE NOW with the score, a **WATCH** button that opens the pixel field, and a link to the school's live stats.
- **Later today:** the kickoff time.
- **Every day:** the next home game and the last game's score.

Scores come from ESPN's public scoreboard feed (team IDs 2600 and 2723) when the page is allowed to load it, for example on GitHub Pages. ESPN's feed is unofficial and can change without notice. Otherwise the screen uses the built-in 2026 schedule in `js/live.js` (`GD_TEAMS`), with results through Oct 17, 2026. Add new scores there to keep that copy current.

**MORE OPTIONS** on that screen opens the play-by-play viewer described below.

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
| `js/d3teams.js` | All Division III programs and conferences |
| `js/national.js` | National Season: random schedules, standings, Top 25, NCAA bracket |
| `js/playbook.js` | Play designer |
| `js/live.js` | Live Game: play-by-play parser and scripted replays |
| `tools/live-relay-worker.js` | Optional relay so a hosted copy can read live stats pages |
| `tools/bundle.js` | Inlines everything into one HTML file |
