/**
 * commuteEngine.js
 * The maths. Genuinely pure: every input arrives as an argument, nothing is
 * read from module scope, nothing is mutated, and no DOM is touched. Call it
 * with the same arguments twice and you get the same answer twice.
 *
 *   const result = calculateCommute({ trip, conditions, preferences, now });
 *
 * The caller decides what to do with `result` — see src/main.js, which assigns
 * it to the store.
 */

import { addMinutes, formatTime, minutesBetween, parseDateTime } from './time.js';
import { componentsFor } from './copy.js';

/**
 * Padding the engine adds on its own when the forecast is shaky. The worse the
 * confidence, the more slack it buys you.
 */
export function uncertaintyBufferFor(confidence) {
  if (confidence < 0.6) return 15;
  if (confidence < 0.75) return 10;
  if (confidence < 0.9) return 5;
  return 2;
}

/** Sum of every real travel component. Personal padding is not included. */
export function travelMinutesFor(conditions) {
  return (
    Number(conditions.baseTravelMinutes || 0) +
    Number(conditions.trafficDelay || 0) +
    Number(conditions.weatherDelay || 0) +
    Number(conditions.constructionDelay || 0) +
    Number(conditions.parkingDelay || 0) +
    Number(conditions.walkingDelay || 0)
  );
}

/** Buffer actually in force: what you asked for, minus any snooze you took. */
export function effectiveBuffer(preferences = {}) {
  const preferred = Number(preferences.preferredBuffer) || 0;
  const snoozed = Number(preferences.snoozeMinutes) || 0;
  return Math.max(0, preferred - snoozed);
}

/**
 * Where you land if you leave at `departureAt` under `conditions`.
 * The window is symmetric — the same number of minutes either side of the
 * likely arrival — because that is what the interface promises the user.
 */
export function projectArrival(departureAt, conditions) {
  const travel = travelMinutesFor(conditions);
  const spread = uncertaintyBufferFor(conditions.confidence);
  const likely = addMinutes(departureAt, travel);

  return {
    departureAt,
    earliest: addMinutes(likely, -spread),
    likely,
    latest: addMinutes(likely, spread),
    spread,
    travel,
  };
}

function riskScoreFor(conditions) {
  const traffic = Math.min(Number(conditions.trafficDelay || 0) * 1.6, 35);
  const weather = Math.min(Number(conditions.weatherDelay || 0) * 2, 25);
  const parking = Math.min(Number(conditions.parkingDelay || 0) * 1.2, 15);
  const shakiness = (1 - Number(conditions.confidence || 1)) * 25;
  return Math.max(0, Math.min(100, Math.round(traffic + weather + parking + shakiness)));
}

/**
 * Status bands, in the order a morning actually unfolds.
 * `missed` only fires once the appointment itself is behind you — the engine
 * never silently assumes you meant tomorrow.
 */
function statusFor({ minutesUntilDeparture, appointmentAt, now }) {
  if (now.getTime() >= appointmentAt.getTime()) return 'missed';
  if (minutesUntilDeparture > 20) return 'plenty_time';
  if (minutesUntilDeparture > 3) return 'get_ready';
  if (minutesUntilDeparture >= -5) return 'leave_now';
  return 'running_late';
}

/**
 * @param {object}  input
 * @param {object}  input.trip         { destination, destinationLabel, appointmentDate, appointmentTime, mode, title }
 * @param {object}  input.conditions   travel components + confidence
 * @param {object}  input.preferences  { preferredBuffer, snoozeMinutes }
 * @param {Date}    input.now
 * @returns {object} a frozen result — no shared references back into the caller's state
 */
export function calculateCommute({ trip, conditions, preferences = {}, now = new Date() }) {
  const buffer = effectiveBuffer(preferences);
  const uncertaintyBuffer = uncertaintyBufferFor(conditions.confidence);
  const travelMinutes = travelMinutesFor(conditions);
  const totalPlanningTime = travelMinutes + buffer + uncertaintyBuffer;

  const appointmentAt = parseDateTime(trip.appointmentDate, trip.appointmentTime);
  const departureAt = addMinutes(appointmentAt, -totalPlanningTime);

  // Two distinct questions, two distinct answers.
  //   1. When *should* you have left, and where does that put you?
  //   2. If you walk out of the door this second, where does that put you?
  // Before the recommended departure these agree; after it they must not.
  const recommended = projectArrival(departureAt, conditions);
  const leaveNowDepartureAt = now.getTime() > departureAt.getTime() ? now : departureAt;
  const leaveNow = projectArrival(leaveNowDepartureAt, conditions);

  const minutesUntilDeparture = minutesBetween(now, departureAt);
  const status = statusFor({ minutesUntilDeparture, appointmentAt, now });

  return Object.freeze({
    // components
    travelMinutes,
    buffer,
    uncertaintyBuffer,
    totalPlanningTime,
    spreadMinutes: recommended.spread,
    arrivalWindowMinutes: recommended.spread * 2,

    // anchors
    appointmentAt,
    departureAt,
    appointmentStr: formatTime(appointmentAt),
    recommendedDepartureStr: formatTime(departureAt),

    // 1. the recommendation
    recommendedArrivalAt: recommended.likely,
    recommendedArrivalStr: formatTime(recommended.likely),
    arrivalEarliestAt: recommended.earliest,
    arrivalLatestAt: recommended.latest,
    arrivalEarliestStr: formatTime(recommended.earliest),
    arrivalLatestStr: formatTime(recommended.latest),
    arrivalRangeStr: `${formatTime(recommended.earliest)} – ${formatTime(recommended.latest)}`,

    // 2. what happens if you leave right now
    leaveNowDepartureAt,
    leaveNowArrivalAt: leaveNow.likely,
    leaveNowArrivalStr: formatTime(leaveNow.likely),
    leaveNowEarliestStr: formatTime(leaveNow.earliest),
    leaveNowLatestStr: formatTime(leaveNow.latest),
    leaveNowRangeStr: `${formatTime(leaveNow.earliest)} – ${formatTime(leaveNow.latest)}`,

    // the gap between the two, which is the whole point of the late state
    minutesUntilDeparture,
    minutesLate: Math.max(0, -minutesUntilDeparture),
    marginMinutes: minutesBetween(leaveNow.likely, appointmentAt),
    isBehindSchedule: minutesUntilDeparture < 0,

    riskScore: riskScoreFor(conditions),
    status,
  });
}

/**
 * The "what if I left at X instead" grid. Offsets are relative to the
 * recommendation, so the middle option is always the recommendation itself.
 */
export function buildScenarios({ conditions, preferences = {}, result, now = new Date() }) {
  if (!result?.departureAt) return [];
  const offsets = [-15, 0, 12, 25];
  const preferred = Number(preferences.preferredBuffer) || 0;

  return offsets.map((offset) => {
    const leaveAt = addMinutes(result.departureAt, offset);
    const { likely } = projectArrival(leaveAt, conditions);
    const minutesEarly = minutesBetween(likely, result.appointmentAt);

    let tag, tone;
    if (offset === 0) {
      tag = 'Recommended';
      tone = 'recommended';
    } else if (minutesEarly >= preferred) {
      tag = 'Extra early';
      tone = 'early';
    } else if (minutesEarly >= 2) {
      tag = 'Cutting it close';
      tone = 'risky';
    } else if (minutesEarly >= 0) {
      tag = 'Right on the bell';
      tone = 'late';
    } else {
      tag = `${Math.abs(minutesEarly)} min late`;
      tone = 'late';
    }

    return {
      offset,
      leaveStr: formatTime(leaveAt),
      arriveStr: formatTime(likely),
      minutesEarly,
      tag,
      tone,
      isPast: leaveAt.getTime() < now.getTime(),
    };
  });
}

/**
 * The backwards ledger: the appointment, minus each component, in the order you
 * experience them in reverse. Labels are mode-aware — a transit rider is never
 * told to allow time for the car park.
 */
export function buildLedger({ trip, conditions, preferences, result }) {
  if (!result?.appointmentAt) return [];
  const words = componentsFor(trip.mode);
  const buffer = effectiveBuffer(preferences);

  const steps = [
    { key: 'buffer', label: 'Settle in before it starts', minutes: buffer, tone: 'buffer' },
    { key: 'walk', label: words.walk.ledger, minutes: conditions.walkingDelay, tone: 'walk' },
    { key: 'park', label: words.park.ledger, minutes: conditions.parkingDelay, tone: 'park' },
    {
      key: 'forecast',
      label: 'Padding for an uncertain forecast',
      minutes: result.uncertaintyBuffer,
      tone: 'forecast',
    },
    {
      key: 'weather',
      label: words.weather.ledger,
      minutes: conditions.weatherDelay,
      tone: 'weather',
    },
    {
      key: 'roadworks',
      label: words.roadworks.ledger,
      minutes: conditions.constructionDelay,
      tone: 'roadworks',
    },
    {
      key: 'traffic',
      label: words.traffic.ledger,
      minutes: conditions.trafficDelay,
      tone: 'traffic',
    },
    {
      key: 'travel',
      label: words.travel.ledger,
      minutes: conditions.baseTravelMinutes,
      tone: 'travel',
    },
  ].filter((step) => step.minutes > 0);

  let running = result.appointmentAt.getTime();
  return steps.map((step) => {
    running -= step.minutes * 60_000;
    return { ...step, atStr: formatTime(new Date(running)) };
  });
}
