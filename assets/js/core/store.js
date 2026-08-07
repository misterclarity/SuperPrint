/* Saved designs, kept in localStorage — no accounts, nothing leaves the device. */

import { normalize } from './render.js';

const KEY = 'superprint.saved.v1';

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 200)));
  } catch {
    /* private mode / quota — saving is a nicety, never a hard failure */
  }
  window.dispatchEvent(new CustomEvent('superprint:saved-changed'));
}

export function idOf(params) {
  const p = normalize(params);
  return [p.style, p.seed, p.complexity, p.paper, p.weight, p.frame].join('|');
}

export function list() {
  return read();
}

export function isSaved(params) {
  const id = idOf(params);
  return read().some((d) => idOf(d) === id);
}

export function save(params) {
  const p = normalize(params);
  const list = read().filter((d) => idOf(d) !== idOf(p));
  list.unshift({ ...p, savedAt: Date.now() });
  write(list);
  return true;
}

export function remove(params) {
  const id = idOf(params);
  write(read().filter((d) => idOf(d) !== id));
}

/** @returns true if the design is now saved. */
export function toggle(params) {
  if (isSaved(params)) {
    remove(params);
    return false;
  }
  save(params);
  return true;
}

export function clearAll() {
  write([]);
}
