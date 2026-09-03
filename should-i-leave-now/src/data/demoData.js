/**
 * demoData.js
 * Fixtures behind the mock services. Swap these for real provider responses and
 * nothing above the service layer needs to change.
 */

export const DESTINATIONS = {
  Gurgaon: {
    label: 'Cyber Hub, Gurgaon',
    distanceKm: 31,
    baseMinutes: { car: 42, bike: 36, transit: 58 },
    parkingDelay: 8,
    walkingDelay: 6,
    note: 'The multi-level car park fills up before 10 AM.',
    bikeNote: 'Two-wheeler stands are on the basement ramp, usually free.',
    transitNote: 'Rapid Metro drops you a five-minute walk from the entrance.',
  },
  'Connaught Place': {
    label: 'Connaught Place, Delhi',
    distanceKm: 14,
    baseMinutes: { car: 28, bike: 22, transit: 34 },
    parkingDelay: 12,
    walkingDelay: 5,
    note: 'Street parking is scarce; the inner circle fills first.',
    bikeNote: 'Bike parking on the outer circle, then a short walk in.',
    transitNote: 'Rajiv Chowk exits into the inner circle; allow for the crowds.',
  },
  Noida: {
    label: 'Noida Sector 62',
    distanceKm: 24,
    baseMinutes: { car: 35, bike: 30, transit: 46 },
    parkingDelay: 5,
    walkingDelay: 3,
    note: 'Open office lots, usually space available.',
    bikeNote: 'Covered two-wheeler parking right by the lobby.',
    transitNote: 'Electronic City station, then a short walk through the campus.',
  },
  Airport: {
    label: 'IGI Airport T3',
    distanceKm: 19,
    baseMinutes: { car: 33, bike: 29, transit: 41 },
    parkingDelay: 10,
    walkingDelay: 10,
    note: 'Long walk from the car park to departures.',
    bikeNote: 'Two-wheeler parking is far from the terminal — allow for the walk.',
    transitNote: 'Airport Express runs every 10 minutes and stops inside T3.',
  },
};

export const TRAFFIC_PROFILES = {
  light: { multiplier: 0.1, confidence: 0.95, label: 'Light traffic' },
  heavy: { multiplier: 0.42, confidence: 0.87, label: 'Heavy congestion' },
  severe: { multiplier: 0.85, confidence: 0.55, label: 'Severe congestion' },
};

export const WEATHER_PROFILES = {
  clear: { temp: 31, condition: 'Clear', icon: 'sun', impactMinutes: 0 },
  rain: { temp: 29, condition: 'Rain', icon: 'cloud-rain', impactMinutes: 7 },
  storm: { temp: 26, condition: 'Storm', icon: 'cloud-lightning', impactMinutes: 15 },
};

/**
 * Seed schedule, anchored to whenever the app is first opened rather than to a
 * fixed clock time. Open it at 9 AM or at 11 PM and the first meeting is still
 * a live decision roughly two hours out — which is the state worth seeing.
 */
export function seedMeetings(toDateValue, now = new Date()) {
  const clock = (date) =>
    `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

  // The first meeting is always a live decision, whatever time you open the app.
  const soon = new Date(now.getTime() + 125 * 60_000);
  soon.setMinutes(Math.ceil(soon.getMinutes() / 15) * 15, 0, 0);

  // The rest sit at ordinary diary times on the days that follow, so the list
  // never reads like a design review at half past midnight.
  const onDay = (offset, time) => {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    return { date: toDateValue(day), time };
  };

  return [
    {
      id: 'seed-client',
      title: 'Client meeting',
      destination: 'Gurgaon',
      date: toDateValue(soon),
      time: clock(soon),
      mode: 'car',
      buffer: 15,
      icon: 'briefcase',
    },
    {
      id: 'seed-review',
      title: 'Design review',
      destination: 'Connaught Place',
      ...onDay(1, '14:30'),
      mode: 'transit',
      buffer: 20,
      icon: 'handshake',
    },
    {
      id: 'seed-flight',
      title: 'Evening flight',
      destination: 'Airport',
      ...onDay(2, '18:45'),
      mode: 'car',
      buffer: 30,
      icon: 'plane',
    },
  ];
}
