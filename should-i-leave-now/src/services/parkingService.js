/**
 * parkingService.js
 * Mock parking + last-mile provider.
 *
 * `difficulty` is an *override*, not the default. Pass null (or leave it out)
 * and you get the destination's own estimate — the airport stays at 10 minutes
 * and Connaught Place stays at 12. The simulator only replaces that number when
 * someone deliberately picks a difficulty.
 */

import { DESTINATIONS } from '../data/demoData.js';
import { destinationNote } from '../core/copy.js';

export const parkingService = {
  /**
   * @param {string} destination  key from DESTINATIONS
   * @param {object} options      { mode, difficulty }
   * @returns {Promise<{parkingDelay:number, walkingDelay:number, note:string, source:'destination'|'override'}>}
   */
  async getParkingEstimate(destination, options = {}) {
    const { mode = 'car', difficulty = null } = options;
    const dest = DESTINATIONS[destination] || DESTINATIONS.Gurgaon;
    const overridden =
      difficulty !== null && difficulty !== '' && Number.isFinite(Number(difficulty));

    // Transit riders don't park; they change services and walk from the station.
    if (mode === 'transit') {
      return {
        parkingDelay: overridden ? Math.round(Number(difficulty) * 0.4) : 3,
        walkingDelay: dest.walkingDelay + 4,
        note: destinationNote(dest, mode),
        source: overridden ? 'override' : 'destination',
      };
    }

    const fromDestination =
      mode === 'bike' ? Math.round(dest.parkingDelay * 0.4) : dest.parkingDelay;

    return {
      parkingDelay: overridden ? Number(difficulty) : fromDestination,
      walkingDelay: dest.walkingDelay,
      note: destinationNote(dest, mode),
      source: overridden ? 'override' : 'destination',
    };
  },
};
