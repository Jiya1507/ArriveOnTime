/**
 * schedule.js
 * The meeting list. Every meeting carries an explicit calendar date as well as
 * a clock time, so "10:00" is never ambiguous about which day it means.
 *
 * Pure functions only — the store owns the array, this file just reasons about it.
 */

import { addDays, addMinutes, parseDateTime, toDateValue, toTimeValue } from './time.js';
import { calculateCommute } from './commuteEngine.js';

let counter = 0;

/** Ids only need to be unique within one browser session. */
function nextId() {
  counter += 1;
  return `m${Date.now().toString(36)}${counter}`;
}

export function createMeeting(partial = {}, now = new Date()) {
  return {
    id: partial.id || nextId(),
    title: (partial.title || '').trim() || 'Untitled meeting',
    destination: partial.destination || 'Gurgaon',
    date: partial.date || toDateValue(now),
    time: partial.time || '10:00',
    mode: partial.mode || 'car',
    buffer: Number.isFinite(Number(partial.buffer)) ? Number(partial.buffer) : 15,
    icon: partial.icon || 'calendar-clock',
  };
}

/**
 * The one place a meeting becomes a trip. Everything that prices a meeting goes
 * through here, so the hero and the schedule can't drift apart by reading
 * different field names off the same object.
 */
export function tripFrom(meeting, destinationLabel) {
  return {
    title: meeting.title,
    destination: meeting.destination,
    destinationLabel: destinationLabel || meeting.destination,
    appointmentDate: meeting.date,
    appointmentTime: meeting.time,
    mode: meeting.mode,
  };
}

export function meetingStart(meeting) {
  return parseDateTime(meeting.date, meeting.time);
}

export function isPast(meeting, now = new Date()) {
  return meetingStart(meeting).getTime() < now.getTime();
}

export function sortMeetings(meetings) {
  return [...meetings].sort((a, b) => meetingStart(a) - meetingStart(b));
}

/**
 * The meeting the hero should be showing: the next one that hasn't started yet,
 * falling back to the most recent one so a just-missed meeting stays on screen
 * rather than vanishing.
 */
export function nextMeeting(meetings, now = new Date()) {
  const sorted = sortMeetings(meetings);
  return sorted.find((meeting) => !isPast(meeting, now)) || sorted[sorted.length - 1] || null;
}

/**
 * Reschedule by an offset in minutes, or to an explicit date/time.
 * Returns a new meeting; the original is untouched.
 *
 *   reschedule(meeting, { minutes: 15 })
 *   reschedule(meeting, { days: 1 })
 *   reschedule(meeting, { date: '2026-09-04', time: '11:30' })
 */
export function reschedule(meeting, change = {}) {
  let { date, time } = meeting;

  if (Number.isFinite(change.minutes) && change.minutes !== 0) {
    const shifted = addMinutes(meetingStart(meeting), change.minutes);
    date = toDateValue(shifted);
    time = toTimeValue(shifted);
  }
  if (Number.isFinite(change.days) && change.days !== 0) {
    date = addDays(date, change.days);
  }
  if (change.date) date = change.date;
  if (change.time) time = change.time;

  return { ...meeting, date, time };
}

/**
 * Planning view: for each meeting, when you'd have to leave, and whether that
 * departure collides with the meeting before it. This is the bit that turns a
 * list of times into a plan you can trust.
 */
export function planDay({ meetings, conditionsFor, preferences, now = new Date() }) {
  const sorted = sortMeetings(meetings);

  return sorted.map((meeting, index) => {
    const conditions = conditionsFor(meeting);
    const result = calculateCommute({
      trip: tripFrom(meeting),
      conditions,
      preferences: { ...preferences, preferredBuffer: meeting.buffer },
      now,
    });

    const previous = sorted[index - 1];
    const clash =
      previous && result.departureAt.getTime() < meetingStart(previous).getTime() ? previous : null;

    return { meeting, result, clash };
  });
}
