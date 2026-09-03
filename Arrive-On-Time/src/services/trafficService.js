/**
 * trafficService.js
 * Mock traffic provider. The signature matches what you'd build on top of
 * Google Directions / Mapbox / HERE, so going live means rewriting this file
 * and nothing else.
 */

import { DESTINATIONS, TRAFFIC_PROFILES } from '../data/demoData.js';

/** Rush-hour weighting, so the mock reacts to the time of day like a real feed. */
function timeOfDayFactor(hour) {
  if (hour >= 8 && hour < 11) return 1.15;
  if (hour >= 17 && hour < 21) return 1.25;
  if (hour >= 23 || hour < 6) return 0.55;
  return 1;
}

export const trafficService = {
  /**
   * @param {string} origin
   * @param {string} destination  key from DESTINATIONS
   * @param {object} options      { mode, severity, arriveByHour, jitter }
   */
  async getTrafficEstimate(origin, destination, options = {}) {
    const { mode = 'car', severity = 'heavy', arriveByHour = 10, jitter = 0 } = options;

    const dest = DESTINATIONS[destination] || DESTINATIONS.Gurgaon;
    const profile = TRAFFIC_PROFILES[severity] || TRAFFIC_PROFILES.heavy;
    const baseDuration = dest.baseMinutes[mode] ?? dest.baseMinutes.car;

    // Transit is far less sensitive to road congestion; bikes filter through it.
    const modeSensitivity = { car: 1, bike: 0.6, transit: 0.3 }[mode] ?? 1;

    const raw = baseDuration * profile.multiplier * modeSensitivity * timeOfDayFactor(arriveByHour);

    // `jitter` lets journey mode re-poll and get a plausibly different answer,
    // which is what makes the "what changed" alerts worth having.
    const drift = jitter ? Math.round((Math.random() * 2 - 1) * jitter) : 0;

    return {
      baseDuration,
      delay: Math.max(0, Math.round(raw) + drift),
      severity,
      label: profile.label,
      confidence: profile.confidence,
      constructionDelay: mode === 'transit' ? 0 : 5,
    };
  },
};
