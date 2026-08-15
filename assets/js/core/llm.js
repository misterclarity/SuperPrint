/*
 * Describing a page in words, using a language model you are running yourself.
 *
 * The rest of this site makes no network calls at all, and that is a promise
 * worth keeping carefully. So: nothing here runs until you have entered the
 * address of your own model, nothing is sent anywhere else, and the address
 * lives in your browser's own storage. There is no hosted service behind this
 * and no key to paste — if the machine on the other end is a laptop on your
 * tailnet, the request never leaves it.
 *
 * What the model actually decides is worth being plain about. It does not draw
 * anything. It reads a description and chooses from the same handful of dials
 * the studio already has — which style, how intricate, what paper, how heavy a
 * pen — and names the seed. The linework is still the generator's, exactly as
 * it would be if you had set those dials by hand. "A calm page for someone with
 * arthritis, for markers" is the kind of request this answers well, because
 * that request really is about the dials.
 *
 * Everything a model says is treated as a suggestion from something unreliable.
 * It is parsed out of whatever prose it arrives wrapped in, mapped onto the
 * vocabulary the site actually has, and then handed to `normalize`, which
 * clamps anything left over. A model that returns nonsense produces a valid
 * page, not an error.
 */

import { PAPERS, WEIGHTS, FRAMES, COMPLEXITY_LABELS, normalize } from './render.js';
import { STYLES } from '../gen/index.js';

/* ------------------------------------------------------------- settings -- */

const KEY = 'superprint.llm.v1';

/** @returns {{url: string, flavour: string, model: string}|null} */
export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? JSON.parse(raw) : null;
    return s && s.url && s.model ? s : null;
  } catch {
    return null;
  }
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ url: s.url, flavour: s.flavour, model: s.model }));
  } catch {
    /* private mode: the setting simply will not persist */
  }
}

export function clearSettings() {
  try { localStorage.removeItem(KEY); } catch { /* nothing to forget */ }
}

/* -------------------------------------------------------------- prompts -- */

/**
 * What the model is allowed to choose from, built from the catalogue itself.
 *
 * Written out rather than hard-coded so that adding a style makes it available
 * to a prompt on the same commit. A list that has to be updated by hand is a
 * list that will describe last month's site.
 */
export function catalogue() {
  return {
    styles: STYLES.map((s) => ({ id: s.id, name: s.name, blurb: s.blurb })),
    papers: Object.values(PAPERS).map((p) => ({ id: p.id, label: p.label, sub: p.sub })),
    weights: Object.values(WEIGHTS).map((w) => ({ id: w.id, label: w.label, sub: w.sub })),
    frames: Object.values(FRAMES).map((f) => f.id),
    complexity: COMPLEXITY_LABELS.map((l, i) => (l ? `${i} = ${l}` : null)).filter(Boolean),
  };
}

export function systemPrompt() {
  const c = catalogue();
  return [
    'You choose settings for a printable coloring page. You do not draw; a generator does that.',
    'Reply with one JSON object and nothing else. No prose, no code fence.',
    '',
    'Keys, all optional except style:',
    '  style       one of the ids below',
    '  complexity  1-5 — ' + c.complexity.join(', '),
    '  paper       one of: ' + c.papers.map((p) => `${p.id} (${p.sub})`).join(', '),
    '  weight      one of: ' + c.weights.map((w) => `${w.id} (${w.sub})`).join(', '),
    '  frame       one of: ' + c.frames.join(', '),
    '  seed        two lowercase words joined by a hyphen, evoking the request',
    '  why         one short sentence, under 15 words, on why this suits the request',
    '',
    'Styles:',
    ...c.styles.map((s) => `  ${s.id} — ${s.name}: ${s.blurb}`),
    '',
    'Guidance: bold weight suits markers, shaky hands and low vision. Low complexity',
    'suits children and anyone who wants a calm page. Match the style to the subject',
    'if one is named, and to the mood if one is not.',
    '',
    'Example reply:',
    '{"style":"wreath","complexity":2,"weight":"bold","paper":"a4","seed":"autumn-ember",'
      + '"why":"An open ring of leaves with room to work, in a heavy line."}',
  ].join('\n');
}

/* -------------------------------------------------------------- parsing -- */

const DESIGN_KEYS = ['style', 'seed', 'complexity', 'paper', 'weight', 'frame', 'caption', 'why', 'reason'];

/**
 * Every balanced `{...}` run in a string, outermost first.
 *
 * Models wrap JSON in explanations, apologies and code fences, and small ones
 * do it even when told twice not to. Rather than hope, this finds the braces
 * and lets `JSON.parse` be the judge of which run is real. Quoted strings are
 * tracked so a brace inside `"why"` cannot end the object early.
 */
function* braceRuns(s) {
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '{') continue;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let j = i; j < s.length; j++) {
      const c = s[j];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) {
        yield s.slice(i, j + 1);
        break;
      }
    }
  }
}

/** The design object a model buried somewhere in its reply, or null. */
export function extractJson(text) {
  if (typeof text !== 'string') return null;

  // Fenced content first: where there is a fence, what is inside it is the
  // answer and what is outside is chatter.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const sources = fenced ? [fenced[1], text] : [text];

  for (const source of sources) {
    for (const run of braceRuns(source)) {
      let value;
      try {
        value = JSON.parse(run);
      } catch {
        continue;
      }
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const design = unwrap(value);
      if (DESIGN_KEYS.some((k) => k in design)) return design;
    }
  }
  return null;
}

/** Models like to answer `{"design": {...}}`; take the object that fits. */
function unwrap(obj) {
  if (DESIGN_KEYS.some((k) => k in obj)) return obj;
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && DESIGN_KEYS.some((k) => k in v)) return v;
  }
  return obj;
}

/* ------------------------------------------------------------- coercion -- */

/** Letters and digits only, so "Stained Glass" and "stained-glass" agree. */
const squash = (v) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Map a loose value onto one of our ids.
 *
 * Exact matches on the id or the label first, then synonyms, then a containment
 * test in either direction — which is what catches "A4 portrait please" and
 * "use the bold pen". Anything still unmatched returns null and the caller
 * falls back to a default, because a wrong confident guess is worse than one.
 */
function match(value, table) {
  const v = squash(value);
  if (!v) return null;
  for (const [id, words] of Object.entries(table)) {
    if (words.some((w) => squash(w) === v)) return id;
  }
  for (const [id, words] of Object.entries(table)) {
    if (words.some((w) => {
      const s = squash(w);
      return s.length > 3 && (v.includes(s) || s.includes(v));
    })) return id;
  }
  return null;
}

function styleTable() {
  const t = {};
  for (const s of STYLES) t[s.id] = [s.id, s.name];
  // Words people and models reach for that are not in any name.
  t.animals.push('cat', 'cats', 'dog', 'dogs', 'fish', 'pet', 'pets', 'animal', 'creature');
  t.wreath.push('botanical', 'garland', 'flowers', 'floral', 'ring');
  t.bloomfield.push('bloom', 'garden', 'allover', 'flowerfield');
  t.frostfield.push('snow', 'snowflake', 'snowflakes', 'winter', 'frost');
  t.fractal.push('sierpinski', 'recursive', 'selfsimilar', 'dragoncurve');
  t.stainedglass.push('glass', 'mosaic', 'window', 'panes');
  t.celtic.push('knot', 'knotwork', 'interlace', 'ribbons');
  t.folkweave.push('folk', 'weave', 'embroidery', 'crossstitch', 'geometric');
  t.contours.push('contour', 'topographic', 'topography', 'map', 'ripples');
  t.bands.push('band', 'stripes', 'borders', 'rows');
  t.mandala.push('radial', 'symmetry', 'meditation', 'zen');
  t.kaleidoscope.push('mirror', 'mirrored', 'abstract', 'shards');
  return t;
}

const COMPLEXITY_WORDS = {
  1: ['1', 'calm', 'verysimple', 'child', 'toddler', 'minimal'],
  2: ['2', 'easy', 'simple', 'light'],
  3: ['3', 'balanced', 'medium', 'moderate', 'normal'],
  4: ['4', 'detailed', 'busy', 'complex'],
  5: ['5', 'intricate', 'veryintricate', 'verydetailed', 'maximum', 'dense'],
};

function paperTable() {
  const t = {};
  for (const p of Object.values(PAPERS)) t[p.id] = [p.id, p.label, p.sub];
  t.letter.push('portrait', 'us', '85x11');
  t.a4.push('a4portrait');
  t.square.push('10x10');
  return t;
}

function weightTable() {
  const t = {};
  for (const w of Object.values(WEIGHTS)) t[w.id] = [w.id, w.label];
  t.fine.push('thin', 'light', 'pencil', 'fineliner');
  t.medium.push('normal', 'standard', 'everyday');
  t.bold.push('thick', 'heavy', 'marker', 'markers', 'lowvision');
  return t;
}

/** A seed the site will accept, keeping whatever the model meant by it. */
export function cleanSeed(value) {
  const s = String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '');
  return s.length >= 3 ? s : '';
}

/**
 * A model's reply, as settings this site can actually draw.
 *
 * @returns {{patch: object, why: string, understood: string[]}} `patch` holds
 *   only the fields that were recognised, so anything the model omitted or
 *   garbled keeps its current value rather than snapping to a default.
 *   `understood` names what was taken, which the UI shows: a model that ignored
 *   half the request should not look like it obeyed.
 */
export function coerceDesign(obj) {
  const patch = {};
  const understood = [];
  if (!obj || typeof obj !== 'object') return { patch, why: '', understood };

  const take = (key, value, label) => {
    if (value === null || value === undefined) return;
    patch[key] = value;
    understood.push(label);
  };

  take('style', match(obj.style ?? obj.styleId ?? obj.name, styleTable()), 'style');

  /*
   * A number and a word fail differently, so they are read differently. A model
   * answering 97 means "as much as there is" and gets 5; one answering "chunky"
   * means nothing we can act on, and the setting is left as the reader had it
   * rather than snapped to a default they did not ask for.
   */
  const detail = obj.complexity ?? obj.detail ?? obj.difficulty;
  const n = typeof detail === 'number' ? detail
    : (/^\s*-?\d+(\.\d+)?\s*$/.test(String(detail ?? '')) ? Number(detail) : NaN);
  const c = Number.isFinite(n)
    ? Math.min(5, Math.max(1, Math.round(n)))
    : match(detail, COMPLEXITY_WORDS);
  take('complexity', c === null ? null : Number(c), 'detail');

  take('paper', match(obj.paper ?? obj.paperSize ?? obj.size, paperTable()), 'paper');
  take('weight', match(obj.weight ?? obj.lineWeight ?? obj.line, weightTable()), 'line weight');
  take('frame', match(obj.frame ?? obj.border, Object.fromEntries(Object.keys(FRAMES).map((f) => [f, [f]]))), 'border');

  const seed = cleanSeed(obj.seed ?? obj.seedName);
  if (seed) take('seed', seed, 'seed');

  const why = String(obj.why ?? obj.reason ?? obj.explanation ?? '').trim().slice(0, 200);
  return { patch, why, understood };
}

/** Everything above, end to end: raw model text in, drawable settings out. */
export function readReply(text, current = {}) {
  const found = extractJson(text);
  if (!found) return null;
  const { patch, why, understood } = coerceDesign(found);
  if (!understood.length) return null;
  return { params: normalize({ ...current, ...patch }), patch, why, understood };
}

/* -------------------------------------------------------------- network -- */

const FLAVOURS = {
  openai: {
    models: { path: '/v1/models', read: (j) => (j?.data || []).map((m) => m.id).filter(Boolean) },
    chat: '/v1/chat/completions',
    body: (model, messages, json) => ({
      model,
      messages,
      temperature: 0.4,
      stream: false,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
    read: (j) => j?.choices?.[0]?.message?.content ?? '',
  },
  ollama: {
    models: { path: '/api/tags', read: (j) => (j?.models || []).map((m) => m.name).filter(Boolean) },
    chat: '/api/chat',
    body: (model, messages, json) => ({
      model,
      messages,
      stream: false,
      options: { temperature: 0.4 },
      ...(json ? { format: 'json' } : {}),
    }),
    read: (j) => j?.message?.content ?? '',
  },
};

/** Trim a trailing slash, and the `/v1` people paste in out of habit. */
export function baseOf(url) {
  return String(url || '').trim().replace(/\/+$/, '').replace(/\/v1$/, '');
}

/**
 * Problems worth naming before a request is made.
 *
 * A browser will not tell you why a cross-origin request to a plain-HTTP
 * address from an HTTPS page failed — it fails the same opaque way as a machine
 * that is switched off. That one confusion would cost more time than everything
 * else here put together, so it is checked up front.
 */
export function preflight(url, pageOrigin = (typeof location === 'undefined' ? '' : location.href)) {
  const base = baseOf(url);
  if (!base) return 'Enter the address your model is served from.';

  let target;
  try {
    target = new URL(base);
  } catch {
    return `"${url}" is not a URL. It should look like https://your-machine.tailnet.ts.net or http://localhost:11434.`;
  }
  if (!/^https?:$/.test(target.protocol)) return 'The address must start with http:// or https://.';

  let page;
  try {
    page = new URL(pageOrigin);
  } catch {
    return null;
  }
  if (page.protocol === 'https:' && target.protocol === 'http:' && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(target.hostname)) {
    return `This page is served over HTTPS, so the browser will block a plain http:// model at ${target.host}. `
      + 'Tailscale can serve it over HTTPS for you — see the README — or open SuperPrint from localhost instead.';
  }
  return null;
}

async function getJSON(url, signal) {
  const res = await fetch(url, { signal, headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * Work out what is listening and what it can run.
 *
 * The OpenAI-shaped API is asked about first because nearly everything speaks
 * it — Ollama, llama.cpp, LM Studio, vLLM — and where it answers, one code path
 * covers them all. Ollama's own API is the fallback for versions predating its
 * compatibility layer.
 */
export async function detect(url, { signal } = {}) {
  const problem = preflight(url);
  if (problem) throw new Error(problem);
  const base = baseOf(url);

  const failures = [];
  for (const flavour of ['openai', 'ollama']) {
    const { path, read } = FLAVOURS[flavour].models;
    try {
      const models = read(await getJSON(base + path, signal));
      if (models.length) return { base, flavour, models };
      failures.push(`${path}: answered, but listed no models`);
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      failures.push(`${path}: ${err.message}`);
    }
  }

  throw new Error(
    `Nothing at ${base} answered as a model server.\n${failures.join('\n')}\n\n`
    + 'If the server is running, it most likely has not been told to accept requests from '
    + `${typeof location === 'undefined' ? 'this page' : location.origin} — see the README.`,
  );
}

/**
 * Put the question, and hand back whatever the model said.
 *
 * Asked for JSON twice over: once in words, and once through whichever
 * structured-output switch the server has. Servers that do not know the switch
 * reject the whole request, so a rejection is retried without it rather than
 * reported — the words alone are usually enough.
 */
export async function ask({ url, flavour, model }, prompt, { signal, timeoutMs = 90000 } = {}) {
  const spec = FLAVOURS[flavour] || FLAVOURS.openai;
  const base = baseOf(url);
  const messages = [
    { role: 'system', content: systemPrompt() },
    { role: 'user', content: String(prompt || '').slice(0, 2000) },
  ];

  const timer = new AbortController();
  const stop = setTimeout(() => timer.abort(), timeoutMs);
  const onAbort = () => timer.abort();
  signal?.addEventListener('abort', onAbort);

  try {
    for (const json of [true, false]) {
      const res = await fetch(base + spec.chat, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(spec.body(model, messages, json)),
        signal: timer.signal,
      });
      if (res.ok) return spec.read(await res.json());
      // Only a rejected request is worth retrying plainer; a 500 means the
      // model itself fell over and asking again the same way will not help.
      if (res.status !== 400 && res.status !== 422) {
        throw new Error(`${model} replied ${res.status} ${res.statusText}`);
      }
      if (!json) throw new Error(`${model} rejected the request (${res.status})`);
    }
    return '';
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(signal?.aborted ? 'Cancelled' : `No reply in ${Math.round(timeoutMs / 1000)}s — a large model on a slow machine may need longer.`);
    }
    if (err instanceof TypeError) {
      throw new Error(`Could not reach ${base}. ${preflight(url) || 'Check the machine is up and allows this page as an origin.'}`);
    }
    throw err;
  } finally {
    clearTimeout(stop);
    signal?.removeEventListener('abort', onAbort);
  }
}
