/**
 * copy.js
 * One place that decides what each travel component is *called*, based on how
 * you're getting there. A transit rider should never be told to allow time for
 * the multi-storey car park, and a cyclist doesn't "drive".
 *
 * Every string the interface shows about a component comes from here, so the
 * vocabulary can't drift out of sync between the breakdown, the ledger and the
 * timeline.
 */

const SHARED = {
  roadworks: { label: 'Roadworks', ledger: 'Roadworks on the route', icon: 'construction' },
  forecast: {
    label: 'Forecast padding',
    ledger: 'Padding for an uncertain forecast',
    icon: 'gauge',
  },
  buffer: {
    label: 'Your early buffer',
    ledger: 'Settle in before it starts',
    icon: 'shield-check',
  },
};

const BY_MODE = {
  car: {
    verb: 'drive',
    noun: 'drive',
    icon: 'car',
    travel: { label: 'Drive time', ledger: 'Driving time', detail: 'Clear roads, no stops' },
    traffic: { label: 'Traffic', ledger: 'Sitting in traffic', detail: 'Congestion on the route' },
    weather: {
      label: 'Weather',
      ledger: 'Slower going in the weather',
      detail: 'Wet roads, lower speeds',
    },
    park: {
      label: 'Parking',
      ledger: 'Find a parking spot',
      detail: 'Circling for a space',
      icon: 'square-parking',
    },
    walk: {
      label: 'Walk from parking',
      ledger: 'Walk in from the car park',
      detail: 'Car park to the door',
      icon: 'footprints',
    },
    roadworks: { ...SHARED.roadworks, detail: 'Lane closure on the route' },
  },

  bike: {
    verb: 'ride',
    noun: 'ride',
    icon: 'bike',
    travel: { label: 'Ride time', ledger: 'Riding time', detail: 'Steady pace, no stops' },
    traffic: {
      label: 'Traffic',
      ledger: 'Held up in traffic',
      detail: 'Filtering through congestion',
    },
    weather: {
      label: 'Weather',
      ledger: 'Riding through the weather',
      detail: 'Exposed the whole way',
    },
    park: {
      label: 'Bike parking',
      ledger: 'Lock up at the bike stand',
      detail: 'Finding and locking the stand',
      icon: 'bike',
    },
    walk: {
      label: 'Walk from the bike stand',
      ledger: 'Walk in from the bike stand',
      detail: 'Bike stand to the door',
      icon: 'footprints',
    },
    roadworks: { ...SHARED.roadworks, detail: 'Diversion on the route' },
  },

  transit: {
    verb: 'travel',
    noun: 'journey',
    icon: 'train-front',
    travel: { label: 'On board', ledger: 'Time on board', detail: 'Scheduled running time' },
    traffic: {
      label: 'Service delays',
      ledger: 'Waiting for a delayed service',
      detail: 'Congestion on the network',
    },
    weather: { label: 'Weather', ledger: 'Weather slowing the network', detail: 'Slower services' },
    park: {
      label: 'Station transfer',
      ledger: 'Change between services',
      detail: 'Platform to platform',
      icon: 'arrow-left-right',
    },
    walk: {
      label: 'Walk from the station',
      ledger: 'Walk in from the station',
      detail: 'Station entrance to the door',
      icon: 'footprints',
    },
    roadworks: {
      label: 'Engineering works',
      ledger: 'Engineering works on the line',
      detail: 'Reduced service',
      icon: 'construction',
    },
  },
};

/** All component vocabulary for one mode. Falls back to car. */
export function componentsFor(mode) {
  const base = BY_MODE[mode] || BY_MODE.car;
  return { ...SHARED, ...base };
}

/** Short label for the mode itself: "Car", "Bike", "Transit". */
export function modeLabel(mode) {
  return { car: 'Car', bike: 'Bike', transit: 'Transit' }[mode] || 'Car';
}

/**
 * Destination notes are written for drivers in the fixtures, so transit and
 * bike riders get a note that matches how they'll actually arrive.
 */
export function destinationNote(destination, mode) {
  if (!destination) return '';
  if (mode === 'transit') return destination.transitNote || destination.note;
  if (mode === 'bike') return destination.bikeNote || destination.note;
  return destination.note;
}
