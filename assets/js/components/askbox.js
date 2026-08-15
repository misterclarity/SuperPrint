/*
 * The "describe a page" box, and the dialog for pointing it at your own model.
 *
 * Deliberately inert until configured. With no model set the field is disabled
 * and the only thing on offer is the link that explains what this is — because
 * the rest of the site makes no network calls, and a box that looked ready to
 * send somewhere would be a lie about that.
 *
 * Two things this is careful about, both learned from how the feature actually
 * fails in practice rather than in theory:
 *
 *   - It says what the model understood, not just that it answered. A small
 *     model asked for "a calm page for markers" often picks the style and
 *     ignores the pen. Showing "took: style, detail" is the difference between
 *     the reader adjusting the one dial that was missed and the reader
 *     concluding the whole thing does not work.
 *   - Failures name the fix. Nearly every one is configuration — a blocked
 *     origin, a plain-HTTP model behind an HTTPS page — and a browser reports
 *     all of them identically as "failed to fetch".
 */

import { normalize } from '../core/render.js';
import { pickBest } from '../core/quality.js';
import * as llm from '../core/llm.js';
import { ICONS, toast } from '../ui.js';

const READ_MORE = 'https://github.com/misterclarity/SuperPrint#describing-a-page-to-a-local-model';

/**
 * A seed in the family the model named, composed as well as the studio's own.
 *
 * The model is good at "autumn-ember" and has no idea which particular roll of
 * that seed lands lopsided — it never sees the drawing. So a name without a
 * number becomes a family, and the existing composition filter picks the member
 * of it that uses the sheet best. A model that gave a complete seed is obeyed
 * exactly, because that is someone reproducing a specific page.
 */
function seedFor(params, named) {
  if (!named) return params.seed;
  if (/\d/.test(named)) return named;
  const family = Array.from({ length: 6 }, (_, i) => `${named}-${101 + i * 137}`);
  return pickBest({ ...params, seed: family[0] }, { seeds: family }).seed;
}

export function createAskBox({ getParams, onApply }) {
  const root = document.createElement('div');
  root.className = 'field ask-field';
  root.id = 'field-ask';
  root.innerHTML = `
    <div class="field-label">
      <label for="ask-input">Describe a page</label>
      <button class="btn btn-ghost btn-sm" id="ask-settings" type="button">Model</button>
    </div>
    <div class="seed-row">
      <input class="input" id="ask-input" type="text" autocomplete="off"
             placeholder="a calm page of autumn leaves, for markers" aria-describedby="ask-note">
      <button class="btn btn-primary btn-icon" id="ask-go" type="button" aria-label="Ask the model"></button>
    </div>
    <p class="small muted ask-note" id="ask-note" aria-live="polite"></p>`;

  const input = root.querySelector('#ask-input');
  const go = root.querySelector('#ask-go');
  const note = root.querySelector('#ask-note');
  const settingsBtn = root.querySelector('#ask-settings');
  go.innerHTML = ICONS.wand;

  let busy = null; // an AbortController while a request is in flight

  const setNote = (html, kind = '') => {
    note.innerHTML = html;
    note.className = `small ask-note ${kind || 'muted'}`;
  };

  function paintReady() {
    const s = llm.loadSettings();
    input.disabled = !s;
    go.disabled = !s;
    settingsBtn.textContent = s ? 'Model' : 'Connect';
    if (!s) {
      setNote(
        'Runs on a language model you host yourself — nothing is sent anywhere else. '
        + `<a href="${READ_MORE}" target="_blank" rel="noopener noreferrer">How to set it up</a>.`,
      );
    } else if (!busy) {
      setNote(`Asking <b>${escape(s.model)}</b> on your own machine.`);
    }
    return s;
  }

  async function submit() {
    const settings = llm.loadSettings();
    const text = input.value.trim();
    if (!settings || !text) return;

    if (busy) { busy.abort(); return; }
    busy = new AbortController();
    go.innerHTML = ICONS.close;
    go.setAttribute('aria-label', 'Cancel');
    setNote(`Asking ${escape(settings.model)}…`);

    try {
      const reply = await llm.ask(settings, text, { signal: busy.signal });
      const current = getParams();
      const read = llm.readReply(reply, current);

      if (!read) {
        setNote(
          `<b>${escape(settings.model)}</b> answered, but not with a design. `
          + 'Smaller models often need a plainer request — try naming a subject or a mood.',
          'warn',
        );
        return;
      }

      // The seed is the one field the model names but cannot judge.
      const params = normalize({ ...read.params, seed: seedFor(read.params, read.patch.seed) });
      onApply(params);

      const why = read.why ? `${escape(read.why)} ` : '';
      setNote(`${why}<span class="ask-took">Set: ${read.understood.join(', ')}.</span>`);
    } catch (err) {
      setNote(escape(err.message).replace(/\n/g, '<br>'), 'warn');
    } finally {
      busy = null;
      go.innerHTML = ICONS.wand;
      go.setAttribute('aria-label', 'Ask the model');
    }
  }

  go.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
  });
  settingsBtn.addEventListener('click', () => openSettings(paintReady));

  paintReady();
  return root;
}

/* ------------------------------------------------------------- settings -- */

function openSettings(onSaved) {
  let dialog = document.getElementById('llm-dialog');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'llm-dialog';
    dialog.className = 'support-dialog llm-dialog';
    dialog.innerHTML = `
      <h2>Your own model</h2>
      <p class="small muted">
        SuperPrint can ask a language model you are running yourself to choose the settings for a
        page. It never draws — it picks the style, detail, paper and pen, the same dials as the
        panel. Nothing is sent anywhere but the address below, and the address is stored only in
        this browser.
      </p>

      <label class="llm-label" for="llm-url">Address</label>
      <input class="input" id="llm-url" type="url" spellcheck="false" autocomplete="off"
             placeholder="https://your-machine.tailnet.ts.net">
      <p class="small muted llm-hint">
        An Ollama, LM Studio, llama.cpp or vLLM server. Over Tailscale, use the machine's
        <span class="mono">.ts.net</span> name.
        <a href="${READ_MORE}" target="_blank" rel="noopener noreferrer">Setup notes</a>.
      </p>

      <div class="llm-row">
        <button class="btn btn-outline" id="llm-detect" type="button">Connect</button>
        <select class="input" id="llm-model" disabled><option>Connect to list models</option></select>
      </div>

      <p class="small llm-status" id="llm-status" aria-live="polite"></p>

      <div class="support-actions">
        <button class="btn btn-primary" id="llm-save" type="button" disabled>Save</button>
        <button class="btn btn-ghost" id="llm-forget" type="button">Forget</button>
        <button class="btn btn-ghost" id="llm-close" type="button">Close</button>
      </div>`;
    document.body.appendChild(dialog);
  }

  const url = dialog.querySelector('#llm-url');
  const model = dialog.querySelector('#llm-model');
  const status = dialog.querySelector('#llm-status');
  const save = dialog.querySelector('#llm-save');
  let flavour = 'openai';

  const say = (msg, kind) => {
    status.textContent = msg;
    status.className = `small llm-status ${kind || 'muted'}`;
  };

  const existing = llm.loadSettings();
  url.value = existing?.url || '';
  model.innerHTML = existing ? `<option>${escape(existing.model)}</option>` : '<option>Connect to list models</option>';
  model.disabled = !existing;
  save.disabled = !existing;
  flavour = existing?.flavour || 'openai';
  say(existing ? `Saved: ${existing.model}` : '');

  dialog.querySelector('#llm-detect').onclick = async () => {
    const problem = llm.preflight(url.value);
    if (problem) return say(problem, 'warn');
    say('Looking…');
    try {
      const found = await llm.detect(url.value);
      flavour = found.flavour;
      model.innerHTML = found.models.map((m) => `<option>${escape(m)}</option>`).join('');
      if (existing && found.models.includes(existing.model)) model.value = existing.model;
      model.disabled = false;
      save.disabled = false;
      say(`${found.models.length} model${found.models.length === 1 ? '' : 's'} on ${found.base} (${found.flavour === 'ollama' ? 'Ollama' : 'OpenAI-compatible'} API)`, 'ok');
    } catch (err) {
      model.disabled = true;
      save.disabled = true;
      say(err.message, 'warn');
    }
  };

  dialog.querySelector('#llm-save').onclick = () => {
    llm.saveSettings({ url: llm.baseOf(url.value), flavour, model: model.value });
    onSaved();
    dialog.close();
    toast('Model saved — describe a page to try it');
  };

  dialog.querySelector('#llm-forget').onclick = () => {
    llm.clearSettings();
    url.value = '';
    model.innerHTML = '<option>Connect to list models</option>';
    model.disabled = true;
    save.disabled = true;
    onSaved();
    say('Forgotten. Nothing about a model is stored now.');
  };

  dialog.querySelector('#llm-close').onclick = () => dialog.close();
  if (typeof dialog.showModal === 'function') dialog.showModal();
}

/** Model output and user input both land in innerHTML; neither is trusted. */
function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
