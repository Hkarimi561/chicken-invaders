// Seasonal events. The active one is chosen from the calendar (month/day, wraps over New Year) and
// can be overridden by the player (client) or by EVENT_OVERRIDE (server, for testing).
export const EVENTS = {
  halloween: { name: 'Halloween', icon: '🎃', from: [10, 15], to: [11, 2], accent: '#ff8a1e', tagline: 'Witch-hat chickens, pumpkin eggs, drifting bats and a harvest moon.' },
  christmas: { name: 'Winter Holidays', icon: '🎄', from: [12, 10], to: [1, 3], accent: '#ff5252', tagline: 'Festive hats, baubles instead of eggs, fairy lights and falling snow.' },
  valentine: { name: "Valentine's", icon: '💝', from: [2, 7], to: [2, 15], accent: '#ff6fa5', tagline: 'Bows, heart candies and floating hearts.' },
  nowruz: { name: 'Nowruz', icon: '🌷', from: [3, 15], to: [4, 4], accent: '#7be495', tagline: 'Flower crowns, painted eggs, fresh sprouts and drifting petals.' },
};

const md = (m, d) => m * 100 + d;

export function eventOn(id, date = new Date()) {
  const e = EVENTS[id];
  if (!e) return false;
  const x = md(date.getMonth() + 1, date.getDate());
  const a = md(...e.from), b = md(...e.to);
  return a <= b ? x >= a && x <= b : x >= a || x <= b; // windows such as Dec 10 - Jan 3 wrap the year
}

/** Id of the event running on this date, or null. */
export function activeEvent(date = new Date()) {
  for (const id of Object.keys(EVENTS)) if (eventOn(id, date)) return id;
  return null;
}

/** The next event to start after this date: { id, days }. */
export function nextEvent(date = new Date()) {
  let best = null;
  for (const [id, e] of Object.entries(EVENTS)) {
    let start = new Date(date.getFullYear(), e.from[0] - 1, e.from[1]);
    if (start <= date) start = new Date(date.getFullYear() + 1, e.from[0] - 1, e.from[1]);
    const days = Math.ceil((start - date) / 86400000);
    if (!best || days < best.days) best = { id, days };
  }
  return best;
}

export const fmtWindow = (id) => {
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const e = EVENTS[id];
  return `${m[e.from[0] - 1]} ${e.from[1]} – ${m[e.to[0] - 1]} ${e.to[1]}`;
};
