/**
 * @vitest-environment jsdom
 *
 * These render against the real index.html, so a markup change that breaks a
 * hook fails here rather than in front of a recruiter.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import { calculateCommute } from '../src/core/commuteEngine.js';
import { createMeeting, planDay } from '../src/core/schedule.js';
import { renderHero, renderTick, renderTimeline } from '../src/ui/hero.js';
import { renderArrival, renderBreakdown, renderScenarios } from '../src/ui/panels.js';
import { renderSchedule } from '../src/ui/schedule.js';
import { mountIcons } from '../src/ui/icons.js';

const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

const conditions = {
  baseTravelMinutes: 42,
  trafficDelay: 18,
  weatherDelay: 7,
  constructionDelay: 5,
  parkingDelay: 8,
  walkingDelay: 6,
  confidence: 0.87,
  trafficSeverity: 'Heavy congestion',
  weatherCondition: 'Rain',
  weatherIcon: 'cloud-rain',
  weatherTemp: 29,
  parkingSource: 'destination',
};

function buildState(now, overrides = {}) {
  const trip = {
    title: 'Client meeting',
    origin: 'Home',
    destination: 'Gurgaon',
    destinationLabel: 'Cyber Hub, Gurgaon',
    appointmentDate: '2026-09-01',
    appointmentTime: '10:00',
    mode: 'car',
    ...overrides.trip,
  };
  const merged = { ...conditions, ...overrides.conditions };
  const preferences = { preferredBuffer: 15, snoozeMinutes: 0 };

  return {
    trip,
    conditions: merged,
    preferences,
    activeMeetingId: 'a',
    meetings: [],
    plan: [],
    ui: { journeyStarted: false, ledgerOpen: false, journeyCheckAt: null },
    result: calculateCommute({ trip, conditions: merged, preferences, now }),
  };
}

beforeEach(() => {
  document.documentElement.innerHTML = html;
  mountIcons();
});

describe('page structure', () => {
  it('has exactly one h1 and it names the app', () => {
    const headings = document.querySelectorAll('h1');
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent.trim()).toBe('Should I Leave Now?');
  });

  it('gives every section a heading and every field a label', () => {
    document.querySelectorAll('section[aria-labelledby]').forEach((section) => {
      expect(document.getElementById(section.getAttribute('aria-labelledby'))).not.toBeNull();
    });
    document.querySelectorAll('input:not([type=hidden]), select').forEach((field) => {
      const labelled =
        document.querySelector(`label[for="${field.id}"]`) || field.getAttribute('aria-label');
      expect(labelled, `no label for #${field.id}`).toBeTruthy();
    });
  });

  it('announces live changes politely', () => {
    const alert = document.getElementById('alert');
    expect(alert.getAttribute('role')).toBe('status');
    expect(alert.getAttribute('aria-live')).toBe('polite');
  });

  it('defaults the parking simulator to the destination estimate', () => {
    expect(document.getElementById('sim-parking').value).toBe('');
    expect(document.getElementById('sim-confidence').value).toBe('');
  });
});

describe('the hero', () => {
  it('leads with the departure time', () => {
    renderHero(buildState(new Date('2026-09-01T06:00:00')));
    const clock = document.getElementById('hero-clock');
    expect(clock.dataset.value).toBe('8:14 AM');
    expect(clock.textContent.replace(/\s+/g, '')).toBe('8:14AM');
  });

  it('shows both arrival numbers once the departure has passed', () => {
    renderHero(buildState(new Date('2026-09-01T08:25:00')));
    const text = document.getElementById('hero-decision').textContent;

    expect(text).toContain('9:40 AM'); // recommended
    expect(text).toContain('9:51 AM'); // if you leave now
    expect(text).toMatch(/11 minutes behind/);
    expect(text).toMatch(/9 minutes.*margin/s);
  });

  it('offers a way out when the meeting has already started', () => {
    renderHero(buildState(new Date('2026-09-01T10:30:00')));
    const host = document.getElementById('hero-decision');
    expect(host.textContent).toMatch(/already started|started 30 minutes ago/i);
    expect(host.querySelector('[data-action="reschedule"]')).not.toBeNull();
  });

  it('switches to a live ETA in journey mode', () => {
    const state = buildState(new Date('2026-09-01T08:25:00'));
    state.ui.journeyStarted = true;
    state.ui.journeyCheckAt = Date.now() + 120_000;

    renderHero(state);
    expect(document.getElementById('journey-eta').textContent).toContain('9:51');
    expect(document.querySelector('[data-action="end-journey"]')).not.toBeNull();

    renderTick(state, new Date());
    expect(document.getElementById('journey-check').textContent).toMatch(/^0?[12]:\d{2}$/);
  });

  it('counts down to the departure the rest of the time', () => {
    const state = buildState(new Date('2026-09-01T08:00:00'));
    renderHero(state);
    renderTick(state, new Date('2026-09-01T08:00:00'));
    expect(document.getElementById('countdown-value').textContent).toBe('14:00');
    expect(document.getElementById('countdown-label').textContent).toBe('Until you leave');
  });
});

describe('the timeline', () => {
  it('draws one band per component, sized by its minutes', () => {
    const state = buildState(new Date('2026-09-01T06:00:00'));
    renderTimeline(state);

    const bands = document.querySelectorAll('#timeline-track .band');
    expect(bands.length).toBe(8);

    const travel = document.querySelector('[data-key="travel"]');
    expect(travel.style.flexGrow).toBe('42');
    expect(travel.getAttribute('aria-label')).toMatch(/42 minutes/);
  });

  it('resizes in place when conditions change so the bands can animate', () => {
    const before = buildState(new Date('2026-09-01T06:00:00'));
    renderTimeline(before);
    const first = document.querySelector('[data-key="traffic"]');

    const after = buildState(new Date('2026-09-01T06:00:00'), {
      conditions: { trafficDelay: 30 },
    });
    renderTimeline(after);

    expect(document.querySelector('[data-key="traffic"]')).toBe(first);
    expect(first.style.flexGrow).toBe('30');
  });
});

describe('the panels', () => {
  it('describes the arrival window with the same numbers the model uses', () => {
    const state = buildState(new Date('2026-09-01T06:00:00'));
    renderArrival(state);
    const text = document.getElementById('arrival-body').textContent;

    expect(text).toContain('9:35 AM – 9:45 AM');
    expect(text).toContain('10-minute window');
    expect(text).toContain('±5 min');
  });

  it('uses transit words for a transit trip', () => {
    renderBreakdown(buildState(new Date('2026-09-01T06:00:00'), { trip: { mode: 'transit' } }));
    const text = document.getElementById('breakdown').textContent;

    expect(text).not.toMatch(/car park|parking|drive time/i);
    expect(text).toMatch(/station/i);
  });

  it('marks the recommended scenario', () => {
    const state = buildState(new Date('2026-09-01T06:00:00'));
    renderScenarios(state, new Date('2026-09-01T06:00:00'));
    const cards = document.querySelectorAll('#scenarios .scenario');
    expect(cards).toHaveLength(4);
    expect(cards[1].dataset.tone).toBe('recommended');
  });
});

describe('the schedule', () => {
  it('lists each meeting with its own departure and controls', () => {
    const now = new Date('2026-09-01T08:00:00');
    const state = buildState(now);
    state.meetings = [
      createMeeting({ id: 'a', title: 'Client meeting', date: '2026-09-01', time: '10:00' }),
      createMeeting({ id: 'b', title: 'Design review', date: '2026-09-01', time: '14:30' }),
    ];
    state.plan = planDay({
      meetings: state.meetings,
      conditionsFor: () => conditions,
      preferences: state.preferences,
      now,
    });

    renderSchedule(state, now);
    const rows = document.querySelectorAll('#schedule .meeting-row');

    expect(rows).toHaveLength(2);
    expect(rows[0].dataset.active).toBe('true');
    expect(rows[0].textContent).toContain('Leave at 8:14 AM');
    expect(rows[0].querySelector('[data-meeting-action="edit"]')).not.toBeNull();
    expect(rows[0].querySelector('[data-meeting-action="delete"]')).not.toBeNull();
    expect(document.getElementById('schedule-note').textContent).toContain('next departure');
  });

  it('invites you to add something when the day is empty', () => {
    const state = buildState(new Date('2026-09-01T08:00:00'));
    renderSchedule(state);
    expect(document.getElementById('schedule').textContent).toMatch(/add a meeting/i);
  });
});

describe('accessibility and type scale', () => {
  /** Relative luminance, per WCAG 2.1. */
  const luminance = (hex) => {
    const [r, g, b] = hex
      .replace('#', '')
      .match(/../g)
      .map((pair) => {
        const channel = parseInt(pair, 16) / 255;
        return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  const contrast = (a, b) => {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (high + 0.05) / (low + 0.05);
  };

  it('meets WCAG AA for every text colour on every surface', () => {
    const text = { ink: '#3a2b24', soft: '#5f4a3f', muted: '#74604f' };
    const surfaces = { surface: '#fffaf4', sunk: '#f9f0e5', page: '#f7ede2' };

    for (const [name, colour] of Object.entries(text)) {
      for (const [surfaceName, surface] of Object.entries(surfaces)) {
        expect(contrast(colour, surface), `${name} on ${surfaceName}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('keeps band labels readable against their own fill', () => {
    const bands = { coral: '#f28482', honey: '#f6bd60', rose: '#f5cac3', teal: '#84a59d' };
    for (const [name, fill] of Object.entries(bands)) {
      expect(contrast('#37271f', fill), name).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast('#f4f7f5', '#48706a')).toBeGreaterThanOrEqual(4.5);
  });

  it('never sets text below 12px', () => {
    const markup = document.documentElement.outerHTML;
    const belowTwelve = markup.match(/text-\[0\.[0-6]\d*rem\]|text-\[1[01]px\]/g);
    expect(belowTwelve).toBeNull();
  });

  it('describes mock services as demo data rather than live', () => {
    const markup = document.documentElement.outerHTML;
    expect(markup).not.toMatch(/live conditions/i);
    expect(markup).toMatch(/mock services/i);
  });
});

describe('the timeline points at what moved', () => {
  it('badges only the component that changed and flashes it', () => {
    const state = buildState(new Date('2026-09-01T06:00:00'));
    renderTimeline(state);

    const worse = buildState(new Date('2026-09-01T06:00:00'), {
      conditions: { trafficDelay: 29 },
    });
    worse.ui.deltas = { traffic: 11 };
    renderTimeline(worse);

    const traffic = document.querySelector('[data-key="traffic"]');
    expect(traffic.querySelector('.band-delta').textContent).toBe('+11');
    expect(traffic.classList.contains('band--changed')).toBe(true);
    expect(document.querySelector('[data-key="walk"] .band-delta')).toBeNull();
  });

  it('clears the badge once the change is old news', () => {
    const state = buildState(new Date('2026-09-01T06:00:00'));
    state.ui.deltas = { traffic: 11 };
    renderTimeline(state);
    expect(document.querySelector('[data-key="traffic"] .band-delta')).not.toBeNull();

    state.ui.deltas = {};
    renderTimeline(state);
    expect(document.querySelector('[data-key="traffic"] .band-delta')).toBeNull();
  });

  it('shows a fall in minutes as a negative badge', () => {
    const state = buildState(new Date('2026-09-01T06:00:00'));
    state.ui.deltas = { weather: -4 };
    renderTimeline(state);
    expect(document.querySelector('[data-key="weather"] .band-delta').textContent).toBe('−4');
  });
});
