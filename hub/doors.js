/* =====================================================================
   THE TRAIN'S CARS — one entry per door, in order from the front.
   To add a section, add an entry. To open a "coming soon" car later,
   give it an `href` (a page in this site or any link).
   ===================================================================== */
export const DOORS = [
  { id: 'points', title: 'Spirit Points', sub: 'Live class standings', status: 'Live', href: '/points/' },
  { id: 'newsletter', title: 'Weekly Newsletter', sub: 'What happened this week in spirit', status: 'Coming soon' },
  { id: 'events', title: 'Events', sub: 'Spirit weeks, rallies and homecoming', status: 'Coming soon' },
  { id: 'cabinet', title: 'Meet the Cabinet', sub: 'The people behind Nueva spirit', status: 'Coming soon' }
];

export const SITE = {
  school: 'Nueva',
  name: 'Spirit Cabinet'
};
