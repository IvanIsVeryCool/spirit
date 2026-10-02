/* =====================================================================
   THE TRAIN'S CARS — one entry per door, in order from the front.
   To add a section, add an entry. To open a "coming soon" car later,
   give it an `href` (a page in this site or any link).
   ===================================================================== */
export const DOORS = [
  { id: 'points', title: 'Spirit Points', sub: 'Live class standings', status: 'Live', href: '/points/' },
  { id: 'newsletter', title: 'Weekly Newsletter', sub: 'What happened this week in spirit', status: 'Coming soon' },
  { id: 'events', title: 'Events', sub: 'Spirit weeks, rallies and homecoming', status: 'Coming soon' },
  { id: 'cabinet', title: 'Meet the Cabinet', sub: 'The people behind Nueva spirit', status: 'Live', scene: 'cabinet' } // scene: you walk through the car to the cab
];

/* =====================================================================
   THE CABINET — who's in the cab when you visit Meet the Cabinet.
   One entry per person: `name` shows above them, `role` underneath it.
   `kind` picks the 3D model (0–11, Kenney's Mini Characters for now;
   these are stand-ins until each member's own model is made).
   ===================================================================== */
export const CABINET = [
  { name: 'President', role: 'Spirit Cabinet', kind: 3 },
  { name: 'Vice President', role: 'Spirit Cabinet', kind: 6 },
  { name: 'Secretary', role: 'Spirit Cabinet', kind: 8 },
  { name: 'Treasurer', role: 'Spirit Cabinet', kind: 10 }
];

export const SITE = {
  school: 'Nueva',
  name: 'Spirit Cabinet'
};
