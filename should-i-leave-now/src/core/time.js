/**
 * time.js
 * Date and duration helpers. Everything here is pure: given the same inputs it
 * returns the same output, and nothing reads the clock unless a `now` is passed.
 */

const MS_PER_MINUTE = 60_000;
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** "8:14 AM" */
export function formatTime(date) {
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const meridiem = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${meridiem}`;
}

/** "10:00" -> "10:00 AM". Accepts the value a native <input type="time"> gives. */
export function to12Hour(timeStr) {
  const [hours, minutes] = String(timeStr).split(':').map(Number);
  const meridiem = hours >= 12 ? 'PM' : 'AM';
  const hour = hours % 12 || 12;
  return `${hour}:${String(minutes || 0).padStart(2, '0')} ${meridiem}`;
}

/** "17m 30s" as "17:30", anything over an hour as "1:36:20". */
export function formatDuration(totalSeconds) {
  const negative = totalSeconds < 0;
  const seconds = Math.abs(Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const body =
    h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return negative ? `-${body}` : body;
}

/**
 * Countdown text. Seconds matter when you're minutes away; they're noise when
 * you're hours away, where "21h 49m" beats "21:48:50" for legibility.
 */
export function formatCountdown(totalSeconds) {
  const negative = totalSeconds < 0;
  const seconds = Math.abs(Math.floor(totalSeconds));
  if (seconds < 3600) return formatDuration(negative ? -seconds : seconds);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${negative ? '-' : ''}${h}h ${String(m).padStart(2, '0')}m`;
}

/** 47 -> "47 minutes", 106 -> "1h 46m". */
export function formatMinutesLong(minutes) {
  const abs = Math.abs(minutes);
  if (abs < 60) return `${abs} minute${abs === 1 ? '' : 's'}`;
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m ? `${h}h ${m}m` : `${h} hour${h > 1 ? 's' : ''}`;
}

/**
 * Builds a local Date from an explicit calendar date and clock time.
 * There is deliberately no "if it already passed, assume tomorrow" fallback:
 * a missed 10:00 meeting is a missed meeting, not tomorrow's meeting.
 *
 * @param {string} dateStr "YYYY-MM-DD"
 * @param {string} timeStr "HH:MM"
 */
export function parseDateTime(dateStr, timeStr) {
  const [year, month, day] = String(dateStr).split('-').map(Number);
  const [hours, minutes] = String(timeStr).split(':').map(Number);
  if (!year || !month || !day) return new Date(NaN);
  return new Date(year, month - 1, day, hours || 0, minutes || 0, 0, 0);
}

/** Date -> "YYYY-MM-DD", the format <input type="date"> expects. */
export function toDateValue(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Date -> "HH:MM", the format <input type="time"> expects. */
export function toTimeValue(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * MS_PER_MINUTE);
}

export function addDays(dateStr, days) {
  const [year, month, day] = String(dateStr).split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return toDateValue(date);
}

export function minutesBetween(from, to) {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_MINUTE);
}

/** Calendar days between two dates, ignoring the time of day. */
export function daysApart(dateStr, now) {
  const [year, month, day] = String(dateStr).split('-').map(Number);
  const target = new Date(year, month - 1, day).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - today) / 86_400_000);
}

/** "Today", "Tomorrow", "Yesterday", otherwise "Mon 7 Sep". */
export function formatDayLabel(dateStr, now = new Date()) {
  const offset = daysApart(dateStr, now);
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  if (offset === -1) return 'Yesterday';
  const [year, month, day] = String(dateStr).split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return `${DAY_NAMES[date.getDay()]} ${day} ${MONTH_NAMES[month - 1]}`;
}

export { MS_PER_MINUTE };
