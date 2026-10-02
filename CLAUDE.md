# Nueva Spirit Cabinet website: project handoff

This is the context for any coding session on this repo: what the site is, how it's built, what's already decided, and what's next.
It is written for Claude Code, which reads `CLAUDE.md` from the repo root automatically.
The README covers the owner-facing basics: how to add a car and how to update scores.

## What it is
- **Owner:** Ivan Cui (GitHub `IvanIsVeryCool`), a student on Nueva School's spirit cabinet.
- **Live site:** https://moonlit-crumble-d56590.netlify.app (Netlify site `moonlit-crumble-d56590`).
  Netlify auto-deploys from GitHub `IvanIsVeryCool/spirit`, branch `main`. `netlify.toml` has `publish = "."`.
  There is no build step: push to `main` and the site updates in about a minute.
- **`/` (hub):** a 3D golden-hour train platform.
  - **First visit of the day:** a paper ticket loader ("Board with sound" or "Board without sound").
    Then a first-person cutscene: you sit on a bench holding the ticket and look around, and a red-and-silver double-deck commuter train pulls in.
  - **Train cars:** each car's door is a section of the cabinet. A split-flap departures board (a station-hall timetable: time, destination, car, status) lists the same cars.
  - **Spirit Points:** only this car is live (`/points/`).
    Weekly Newsletter, Events and Meet the Cabinet show a "coming soon" notice.
- **`/points/`:** the live Spirit Points leaderboard, in the same golden-hour world.
  - Boarding the Spirit Points car leads into a short ride (about 7 s to arrival): the train runs north on an illustrated 3D Peninsula map, Nueva → Hillsdale, then at a junction the line fans out into one branch per car (Spirit Points, Weekly Newsletter, Events, Meet the Cabinet, each with its own terminal) and the train takes its car's branch. A chime at each stop, a split-flap "Next stop" display and a route strip.
  - At Spirit Points it pulls in beside a big station billboard; the standings and results open on its face.
  - Scores come from a Google Sheet. (The old igloo-style scroll page was replaced, at the owner's request.)

## Running and testing locally
- Serve the repo root with any static server, for example `python3 -m http.server 8770`, then open http://localhost:8770.
  ES modules need http, so opening the files directly from disk won't work.
- three.js r160 is vendored at `/vendor/three.module.min.js`, with add-ons in `/vendor/jsm/`
  (postprocessing: bloom and output passes; RoomEnvironment).
  Pages use an importmap that maps `"three"`. Don't add a bundler or npm dependencies.
- `#debug` on the hub URL exposes the scene as `window.__st`.
- **Headless testing** (Playwright Chromium with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`):
  - The software renderer is slow: about 2–5 fps, and loading takes 1–2 minutes because of the warm-up.
  - To land screenshots at exact moments of the cutscene, step the clock in the page:
    `__st.clock.getDelta = function(){ this.elapsedTime += .1; return .1 }`.
    Cutscene time is `__st.clock.elapsedTime - __st.intro.t0`.
- **Daily ticket reset:** the date of the last visit is stored in `localStorage['spirit-hub-day']`.
  Delete that key to see the ticket and cutscene again, or use the "Replay intro" button.
- Fonts: Archivo (display), Public Sans (text) and DotGothic16 (LED and dot-matrix text), all from Google Fonts.

## Files
| File | What it does |
|---|---|
| `index.html` | Hub markup and all hub CSS. It contains the ticket loader (`#loader`, with a `.quick` variant for repeat visits), the HUD (`.sign`, `#replay-btn`, `#sound-btn`), the headline, the split-flap departures board (`#board`, `.flap` cells with the split line and a flip animation), the coming-soon notice and the skip button. |
| `hub/doors.js` | `DOORS`, the list of cars (`id`, `title`, `sub`, `status`, optional `href`), plus `SITE`. Adding an `href` makes a car live. |
| `hub/hub.js` | Page logic: ticket fill-in, loader progress, `boot()` (fonts, then the scene, then `station.warm()`), `enter()`, `quickEnter()`, `playIntro()`, replay, board rendering, boarding flight, keyboard and pointer handling, and the daily reset. |
| `hub/station.js` | The 3D scene (`Station` class): sky shader and PMREM environment, hills, trees, tracks, platform, overhead wires, lamps and benches, the train (built from `train.js`), the cutscene rig (simple hands holding the ticket, knees, sneakers), the cutscene timeline (`_introFrame`) with the spring-driven head (`_head`), the arrival, door animation, camera choreography, `warm()` and adaptive resolution (`_adapt`). |
| `hub/train.js` | The train's shape and paint. Body cross-section is a superellipse sampled by arc length (`arcRing`, `vOfY`). `shellRing()` is that ring with vertices pinned exactly to the door and window edges (both sides); `bodyGeometry()` uses it to cut the real doorway on the platform side. Also the lofted nose (`noseGeometry`, `nosePoint`), window slots, and canvas-painted textures (`paintBody`, `paintNose`, `windowTexture`). Constants: `CAR_L = 8`, `GAP = .36`, `W = 2.9`, `H = 4.05`, `FLOOR = .55`, `DOOR_W = 1.3`, `DOOR_H = 2.1`, `NOSE_L = 2.6`. |
| `hub/interior.js` | `buildInterior(car, …)`: the 3D inside of each car behind its door. A lining (the body section offset 7 cm inward, with the doorways and windows cut out), a platform-level vestibule with the far-side doors, an LED display and grab poles, stairs up to the upper deck on the left (far side), a step down to the lower deck on the right, seats with moquette, and one seated passenger per car (built with `person()` and baked in). All lighting is baked into vertex colours by `bake()` from the `LIGHTS` list (each light only reaches its own room box); no real-time lights. Per car it's about 5 draw calls: baked surfaces, seats, light panels, steel, and window glass. |
| `hub/scenery.js` | `mergeStatic()`, which merges static meshes into one draw call per material (skips `userData.keep`). `person()` builds a figure from meshes (used for you, the headphone listener, via `addPeople`/`updatePeople`, and baked into the car interiors). Also platform props (bins, ticket validators, planters, door markers, the forecourt bike path), and the background (hillside houses with lit windows, a radio mast, road traffic, clouds, birds). Exports the colour palettes (`SKIN`, `HAIR`, `TOPS`, `PANTS`). |
| `hub/crowd.js` | `Crowd`: everyone else. The people waiting (benches and yellow line; heads watch the train and the doors), walkers (some with a phone, a rolling suitcase or a dog on a leash), bikes, an e-bike and an e-scooter on the forecourt path, and cyclists on the road beyond the fence. Every body part (head, hair, torso, thigh, shoe…) and prop is one `InstancedMesh` shared by the whole crowd, posed each frame from joint positions (walk cycle by angles, seated legs and riders' legs and arms by two-bone `ik()`), so the crowd is a fixed ~27 draw calls. |
| `hub/audio.js` | `StationAudio`: all sound is synthesized with Web Audio (crossing bells, horn, motor, brakes, door chime, birds, foley). There are no audio files. |
| `points/index.html`, `points/js/app.js` | The Spirit Points page (all its CSS is in the HTML) and its logic: the ride's route display and station pins, the billboard board (split-flap standings with tap-to-expand class stats, a results timetable with class filters and summary, the ticket-style event detail with standings movement), live refresh with toasts, sound, and the static fallback. |
| `points/js/ride.js` | `Ride({ dest })`: the 3D map (painted ground with the bay and freeways, low-poly hills, instanced towns and trees), the line (`TRUNK` control points to the junction, then `linePoints(i)` turns onto branch `i` at heading `FAN[i]`, one per `DOORS` entry; the trunk is double track, branches single), the stations (`stopU`/`names`: Nueva, Hillsdale and the `dest` car's terminal; the other terminals are `alts`, shown as grey pins at the junction), the billboard (`setBillboard(aspect)`, `finalPose()`, `panelRect()`), and a simplified train built from `hub/train.js`. The ride timeline is in `update()`; `jumpToBoard()` skips straight to the billboard. Pass `dest` (a `DOORS` index) to ride another car's branch: the other sections' pages can reuse this. |
| `hub/flap.js` | Split-flap letters (`flap`, `pad`, `padStart`, `blank`), shared by the departures board and the billboard. |
| `points/js/data.js` | `CONFIG`: `sheetId` `1cFKxVMGLDuZeS974UUVzH-Oa57sHUe9tHMFCUkwM0r0`, `schoolName` `Nueva`, `refreshSeconds`. Data comes from the sheet's gviz CSV endpoint. Columns: Date, Challenge, Seniors, Juniors, Sophomores, Freshmen. |
| `assets/logo.png` | The white logo on a transparent background, used as a CSS mask (`--logo`) and as a texture. |

## How the hub works (things that are easy to break)
- **Warm-up (`Station.warm`)** runs behind the loading screen.
  - It builds the cutscene rig, compiles every shader, and renders every object once (frustum culling off, train in view, camera on the bench).
  - Without this the train stutters as it first enters the view. Anything new added to the scene is warmed automatically, as long as it exists before `warm()` runs.
- **Car interiors (`interior.js`):** built inside `_side()`, so they exist before merging and `warm()`.
  - Each car gets its own copy of the `base`, `seat` and `glow` materials; `render()` scales their colour with the door's opening and hover (`d.inside`), so the lights come up as the doors open and warm up on hover.
  - The car-end gangway blocks reach 15 cm into each car, so the interior ends at `END = CAR_L / 2 - .22`.
  - The bogies sit under the lower deck. The springs and dampers were lowered (invisible from outside) so the lower floor (`LOWER = .43`) clears them; keep bogie parts below that.
  - Window and far-door glass is a shared transparent material with a warm gradient, so the evening outside shows through softened.
- **Crowd (`crowd.js`):** built in the constructor before `warm()`.
  - Walkers spawn off-screen at x = ±44 and cross; a few start mid-platform so it's busy on arrival. Slots, speeds and outfits are random; the same-lane walker behind slows down rather than overlap.
  - Lanes are placed so passers-by stay below the doors on screen from the resting camera: desktop walkers at `front + 16.4 / 17.2`, the bike path at `front + 20.2`; phones (camera closer) use walker lanes at `front + 11.3 / 12` and no forecourt bikes. The road cyclists ride at z −8.85 and −12.4.
  - When boarding, walkers near where the camera's flight line crosses their lane hurry out or wait (`flX` in `update`).
  - Static waiting people used to be about 70 merged draw calls (plus shadows); in the crowd they're shared instances, so the scene dropped from ~430 to ~350 calls with the crowd included (desktop, shadow pass counted; phones ~115).
- **Merging:** after the scene is built, `mergeStatic()` collapses each car, the props, people and wires.
  - Anything animated, or referenced later, must have `userData.keep = true` so it isn't merged.
    Examples: door leaves, door hit boxes, light spill, nose mesh, headlight beam, people's heads.
  - This keeps the scene around 300 draw calls.
- **Adaptive resolution:** `_adapt()` lowers the pixel ratio in steps of 0.25 when frames average over 24 ms, and raises it again when they're under 12 ms.
- **Cutscene timeline** (seconds):
  - Sit down at 0.25. Look at the ticket until 3.6.
  - Look up and right, then left down the platform with the crossing bells at 3.4.
  - The train starts arriving at 5.2 (a 6-second arrival). The head then tracks the train's nose.
  - At 12.1 the first-person rig is swapped for the seated listener (`st.listener`, you with red headphones), and the camera lifts up over your head and pulls back behind the bench (1.5 s). Hand-off to the platform view at 13.6.
  - The listener is hidden during the cutscene (`_me(false)`) and shown again at 12.1, on skip and at the end.
  - **Cutscene sound:** `audio.beginScene()` (in `playIntro`) routes every sound the opening plays through its own gains (`outDry`/`outVerb`), because bells, horn and the arrival are scheduled seconds ahead. Skipping calls `audio.endScene(.4)` to fade all of it out; the natural end lets the reverb tails go (`endScene(2.5)`). New sound methods should connect to `this.outDry`/`this.outVerb`, not `dry`/`verbIn`. His head nods on the beat in `updatePeople` (`p.music`); no music is played.
- **Head motion:** `_head` uses critically damped and slightly underdamped springs on yaw and pitch.
  On top of that: small random glances while holding a look, a slight dip during big turns, tilt into turns, and a breathing sway.
- **Daily flow:**
  - **First visit:** `firstToday` is true, so the ticket loader shows, and `enter()` writes the date and plays the cutscene.
  - **Later visits that day:** `#loader.quick` shows only the logo and a progress line, then `quickEnter()` parks the train and opens the doors.
  - **Sound:** on by default on later visits, unless you turned it off with the sound button (`localStorage['spirit-sound'] = 'off'`). Browsers hold audio until the first tap or key press, so `unlockAudio` resumes it then. The first visit's ticket still offers both choices.
  - **Departures board (`hub.js`):** `renderBoard()` builds the rows once, then `flap()` flips only the cells whose letter changed (each cell cycles a few random letters, with a per-cell token so overlapping updates can't land out of order). `showBoard()` slides it in and flips everything from blank; `audio.clatter()` is the flap sound. Departure times are set once on load. Phones hide the time and car columns.
  - **Replay:** `#replay-btn` (shown once `body.entered` is set) replays the cutscene.
  - **Reduced motion or no WebGL:** a static version.
- **Boarding a live car:** a 1.9 s camera flight (`board()`): it lines up in front of the door, then glides through the doorway into the vestibule (ends at z = .35, inside the car). The flash starts at 1.5 s (`hub.js`), then navigation.
  The `sessionStorage['spirit-door']` handoff makes Spirit Points turn sound on when you arrive from the train.
- **Layout:**
  - Platform edge `front = W/2 + .12`. Benches at `z = front + 5.8` and `x = 0, ±2P` (P = CAR_L + GAP); you sit on the middle bench in the cutscene.
  - Lamps at `x = ±P, ±3P`.
  - Doors are at the car centers (`x = ±P/2, ±1.5P` when parked). Keep props and people out of the door columns and the boarding camera path.
  - The second track is at z −4.6, the fence at −8.2, the road at −10.6, trees from −13 to −35, houses from −50 to −68, and hills from −70 back.

## How Spirit Points works
- **Boot:** a warm cover (the same gradient as the hub's boarding flash) while fonts, data and the scene load; `ride.warm()` renders from the start and from the billboard.
- **Ride or not:** it rides the first time per browser session and whenever you come through a train door (`sessionStorage['spirit-door']`); a reload in the same session goes straight to the board (`sessionStorage['spirit-rode']`). Skip button or Escape skips. Reduced motion or no WebGL: `body.static`, the board is the page.
- **Billboard fit:** `layoutBoard()` picks the board's box for the screen (wide on desktop, tall on phones), `setBillboard()` reshapes the 3D billboard to that aspect, `finalPose()` places the camera so its face fills that box, and `placeBoard()` lays the HTML panel exactly over the projected face every frame.
- **Sound:** the hub's `StationAudio` (`audio.ride()` is the running hum, `chime()` at stops, `doors()` on arrival, `clatter()` for flaps). On unless turned off (`localStorage['spirit-sound']`), unlocked on the first tap or key.
- **Data:** `data.js` fetches the sheet; scores are cached in `localStorage['spirit-cache-<sheetId>']`; it re-checks every `refreshSeconds` and when the tab returns; changes flip only the changed flaps and show a toast.
- **Testing without the sheet:** the sandbox can't reach Google, so seed the cache key above with sample entries (`{ entries: [{ row, challenge, t, points: { sr, jr, so, fr } }] }`).

## Owner preferences and decisions so far
- **Look:** polished and professional, nothing that looks "vibe coded". Smooth, real animations.
  Keep the golden-hour station look, which the owner likes. Only the necessary text: the owner asked twice to cut extra copy.
- **Workflow:** push changes live, meaning commit to `main` and push. The owner asks for "push" when they want it on the site.
  Commit with your own git identity (whatever is set up on your computer).
- **Train:** keep it an original red-and-silver "Nueva Spirit Line" design.
  The owner asked for a copy of Caltrain's actual train (livery and design); that was declined because the design and branding belong to Caltrain and its manufacturer. Don't recreate it.
- **Hands:** the cutscene uses the original simple hands, with no thumbs (the owner's choice).
  Rigged and photo-textured hand models were tried and removed.
- **Loading:** a longer loading screen is fine if it means no lag.
- **Spirit Points:** the status line just says who leads (for example "Seniors lead by 40").
  The ride uses our own Spirit Line map styling with real Peninsula stop names (approved), not Caltrain's map or branding.

## Next up (requested, not built yet)
1. The coming-soon sections (Weekly Newsletter, Events, Meet the Cabinet) don't have pages yet.
   Add them as `/newsletter/` etc. with an `href` in `doors.js`.
