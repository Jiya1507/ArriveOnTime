/**
 * changes.js
 * "Traffic updated" tells you nothing. This works out what actually moved and
 * by how much, so the app can say:
 *
 *   Traffic just got worse.
 *   Your departure moved 8:14 → 8:03. Leave 11 minutes earlier.
 *
 * Pure: hand it two snapshots, get back a message or null.
 */

const CAUSES = [
  { key: 'trafficDelay', worse: 'Traffic just got worse.', better: 'Traffic is clearing.' },
  {
    key: 'weatherDelay',
    worse: 'The weather is slowing the route.',
    better: 'The weather is easing off.',
  },
  { key: 'parkingDelay', worse: 'Parking is filling up.', better: 'Parking is looking easier.' },
  {
    key: 'constructionDelay',
    worse: 'New roadworks on the route.',
    better: 'The roadworks have cleared.',
  },
];

/** A small, comparable record of one recommendation. */
export function snapshot(result, conditions) {
  if (!result) return null;
  return {
    departureMs: result.departureAt.getTime(),
    departureStr: result.recommendedDepartureStr,
    arrivalRangeStr: result.arrivalRangeStr,
    spreadMinutes: result.spreadMinutes,
    conditions: {
      trafficDelay: Number(conditions.trafficDelay || 0),
      weatherDelay: Number(conditions.weatherDelay || 0),
      parkingDelay: Number(conditions.parkingDelay || 0),
      constructionDelay: Number(conditions.constructionDelay || 0),
      confidence: Number(conditions.confidence || 1),
    },
  };
}

/** Which single condition moved the most, and in which direction. */
function dominantCause(previous, next) {
  let best = null;
  for (const cause of CAUSES) {
    const delta = next.conditions[cause.key] - previous.conditions[cause.key];
    if (delta === 0) continue;
    if (!best || Math.abs(delta) > Math.abs(best.delta)) best = { ...cause, delta };
  }
  return best;
}

/**
 * Which components moved and by how much, keyed the way the timeline bands are.
 * Lets the interface point at the band that changed instead of just repainting
 * every number on the page.
 *
 * @returns {Record<string, number>} e.g. { traffic: 11, weather: -2 }
 */
export function componentDeltas(previous, next) {
  if (!previous || !next) return {};
  const byBand = {
    trafficDelay: 'traffic',
    weatherDelay: 'weather',
    parkingDelay: 'park',
    constructionDelay: 'roadworks',
  };

  const deltas = {};
  for (const [key, band] of Object.entries(byBand)) {
    const delta = next.conditions[key] - previous.conditions[key];
    if (delta !== 0) deltas[band] = delta;
  }

  // The forecast band isn't a condition, it's derived from confidence — but it
  // moves on screen like the others, so it needs a badge like the others.
  const forecast = next.spreadMinutes - previous.spreadMinutes;
  if (forecast !== 0) deltas.forecast = forecast;

  return deltas;
}

/**
 * @returns {null | { tone: 'warn'|'good'|'info', headline: string, detail: string }}
 */
export function describeChange(previous, next) {
  if (!previous || !next) return null;

  const shiftMinutes = Math.round((previous.departureMs - next.departureMs) / 60_000);
  const cause = dominantCause(previous, next);

  // Departure moved.
  if (shiftMinutes !== 0) {
    const earlier = shiftMinutes > 0;
    const size = Math.abs(shiftMinutes);
    const headline = cause
      ? earlier
        ? cause.worse
        : cause.better
      : earlier
        ? 'Conditions got worse.'
        : 'Conditions improved.';

    return {
      tone: earlier ? 'warn' : 'good',
      headline,
      detail:
        `Your departure moved ${previous.departureStr} → ${next.departureStr}. ` +
        `Leave ${size} minute${size === 1 ? '' : 's'} ${earlier ? 'earlier' : 'later'}.`,
      shiftMinutes,
    };
  }

  // Departure held, but the confidence — and so the arrival window — changed.
  if (previous.spreadMinutes !== next.spreadMinutes) {
    const widened = next.spreadMinutes > previous.spreadMinutes;
    return {
      tone: widened ? 'warn' : 'good',
      headline: widened ? 'The forecast is less certain.' : 'The forecast firmed up.',
      detail: `Your arrival window ${widened ? 'widened' : 'narrowed'}: ${previous.arrivalRangeStr} → ${next.arrivalRangeStr}.`,
      shiftMinutes: 0,
    };
  }

  return null;
}
