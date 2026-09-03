/**
 * schedule.js (ui)
 * The meeting list and the add / reschedule dialog.
 *
 * Every row shows the thing the list is actually for: not just when the meeting
 * starts, but when you'd have to leave for it — and whether that departure
 * collides with the meeting before it.
 */

import { byId, esc, setHTML, setText } from './dom.js';
import { icon } from './icons.js';
import { createMeeting, meetingStart, reschedule } from '../core/schedule.js';
import { modeLabel } from '../core/copy.js';
import { formatDayLabel, parseDateTime, toDateValue, toTimeValue } from '../core/time.js';
import { DESTINATIONS } from '../data/demoData.js';

const STATUS_CHIP = {
  plenty_time: { label: 'On track', className: 'chip--teal' },
  get_ready: { label: 'Soon', className: 'chip--honey' },
  leave_now: { label: 'Leave now', className: 'chip--teal' },
  running_late: { label: 'Late', className: 'chip--coral' },
  missed: { label: 'Passed', className: '' },
};

/* ------------------------------------------------------------------ */
/* list                                                                */
/* ------------------------------------------------------------------ */

export function renderSchedule(state, now = new Date()) {
  const plan = state.plan || [];

  if (!plan.length) {
    setHTML(
      'schedule',
      `<li class="row justify-center text-center text-ink-soft">
        Nothing scheduled. Add a meeting and this becomes your day.
      </li>`,
    );
    setText('schedule-note', 'No meetings yet.');
    return;
  }

  const upcoming = plan.filter(
    (entry) => !entry.result.appointmentAt || meetingStart(entry.meeting) >= now,
  );
  const nextEntry = upcoming[0];
  setText(
    'schedule-note',
    nextEntry
      ? `${upcoming.length} coming up · next departure ${nextEntry.result.recommendedDepartureStr}`
      : 'Everything today has already started.',
  );

  setHTML(
    'schedule',
    plan
      .map(({ meeting, result, clash }) => {
        const chip = STATUS_CHIP[result.status] || STATUS_CHIP.plenty_time;
        const past = result.status === 'missed';
        const destination = DESTINATIONS[meeting.destination];

        return `
        <li class="meeting-row" data-active="${meeting.id === state.activeMeetingId}" data-past="${past}">
          <button type="button" class="min-w-0 text-left" data-meeting-action="select" data-id="${esc(meeting.id)}">
            <span class="flex min-w-0 items-center gap-2">
              <span class="text-ink-muted">${icon(meeting.icon || 'calendar-clock')}</span>
              <span class="truncate text-sm font-semibold">${esc(meeting.title)}</span>
            </span>
            <span class="mt-0.5 block truncate text-xs text-ink-muted">
              ${esc(formatDayLabel(meeting.date, now))} at ${esc(shortTime(meeting))} ·
              ${esc(destination ? destination.label : meeting.destination)} · ${esc(modeLabel(meeting.mode))}
            </span>
            <span class="mt-1 block text-xs font-semibold">
              ${past ? 'Started without you' : `Leave at ${esc(result.recommendedDepartureStr)}`}
            </span>
            ${
              clash
                ? `<span class="mt-1 flex items-center gap-1 text-xs font-semibold text-bad">
                     ${icon('triangle-alert', '0.85rem')} You'd have to leave before ${esc(clash.title)} starts
                   </span>`
                : ''
            }
          </button>

          <span class="flex flex-col items-end gap-1.5">
            <span class="chip ${chip.className}">${esc(chip.label)}</span>
            <span class="flex gap-1">
              <button type="button" class="btn btn--ghost" data-meeting-action="edit" data-id="${esc(meeting.id)}"
                aria-label="Edit or reschedule ${esc(meeting.title)}">${icon('pencil', '0.9rem')}</button>
              <button type="button" class="btn btn--ghost" data-meeting-action="delete" data-id="${esc(meeting.id)}"
                aria-label="Remove ${esc(meeting.title)}">${icon('trash', '0.9rem')}</button>
            </span>
          </span>
        </li>`;
      })
      .join(''),
  );
}

function shortTime(meeting) {
  const date = meetingStart(meeting);
  const hours = date.getHours() % 12 || 12;
  return `${hours}:${String(date.getMinutes()).padStart(2, '0')} ${date.getHours() >= 12 ? 'PM' : 'AM'}`;
}

/* ------------------------------------------------------------------ */
/* dialog                                                              */
/* ------------------------------------------------------------------ */

let draft = null;
let handlers = {};

export function initMeetingDialog({ onSave, onDelete }) {
  handlers = { onSave, onDelete };
  const dialog = byId('meeting-dialog');
  const form = byId('meeting-form');
  if (!dialog || !form) return;

  byId('btn-close-dialog')?.addEventListener('click', () => dialog.close('cancel'));

  // Quick reschedule chips move the draft rather than the saved meeting, so
  // nothing changes until Save is pressed.
  form.querySelectorAll('[data-shift-minutes], [data-shift-days]').forEach((button) => {
    button.addEventListener('click', () => {
      draft = reschedule(readForm(), {
        minutes: Number(button.dataset.shiftMinutes) || 0,
        days: Number(button.dataset.shiftDays) || 0,
      });
      fillForm(draft);
      updatePreview();
    });
  });

  form.addEventListener('input', updatePreview);
  form.addEventListener('change', updatePreview);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const meeting = readForm();
    if (!meeting.title.trim() || !meeting.date || !meeting.time) return;
    dialog.close('save');
    handlers.onSave?.(meeting);
  });

  byId('btn-delete-meeting')?.addEventListener('click', () => {
    const id = draft?.id;
    dialog.close('delete');
    if (id) handlers.onDelete?.(id);
  });
}

export function openMeetingDialog(meeting, { now = new Date() } = {}) {
  const dialog = byId('meeting-dialog');
  if (!dialog) return;

  const isNew = !meeting;
  draft = meeting
    ? { ...meeting }
    : createMeeting({ date: toDateValue(now), time: nextRoundHour(now) }, now);

  setText('dialog-title', isNew ? 'Add a meeting' : `Reschedule ${meeting.title}`);
  byId('meeting-title').value = isNew ? '' : draft.title;
  byId('btn-delete-meeting')?.classList.toggle('hidden', isNew);

  fillForm(draft);
  updatePreview();
  dialog.showModal();
  byId('meeting-title')?.focus();
}

function nextRoundHour(now) {
  const date = new Date(now.getTime() + 90 * 60_000);
  date.setMinutes(0, 0, 0);
  return toTimeValue(date);
}

function fillForm(meeting) {
  byId('meeting-destination').value = meeting.destination;
  byId('meeting-date').value = meeting.date;
  byId('meeting-time').value = meeting.time;
  byId('meeting-mode').value = meeting.mode;
  byId('meeting-buffer').value = String(meeting.buffer);
}

function readForm() {
  return {
    ...draft,
    title: byId('meeting-title').value,
    destination: byId('meeting-destination').value,
    date: byId('meeting-date').value || draft.date,
    time: byId('meeting-time').value || draft.time,
    mode: byId('meeting-mode').value,
    buffer: Number(byId('meeting-buffer').value),
  };
}

function updatePreview() {
  const meeting = readForm();
  const start = parseDateTime(meeting.date, meeting.time);
  if (Number.isNaN(start.getTime())) return;
  setText(
    'dialog-preview',
    `${formatDayLabel(meeting.date, new Date())} at ${shortTime(meeting)}, arriving ${meeting.buffer} min early by ${modeLabel(meeting.mode).toLowerCase()}.`,
  );
}
