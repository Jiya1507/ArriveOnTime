/**
 * alerts.js
 * One status bar. It always says what changed and what to do about it, never
 * just "conditions updated".
 */

import { byId, setText } from './dom.js';
import { icon } from './icons.js';

const TONES = {
  info: { background: 'var(--surface-sunk)', icon: 'info' },
  good: {
    background: 'color-mix(in srgb, var(--color-teal) 30%, var(--surface))',
    icon: 'circle-check',
  },
  warn: {
    background: 'color-mix(in srgb, var(--color-honey) 45%, var(--surface))',
    icon: 'triangle-alert',
  },
  bad: {
    background: 'color-mix(in srgb, var(--color-coral) 35%, var(--surface))',
    icon: 'circle-alert',
  },
};

let timer = null;

export function showAlert({ headline, detail = '', tone = 'info', sticky = false }) {
  const bar = byId('alert');
  if (!bar) return;

  const style = TONES[tone] || TONES.info;
  bar.style.background = style.background;
  bar.classList.remove('hidden');

  const iconHost = byId('alert-icon');
  if (iconHost) iconHost.innerHTML = icon(style.icon);

  setText('alert-headline', headline);
  setText('alert-detail', detail);

  clearTimeout(timer);
  if (!sticky) timer = setTimeout(hideAlert, 7000);
}

export function hideAlert() {
  byId('alert')?.classList.add('hidden');
  clearTimeout(timer);
}
