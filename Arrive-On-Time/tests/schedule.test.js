import { describe, expect, it } from 'vitest';
import {
  createMeeting,
  isPast,
  meetingStart,
  nextMeeting,
  planDay,
  reschedule,
  sortMeetings,
} from '../src/core/schedule.js';
import { describeChange, snapshot } from '../src/core/changes.js';
import { calculateCommute } from '../src/core/commuteEngine.js';
import { formatDayLabel, parseDateTime, toDateValue } from '../src/core/time.js';
import { parkingService } from '../src/services/parkingService.js';
import { componentsFor, destinationNote } from '../src/core/copy.js';
import { DESTINATIONS } from '../src/data/demoData.js';

const conditions = {
  baseTravelMinutes: 42,
  trafficDelay: 18,
  weatherDelay: 7,
  constructionDelay: 5,
  parkingDelay: 8,
  walkingDelay: 6,
  confidence: 0.87,
};

const now = new Date('2026-09-01T08:00:00');

describe('meetings carry an explicit date', () => {
  it('never guesses at tomorrow', () => {
    const meeting = createMeeting({ title: 'Standup', date: '2026-09-01', time: '10:00' });
    const result = calculateCommute({
      trip: {
        destination: meeting.destination,
        appointmentDate: meeting.date,
        appointmentTime: meeting.time,
        mode: meeting.mode,
      },
      conditions,
      preferences: { preferredBuffer: meeting.buffer },
      now: new Date('2026-09-01T11:05:00'),
    });

    // 11:05 on the day of a 10:00 meeting is a missed meeting, full stop.
    expect(result.status).toBe('missed');
    expect(result.appointmentAt.getDate()).toBe(1);
  });

  it('labels dates the way a person would say them', () => {
    expect(formatDayLabel('2026-09-01', now)).toBe('Today');
    expect(formatDayLabel('2026-09-02', now)).toBe('Tomorrow');
    expect(formatDayLabel('2026-09-07', now)).toBe('Mon 7 Sep');
  });

  it('sorts by the moment it actually starts, not the clock time', () => {
    const meetings = [
      createMeeting({ title: 'Late', date: '2026-09-02', time: '09:00' }),
      createMeeting({ title: 'Early', date: '2026-09-01', time: '18:00' }),
    ];
    expect(sortMeetings(meetings)[0].title).toBe('Early');
  });

  it('shows the next meeting that has not started', () => {
    const meetings = [
      createMeeting({ id: 'a', date: '2026-09-01', time: '07:00' }),
      createMeeting({ id: 'b', date: '2026-09-01', time: '14:30' }),
    ];
    expect(nextMeeting(meetings, now).id).toBe('b');
    expect(isPast(meetings[0], now)).toBe(true);
  });
});

describe('rescheduling', () => {
  const meeting = createMeeting({ title: 'Client', date: '2026-09-01', time: '10:00' });

  it('moves by minutes and rolls the date when it needs to', () => {
    expect(reschedule(meeting, { minutes: 15 }).time).toBe('10:15');
    const overnight = reschedule({ ...meeting, time: '23:50' }, { minutes: 20 });
    expect(overnight.date).toBe('2026-09-02');
    expect(overnight.time).toBe('00:10');
  });

  it('moves by days without touching the time', () => {
    const moved = reschedule(meeting, { days: 1 });
    expect(moved.date).toBe('2026-09-02');
    expect(moved.time).toBe('10:00');
  });

  it('accepts an explicit date and time', () => {
    const moved = reschedule(meeting, { date: '2026-09-04', time: '11:30' });
    expect(meetingStart(moved).getTime()).toBe(parseDateTime('2026-09-04', '11:30').getTime());
  });

  it('leaves the original untouched', () => {
    reschedule(meeting, { minutes: 45 });
    expect(meeting.time).toBe('10:00');
  });
});

describe('planning a day', () => {
  it('gives every meeting its own departure time', () => {
    const meetings = [
      createMeeting({ id: 'a', title: 'Standup', date: '2026-09-01', time: '10:00', buffer: 15 }),
      createMeeting({ id: 'b', title: 'Review', date: '2026-09-01', time: '14:30', buffer: 20 }),
    ];
    const plan = planDay({ meetings, conditionsFor: () => conditions, preferences: {}, now });

    expect(plan).toHaveLength(2);
    expect(plan[0].result.recommendedDepartureStr).toBe('8:14 AM');
    expect(plan[1].result.recommendedDepartureStr).toBe('12:39 PM');
    expect(plan[0].clash).toBeNull();
  });

  it('flags a departure that lands before the meeting in front of it', () => {
    const meetings = [
      createMeeting({ id: 'a', title: 'Standup', date: '2026-09-01', time: '10:00' }),
      createMeeting({ id: 'b', title: 'Across town', date: '2026-09-01', time: '11:00' }),
    ];
    const plan = planDay({ meetings, conditionsFor: () => conditions, preferences: {}, now });
    expect(plan[1].clash?.title).toBe('Standup');
  });
});

describe('what changed', () => {
  const build = (extra) =>
    calculateCommute({
      trip: {
        destination: 'Gurgaon',
        appointmentDate: '2026-09-01',
        appointmentTime: '10:00',
        mode: 'car',
      },
      conditions: { ...conditions, ...extra },
      preferences: { preferredBuffer: 15 },
      now,
    });

  it('says nothing when nothing moved', () => {
    const before = snapshot(build(), conditions);
    const after = snapshot(build(), conditions);
    expect(describeChange(before, after)).toBeNull();
  });

  it('names the cause and the size of the shift', () => {
    const before = snapshot(build(), conditions);
    const worse = { ...conditions, trafficDelay: 29 };
    const after = snapshot(build(worse), worse);

    const change = describeChange(before, after);
    expect(change.tone).toBe('warn');
    expect(change.headline).toMatch(/traffic/i);
    expect(change.detail).toContain('8:14 AM → 8:03 AM');
    expect(change.detail).toMatch(/11 minutes earlier/);
  });

  it('reports a widening window when only the confidence moved', () => {
    const before = snapshot(build(), conditions);
    const shaky = { ...conditions, confidence: 0.5, trafficDelay: 18 + 13 };
    const after = snapshot(build(shaky), shaky);
    expect(describeChange(before, after).detail).toMatch(/departure moved|window/i);
  });
});

describe('parking is an estimate, not an override', () => {
  it('keeps the destination value when the simulator is untouched', async () => {
    const airport = await parkingService.getParkingEstimate('Airport', { mode: 'car' });
    const cp = await parkingService.getParkingEstimate('Connaught Place', { mode: 'car' });

    expect(airport.parkingDelay).toBe(DESTINATIONS.Airport.parkingDelay);
    expect(cp.parkingDelay).toBe(DESTINATIONS['Connaught Place'].parkingDelay);
    expect(airport.source).toBe('destination');
  });

  it('only replaces it when a difficulty is chosen', async () => {
    const overridden = await parkingService.getParkingEstimate('Airport', {
      mode: 'car',
      difficulty: 15,
    });
    expect(overridden.parkingDelay).toBe(15);
    expect(overridden.source).toBe('override');
  });

  it('treats an empty selection as no override', async () => {
    const untouched = await parkingService.getParkingEstimate('Airport', {
      mode: 'car',
      difficulty: '',
    });
    expect(untouched.parkingDelay).toBe(10);
  });
});

describe('mode-aware language', () => {
  it('never mentions parking to someone on the train', async () => {
    const transit = await parkingService.getParkingEstimate('Gurgaon', { mode: 'transit' });
    expect(transit.note).not.toMatch(/car park|parking/i);
    expect(transit.note).toMatch(/metro|station/i);

    const words = componentsFor('transit');
    expect(words.walk.label).toMatch(/station/i);
    expect(words.park.label).not.toMatch(/parking/i);
  });

  it('gives cyclists their own note and their own vocabulary', () => {
    expect(destinationNote(DESTINATIONS.Airport, 'bike')).toMatch(/two-wheeler/i);
    expect(componentsFor('bike').walk.label).toMatch(/bike stand/i);
    expect(componentsFor('car').walk.label).toMatch(/parking/i);
  });
});

describe('date helpers', () => {
  it('round-trips a date through the input format', () => {
    expect(toDateValue(new Date(2026, 8, 1))).toBe('2026-09-01');
    expect(parseDateTime('2026-09-01', '10:00').getHours()).toBe(10);
  });
});

describe('component deltas', () => {
  const build = (extra) =>
    calculateCommute({
      trip: {
        destination: 'Gurgaon',
        appointmentDate: '2026-09-01',
        appointmentTime: '10:00',
        mode: 'car',
      },
      conditions: { ...conditions, ...extra },
      preferences: { preferredBuffer: 15 },
      now,
    });

  it('reports only the components that moved, keyed by band', async () => {
    const { componentDeltas } = await import('../src/core/changes.js');
    const before = snapshot(build(), conditions);
    const worse = { ...conditions, trafficDelay: 29, weatherDelay: 3 };
    const after = snapshot(build(worse), worse);

    expect(componentDeltas(before, after)).toEqual({ traffic: 11, weather: -4 });
  });

  it('badges the forecast band when confidence changes its size', async () => {
    const { componentDeltas } = await import('../src/core/changes.js');
    const before = snapshot(build(), conditions);
    const shaky = { ...conditions, confidence: 0.5 };
    const after = snapshot(build(shaky), shaky);

    expect(componentDeltas(before, after).forecast).toBe(10);
  });
});
