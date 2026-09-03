/**
 * hero.js
 * The decision panel and the backwards timeline beside it.
 *
 * The panel keeps two arrival numbers apart on purpose:
 *   recommendedArrivalStr — where you land if you left when you were told to
 *   leaveNowArrivalStr    — where you land if you walk out of the door now
 * Before the recommended departure these are the same number. After it they
 * are not, and saying so is the entire point of the late state.
 */

import { byId, esc } from './dom.js';
import { icon } from './icons.js';
import { buildLedger } from '../core/commuteEngine.js';
import { componentsFor, modeLabel } from '../core/copy.js';
import {
  formatCountdown,
  formatDayLabel,
  formatDuration,
  formatMinutesLong,
  minutesBetween,
} from '../core/time.js';

const STATUS = {
  plenty_time: { label: 'Plenty of time', chip: 'chip--teal' },
  get_ready: { label: 'Start wrapping up', chip: 'chip--honey' },
  leave_now: { label: 'Leave now', chip: 'chip--teal' },
  running_late: { label: 'Behind schedule', chip: 'chip--coral' },
  missed: { label: 'Already started', chip: 'chip--rose' },
};

const reduceMotion = () =>
  globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/* ------------------------------------------------------------------ */
/* decision panel                                                      */
/* ------------------------------------------------------------------ */

function clockMarkup(timeStr) {
  const [clock, meridiem = ''] = String(timeStr).split(' ');
  return `${esc(clock)}<span class="clock-meridiem">${esc(meridiem)}</span>`;
}

function arrivalMath(state) {
  const { result, trip } = state;
  const words = componentsFor(trip.mode);

  if (result.status === 'missed') {
    const lateBy = Math.abs(minutesBetween(result.appointmentAt, new Date()));
    return `
      <div class="row">
        <span>This meeting started ${esc(formatMinutesLong(lateBy))} ago.</span>
      </div>
      <p class="card-note">Pick another meeting, or reschedule this one to a time you can still make.</p>`;
  }

  if (result.isBehindSchedule) {
    const margin = result.marginMinutes;
    return `
      <div class="flex flex-col gap-1.5">
        <div class="row">
          <span class="min-w-0">Recommended arrival<span class="block text-ink-muted">had you left at ${esc(result.recommendedDepartureStr)}</span></span>
          <strong class="tabular-nums">${esc(result.recommendedArrivalStr)}</strong>
        </div>
        <div class="row" style="background: color-mix(in srgb, var(--color-coral) 18%, var(--surface-sunk))">
          <span class="min-w-0">If you leave now<span class="block text-ink-muted">${esc(result.leaveNowRangeStr)}</span></span>
          <strong class="tabular-nums">${esc(result.leaveNowArrivalStr)}</strong>
        </div>
      </div>
      <p class="text-sm">
        You're <strong>${esc(formatMinutesLong(result.minutesLate))}</strong> behind your ideal departure.
        ${
          margin >= 0
            ? `Leave now and you still have about <strong>${esc(formatMinutesLong(margin))}</strong> of margin before ${esc(result.appointmentStr)}.`
            : `Leaving now still puts you about <strong>${esc(formatMinutesLong(margin))}</strong> late.`
        }
      </p>`;
  }

  return `
    <div class="row">
      <span class="min-w-0">Arrive between<span class="block text-ink-muted">best guess ${esc(result.recommendedArrivalStr)}</span></span>
      <strong class="tabular-nums">${esc(result.arrivalRangeStr)}</strong>
    </div>
    <p class="text-sm">
      ${
        result.status === 'leave_now'
          ? `Head out now by ${esc(words.noun)} and you'll be seated with about <strong>${esc(formatMinutesLong(result.marginMinutes))}</strong> to spare.`
          : `You have <strong>${esc(formatMinutesLong(result.minutesUntilDeparture))}</strong> before you need to move. That leaves about ${esc(formatMinutesLong(result.marginMinutes))} of margin on arrival.`
      }
    </p>`;
}

function journeyPanel(state) {
  const { result, trip, conditions } = state;
  const margin = result.marginMinutes;

  return `
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="chip chip--teal">${icon('navigation')} On your way</span>
      <span class="chip">${esc(modeLabel(trip.mode))} · ${esc(conditions.trafficSeverity)}</span>
    </div>

    <div>
      <p class="field-label">Arriving at</p>
      <p id="journey-eta" class="clock clock--hero">${clockMarkup(result.leaveNowArrivalStr)}</p>
    </div>

    <div class="grid grid-cols-2 gap-2">
      <div class="row"><span>${esc(trip.title)}</span><strong class="tabular-nums">${esc(result.appointmentStr)}</strong></div>
      <div class="row"><span>Margin</span><strong class="tabular-nums ${margin < 0 ? 'text-bad' : ''}">${margin >= 0 ? esc(formatMinutesLong(margin)) : `${esc(formatMinutesLong(margin))} late`}</strong></div>
    </div>

    <p class="card-note">
      Conditions are re-checked automatically. Next check in
      <strong id="journey-check" class="tabular-nums">2:00</strong>.
    </p>

    <div class="flex flex-wrap gap-2">
      <button type="button" class="btn btn--primary flex-1" data-action="end-journey">
        ${icon('flag')} End journey
      </button>
      <button type="button" class="btn btn--quiet" data-action="refresh">
        ${icon('refresh-cw')} Check now
      </button>
    </div>`;
}

export function renderHero(state) {
  const host = byId('hero-decision');
  const hero = byId('hero');
  if (!host || !state.result) return;

  const { result, trip } = state;
  const status = STATUS[result.status] || STATUS.get_ready;

  hero.className = `card hero gap-0 p-0 accent-${result.status}`;
  hero.classList.toggle('is-urgent', result.status === 'leave_now' && !state.ui.journeyStarted);

  if (state.ui.journeyStarted) {
    host.innerHTML = journeyPanel(state);
    return;
  }

  const dayLabel = formatDayLabel(trip.appointmentDate, new Date());

  host.innerHTML = `
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div class="min-w-0">
        <p class="truncate text-sm font-semibold">${esc(trip.title)}</p>
        <p class="card-note truncate">
          ${esc(dayLabel)} at ${esc(result.appointmentStr)} · ${esc(trip.destinationLabel)} · ${esc(modeLabel(trip.mode))}
        </p>
      </div>
      <span class="chip ${status.chip}">${esc(status.label)}</span>
    </div>

    <div class="flex flex-wrap items-end justify-between gap-3 border-y border-line py-4">
      <div class="min-w-0">
        <p class="field-label">${result.status === 'missed' ? 'You should have left at' : 'Leave at'}</p>
        <p id="hero-clock" class="clock clock--hero" data-value="${esc(result.recommendedDepartureStr)}">
          ${clockMarkup(result.recommendedDepartureStr)}
        </p>
      </div>
      <div class="row flex-none gap-3">
        ${icon('timer', '1.25rem')}
        <span>
          <span id="countdown-value" class="block text-lg font-semibold tabular-nums">--:--</span>
          <span id="countdown-label" class="block text-xs font-semibold text-ink-muted">Until you leave</span>
        </span>
      </div>
    </div>

    <div class="flex flex-col gap-2">${arrivalMath(state)}</div>

    <div class="mt-auto flex flex-wrap gap-2 pt-1">
      <button type="button" class="btn btn--primary flex-1" data-action="start-journey"
        ${result.status === 'missed' ? 'disabled style="opacity:.5;cursor:not-allowed"' : ''}>
        ${icon('play')} Start journey
      </button>
      <button type="button" class="btn btn--quiet" data-action="snooze">Give me 5 more minutes</button>
      <button type="button" class="btn btn--quiet" data-action="reschedule">Reschedule</button>
    </div>`;

  animateClock(byId('hero-clock'), result.departureAt);
}

/* ------------------------------------------------------------------ */
/* the big number, tweened when the recommendation moves               */
/* ------------------------------------------------------------------ */

let lastMinutes = null;
let frame = null;

function minutesOfDay(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function formatMinutesOfDay(total) {
  const wrapped = ((Math.round(total) % 1440) + 1440) % 1440;
  const hours24 = Math.floor(wrapped / 60);
  const minutes = wrapped % 60;
  const meridiem = hours24 >= 12 ? 'PM' : 'AM';
  const hours = hours24 % 12 || 12;
  return `${hours}:${String(minutes).padStart(2, '0')} ${meridiem}`;
}

/** Rolls from the previous departure to the new one so a change is impossible to miss. */
function animateClock(element, departureAt) {
  if (!element) return;
  const target = minutesOfDay(departureAt);

  if (lastMinutes === null || reduceMotion() || Math.abs(target - lastMinutes) > 180) {
    lastMinutes = target;
    return;
  }
  if (lastMinutes === target) return;

  const from = lastMinutes;
  const start = performance.now();
  const duration = 520;
  cancelAnimationFrame(frame);

  const step = (time) => {
    const progress = Math.min(1, (time - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.innerHTML = clockMarkup(formatMinutesOfDay(from + (target - from) * eased));
    if (progress < 1) frame = requestAnimationFrame(step);
    else lastMinutes = target;
  };
  frame = requestAnimationFrame(step);
}

/* ------------------------------------------------------------------ */
/* per-second updates                                                  */
/* ------------------------------------------------------------------ */

export function renderTick(state, now = new Date()) {
  const { result, ui } = state;
  if (!result) return;

  if (ui.journeyStarted) {
    const check = byId('journey-check');
    if (check && ui.journeyCheckAt) {
      const seconds = Math.max(0, Math.round((ui.journeyCheckAt - now.getTime()) / 1000));
      check.textContent = formatDuration(seconds);
    }
    return;
  }

  const value = byId('countdown-value');
  const label = byId('countdown-label');
  if (!value) return;

  const seconds = Math.floor((result.departureAt.getTime() - now.getTime()) / 1000);
  value.textContent = formatCountdown(seconds);
  value.className = `block text-lg font-semibold tabular-nums ${
    seconds <= 0 ? 'text-bad' : seconds < 300 ? 'text-warn' : ''
  }`;
  if (label) label.textContent = seconds < 0 ? 'Past your departure' : 'Until you leave';
}

/* ------------------------------------------------------------------ */
/* the timeline                                                        */
/* ------------------------------------------------------------------ */

export function renderTimeline(state) {
  const host = byId('hero-timeline');
  if (!host || !state.result) return;

  const { result, trip, conditions, preferences } = state;
  const steps = buildLedger({ trip, conditions, preferences, result });
  const deltas = state.ui.deltas || {};
  const comfortable = result.buffer > 0 ? steps[0]?.atStr : result.appointmentStr;

  const header = `
    <div class="timeline-anchor">
      <span class="min-w-0 truncate">${esc(trip.title)} starts</span>
      <strong>${esc(result.appointmentStr)}</strong>
    </div>
    <p class="card-note -mt-1">Seated and settled by ${esc(comfortable)}, working backwards.</p>`;

  const footer = `
    <div class="timeline-anchor pt-1">
      <span class="min-w-0 truncate">Walk out of the door</span>
      <strong>${esc(result.recommendedDepartureStr)}</strong>
    </div>`;

  const track = byId('timeline-track');
  const keys = steps.map((step) => step.key).join(',');

  // Rebuild only when the set of components changes; otherwise resize in place
  // so the bands animate instead of flashing.
  if (!track || track.dataset.keys !== keys) {
    host.innerHTML = `${header}<ol id="timeline-track" class="timeline-track" data-keys="${esc(keys)}">${steps
      .map((step) => bandMarkup(step, deltas[step.key]))
      .join('')}</ol>${footer}`;
    return;
  }

  host.querySelector('.timeline-anchor strong').textContent = result.appointmentStr;
  host.querySelector('.card-note').textContent =
    `Seated and settled by ${comfortable}, working backwards.`;
  host.querySelectorAll('.timeline-anchor')[1].querySelector('strong').textContent =
    result.recommendedDepartureStr;

  steps.forEach((step) => {
    const band = track.querySelector(`[data-key="${step.key}"]`);
    if (!band) return;
    band.style.flexGrow = String(step.minutes);
    band.querySelector('.band-minutes').textContent = `${step.minutes}m`;
    band.setAttribute(
      'aria-label',
      `${step.label}, ${step.minutes} minutes, reached at ${step.atStr}`,
    );
    markDelta(band, deltas[step.key]);
  });
}

function bandMarkup(step, delta) {
  return `
    <li class="band band--${esc(step.tone)}${delta ? ' band--changed' : ''}" data-key="${esc(step.key)}"
        style="flex-grow:${step.minutes}"
        aria-label="${esc(step.label)}, ${step.minutes} minutes, reached at ${esc(step.atStr)}">
      <span class="band-name">${esc(step.label)}</span>
      <span class="flex items-center">
        <span class="band-minutes">${step.minutes}m</span>
        ${delta ? `<span class="band-delta">${deltaLabel(delta)}</span>` : ''}
      </span>
    </li>`;
}

function deltaLabel(delta) {
  return `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`;
}

/** Adds or removes the badge in place so the band can animate rather than redraw. */
function markDelta(band, delta) {
  const holder = band.querySelector('.band-minutes')?.parentElement;
  if (!holder) return;
  const existing = holder.querySelector('.band-delta');

  if (!delta) {
    existing?.remove();
    band.classList.remove('band--changed');
    return;
  }

  if (existing) existing.textContent = deltaLabel(delta);
  else
    holder.insertAdjacentHTML('beforeend', `<span class="band-delta">${deltaLabel(delta)}</span>`);

  band.classList.remove('band--changed');
  void band.offsetWidth; // restart the flash
  band.classList.add('band--changed');
}
