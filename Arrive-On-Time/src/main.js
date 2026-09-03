/**
 * main.js
 * Bootstrap and wiring. This is the only file that owns the clock, the network
 * (such as it is) and the event listeners. It calls the engine and assigns the
 * answer to the store:
 *
 *   state.result = calculateCommute({ trip, conditions, preferences, now });
 *
 * The engine never reaches back in here.
 */

import '@fontsource-variable/inter';
import '@fontsource-variable/bricolage-grotesque';
import './styles.css';

import { state, subscribe, update } from './state/store.js';
import { load, save } from './state/storage.js';
import { calculateCommute } from './core/commuteEngine.js';
import { componentDeltas, describeChange, snapshot } from './core/changes.js';
import {
  createMeeting,
  meetingStart,
  nextMeeting,
  planDay,
  sortMeetings,
  tripFrom,
} from './core/schedule.js';
import { toDateValue } from './core/time.js';
import { DESTINATIONS, seedMeetings } from './data/demoData.js';
import { trafficService } from './services/trafficService.js';
import { weatherService } from './services/weatherService.js';
import { parkingService } from './services/parkingService.js';

import { byId, on } from './ui/dom.js';
import { mountIcons, icon } from './ui/icons.js';
import { renderHero, renderTick, renderTimeline } from './ui/hero.js';
import {
  renderArrival,
  renderBreakdown,
  renderBuffer,
  renderLedger,
  renderScenarios,
  renderTrip,
  renderWeatherChip,
} from './ui/panels.js';
import { initMeetingDialog, openMeetingDialog, renderSchedule } from './ui/schedule.js';
import { hideAlert, showAlert } from './ui/alerts.js';

const JOURNEY_CHECK_MS = 120_000;

/* ------------------------------------------------------------------ */
/* conditions                                                          */
/* ------------------------------------------------------------------ */

/** Pull every mock service for one meeting-shaped trip. Overrides stay optional. */
async function conditionsFor({ destination, mode, appointmentTime }, { jitter = 0 } = {}) {
  const { traffic: severity, weather, parking, confidence } = state.simulation;
  const arriveByHour = parseInt(String(appointmentTime).split(':')[0], 10) || 9;

  const [road, sky, kerb] = await Promise.all([
    trafficService.getTrafficEstimate(state.trip.origin, destination, {
      mode,
      severity,
      arriveByHour,
      jitter,
    }),
    weatherService.getWeather(destination, { condition: weather, mode }),
    parkingService.getParkingEstimate(destination, { mode, difficulty: parking }),
  ]);

  return {
    baseTravelMinutes: road.baseDuration,
    trafficDelay: road.delay,
    trafficSeverity: road.label,
    constructionDelay: road.constructionDelay,
    confidence: confidence ?? road.confidence,
    weatherDelay: sky.impactMinutes,
    weatherTemp: sky.temp,
    weatherCondition: sky.condition,
    weatherIcon: sky.icon,
    parkingDelay: kerb.parkingDelay,
    walkingDelay: kerb.walkingDelay,
    parkingSource: kerb.source,
    note: kerb.note,
  };
}

let deltaTimer = null;

/** The badges are a "what just moved" cue, not a permanent label. */
function scheduleDeltaClear() {
  clearTimeout(deltaTimer);
  deltaTimer = setTimeout(() => update({ ui: { deltas: {} } }), 8000);
}

function setLoading(loading) {
  const host = byId('refresh-icon');
  if (host) host.classList.toggle('animate-spin', loading);
}

/**
 * Refresh the active trip, recompute, work out what moved, then repaint.
 * `announce` is off when the user changed the trip themselves — they don't need
 * telling that picking a different destination changed the departure time.
 */
async function refreshConditions({ announce = true, jitter = 0 } = {}) {
  setLoading(true);
  try {
    const fresh = await conditionsFor(state.trip, { jitter });
    update({ conditions: fresh }, { silent: true });
  } catch (error) {
    console.error('Conditions unavailable:', error);
    showAlert({
      tone: 'warn',
      headline: 'Demo conditions are unavailable.',
      detail: 'Showing the last known estimate.',
    });
  } finally {
    setLoading(false);
  }

  const previous = state.snapshot;
  recalculate();
  const current = snapshot(state.result, state.conditions);
  const change = announce ? describeChange(previous, current) : null;
  const deltas = announce ? componentDeltas(previous, current) : {};
  state.snapshot = current;

  await rebuildPlan();
  update({ ui: { change, deltas } });

  if (change) {
    showAlert({ tone: change.tone, headline: change.headline, detail: change.detail });
  }
  if (Object.keys(deltas).length) scheduleDeltaClear();
}

/* ------------------------------------------------------------------ */
/* engine                                                              */
/* ------------------------------------------------------------------ */

function recalculate(now = new Date()) {
  state.result = calculateCommute({
    trip: state.trip,
    conditions: state.conditions,
    preferences: state.preferences,
    now,
  });
  return state.result;
}

/** One engine run per scheduled meeting, so the list can show real departures. */
async function rebuildPlan(now = new Date()) {
  const entries = await Promise.all(
    state.meetings.map(async (meeting) => [meeting.id, await conditionsFor(tripFrom(meeting))]),
  );
  const byMeeting = new Map(entries);

  state.plan = planDay({
    meetings: state.meetings,
    conditionsFor: (meeting) => byMeeting.get(meeting.id) || state.conditions,
    preferences: state.preferences,
    now,
  });
}

/* ------------------------------------------------------------------ */
/* meetings                                                            */
/* ------------------------------------------------------------------ */

function activeMeeting() {
  return state.meetings.find((meeting) => meeting.id === state.activeMeetingId) || null;
}

/** Point the hero at a meeting. The trip is a projection of it, never the source. */
async function selectMeeting(id, { announce = false } = {}) {
  const meeting = state.meetings.find((item) => item.id === id) || nextMeeting(state.meetings);
  if (!meeting) return;

  state.activeMeetingId = meeting.id;
  state.snapshot = null;

  update(
    {
      trip: tripFrom(meeting, DESTINATIONS[meeting.destination]?.label),
      preferences: { preferredBuffer: meeting.buffer, snoozeMinutes: 0 },
      ui: { journeyStarted: false, journeyCheckAt: null },
    },
    { silent: true },
  );

  persist();
  await refreshConditions({ announce: false });

  if (announce) {
    showAlert({
      tone: 'info',
      headline: `Now showing ${meeting.title}.`,
      detail: `Leave at ${state.result.recommendedDepartureStr}.`,
    });
  }
}

async function saveMeeting(meeting) {
  const existing = state.meetings.findIndex((item) => item.id === meeting.id);
  const previousStart = existing >= 0 ? meetingStart(state.meetings[existing]) : null;
  const clean = createMeeting(meeting);

  if (existing >= 0) state.meetings[existing] = { ...clean, id: meeting.id };
  else state.meetings.push(clean);

  state.meetings = sortMeetings(state.meetings);
  persist();

  const id = existing >= 0 ? meeting.id : clean.id;
  await selectMeeting(id);

  const moved = previousStart && previousStart.getTime() !== meetingStart(clean).getTime();
  showAlert({
    tone: 'good',
    headline: moved
      ? `${clean.title} moved.`
      : existing >= 0
        ? `${clean.title} updated.`
        : `${clean.title} added.`,
    detail: `Leave at ${state.result.recommendedDepartureStr} to arrive ${clean.buffer} min early.`,
  });
}

async function deleteMeeting(id) {
  const removed = state.meetings.find((meeting) => meeting.id === id);
  state.meetings = state.meetings.filter((meeting) => meeting.id !== id);
  persist();

  if (state.activeMeetingId === id) {
    const next = nextMeeting(state.meetings);
    if (next) await selectMeeting(next.id);
    else {
      state.result = null;
      state.plan = [];
    }
  } else {
    await rebuildPlan();
  }

  update({});
  if (removed) {
    showAlert({ tone: 'info', headline: `${removed.title} removed.`, detail: '' });
  }
}

/* ------------------------------------------------------------------ */
/* persistence + theme                                                 */
/* ------------------------------------------------------------------ */

function persist() {
  save({
    meetings: state.meetings,
    activeMeetingId: state.activeMeetingId,
    preferredBuffer: state.preferences.preferredBuffer,
    theme: state.preferences.theme,
    simulation: state.simulation,
  });
}

function applyTheme(theme) {
  const dark = theme === 'dark';
  document.documentElement.classList.toggle('dark', dark);
  state.preferences.theme = dark ? 'dark' : 'light';
  const host = byId('theme-icon');
  if (host) host.innerHTML = icon(dark ? 'sun' : 'moon');
}

/* ------------------------------------------------------------------ */
/* render                                                              */
/* ------------------------------------------------------------------ */

function render() {
  if (!state.result) {
    renderSchedule(state);
    return;
  }
  renderHero(state);
  renderTimeline(state);
  renderTick(state);
  renderBreakdown(state);
  renderLedger(state);
  renderBuffer(state);
  renderScenarios(state);
  renderArrival(state);
  renderTrip(state);
  renderWeatherChip(state);
  renderSchedule(state);
}

/* ------------------------------------------------------------------ */
/* events                                                              */
/* ------------------------------------------------------------------ */

function wire() {
  on('btn-refresh', 'click', () => refreshConditions({ jitter: 3 }));
  on('btn-dismiss', 'click', hideAlert);

  on('btn-theme', 'click', () => {
    applyTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark');
    persist();
  });

  on('btn-sim', 'click', () => {
    const open = !state.ui.simOpen;
    update({ ui: { simOpen: open } }, { silent: true });
    byId('sim-panel')?.classList.toggle('hidden', !open);
    byId('btn-sim')?.setAttribute('aria-expanded', String(open));
  });

  const simFields = {
    'sim-traffic': 'traffic',
    'sim-weather': 'weather',
    'sim-parking': 'parking',
    'sim-confidence': 'confidence',
  };
  for (const [id, key] of Object.entries(simFields)) {
    on(id, 'change', (event) => {
      const raw = event.target.value;
      const value = raw === '' ? null : key === 'confidence' ? Number(raw) : raw;
      update({ simulation: { [key]: value } }, { silent: true });
      persist();
      refreshConditions();
    });
  }

  on('buffer-slider', 'input', (event) => {
    const preferredBuffer = Number(event.target.value);
    update({ preferences: { preferredBuffer, snoozeMinutes: 0 } }, { silent: true });

    const meeting = activeMeeting();
    if (meeting) {
      meeting.buffer = preferredBuffer;
      persist();
    }
    recalculate();
    rebuildPlan().then(() => update({}));
  });

  on('btn-ledger', 'click', () => update({ ui: { ledgerOpen: !state.ui.ledgerOpen } }));

  on('trip-form', 'submit', async (event) => {
    event.preventDefault();
    const meeting = activeMeeting();
    if (!meeting) return;
    await saveMeeting({
      ...meeting,
      destination: byId('input-destination').value,
      date: byId('input-date').value || meeting.date,
      time: byId('input-time').value || meeting.time,
      mode: byId('input-mode').value,
    });
  });

  on('btn-add-meeting', 'click', () => openMeetingDialog(null));

  // Hero actions (the panel is re-rendered, so delegate rather than re-bind).
  byId('hero-decision')?.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;

    if (action === 'start-journey') startJourney();
    if (action === 'end-journey') endJourney();
    if (action === 'refresh') refreshConditions({ jitter: 4 });
    if (action === 'reschedule') openMeetingDialog(activeMeeting());
    if (action === 'snooze') snooze();
  });

  byId('schedule')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-meeting-action]');
    if (!button) return;
    const { meetingAction, id } = button.dataset;
    if (meetingAction === 'select') selectMeeting(id, { announce: true });
    if (meetingAction === 'edit') openMeetingDialog(state.meetings.find((m) => m.id === id));
    if (meetingAction === 'delete') deleteMeeting(id);
  });

  initMeetingDialog({ onSave: saveMeeting, onDelete: deleteMeeting });
}

function snooze() {
  const room = Number(state.preferences.preferredBuffer) - state.preferences.snoozeMinutes;
  if (room < 5) {
    showAlert({
      tone: 'warn',
      headline: 'No buffer left to borrow.',
      detail: 'Leaving any later means arriving late.',
    });
    return;
  }
  state.preferences.snoozeMinutes += 5;
  recalculate();
  update({});
  showAlert({
    tone: 'info',
    headline: 'Five minutes borrowed from your buffer.',
    detail: `New departure ${state.result.recommendedDepartureStr}.`,
  });
}

function startJourney() {
  update({
    ui: { journeyStarted: true, journeyCheckAt: Date.now() + JOURNEY_CHECK_MS },
  });
  showAlert({
    tone: 'good',
    headline: 'On your way.',
    detail: `Arriving around ${state.result.leaveNowArrivalStr}. Conditions are re-checked every two minutes.`,
  });
}

function endJourney() {
  update({ ui: { journeyStarted: false, journeyCheckAt: null } });
  showAlert({ tone: 'info', headline: 'Journey ended.', detail: '' });
}

/* ------------------------------------------------------------------ */
/* clock                                                               */
/* ------------------------------------------------------------------ */

function startClock() {
  let lastStatus = state.result?.status;

  setInterval(async () => {
    const now = new Date();
    renderTick(state, now);

    if (
      state.ui.journeyStarted &&
      state.ui.journeyCheckAt &&
      Date.now() >= state.ui.journeyCheckAt
    ) {
      state.ui.journeyCheckAt = Date.now() + JOURNEY_CHECK_MS;
      await refreshConditions({ jitter: 4 });
      return;
    }

    if (now.getSeconds() !== 0) return;

    recalculate(now);
    update({});

    if (state.result.status !== lastStatus) {
      lastStatus = state.result.status;
      if (lastStatus === 'leave_now') {
        showAlert({
          tone: 'warn',
          headline: 'Time to go.',
          detail: `Leaving now protects your ${state.result.buffer}-minute buffer.`,
        });
      } else if (lastStatus === 'running_late') {
        showAlert({
          tone: 'bad',
          headline: "You're past the ideal departure.",
          detail: `Leaving now puts you at the door around ${state.result.leaveNowArrivalStr}.`,
        });
      }
    }
  }, 1000);
}

/* ------------------------------------------------------------------ */
/* boot                                                                */
/* ------------------------------------------------------------------ */

async function init() {
  const saved = load();
  const now = new Date();

  state.meetings =
    Array.isArray(saved.meetings) && saved.meetings.length
      ? saved.meetings.map((meeting) => createMeeting(meeting, now))
      : seedMeetings(toDateValue, now).map((meeting) => createMeeting(meeting, now));
  state.meetings = sortMeetings(state.meetings);

  if (saved.simulation) Object.assign(state.simulation, saved.simulation);
  if (saved.preferredBuffer !== undefined) {
    state.preferences.preferredBuffer = Number(saved.preferredBuffer);
  }

  applyTheme(
    saved.theme ||
      (globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  );

  for (const [id, key] of Object.entries({
    'sim-traffic': 'traffic',
    'sim-weather': 'weather',
    'sim-parking': 'parking',
    'sim-confidence': 'confidence',
  })) {
    const field = byId(id);
    if (field) field.value = state.simulation[key] ?? '';
  }

  mountIcons();
  wire();
  subscribe(render);

  const active =
    state.meetings.find((meeting) => meeting.id === saved.activeMeetingId) ||
    nextMeeting(state.meetings, now);
  if (active) await selectMeeting(active.id);
  else update({});

  startClock();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
