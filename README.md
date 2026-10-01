# Spirit Points website

A scroll-driven 3D site for the class spirit competition. Scores come live from the
"Spirit Points Scores" Google Sheet, so updating points never needs a code change.

## Updating scores
Add one row per event to the sheet:

| Date | Challenge | Seniors | Juniors | Sophomores | Freshmen |
|---|---|---|---|---|---|
| 10/3/2026 | Tug of war | 50 | 100 | 25 | 75 |

- Leave a class blank if it got no points. Use a minus sign to take points away.
- Keep the header row as it is.
- Open pages pick up changes within about a minute.
- The sheet must be shared as "Anyone with the link: Viewer".

## Settings
In `js/data.js`, at the top under SETTINGS:
- `sheetId`: which Google Sheet the site reads.
- `schoolName`: shown in the header, loader and footer.
- `refreshSeconds`: how often open pages check for new points.

## Files
- `index.html`: page structure and styles.
- `js/app.js`: page flow, scroll sections, text effects, live updates.
- `js/scene.js`: the WebGL particle scene (logo, crystal pillars, results spiral, footer words).
- `js/sound.js`: all sound, synthesized in the browser with the Web Audio API (no audio files).
- `js/data.js`: settings and reading the Google Sheet.
- `vendor/three.module.min.js`: three.js r160 (MIT license, see `vendor/THREE-LICENSE.txt`).
- `assets/logo.png`: the logo the particles are sampled from.

Visitors with "reduce motion" turned on, or browsers without WebGL, get a calm static
version of the same content.
