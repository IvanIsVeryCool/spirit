/* =====================================================================
   THE FIELD AND THE MARKETS: the only part you should need to edit
   ===================================================================== */
// The tournament. The year follows the school year (NPDI is in the spring), so it moves on by itself.
const SY = (() => { const d = new Date(); return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; })();
export const EVENT = { short: 'NPDI', name: 'National Parliamentary Debate Invitational', year: SY + 1 };

// The teams going in. `p` is each team's starting chance to win (they're scaled to add up to 100%),
// `seed` its chance to be top seed after prelims. A sample field until the real qualifiers are in.
export const TEAMS = [
  { id: 'nueva-a', school: 'Nueva', team: 'A', p: 16, seed: 15, home: true },
  { id: 'harker-a', school: 'Harker', team: 'A', p: 13, seed: 14 },
  { id: 'menlo-a', school: 'Menlo', team: 'A', p: 9, seed: 10 },
  { id: 'bellarmine-a', school: 'Bellarmine', team: 'A', p: 8, seed: 9 },
  { id: 'nueva-b', school: 'Nueva', team: 'B', p: 7, seed: 6, home: true },
  { id: 'gunn-a', school: 'Gunn', team: 'A', p: 7, seed: 7 },
  { id: 'leland-a', school: 'Leland', team: 'A', p: 6, seed: 6 },
  { id: 'lynbrook-a', school: 'Lynbrook', team: 'A', p: 6, seed: 5 },
  { id: 'campolindo-a', school: 'Campolindo', team: 'A', p: 5, seed: 5 },
  { id: 'msj-a', school: 'Mission San Jose', team: 'A', p: 5, seed: 5 },
  { id: 'saratoga-a', school: 'Saratoga', team: 'A', p: 4, seed: 4 },
  { id: 'montavista-a', school: 'Monta Vista', team: 'A', p: 4, seed: 4 },
  { id: 'shp-a', school: 'Sacred Heart Prep', team: 'A', p: 3, seed: 3 },
  { id: 'miramonte-a', school: 'Miramonte', team: 'A', p: 3, seed: 3 },
  { id: 'headroyce-a', school: 'Head-Royce', team: 'A', p: 2, seed: 2 },
  { id: 'lick-a', school: 'Lick-Wilmerding', team: 'A', p: 2, seed: 2 }
];

// The markets. `multi`: one contract per team, exactly one wins. `binary`: a single Yes/No question, `p` its
// starting chance in %. `b` is how deep the market is: bigger means a trade moves the price less.
export const MARKETS = [
  { id: 'champion', kind: 'multi', short: 'Champion', title: `Who will win ${EVENT.short} ${EVENT.year}?`, key: 'p', b: 800, vol: 48210,
    rules: 'Each team’s contract pays $1 if that team wins the final round, and nothing otherwise.' },
  { id: 'topseed', kind: 'multi', short: 'Top seed', title: 'Who will be top seed after prelims?', key: 'seed', b: 600, vol: 17940,
    rules: 'Pays $1 for the team ranked first when the preliminary rounds end (record, then speaker points).' },
  { id: 'nueva-semis', kind: 'binary', short: 'Nueva in semis', title: 'Will a Nueva team reach semifinals?', p: 62, b: 500, vol: 21385,
    rules: 'Yes if either Nueva team debates in a semifinal round, including a walkover.' },
  { id: 'nueva-final', kind: 'binary', short: 'Nueva closeout', title: 'Will both Nueva teams make the final?', p: 6, b: 400, vol: 6120,
    rules: 'Yes if Nueva A and Nueva B are the two teams in the final round.' },
  { id: 'unseeded', kind: 'binary', short: 'Upset', title: 'Will a team seeded outside the top 4 win?', p: 41, b: 500, vol: 9870,
    rules: 'Yes if the champion was seeded 5th or lower going into elimination rounds.' },
  { id: 'final-30', kind: 'binary', short: '3–0 final', title: 'Will the final be a unanimous decision?', p: 38, b: 450, vol: 5230,
    rules: 'Yes if every judge on the final round’s panel votes for the winner.' }
];

// Play money each visitor starts with.
export const START_CASH = 1000;
/* ===================================================================== */
