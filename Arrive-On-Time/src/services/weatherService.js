/**
 * weatherService.js
 * Mock weather provider, shaped like an OpenWeatherMap "current + impact" call.
 */

import { WEATHER_PROFILES } from '../data/demoData.js';

export const weatherService = {
  /**
   * @param {string} location
   * @param {object} options  { condition, mode }
   */
  async getWeather(location, options = {}) {
    const { condition = 'rain', mode = 'car' } = options;
    const profile = WEATHER_PROFILES[condition] || WEATHER_PROFILES.rain;

    // Riders lose more time to bad weather than drivers; transit loses least.
    const exposure = { car: 1, bike: 1.6, transit: 0.7 }[mode] ?? 1;

    return {
      temp: profile.temp,
      condition: profile.condition,
      icon: profile.icon,
      impactMinutes: Math.round(profile.impactMinutes * exposure),
    };
  },
};
