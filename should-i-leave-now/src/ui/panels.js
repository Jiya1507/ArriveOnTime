/**
 * panels.js
 * Everything below the hero. Each function reads state and writes one region.
 */

import { byId, esc, setHTML, setText, show } from './dom.js';
import { icon } from './icons.js';
import { buildLedger, buildScenarios } from '../core/commuteEngine.js';
import { componentsFor, destinationNote, modeLabel } from '../core/copy.js';
import { formatMinutesLong } from '../core/time.js';
import { DESTINATIONS } from '../data/demoData.js';

/* ------------------------------------------------------------------ */

export function renderBreakdown(state) {
  const { conditions: c, result, trip } = state;
  const words = componentsFor(trip.mode);

  const items = [
    {
      icon: words.icon,
      label: words.travel.label,
      minutes: c.baseTravelMinutes,
      note: words.travel.detail,
    },
    { icon: 'route', label: words.traffic.label, minutes: c.trafficDelay, note: c.trafficSeverity },
    {
      icon: c.weatherIcon || 'cloud-rain',
      label: words.weather.label,
      minutes: c.weatherDelay,
      note: `${c.weatherCondition}, ${words.weather.detail.toLowerCase()}`,
    },
    {
      icon: words.roadworks.icon,
      label: words.roadworks.label,
      minutes: c.constructionDelay,
      note: words.roadworks.detail,
    },
    {
      icon: words.park.icon,
      label: words.park.label,
      minutes: c.parkingDelay,
      note: c.parkingSource === 'override' ? 'Simulated override' : words.park.detail,
    },
    {
      icon: words.walk.icon,
      label: words.walk.label,
      minutes: c.walkingDelay,
      note: words.walk.detail,
    },
    {
      icon: 'shield-check',
      label: words.buffer.label,
      minutes: result.buffer,
      note: 'How early you like to be',
    },
    {
      icon: 'gauge',
      label: words.forecast.label,
      minutes: result.uncertaintyBuffer,
      note: `Confidence is ${Math.round(c.confidence * 100)}%`,
    },
  ].filter((item) => item.minutes > 0);

  setHTML(
    'breakdown',
    items
      .map(
        (item) => `
      <div class="row">
        <span class="flex min-w-0 items-center gap-2.5">
          <span class="text-ink-muted">${icon(item.icon)}</span>
          <span class="min-w-0">
            <span class="block truncate font-semibold">${esc(item.label)}</span>
            <span class="block truncate text-xs text-ink-muted">${esc(item.note)}</span>
          </span>
        </span>
        <strong class="tabular-nums">${item.minutes} min</strong>
      </div>`,
      )
      .join('') +
      `<div class="flex items-center justify-between px-2.5 pt-2 text-sm font-semibold">
        <span>Total to set aside</span>
        <span class="tabular-nums">${result.totalPlanningTime} min</span>
      </div>`,
  );

  setText(
    'breakdown-note',
    `${formatMinutesLong(result.travelMinutes)} of travel, plus ${result.buffer} min early and ${result.uncertaintyBuffer} min of forecast padding.`,
  );
}

/* ------------------------------------------------------------------ */

export function renderLedger(state) {
  const open = state.ui.ledgerOpen;
  const toggle = byId('btn-ledger');
  if (toggle) {
    toggle.textContent = open ? 'Hide ledger' : 'Backwards ledger';
    toggle.setAttribute('aria-expanded', String(open));
  }
  show('ledger', open);
  if (!open) return;

  const steps = buildLedger({
    trip: state.trip,
    conditions: state.conditions,
    preferences: state.preferences,
    result: state.result,
  });

  setHTML(
    'ledger',
    `<ol class="flex flex-col gap-1.5 border-t border-line pt-3">
      ${steps
        .map(
          (step) => `
        <li class="flex items-baseline justify-between gap-3 text-xs">
          <span class="min-w-0 truncate text-ink-soft">${esc(step.label)}
            <span class="text-ink-muted">(${step.minutes} min)</span>
          </span>
          <strong class="tabular-nums">${esc(step.atStr)}</strong>
        </li>`,
        )
        .join('')}
    </ol>
    <p class="card-note mt-2">Start at the appointment, subtract each row, and the last line is when you need to be moving.</p>`,
  );
}

/* ------------------------------------------------------------------ */

const BUFFER_COPY = {
  0: 'No padding at all. You arrive exactly as it starts.',
  5: 'Enough to park and walk in, nothing more.',
  10: 'Park, walk in, and catch your breath.',
  15: 'Park, walk in, sit down, glance at your notes.',
  20: 'Room to get a coffee before anyone else shows up.',
  25: 'You will almost certainly be the first one there.',
  30: 'A generous cushion for whatever the road does.',
};

export function renderBuffer(state) {
  const preferred = Number(state.preferences.preferredBuffer);
  const slider = byId('buffer-slider');
  if (slider && Number(slider.value) !== preferred) slider.value = String(preferred);

  setText('buffer-value', preferred === 0 ? 'Just in time' : `${preferred} min early`);
  setText('buffer-explainer', BUFFER_COPY[preferred] || BUFFER_COPY[15]);

  const snoozed = Number(state.preferences.snoozeMinutes) || 0;
  show('snooze-note', snoozed > 0);
  if (snoozed > 0) {
    setText(
      'snooze-note',
      `You've borrowed ${snoozed} min from your buffer. Departure moved later by the same amount.`,
    );
  }
}

/* ------------------------------------------------------------------ */

export function renderScenarios(state, now = new Date()) {
  const scenarios = buildScenarios({
    conditions: state.conditions,
    preferences: state.preferences,
    result: state.result,
    now,
  });

  setHTML(
    'scenarios',
    scenarios
      .map((scenario) => {
        // For a late option the tag already reads "5 min late", so printing the
        // spare-time line underneath would just say it twice.
        const spare =
          scenario.minutesEarly >= 0
            ? `${scenario.minutesEarly} min spare`
            : `${Math.abs(scenario.minutesEarly)} min late`;

        return `
      <div class="scenario" data-tone="${esc(scenario.tone)}" data-past="${scenario.isPast}">
        <p class="text-xs font-semibold text-ink-muted">Leave ${esc(scenario.leaveStr)}</p>
        <p class="my-1 font-semibold tabular-nums">${esc(scenario.arriveStr)}</p>
        <p class="text-xs font-semibold">${esc(scenario.tag)}</p>
        ${spare === scenario.tag ? '' : `<p class="text-xs text-ink-muted">${esc(spare)}</p>`}
      </div>`;
      })
      .join(''),
  );
}

/* ------------------------------------------------------------------ */

export function renderArrival(state) {
  const { result, conditions } = state;
  const confidence = Math.round(conditions.confidence * 100);

  // The window is symmetric, and the copy says exactly that. If the model ever
  // changes shape, this sentence has to change with it.
  setHTML(
    'arrival-body',
    `<div>
      <p class="field-label">If you leave at ${esc(result.recommendedDepartureStr)}</p>
      <p class="clock text-2xl">${esc(result.arrivalRangeStr)}</p>
      <p class="card-note">Best guess ${esc(result.recommendedArrivalStr)} — a ${result.arrivalWindowMinutes}-minute window, ±${result.spreadMinutes} min at ${confidence}% confidence.</p>
    </div>
    ${windowBar(result)}
    ${
      result.isBehindSchedule && result.status !== 'missed'
        ? `<div class="row" style="background: color-mix(in srgb, var(--color-coral) 18%, var(--surface-sunk))">
             <span class="min-w-0">Leaving now instead</span>
             <strong class="tabular-nums">${esc(result.leaveNowRangeStr)}</strong>
           </div>`
        : ''
    }`,
  );

  setText('confidence-value', `${confidence}%`);
  setText(
    'confidence-note',
    confidence >= 85
      ? 'Estimates are steady'
      : confidence >= 70
        ? 'Estimates may shift'
        : 'Conditions are volatile',
  );
  const confidenceEl = byId('confidence-value');
  if (confidenceEl) {
    confidenceEl.className = `text-lg font-semibold tabular-nums ${
      confidence >= 85 ? 'text-ok' : confidence >= 70 ? 'text-warn' : 'text-bad'
    }`;
  }

  setText('risk-value', `${result.riskScore}/100`);
  setText(
    'risk-note',
    result.riskScore < 30
      ? 'Little can go wrong'
      : result.riskScore < 60
        ? 'A few things could slip'
        : 'Delays are stacking up',
  );
  const riskEl = byId('risk-value');
  if (riskEl) {
    riskEl.className = `text-lg font-semibold tabular-nums ${
      result.riskScore < 30 ? 'text-ok' : result.riskScore < 60 ? 'text-warn' : 'text-bad'
    }`;
  }
}

/** A bar whose shaded middle is the arrival window, drawn to the same scale as the copy. */
function windowBar(result) {
  const total = Math.max(result.arrivalWindowMinutes + 10, 20);
  const width = Math.round((result.arrivalWindowMinutes / total) * 100);
  const side = (100 - width) / 2;
  return `
    <div class="flex h-2 w-full overflow-hidden rounded-full bg-sunk" role="presentation">
      <span style="width:${side}%"></span>
      <span class="bg-teal" style="width:${width}%"></span>
      <span style="width:${side}%"></span>
    </div>`;
}

/* ------------------------------------------------------------------ */

export function renderTrip(state) {
  const destination = DESTINATIONS[state.trip.destination];
  setText('trip-distance', destination ? `${destination.distanceKm} km` : '—');
  setText('trip-note', destinationNote(destination, state.trip.mode) || '');

  const map = {
    'input-destination': state.trip.destination,
    'input-date': state.trip.appointmentDate,
    'input-time': state.trip.appointmentTime,
    'input-mode': state.trip.mode,
  };
  for (const [id, value] of Object.entries(map)) {
    const field = byId(id);
    if (field && field.value !== value) field.value = value;
  }
}

export function renderWeatherChip(state) {
  const { conditions, trip } = state;
  const chip = byId('weather-chip');
  if (!chip) return;
  chip.innerHTML = `${icon(conditions.weatherIcon || 'cloud-rain')}
    <span>${conditions.weatherTemp}°C · ${esc(conditions.weatherCondition)}${
      conditions.weatherDelay > 0
        ? ` · +${conditions.weatherDelay}m by ${esc(modeLabel(trip.mode).toLowerCase())}`
        : ''
    }</span>`;
}
