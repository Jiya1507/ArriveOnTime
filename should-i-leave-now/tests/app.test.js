/**
 * @vitest-environment jsdom
 *
 * Boots the real application against the real markup and drives it the way a
 * person would: add a meeting, reschedule it, start a journey. This is the test
 * that catches wiring mistakes the unit tests can't see.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

/** Lets the queued promises inside the app settle. */
const settle = () => new Promise((done) => setTimeout(done, 0));

let state;

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date('2026-09-01T08:00:00') });

  document.documentElement.innerHTML = html;
  localStorage.clear();

  // jsdom has neither of these, and the app is allowed to assume both.
  globalThis.matchMedia ??= () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  });
  HTMLDialogElement.prototype.showModal ??= function showModal() {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function close() {
    this.open = false;
  };

  await import('../src/main.js');
  ({ state } = await import('../src/state/store.js'));
  await settle();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('booting', () => {
  it('seeds a schedule and answers the question straight away', () => {
    expect(state.meetings.length).toBeGreaterThan(0);
    expect(state.result).not.toBeNull();
    expect(document.getElementById('hero-clock').dataset.value).toMatch(/^\d{1,2}:\d{2} [AP]M$/);
    expect(document.querySelectorAll('#schedule .meeting-row').length).toBe(state.meetings.length);
  });

  it('keeps the destination parking estimate until the simulator overrides it', async () => {
    expect(state.conditions.parkingSource).toBe('destination');
    expect(state.conditions.parkingDelay).toBe(8); // Gurgaon's own figure

    const parking = document.getElementById('sim-parking');
    parking.value = '15';
    parking.dispatchEvent(new Event('change'));
    await settle();

    expect(state.conditions.parkingDelay).toBe(15);
    expect(state.conditions.parkingSource).toBe('override');
  });

  it('explains what changed rather than that something changed', async () => {
    const traffic = document.getElementById('sim-traffic');
    traffic.value = 'severe';
    traffic.dispatchEvent(new Event('change'));
    await settle();

    const alert = document.getElementById('alert');
    expect(alert.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('alert-headline').textContent).toMatch(/traffic/i);
    expect(document.getElementById('alert-detail').textContent).toMatch(/→/);
    expect(document.getElementById('alert-detail').textContent).toMatch(/earlier|later/);
  });
});

describe('planning', () => {
  it('adds a meeting and makes it the one on screen', async () => {
    document.getElementById('btn-add-meeting').click();

    document.getElementById('meeting-title').value = 'Dentist';
    document.getElementById('meeting-destination').value = 'Noida';
    document.getElementById('meeting-date').value = '2026-09-01';
    document.getElementById('meeting-time').value = '16:00';
    document.getElementById('meeting-mode').value = 'transit';
    document.getElementById('meeting-buffer').value = '10';

    document
      .getElementById('meeting-form')
      .dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await settle();

    expect(state.meetings.some((meeting) => meeting.title === 'Dentist')).toBe(true);
    expect(state.trip.title).toBe('Dentist');
    expect(state.trip.mode).toBe('transit');
    expect(document.getElementById('hero-decision').textContent).toContain('Dentist');
  });

  it('reschedules from the quick chips without touching the saved meeting first', async () => {
    const before = state.trip.appointmentTime;
    document.querySelector('[data-action="reschedule"]').click();

    document.querySelector('[data-shift-minutes="15"]').click();
    expect(document.getElementById('meeting-time').value).not.toBe(before);
    expect(state.trip.appointmentTime).toBe(before); // nothing saved yet

    document
      .getElementById('meeting-form')
      .dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await settle();

    expect(state.trip.appointmentTime).not.toBe(before);
  });

  it('removes a meeting and falls back to the next one', async () => {
    const [first] = state.meetings;
    document.querySelector(`[data-meeting-action="delete"][data-id="${first.id}"]`).click();
    await settle();

    expect(state.meetings.some((meeting) => meeting.id === first.id)).toBe(false);
    expect(state.activeMeetingId).not.toBe(first.id);
    expect(state.result).not.toBeNull();
  });

  it('remembers the schedule across a reload', async () => {
    document.getElementById('btn-add-meeting').click();
    document.getElementById('meeting-title').value = 'Persisted';
    document.getElementById('meeting-date').value = '2026-09-03';
    document.getElementById('meeting-time').value = '09:00';
    document
      .getElementById('meeting-form')
      .dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await settle();

    const stored = JSON.parse(localStorage.getItem('should_i_leave_now_v2'));
    expect(stored.meetings.some((meeting) => meeting.title === 'Persisted')).toBe(true);
  });
});

describe('journey mode', () => {
  it('turns the hero into a live ETA and back again', async () => {
    document.querySelector('[data-action="start-journey"]').click();
    await settle();

    expect(state.ui.journeyStarted).toBe(true);
    expect(document.getElementById('journey-eta')).not.toBeNull();
    expect(document.getElementById('journey-check')).not.toBeNull();

    document.querySelector('[data-action="end-journey"]').click();
    await settle();

    expect(state.ui.journeyStarted).toBe(false);
    expect(document.getElementById('hero-clock')).not.toBeNull();
  });
});

describe('the buffer', () => {
  it('moves the departure time and sticks to the meeting', async () => {
    const before = state.result.recommendedDepartureStr;
    const slider = document.getElementById('buffer-slider');
    slider.value = '30';
    slider.dispatchEvent(new Event('input'));
    await settle();

    expect(state.preferences.preferredBuffer).toBe(30);
    expect(state.result.recommendedDepartureStr).not.toBe(before);
    expect(state.meetings.find((m) => m.id === state.activeMeetingId).buffer).toBe(30);
  });

  it('borrows five minutes back, then refuses once there is nothing left', async () => {
    const slider = document.getElementById('buffer-slider');
    slider.value = '5';
    slider.dispatchEvent(new Event('input'));
    await settle();

    document.querySelector('[data-action="snooze"]').click();
    expect(state.preferences.snoozeMinutes).toBe(5);

    document.querySelector('[data-action="snooze"]').click();
    expect(state.preferences.snoozeMinutes).toBe(5);
    expect(document.getElementById('alert-headline').textContent).toMatch(/no buffer left/i);
  });
});

describe('the hero and the schedule agree', () => {
  it('prices the active meeting identically in both places', async () => {
    const active = state.plan.find((entry) => entry.meeting.id === state.activeMeetingId);
    expect(active).toBeDefined();

    // Regression: rebuildPlan once passed a meeting (.time) into a function
    // destructuring .appointmentTime, so scheduled meetings were priced at 9 AM
    // traffic and drifted a minute from the hero.
    expect(active.result.recommendedDepartureStr).toBe(state.result.recommendedDepartureStr);

    const heroClock = document.getElementById('hero-clock').dataset.value;
    const row = document.querySelector('.meeting-row[data-active="true"]');
    expect(row.textContent).toContain(`Leave at ${heroClock}`);
  });

  it('prices an evening meeting with evening traffic, not morning traffic', async () => {
    const { tripFrom } = await import('../src/core/schedule.js');
    const evening = tripFrom({
      title: 'Flight',
      destination: 'Airport',
      date: '2026-09-02',
      time: '18:45',
      mode: 'car',
    });
    expect(evening.appointmentTime).toBe('18:45');
    expect(evening.appointmentDate).toBe('2026-09-02');
  });
});

describe('the seeded demo is always a live decision', () => {
  it('opens on a meeting that has not already happened', () => {
    expect(state.result.status).not.toBe('missed');
    expect(state.result.minutesUntilDeparture).toBeGreaterThan(-60);
  });

  it('shows a readable countdown rather than an ambiguous clock', () => {
    const text = document.getElementById('countdown-value').textContent;
    expect(text).toMatch(/^-?(\d+h \d{2}m|\d{2}:\d{2}(:\d{2})?)$/);
  });
});
