/* =====================================================================
   THE TRAIN'S CARS — one entry per door, in order from the front.
   To add a section, add an entry. To open a "coming soon" car later,
   give it an `href` (a page in this site or any link).
   ===================================================================== */
export const DOORS = [
  { id: 'gallery', title: 'Photo Gallery', sub: 'Photos from spirit events', status: 'Live', scene: 'gallery' },  // scene: the gallery opens inside the car
  { id: 'newsletter', title: 'Weekly Newsletter', sub: 'This week in spirit', status: 'Live', scene: 'newsletter' }, // scene: you take a seat and read it
  { id: 'events', title: 'Events', sub: 'Spirit weeks, rallies and homecoming', status: 'Live', scene: 'events' },     // scene: the car's next-stops screen
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

/* =====================================================================
   EVENTS — the next stops on the screen inside the Events car, in order.
   `date` and `time` are shown as written (leave them out and it says
   "Date to be announced"); `place` and `note` are optional.
     { name: 'Homecoming', date: 'Fri, Oct 16', time: '6 pm', place: 'Main field', note: 'Wear red' },
   ===================================================================== */
export const EVENTS = [
  { name: 'Homecoming' },
  { name: 'Spirit Week' },
  { name: 'Pep Rally' },
  { name: 'Winter Formal' },
  { name: 'Field Day' }
];

/* =====================================================================
   THE WEEKLY NEWSLETTER — the newspaper you read in the Newsletter car.
   Each week: change `issue` and `week`, and the stories. A story is a
   `head`line, an optional `kicker` (the small red label over it) and
   `body`: a list of paragraphs. The first story leads the front page.
   The Spirit Points standings and the next events are added by themselves.
   ===================================================================== */
export const NEWSLETTER = {
  issue: 1,
  week: 'Week of Sept 28, 2026',
  stories: [
    {
      kicker: 'All aboard',
      head: 'The Spirit Cabinet gets a train',
      body: [
        'Nueva spirit has a new home online, and it runs on rails. Every car of the Spirit Line is a part of the cabinet’s work: step into a car and you’re there.',
        'Car 1 is the photo gallery, with pictures from spirit events. You’re reading car 2, the weekly newsletter. Car 3 shows the next stops: the events coming up. At the back of car 4, the cab door opens and you can meet the cabinet.',
        'For the class standings, ask the officer on the platform. He has the latest numbers.'
      ]
    },
    {
      kicker: 'Spirit Points',
      head: 'Every event counts',
      body: [
        'Each spirit event earns points for the Seniors, Juniors, Sophomores and Freshmen. The totals update after every event, so the standings can change any week.',
        'Show up, dress up, and bring your class along.'
      ]
    },
    {
      kicker: 'From the cabinet',
      head: 'Got an idea?',
      body: [
        'Have an idea for a spirit event, a theme day or a challenge? Tell anyone on the Spirit Cabinet. The best ideas end up on the schedule.'
      ]
    }
  ]
};
