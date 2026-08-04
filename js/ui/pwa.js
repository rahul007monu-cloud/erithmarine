/**
 * pwa.js — Service worker registration and the install prompt.
 */

import { $ } from './dom.js';

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Only over HTTPS or localhost; browsers refuse otherwise and log noise.
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;

  window.addEventListener('load', () => {
    // Registered relative to the page so the worker scope follows the deploy
    // path. On GitHub Pages that is /<repo>/, not the domain root.
    const swUrl = new URL('sw.js', document.baseURI).href;
    navigator.serviceWorker.register(swUrl).catch((error) => {
      console.warn('[pwa] service worker registration failed', error);
    });
  });
}

/**
 * Shows the install button only when the browser actually offers installation,
 * so the UI never advertises something that will not work.
 */
export function mountInstallPrompt() {
  const button = $('#installBtn');
  if (!button) return;

  let deferred = null;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event;
    button.hidden = false;
  });

  button.addEventListener('click', async () => {
    if (!deferred) return;
    button.disabled = true;
    deferred.prompt();
    try {
      await deferred.userChoice;
    } finally {
      deferred = null;
      button.hidden = true;
      button.disabled = false;
    }
  });

  window.addEventListener('appinstalled', () => {
    button.hidden = true;
  });
}
