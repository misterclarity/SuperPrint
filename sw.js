/*
 * Service worker: the whole site, available offline.
 *
 * SuperPrint draws everything in the browser and talks to no server, so there
 * is nothing about it that needs a network beyond fetching the files once.
 * Cache those and it works on a plane, in a waiting room, or on a laptop that
 * has never seen this domain since Tuesday.
 *
 * Every path here is relative to the worker's own location, which is what lets
 * the same files work at a custom domain and under a project subpath like
 * user.github.io/SuperPrint/ without a build step to rewrite them.
 *
 * The strategy is stale-while-revalidate throughout: answer from the cache
 * immediately, then refresh it in the background for next time. For a static
 * site that is the right trade — pages open instantly and offline, and an
 * update lands one visit later. Users are told when that has happened rather
 * than left on an old version indefinitely; see assets/js/pwa.js.
 */

const VERSION = 'v1';
const CACHE = `superprint-${VERSION}`;

/*
 * Everything the site is made of. It is written out by hand because there is no
 * build step to generate it, and kept honest by tests/pwa.test.mjs, which walks
 * the repository and fails if a shipped file is missing from this list or a
 * listed file is missing from disk.
 */
const ASSETS = [
  './',
  '404.html',
  'gallery.html',
  'index.html',
  'manifest.webmanifest',
  'saved.html',
  'studio.html',
  'assets/apple-touch-icon.png',
  'assets/favicon-32.png',
  'assets/favicon.svg',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/icon-maskable-512.png',
  'assets/icon-maskable.svg',
  'assets/css/print.css',
  'assets/css/style.css',
  'assets/js/pwa.js',
  'assets/js/ui.js',
  'assets/js/components/tile.js',
  'assets/js/core/clip.js',
  'assets/js/core/export.js',
  'assets/js/core/layer.js',
  'assets/js/core/path.js',
  'assets/js/core/quality.js',
  'assets/js/core/render.js',
  'assets/js/core/rng.js',
  'assets/js/core/shapes.js',
  'assets/js/core/sketch.js',
  'assets/js/core/store.js',
  'assets/js/core/util.js',
  'assets/js/gen/animals.js',
  'assets/js/gen/bands.js',
  'assets/js/gen/bloomfield.js',
  'assets/js/gen/celtic.js',
  'assets/js/gen/contours.js',
  'assets/js/gen/folkweave.js',
  'assets/js/gen/fractal.js',
  'assets/js/gen/frostfield.js',
  'assets/js/gen/index.js',
  'assets/js/gen/kaleidoscope.js',
  'assets/js/gen/mandala.js',
  'assets/js/gen/stainedglass.js',
  'assets/js/gen/wreath.js',
  'assets/js/pages/gallery.js',
  'assets/js/pages/home.js',
  'assets/js/pages/saved.js',
  'assets/js/pages/studio.js',
];

self.addEventListener('install', (event) => {
  // addAll is all-or-nothing, which is what we want: a half-filled cache would
  // mean a site that loads offline and then breaks halfway down a page.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith('superprint-') && k !== CACHE).map((k) => caches.delete(k)),
    );
    await self.clients.claim();
  })());
});

// The page asks for this once the reader has agreed to take the new version.
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

/**
 * The cache key for a request.
 *
 * Query strings are dropped, because a design's whole recipe lives in the URL:
 * studio.html?style=mandala&seed=amber-thistle-408 is the same document as
 * studio.html, and keying on the full URL would store a fresh copy of the page
 * for every design anybody ever opened.
 */
function keyFor(url) {
  return new Request(url.origin + url.pathname);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = url.search ? keyFor(url) : req;
    const cached = await cache.match(key);

    // `no-cache` revalidates with the server rather than trusting the HTTP
    // cache, which on GitHub Pages holds files for ten minutes; an unchanged
    // file still costs only a 304.
    const fresh = fetch(req, { cache: 'no-cache' })
      .then((res) => {
        if (res && res.ok && res.type === 'basic') cache.put(key, res.clone());
        return res;
      })
      .catch(() => null);

    if (cached) return cached;

    const res = await fresh;
    if (res) return res;

    // Offline and never seen: any page is better than the browser's error, and
    // every page carries the whole app.
    if (req.mode === 'navigate') {
      const shell = await cache.match('index.html');
      if (shell) return shell;
    }
    return Response.error();
  })());
});
