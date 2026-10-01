# Spirit Points website

## Updating scores
Open the "Spirit Points Scores" Google Sheet and add one row per challenge:

| Date | Challenge | Seniors | Juniors | Sophomores | Freshmen |
|---|---|---|---|---|---|
| 10/3/2026 | Tug of war | 50 | 100 | 25 | 75 |

- Leave a class blank if it got no points. Use a minus sign to take points away.
- Keep the header row exactly as it is.
- The website picks up changes within about a minute. Nobody needs to touch the site files.

## Settings
At the top of the script in `index.html` (search for SETTINGS):
- `sheetId`: which Google Sheet the site reads.
- `schoolName`: shown in the menu bar and the intro.
- `refreshSeconds`: how often open pages check for new points.

The sheet must be shared as "Anyone with the link: Viewer", or the site can't read it.

## Files
- `index.html`: the whole site.
- `favicon-64.png`, `apple-touch-icon.png`: browser tab and phone home-screen icons.
- `share.png`: the preview image when the link is shared.
