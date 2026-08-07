import * as store from '../core/store.js';
import { createTile } from '../components/tile.js';
import { toast, ICONS } from '../ui.js';

const grid = document.getElementById('saved-grid');
const empty = document.getElementById('saved-empty');
const clearBtn = document.getElementById('clear-saved');
const countEl = document.getElementById('saved-count');

function paint() {
  const items = store.list();
  grid.innerHTML = '';
  const has = items.length > 0;
  empty.hidden = has;
  grid.hidden = !has;
  clearBtn.hidden = !has;
  countEl.textContent = has ? `${items.length} design${items.length === 1 ? '' : 's'} saved on this device` : '';

  for (const item of items) {
    grid.appendChild(createTile(item, { onRemove: () => paint() }));
  }
}

if (grid) {
  clearBtn.insertAdjacentHTML('afterbegin', ICONS.trash);
  clearBtn.addEventListener('click', () => {
    if (!window.confirm('Remove every saved design from this device? This cannot be undone.')) return;
    store.clearAll();
    paint();
    toast('Collection cleared');
  });
  window.addEventListener('superprint:saved-changed', paint);
  paint();
}
