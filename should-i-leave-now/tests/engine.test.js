import { describe, expect, it } from 'vitest';
import {
  buildLedger,
  buildScenarios,
  calculateCommute,
  effectiveBuffer,
  projectArrival,
  travelMinutesFor,
  uncertaintyBufferFor,
} from '../src/core/commuteEngine.js';

/**
 * The worked example from the review:
 *   travel 42 + 18 + 7 + 5 + 8 + 6 = 86 min
 *   buffer 15, uncertainty 5 at 87% confidence  -> 106 min of planning
 *   10:00 meeting -> leave 8:14, arrive 9:40
 */
const conditions = {
  baseTravelMinutes: 42,
  trafficDelay: 18,
  weatherDelay: 7,
  constructionDelay: 5,
  parkingDelay: 8,
  walkingDelay: 6,
  confidence: 0.87,
};

const trip = {
  destination: 'Gurgaon',
  destinationLabel: 'Cyber Hub, Gurgaon',
  appointmentDate: '2026-09-01',
  appointmentTime: '10:00',
  mode: 'car',
};

const preferences = { preferredBuffer: 15, snoozeMinutes: 0 };
const at = (time) => new Date(`2026-09-01T${time}:00`);
const input = { trip, conditions, preferences };

describe('component maths', () => {
  it('adds up every travel component and nothing else', () => {
    expect(travelMinutesFor(conditions)).toBe(86);
  });

  it('buys more padding as confidence drops', () => {
    expect(uncertaintyBufferFor(0.95)).toBe(2);
    expect(uncertaintyBufferFor(0.87)).toBe(5);
    expect(uncertaintyBufferFor(0.7)).toBe(10);
    expect(uncertaintyBufferFor(0.5)).toBe(15);
  });

  it('never lets a snooze push the buffer below zero', () => {
    expect(effectiveBuffer({ preferredBuffer: 15, snoozeMinutes: 5 })).toBe(10);
    expect(effectiveBuffer({ preferredBuffer: 5, snoozeMinutes: 30 })).toBe(0);
  });
});

describe('the recommendation', () => {
  it('works backwards to a departure time', () => {
    const result = calculateCommute({ ...input, now: at('06:00') });
    expect(result.totalPlanningTime).toBe(106);
    expect(result.recommendedDepartureStr).toBe('8:14 AM');
    expect(result.recommendedArrivalStr).toBe('9:40 AM');
    expect(result.status).toBe('plenty_time');
  });

  it('moves through the status bands as the morning goes on', () => {
    expect(calculateCommute({ ...input, now: at('08:00') }).status).toBe('get_ready');
    expect(calculateCommute({ ...input, now: at('08:12') }).status).toBe('leave_now');
    expect(calculateCommute({ ...input, now: at('08:25') }).status).toBe('running_late');
    expect(calculateCommute({ ...input, now: at('10:01') }).status).toBe('missed');
  });
});

/**
 * The bug this version was written to kill: once the recommended departure has
 * passed, the ETA has to be measured from now, not from the ideal departure.
 */
describe('leaving now, once the recommended departure has passed', () => {
  const result = calculateCommute({ ...input, now: at('08:25') });

  it('is running late', () => {
    expect(result.status).toBe('running_late');
    expect(result.minutesLate).toBe(11);
  });

  it('reports a live ETA measured from now', () => {
    expect(result.leaveNowArrivalStr).toBe('9:51 AM');
  });

  it('keeps the live ETA separate from the recommended arrival', () => {
    expect(result.recommendedArrivalStr).toBe('9:40 AM');
    expect(result.leaveNowArrivalStr).not.toBe(result.recommendedArrivalStr);
  });

  it('still reports the margin left against the meeting', () => {
    expect(result.marginMinutes).toBe(9);
  });

  it('collapses the two answers together before the departure passes', () => {
    const early = calculateCommute({ ...input, now: at('07:00') });
    expect(early.leaveNowArrivalStr).toBe(early.recommendedArrivalStr);
    expect(early.marginMinutes).toBe(20);
  });
});

describe('the arrival window', () => {
  const result = calculateCommute({ ...input, now: at('06:00') });

  it('is symmetric, which is what the interface promises', () => {
    expect(result.arrivalEarliestStr).toBe('9:35 AM');
    expect(result.arrivalLatestStr).toBe('9:45 AM');
    expect(result.spreadMinutes).toBe(5);
    expect(result.arrivalWindowMinutes).toBe(10);
  });

  it('always brackets the expected arrival', () => {
    for (const confidence of [0.95, 0.87, 0.7, 0.5]) {
      const windowed = calculateCommute({
        ...input,
        conditions: { ...conditions, confidence },
        now: at('06:00'),
      });
      expect(windowed.arrivalEarliestAt <= windowed.recommendedArrivalAt).toBe(true);
      expect(windowed.recommendedArrivalAt <= windowed.arrivalLatestAt).toBe(true);
    }
  });
});

describe('purity', () => {
  it('returns the same answer for the same arguments', () => {
    const a = calculateCommute({ ...input, now: at('08:00') });
    const b = calculateCommute({ ...input, now: at('08:00') });
    expect(a).toEqual(b);
  });

  it('does not mutate anything it is given', () => {
    const conditionsCopy = { ...conditions };
    const tripCopy = { ...trip };
    const preferencesCopy = { ...preferences };
    calculateCommute({
      trip: tripCopy,
      conditions: conditionsCopy,
      preferences: preferencesCopy,
      now: at('08:00'),
    });
    expect(conditionsCopy).toEqual(conditions);
    expect(tripCopy).toEqual(trip);
    expect(preferencesCopy).toEqual(preferences);
  });

  it('hands back a frozen result so callers cannot corrupt it', () => {
    const result = calculateCommute({ ...input, now: at('08:00') });
    expect(Object.isFrozen(result)).toBe(true);
  });
});

describe('edge cases', () => {
  it('handles a departure that falls on the previous day', () => {
    const result = calculateCommute({
      trip: { ...trip, appointmentDate: '2026-09-02', appointmentTime: '00:30' },
      conditions,
      preferences,
      now: new Date('2026-09-01T20:00:00'),
    });
    expect(result.recommendedDepartureStr).toBe('10:44 PM');
    expect(result.departureAt.getDate()).toBe(1);
  });

  it('copes with a zero buffer', () => {
    const result = calculateCommute({
      ...input,
      preferences: { preferredBuffer: 0, snoozeMinutes: 0 },
      now: at('06:00'),
    });
    expect(result.buffer).toBe(0);
    expect(result.totalPlanningTime).toBe(91);
  });

  it('projects arrival from whatever departure it is handed', () => {
    const { likely } = projectArrival(at('09:00'), conditions);
    expect(likely.getHours()).toBe(10);
    expect(likely.getMinutes()).toBe(26);
  });
});

describe('scenarios and the ledger', () => {
  const result = calculateCommute({ ...input, now: at('06:00') });

  it('centres the scenario grid on the recommendation', () => {
    const scenarios = buildScenarios({ conditions, preferences, result, now: at('06:00') });
    expect(scenarios).toHaveLength(4);
    expect(scenarios[1].tag).toBe('Recommended');
    expect(scenarios[1].leaveStr).toBe('8:14 AM');
    expect(scenarios[3].minutesEarly).toBeLessThan(scenarios[0].minutesEarly);
  });

  it('subtracts every component back to the departure time', () => {
    const ledger = buildLedger({ trip, conditions, preferences, result });
    expect(ledger.at(-1).atStr).toBe(result.recommendedDepartureStr);
    const total = ledger.reduce((sum, step) => sum + step.minutes, 0);
    expect(total).toBe(result.totalPlanningTime);
  });

  it('describes the journey in the words of the chosen mode', () => {
    const byTransit = buildLedger({
      trip: { ...trip, mode: 'transit' },
      conditions,
      preferences,
      result,
    });
    const labels = byTransit.map((step) => step.label).join(' ');
    expect(labels).not.toMatch(/parking|car park|driv/i);
    expect(labels).toMatch(/station/i);
  });
});
