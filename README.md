# Nueva Spirit Cabinet website

- `/` is the homescreen. You get a ticket, punch it, and on your first visit you're
  sitting on the platform bench, ticket in hand, as a red-and-silver commuter train
  pulls in. Each car's door is a section of the Spirit Cabinet, and the LED departure
  board lists the same cars. The ticket and that opening play on your first visit each day; later visits go straight to the platform, with a Replay intro button.
- The cars, front to back: **Photo Gallery** (it opens inside the car), **Weekly Newsletter** (you sit down in the car and
  read it as a newspaper), **Events** (the car's next-stops screen, with events as the stops) and **Meet the Cabinet**
  (you walk to the cab at the back).
- `/points/` is the live Spirit Points standings. Click the officer on the platform (the "Leaderboard" label): he holds
  up a sign with the standings, and "Full leaderboard" takes you there. Visiting `/points/` directly rides the train up a map of the Peninsula to a big billboard (scores from the Google Sheet).

## Adding or opening a train car
Edit `hub/doors.js`. Each entry is one car, front to back:

```js
{ id: 'gallery', title: 'Photo Gallery', sub: 'Photos from spirit events', status: 'Live', href: '/gallery/' }
```

A car with no `href` (and no `scene`) shows a "coming soon" panel. Give it an `href` (a page in this
site such as `/newsletter/`, or any link like a Google Doc) to make its door lead there,
and change `status` to something like 'Live' or 'New'.

## Your own headphone song
In the opening, a song plays in your headphones. To use your own recording, name it
exactly `headphones.mp3` and upload it into the `assets/audio/` folder: on GitHub, open
the repo, click into `assets`, then `audio`, then Add file → Upload files, drag the file
in, and commit. It loops quietly under the station sounds and fades out as the camera
pulls away. To have the song play once and then loop a section, also upload a
`headphones_loop.mp3` to the same folder; it starts the moment the song ends and repeats.
Delete the files to go back to the built-in song. Only upload music you wrote
or are licensed to put on a public website; keep the file under 25 MB.

## Adding photos to the gallery
1. On GitHub, open `assets/gallery/`, then Add file → Upload files, and upload the photos
   (JPG, about 2000 px wide at most; phone photos are fine).
2. Open `gallery/photos.js` and add a line for each, newest first:

```js
{ file: 'homecoming-rally.jpg', caption: 'The rally in the gym', album: 'Homecoming', date: '2026-10-16' },
```

`album` puts photos under a filter button at the top (any name); `caption` and `date` are optional.
The gallery starts with a few pictures of the Spirit Line itself; delete their lines (and files) once you have your own.

## The weekly newsletter
Edit `NEWSLETTER` in `hub/doors.js` each week: the `issue` number, the `week`, and the
`stories` (a `kicker` label, a `head`line and the `body` paragraphs; the first story leads
the front page). The newspaper adds the live Spirit Points standings and the next events itself,
and turns its own pages when there's more than fits.

## Events
Edit `EVENTS` in `hub/doors.js`, in order, soonest first. Each one shows up as a stop on the screen in the Events car:

```js
{ name: 'Homecoming', date: 'Fri, Oct 16', time: '6 pm', place: 'Main field', note: 'Wear red' },
```

Leave out `date` and the screen says "Date to be announced".

## Meet the Cabinet
The cabinet stand in the cab at the back of the train. To change who's there, edit
`CABINET` in `hub/doors.js`: one line per person, with their `name` (shown above them),
their `role` (under the name), and `kind`, which picks the 3D model.

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
- `gallery/`: the photo gallery (`photos.js` lists the photos, which live in `assets/gallery/`); the platform opens it inside car 1.
- `vendor/`: three.js r160 and its bloom/environment add-ons (MIT license, see `vendor/THREE-LICENSE.txt`).
- `assets/logo.png`, icons and `share.png`: shared by both pages.

All sound is synthesized live in the browser; the only audio files are your own headphone song, if you add one.
People with "reduce motion" turned on, or browsers without WebGL, get simple static versions.
