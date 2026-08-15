/*
 * The installable, offline side of the site.
 *
 * There is no build step here, so the service worker's list of files to cache
 * is written out by hand — and a hand-written manifest of every file in a
 * project is the definition of something that rots. Add a generator, forget the
 * list, and the site still works perfectly in every test and in the browser,
 * right up until someone opens it on a train and one module 404s.
 *
 * So this walks the repository and insists the two agree: everything shipped is
 * cached, everything cached exists. The rest checks the things a browser
 * silently ignores rather than reporting — a manifest with an absolute
 * start_url works fine at the domain root and breaks under a project subpath,
 * and nothing tells you but the install button never appearing.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const PAGES = ['index.html', 'studio.html', 'color.html', 'gallery.html', 'saved.html', '404.html'];

// Not part of what a browser loads: tooling, docs and the worker itself, which
// cannot be one of its own cached assets.
const NOT_SHIPPED = new Set([
  'sw.js', 'package.json', 'README.md', 'LICENSE', '.gitignore', '.nojekyll',
]);
const SKIP_DIRS = new Set(['.git', '.github', 'tests', 'node_modules']);

/** Every file a browser could actually be asked to load. */
function shippedFiles(dir = ROOT, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(name)) shippedFiles(full, out);
      continue;
    }
    if (NOT_SHIPPED.has(name) || name.startsWith('.')) continue;
    out.push(relative(ROOT, full).split(sep).join('/'));
  }
  return out;
}

export default function run() {
  const failures = [];
  const table = {};

  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  const manifestRaw = readFileSync(join(ROOT, 'manifest.webmanifest'), 'utf8');

  /* -- 1. the precache list matches what is actually shipped -------------- */
  {
    const block = sw.match(/const ASSETS = \[([\s\S]*?)\];/);
    if (!block) {
      failures.push('sw.js: could not find the ASSETS list at all');
    } else {
      const listed = [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
      const cached = new Set(listed);
      const shipped = shippedFiles();

      const missing = shipped.filter((f) => !cached.has(f));
      const phantom = listed.filter((f) => f !== './' && !existsSync(join(ROOT, f)));
      const dupes = listed.filter((f, i) => listed.indexOf(f) !== i);

      table['precache'] = {
        listed: listed.length,
        shipped: shipped.length,
        missing: missing.length,
        phantom: phantom.length,
      };

      if (missing.length) {
        failures.push(
          `sw.js does not cache ${missing.length} shipped file(s), so they would 404 offline: `
          + `${missing.join(', ')}`,
        );
      }
      if (phantom.length) {
        failures.push(
          `sw.js caches ${phantom.length} file(s) that do not exist: ${phantom.join(', ')}. `
          + `cache.addAll rejects as a whole, so the worker would never install.`,
        );
      }
      if (dupes.length) failures.push(`sw.js lists duplicates: ${[...new Set(dupes)].join(', ')}`);
      if (!cached.has('./')) {
        failures.push("sw.js does not cache './' — the site's own root URL would miss offline");
      }
    }
  }

  /* -- 2. nothing in the worker assumes it lives at the domain root ------- */
  {
    const absolute = [...sw.matchAll(/'(\/[^']*)'/g)].map((m) => m[1]);
    table['worker paths'] = { 'root-absolute': absolute.length };
    if (absolute.length) {
      failures.push(
        `sw.js uses root-absolute path(s) ${absolute.join(', ')}, which break under a project `
        + `subpath like user.github.io/SuperPrint/. Paths must be relative to the worker.`,
      );
    }
  }

  /* -- 3. the manifest is valid and portable ------------------------------ */
  {
    let manifest = null;
    try {
      manifest = JSON.parse(manifestRaw);
    } catch (err) {
      failures.push(`manifest.webmanifest is not valid JSON: ${err.message}`);
    }

    if (manifest) {
      for (const field of ['name', 'short_name', 'start_url', 'display', 'icons', 'theme_color', 'background_color']) {
        if (manifest[field] === undefined) failures.push(`manifest.webmanifest has no "${field}"`);
      }

      for (const field of ['start_url', 'scope', 'id']) {
        const v = manifest[field];
        if (typeof v === 'string' && (v.startsWith('/') || /^https?:/.test(v))) {
          failures.push(
            `manifest "${field}" is "${v}" — an absolute value only works at a domain root, and `
            + `this site also has to run from a project subpath.`,
          );
        }
      }

      const icons = manifest.icons || [];
      const missing = icons.map((i) => i.src).filter((src) => !existsSync(join(ROOT, src)));
      if (missing.length) failures.push(`manifest lists missing icon(s): ${missing.join(', ')}`);

      const maskable = icons.filter((i) => (i.purpose || '').includes('maskable'));
      const big = icons.filter((i) => /512/.test(i.sizes || '') || i.sizes === 'any');
      table['manifest'] = {
        icons: icons.length,
        maskable: maskable.length,
        display: manifest.display,
        shortcuts: (manifest.shortcuts || []).length,
      };

      if (!maskable.length) {
        failures.push('manifest has no maskable icon, so Android will letterbox the icon in a white blob');
      }
      if (!big.length) failures.push('manifest has no icon of 512px or larger for the install prompt');

      for (const s of manifest.shortcuts || []) {
        if (!existsSync(join(ROOT, s.url))) failures.push(`manifest shortcut points at a missing page: ${s.url}`);
      }
    }
  }

  /* -- 4. every page is installable and themed --------------------------- */
  {
    const rows = {};
    for (const page of PAGES) {
      const html = readFileSync(join(ROOT, page), 'utf8');
      const hasManifest = /rel="manifest"/.test(html);
      const themeColors = (html.match(/name="theme-color"/g) || []).length;
      const hasWorker = /assets\/js\/pwa\.js/.test(html);
      const scripted = /assets\/js\/ui\.js/.test(html);

      rows[page] = {
        manifest: String(hasManifest),
        'theme-color': themeColors,
        'registers sw': String(hasWorker),
      };

      if (!hasManifest) failures.push(`${page} does not link the manifest`);
      if (themeColors < 2) {
        failures.push(
          `${page} has ${themeColors} theme-color meta(s); it needs one per colour scheme or the `
          + `browser chrome will clash with the page in one of the two themes.`,
        );
      }
      // 404.html carries no scripts of its own and needs none.
      if (scripted && !hasWorker) failures.push(`${page} loads the app but never registers the service worker`);
      if (/href="\/[^"]/.test(html)) failures.push(`${page} has a root-absolute link, which breaks on a project subpath`);
    }
    console.table(rows);
  }

  console.table(table);
  return failures;
}
