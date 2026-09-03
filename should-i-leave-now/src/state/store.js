/**
 * store.js
 * The single source of truth. It holds data and notifies subscribers — it does
 * no maths and touches no DOM. The engine reads a copy of this via arguments;
 * it never imports it.
 */

const listeners = new Set();

export const state = {
  /** Everything the user has scheduled. Each meeting owns an explicit date. */
  meetings: [],
  activeMeetingId: null,

  /** The trip the hero is currently answering for, derived from the active meeting. */
  trip: {
    origin: 'Home',
    title: 'Client meeting',
    destination: 'Gurgaon',
    destinationLabel: 'Cyber Hub, Gurgaon',
    appointmentDate: '',
    appointmentTime: '10:00',
    mode: 'car',
  },

  /** Live-ish numbers from the service layer. Only refreshConditions() writes here. */
  conditions: {
    baseTravelMinutes: 42,
    trafficDelay: 18,
    weatherDelay: 7,
    constructionDelay: 5,
    parkingDelay: 8,
    walkingDelay: 6,
    confidence: 0.87,
    trafficSeverity: 'Heavy congestion',
    weatherTemp: 29,
    weatherCondition: 'Rain',
    weatherIcon: 'cloud-rain',
    parkingSource: 'destination',
    note: '',
  },

  preferences: {
    preferredBuffer: 15,
    snoozeMinutes: 0,
    theme: 'light',
  },

  /** Simulator selections. `null` means "leave it to the service". */
  simulation: {
    traffic: 'heavy',
    weather: 'rain',
    parking: null,
    confidence: null,
  },

  ui: {
    ledgerOpen: false,
    simOpen: false,
    journeyStarted: false,
    journeyCheckAt: null,
    meetingFormOpen: false,
    editingMeetingId: null,
    loading: false,
    change: null,
    deltas: {},
  },

  /** Last engine output. Assigned by main.js — never computed in place. */
  result: null,
  /** One entry per meeting: { meeting, result, clash }. */
  plan: [],
  /** Comparable record of the previous recommendation, for "what changed". */
  snapshot: null,
};

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notify() {
  for (const listener of listeners) listener(state);
}

/** Shallow-merge a patch one level deep, then notify. */
export function update(patch, { silent = false } = {}) {
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      Object.assign(state[key], value);
    } else {
      state[key] = value;
    }
  }
  if (!silent) notify();
  return state;
}
