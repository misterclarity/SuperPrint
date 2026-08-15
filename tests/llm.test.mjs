/*
 * Reading a language model's answer.
 *
 * The model is the unreliable part of this feature and cannot be tested — it is
 * on someone else's machine and says something different every time. What can
 * be tested is everything downstream of it, and that is where the value is:
 * a small local model wraps JSON in apologies, invents key names, answers
 * "Stained Glass" where an id was asked for and "very intricate" where a number
 * was, and occasionally returns no JSON at all.
 *
 * Every one of those has to end with a drawable page rather than an error, so
 * every one of them is a case below. The replies here are the shapes real 7B
 * models actually produce, not tidy ones.
 */

import {
  extractJson, coerceDesign, readReply, cleanSeed, preflight, baseOf, systemPrompt, catalogue,
} from '../assets/js/core/llm.js';
import { STYLES } from '../assets/js/gen/index.js';
import { PAPERS, WEIGHTS, FRAMES } from '../assets/js/core/render.js';

export default function run() {
  const failures = [];
  const table = {};
  const eq = (name, got, want) => {
    if (got !== want) failures.push(`${name}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
  };

  /* -- 1. finding the JSON in whatever it arrived wrapped in -------------- */
  {
    const replies = {
      'bare object': '{"style":"mandala"}',
      'fenced': '```json\n{"style":"mandala"}\n```',
      'fenced without a language': '```\n{"style":"mandala"}\n```',
      'prose before': 'Sure! Here is a design for you:\n{"style":"mandala"}',
      'prose after': '{"style":"mandala"}\nLet me know if you would like another.',
      'prose both sides': 'Certainly.\n{"style":"mandala"}\nHope that helps!',
      'nested under a key': '{"design":{"style":"mandala"}}',
      'a brace inside a string': '{"style":"mandala","why":"a { in the reason"}',
      'newlines and indentation': '{\n  "style" : "mandala"\n}',
      'a preamble that is itself JSON-ish': '{"note":"thinking"}\n{"style":"mandala"}',
    };
    const rows = {};
    for (const [name, reply] of Object.entries(replies)) {
      const found = extractJson(reply);
      rows[name] = { found: String(!!found), style: found?.style ?? '—' };
      eq(`extract from ${name}`, found?.style, 'mandala');
    }
    console.table(rows);

    for (const [name, reply] of Object.entries({
      'empty': '',
      'prose only': 'I am sorry, I cannot help with that request.',
      'broken JSON': '{"style": "mandala",,}',
      'unrelated JSON': '{"temperature":0.7,"tokens":128}',
      'not a string': null,
    })) {
      eq(`no design in ${name}`, extractJson(reply), null);
    }

    // An array of one is a shape models produce when asked for "a design", and
    // scanning for braces rather than parsing the whole reply means it costs
    // nothing to accept.
    eq('a one-item array yields its design', extractJson('[{"style":"mandala"}]')?.style, 'mandala');
  }

  /* -- 2. loose vocabulary onto real ids ---------------------------------- */
  {
    const cases = [
      [{ style: 'Stained Glass' }, 'style', 'stainedglass'],
      [{ style: 'stained-glass' }, 'style', 'stainedglass'],
      [{ style: 'Botanical Wreath' }, 'style', 'wreath'],
      [{ style: 'snowflakes' }, 'style', 'frostfield'],
      [{ style: 'cats' }, 'style', 'animals'],
      [{ style: 'knotwork' }, 'style', 'celtic'],
      [{ style: 'Sierpinski triangle' }, 'style', 'fractal'],
      [{ complexity: 5 }, 'complexity', 5],
      [{ complexity: '4' }, 'complexity', 4],
      [{ complexity: 'very intricate' }, 'complexity', 5],
      [{ complexity: 'simple' }, 'complexity', 2],
      [{ detail: 'Balanced' }, 'complexity', 3],
      [{ paper: 'A4' }, 'paper', 'a4'],
      [{ paper: 'A4 landscape' }, 'paper', 'a4-landscape'],
      [{ paper: 'US Letter' }, 'paper', 'letter'],
      [{ size: 'square' }, 'paper', 'square'],
      [{ weight: 'bold' }, 'weight', 'bold'],
      [{ weight: 'thick' }, 'weight', 'bold'],
      [{ weight: 'markers' }, 'weight', 'bold'],
      [{ lineWeight: 'Fine' }, 'weight', 'fine'],
      [{ frame: 'double' }, 'frame', 'double'],
      [{ border: 'rounded' }, 'frame', 'rounded'],
    ];
    for (const [input, key, want] of cases) {
      eq(`coerce ${JSON.stringify(input)}`, coerceDesign(input).patch[key], want);
    }

    // Every id in the catalogue has to survive the round trip, or a style
    // becomes unreachable by name the day it is added.
    for (const s of STYLES) {
      eq(`style id ${s.id}`, coerceDesign({ style: s.id }).patch.style, s.id);
      eq(`style name ${s.name}`, coerceDesign({ style: s.name }).patch.style, s.id);
    }
    for (const p of Object.values(PAPERS)) eq(`paper ${p.id}`, coerceDesign({ paper: p.id }).patch.paper, p.id);
    for (const w of Object.values(WEIGHTS)) eq(`weight ${w.id}`, coerceDesign({ weight: w.id }).patch.weight, w.id);
    for (const f of Object.keys(FRAMES)) eq(`frame ${f}`, coerceDesign({ frame: f }).patch.frame, f);
  }

  /*
   * -- 3. what was not understood keeps its old value ---------------------
   *
   * The reason `patch` holds only recognised keys. If an unmatched value fell
   * through to a default, a model answering just `{"style":"celtic"}` would
   * silently reset the paper size someone had chosen by hand.
   */
  {
    const { patch, understood } = coerceDesign({ style: 'celtic', paper: 'A2 poster', weight: 'chunky?' });
    eq('unmatched paper is left alone', 'paper' in patch, false);
    eq('unmatched weight is left alone', 'weight' in patch, false);
    eq('only what was taken is reported', understood.join(','), 'style');

    const kept = readReply('{"style":"celtic"}', { paper: 'square', weight: 'bold', complexity: 5 });
    eq('existing paper survives', kept.params.paper, 'square');
    eq('existing weight survives', kept.params.weight, 'bold');
    eq('existing detail survives', kept.params.complexity, 5);
    eq('the named style is applied', kept.params.style, 'celtic');
  }

  /* -- 4. nonsense in, drawable page out ---------------------------------- */
  {
    eq('no JSON at all', readReply('I cannot do that.'), null);
    eq('JSON with nothing usable', readReply('{"style":"a lovely drawing of my dog"}'), null);

    const wild = readReply('{"style":"mandala","complexity":97,"paper":"A0","weight":"crayon","seed":"!!!"}');
    eq('out-of-range detail is clamped', wild.params.complexity, 5);
    eq('unknown paper falls back to a real one', Boolean(PAPERS[wild.params.paper]), true);
    eq('unknown weight falls back to a real one', Boolean(WEIGHTS[wild.params.weight]), true);
    eq('an unusable seed does not become the seed', wild.params.seed.length > 0, true);

    const negative = readReply('{"style":"bands","complexity":-3}');
    eq('negative detail is clamped up', negative.params.complexity, 1);
  }

  /* -- 5. seeds ----------------------------------------------------------- */
  {
    eq('two words', cleanSeed('Autumn Ember'), 'autumn-ember');
    eq('already a seed', cleanSeed('amber-thistle-408'), 'amber-thistle-408');
    eq('punctuation', cleanSeed('  ~Quiet~ Fern!!  '), 'quiet-fern');
    eq('too short', cleanSeed('a'), '');
    eq('nothing usable', cleanSeed('!!!'), '');
    eq('no trailing hyphen after the length cut', /-$/.test(cleanSeed('x'.repeat(47) + ' y')), false);
    eq('length is capped', cleanSeed('word-'.repeat(40)).length <= 48, true);
  }

  /*
   * -- 6. the mixed-content trap -------------------------------------------
   *
   * The single most likely way this feature fails for someone. A browser gives
   * no usable error for it, so it has to be caught before the request.
   */
  {
    const https = 'https://user.github.io/SuperPrint/studio.html';
    const http = 'http://localhost:8080/studio.html';
    eq('http model from an https page is refused',
      /HTTPS/.test(preflight('http://box.tailnet.ts.net:11434', https) || ''), true);
    eq('https model from an https page is fine',
      preflight('https://box.tailnet.ts.net', https), null);
    eq('http model from an http page is fine',
      preflight('http://box.tailnet.ts.net:11434', http), null);
    // Browsers exempt loopback from mixed-content blocking, so we must not
    // refuse what they will actually allow.
    eq('localhost is exempt', preflight('http://localhost:11434', https), null);
    eq('127.0.0.1 is exempt', preflight('http://127.0.0.1:11434', https), null);
    eq('nonsense is refused', /not a URL/.test(preflight('wat', http) || ''), true);
    eq('empty is refused', Boolean(preflight('', http)), true);
    eq('a non-web protocol is refused', /http:\/\//.test(preflight('ftp://box/', http) || ''), true);
  }

  /* -- 7. the address people actually paste ------------------------------- */
  {
    eq('trailing slash', baseOf('http://box:11434/'), 'http://box:11434');
    eq('trailing /v1', baseOf('http://box:1234/v1'), 'http://box:1234');
    eq('trailing /v1/', baseOf('http://box:1234/v1/'), 'http://box:1234');
    eq('surrounding space', baseOf('  http://box:11434  '), 'http://box:11434');
  }

  /*
   * -- 8. the prompt describes the site that exists -------------------------
   *
   * Built from the catalogue rather than written out, so that adding a style
   * makes it promptable on the same commit. This is the test that fails if that
   * ever stops being true.
   */
  {
    const p = systemPrompt();
    const missing = STYLES.filter((s) => !p.includes(s.id) || !p.includes(s.blurb));
    eq('every style is described to the model', missing.map((s) => s.id).join(','), '');
    eq('every paper is offered', Object.keys(PAPERS).filter((id) => !p.includes(id)).join(','), '');
    eq('every weight is offered', Object.keys(WEIGHTS).filter((id) => !p.includes(id)).join(','), '');

    // The example in the prompt has to be an answer we would actually accept.
    const example = readReply(p.slice(p.lastIndexOf('{')));
    eq('the example reply parses', Boolean(example), true);
    eq('the example names a real style', Boolean(example && example.params.style), true);

    table['prompt'] = {
      styles: catalogue().styles.length,
      'prompt chars': p.length,
      'example understood': example ? example.understood.join(' ') : 'none',
    };
  }

  console.table(table);
  return failures;
}
