/**
 * dom.js
 * The only place that knows about `document`. Keeps the render modules free of
 * defensive null checks.
 */

export const byId = (id) => document.getElementById(id);

/** Escapes anything user-supplied before it goes near innerHTML. */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function setText(id, value) {
  const element = byId(id);
  if (element) element.textContent = value;
}

export function setHTML(id, markup) {
  const element = byId(id);
  if (element) element.innerHTML = markup;
}

export function show(id, visible) {
  const element = byId(id);
  if (element) element.classList.toggle('hidden', !visible);
}

export function on(id, event, handler) {
  byId(id)?.addEventListener(event, handler);
}
