/**
 * icons.js
 * Only the icons this app actually uses are imported, so the bundle carries a
 * couple of kilobytes of SVG rather than the whole Lucide set. Nothing here
 * scans the document at runtime: `icon()` returns markup, `mountIcons()` fills
 * any `[data-icon]` placeholders that came from static HTML.
 */

import {
  ArrowLeftRight,
  Bike,
  Briefcase,
  CalendarClock,
  Car,
  CircleAlert,
  CircleCheck,
  Clock,
  CloudLightning,
  CloudRain,
  Construction,
  Flag,
  Footprints,
  Gauge,
  Handshake,
  Info,
  MapPin,
  Moon,
  Navigation,
  Pencil,
  Plane,
  Play,
  Plus,
  RefreshCw,
  Route,
  ShieldCheck,
  SquareParking,
  Sun,
  Timer,
  TrainFront,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide';

const ICONS = {
  'arrow-left-right': ArrowLeftRight,
  bike: Bike,
  briefcase: Briefcase,
  'calendar-clock': CalendarClock,
  car: Car,
  'circle-alert': CircleAlert,
  'circle-check': CircleCheck,
  clock: Clock,
  'cloud-lightning': CloudLightning,
  'cloud-rain': CloudRain,
  construction: Construction,
  flag: Flag,
  footprints: Footprints,
  gauge: Gauge,
  handshake: Handshake,
  info: Info,
  'map-pin': MapPin,
  moon: Moon,
  navigation: Navigation,
  pencil: Pencil,
  plane: Plane,
  play: Play,
  plus: Plus,
  'refresh-cw': RefreshCw,
  route: Route,
  'shield-check': ShieldCheck,
  'square-parking': SquareParking,
  sun: Sun,
  timer: Timer,
  'train-front': TrainFront,
  trash: Trash2,
  'triangle-alert': TriangleAlert,
  x: X,
};

const ATTRS = [
  'xmlns="http://www.w3.org/2000/svg"',
  'viewBox="0 0 24 24"',
  'fill="none"',
  'stroke="currentColor"',
  'stroke-width="2"',
  'stroke-linecap="round"',
  'stroke-linejoin="round"',
  'aria-hidden="true"',
  'focusable="false"',
].join(' ');

function serialise(node) {
  return node
    .map(([tag, attrs]) => {
      const pairs = Object.entries(attrs)
        .map(([key, value]) => `${key}="${value}"`)
        .join(' ');
      return `<${tag} ${pairs} />`;
    })
    .join('');
}

/**
 * @param {string} name  key from ICONS
 * @param {string} size  any CSS length, e.g. "1rem"
 * @returns {string} inline SVG markup, safe to drop into a template string
 */
export function icon(name, size = '1rem') {
  const node = ICONS[name] || ICONS.info;
  return `<svg ${ATTRS} width="${size}" height="${size}" class="shrink-0">${serialise(node)}</svg>`;
}

/** Replaces `<span data-icon="clock">` placeholders in server-rendered HTML. */
export function mountIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((element) => {
    const size = element.dataset.iconSize || '1.05rem';
    element.innerHTML = icon(element.dataset.icon, size);
  });
}
