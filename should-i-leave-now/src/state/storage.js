/**
 * storage.js
 * Thin wrapper over localStorage that degrades to an in-memory object when
 * storage is unavailable (private browsing, file://, tests).
 */

const KEY = 'should_i_leave_now_v2';

let memory = {};
let usingMemory = false;

function read() {
  if (usingMemory) return memory;
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    usingMemory = true;
    return memory;
  }
}

export function load() {
  const value = read();
  return value && typeof value === 'object' ? value : {};
}

export function save(patch) {
  const next = { ...load(), ...patch };
  memory = next;
  if (usingMemory) return next;
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(next));
  } catch {
    usingMemory = true;
  }
  return next;
}

export function clear() {
  memory = {};
  try {
    globalThis.localStorage?.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
