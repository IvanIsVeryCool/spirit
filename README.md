# Nueva Spirit Cabinet website

- `/` is the homescreen. You get a ticket, punch it, and on your first visit you're
  sitting on the platform bench, ticket in hand, as a red-and-silver commuter train
  pulls in. Each car's door is a section of the Spirit Cabinet, and the LED departure
  board lists the same cars. The ticket and that opening play on your first visit each day; later visits go straight to the platform, with a Replay intro button.
- `/points/` is the live Spirit Points standings (scroll-driven 3D, scores from the Google Sheet).

## Adding or opening a train car
Edit `hub/doors.js`. Each entry is one car, front to back:

```js
{ id: 'newsletter', title: 'Weekly Newsletter', sub: 'What happened this week in spirit', status: 'Coming soon' }
```

A car with no `href` shows a "coming soon" panel. Give it an `href` (a page in this
site such as `/newsletter/`, or any link like a Google Doc) to make its door lead there,
and change `status` to something like 'Live' or 'New'.

## Updating spirit points
Add one row per event to the "Spirit Points Scores" Google Sheet:

| Date | Challenge | Seniors | Juniors | Sophomores | Freshmen |
|---|---|---|---|---|---|
| 10/3/2026 | Tug of war | 50 | 100 | 25 | 75 |

Leave a class blank for 0. The sheet must be shared as "Anyone with the link: Viewer".
Settings for the points page (sheet ID, school name, refresh rate) are at the top of
`points/js/data.js`.

## Files
- `index.html`, `hub/`: the train station (`station.js` 3D scene, `audio.js` sounds, `hub.js` page logic and departure board, `doors.js` the cars).
- `points/`: the Spirit Points page and its scripts.
- `vendor/`: three.js r160 and its bloom/environment add-ons (MIT license, see `vendor/THREE-LICENSE.txt`).
- `assets/logo.png`, icons and `share.png`: shared by both pages.

All sound on both pages is synthesized live in the browser; there are no audio files.
People with "reduce motion" turned on, or browsers without WebGL, get simple static versions.
