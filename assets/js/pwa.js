/*
 * The installable, offline half of the site.
 *
 * Three jobs, none of which change what the app does — only whether it is there
 * when the network is not:
 *
 *   - register the service worker, so the whole site is cached;
 *   - offer to install, when the browser says it can;
 *   - say so when a new version has been fetched, and let the reader take it.
 *
 * All of it degrades to nothing. A browser without service workers, or a page
 * opened over file://, simply gets the site as it always was.
 */

import { toast } from './ui.js';

/* -------------------------------------------------------------- install -- */

/**
 * Chromium fires `beforeinstallprompt` when it decides the site is
 * installable, and the event is the only way to raise the prompt later — so it
 * is kept, and a button appears in the header until it is used or the app is
 * installed. Safari and Firefox never fire it and simply never show a button;
 * on iOS installing is a manual Share → Add to Home Screen, which no API can
 * trigger.
 */
function wireInstall() {
  let deferred = null;
  let button = null;

  const remove = () => {
    if (button) button.remove();
    button = null;
    deferred = null;
  };

  window.addEventListener('beforeinstallprompt', (event) => {
    // Keep the browser's own banner off; the header button replaces it.
    event.preventDefault();
    deferred = event;
    if (button) return;

    const actions = document.querySelector('.nav-actions');
    if (!actions) return;

    button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-outline btn-sm install-btn';
    button.textContent = 'Install';
    button.title = 'Install SuperPrint as an app';
    button.addEventListener('click', async () => {
      if (!deferred) return;
      const prompt = deferred;
      deferred = null;
      prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === 'accepted') remove();
      else button.disabled = true; // asking twice after a "no" is nagging
    });
    // Ahead of the primary call to action, so it never displaces it.
    actions.insertBefore(button, actions.firstChild);
  });

  window.addEventListener('appinstalled', () => {
    remove();
    toast('Installed — SuperPrint works offline now');
  });
}

/* --------------------------------------------------------------- update -- */

/** A small bar offering the new version, since the toast is not clickable. */
function offerUpdate(worker) {
  if (document.querySelector('.update-bar')) return;

  const bar = document.createElement('div');
  bar.className = 'update-bar';
  bar.setAttribute('role', 'status');
  bar.innerHTML = '<span>A new version is ready.</span>';

  const accept = document.createElement('button');
  accept.type = 'button';
  accept.className = 'btn btn-sm';
  accept.textContent = 'Reload';
  accept.addEventListener('click', () => {
    accept.disabled = true;
    // The worker steps aside; `controllerchange` below does the reload.
    worker.postMessage('skip-waiting');
  });

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'btn btn-ghost btn-sm';
  dismiss.textContent = 'Later';
  dismiss.setAttribute('aria-label', 'Dismiss update notice');
  dismiss.addEventListener('click', () => bar.remove());

  bar.append(accept, dismiss);
  document.body.appendChild(bar);
  requestAnimationFrame(() => bar.classList.add('show'));
}

/* ------------------------------------------------------------- offline -- */

function wireConnection() {
  // Only on the transition, and only downward: the app keeps working offline,
  // so this is reassurance rather than an error.
  window.addEventListener('offline', () => toast('Offline — you can carry on making pages'));
  window.addEventListener('online', () => toast('Back online'));
}

/* -------------------------------------------------------------- startup -- */

function init() {
  wireInstall();
  wireConnection();

  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;

  window.addEventListener('load', async () => {
    try {
      // `updateViaCache: 'none'` keeps the worker script itself out of the HTTP
      // cache, so an update is noticed on the next visit rather than after
      // GitHub Pages' ten minutes have run out.
      const reg = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });

      // Already waiting from a previous visit.
      if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);

      reg.addEventListener('updatefound', () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          // An existing controller means this is an update rather than the
          // very first install, which deserves no interruption.
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            offerUpdate(installing);
          }
        });
      });
    } catch {
      // An unregistrable worker costs nothing: the site still works online.
    }
  });

  /*
   * Reload when a new worker takes over — but only when one was already in
   * charge. `clients.claim()` also fires this on the very first visit, as the
   * freshly installed worker adopts the open page, and reloading there would
   * bounce the reader for no reason on their way in.
   */
  const wasControlled = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!wasControlled || reloading) return;
    reloading = true;
    location.reload();
  });
}

init();
