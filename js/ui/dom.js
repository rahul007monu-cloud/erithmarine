/**
 * dom.js — Small DOM helpers. No framework, no dependencies.
 */

import { STRINGS } from '../content.js';

export const $ = (selector, scope = document) => scope.querySelector(selector);
export const $$ = (selector, scope = document) =>
  Array.from(scope.querySelectorAll(selector));

/**
 * Creates an element.
 * @param {string} tag
 * @param {Object} [attrs] `class`, `text`, `html`, `on:<event>`, or any attribute
 * @param {Array} [children]
 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;

    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on:')) node.addEventListener(key.slice(3), value);
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, value);
  }

  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/**
 * Fills every `[data-i18n]` element from the string table.
 * Missing keys are left visible as the key itself, which makes gaps obvious
 * during review rather than silently rendering an empty box.
 */
export function applyStrings(scope = document) {
  for (const node of $$('[data-i18n]', scope)) {
    const key = node.dataset.i18n;
    if (Object.prototype.hasOwnProperty.call(STRINGS, key)) {
      node.textContent = STRINGS[key];
    } else {
      node.textContent = key;
      // Surface the omission in the console so it is caught before launch.
      console.warn(`[content] missing string: ${key}`);
    }
  }
}

/** Escapes text for safe interpolation into innerHTML. */
export function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch]);
}

/** Debounces a function by `wait` milliseconds. */
export function debounce(fn, wait = 120) {
  let timer = 0;
  return function debounced(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}

/** True when the visitor has asked for reduced motion. */
export const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
