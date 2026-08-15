/* Shared chrome: theme toggle, mobile nav, active link, toasts, icons. */

export const ICONS = {
  shuffle: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="M4 4l5 5"/></svg>',
  print: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>',
  download: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></svg>',
  heart: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
  heartFilled: '<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
  link: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  trash: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  wand: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 21 14-14"/><path d="m16 4 1.5 3L21 8.5 17.5 10 16 13l-1.5-3L11 8.5 14.5 7Z"/></svg>',
  sun: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6.4 6.4 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
  menu: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',
  expand: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>',
  close: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  palette: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21a9 9 0 1 1 9-9c0 1.7-1.3 3-3 3h-1.5a2 2 0 0 0-1.4 3.4 1.6 1.6 0 0 1-1.1 2.6Z"/><circle cx="7.5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="9.8" cy="8" r="1.2" fill="currentColor" stroke="none"/><circle cx="14.2" cy="7.6" r="1.2" fill="currentColor" stroke="none"/><circle cx="17" cy="11" r="1.2" fill="currentColor" stroke="none"/></svg>',
  bucket: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 3.5 18 13a1.5 1.5 0 0 1 0 2.1l-5.4 5.4a1.5 1.5 0 0 1-2.1 0l-6-6a1.5 1.5 0 0 1 0-2.1L11 5.9"/><path d="m4.6 12.4 14.3.4"/><path d="M20.5 17.5c0 1-.7 1.8-1.6 1.8s-1.6-.8-1.6-1.8 1.6-2.8 1.6-2.8 1.6 1.8 1.6 2.8Z" fill="currentColor"/></svg>',
  brush: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 3.5a2.1 2.1 0 0 1 3 3L13 14l-3-3Z"/><path d="M10 11c-2.5.4-4 2.1-4 4.5 0 1-.6 2-1.6 2.4-.6.2-.7.7-.2 1 .9.7 2.2 1.1 3.6 1.1 2.8 0 5-1.9 5-4.5 0-1.6-1.2-3-2.8-3.5Z"/></svg>',
  eraser: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 3.5 21 11a1.5 1.5 0 0 1 0 2.1l-6.4 6.4H9.3l-6-6a1.5 1.5 0 0 1 0-2.1l8.1-8a1.5 1.5 0 0 1 2.1 0Z"/><path d="m8 8 7.5 7.5"/><path d="M21 20.5h-8"/></svg>',
  undo: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h11a6 6 0 0 1 0 12H8"/><path d="m7 4-4 4 4 4"/></svg>',
  back: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="m11 18-6-6 6-6"/></svg>',
};

let toastTimer;

export function toast(message) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function initTheme() {
  const btn = document.querySelector('[data-theme-toggle]');
  if (!btn) return;
  const paint = () => {
    const dark = document.documentElement.dataset.theme === 'dark';
    btn.innerHTML = dark ? ICONS.sun : ICONS.moon;
    btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    btn.title = btn.getAttribute('aria-label');
  };
  btn.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('superprint.theme', next); } catch { /* ignore */ }
    paint();
  });
  paint();
}

function initNav() {
  const toggle = document.querySelector('[data-nav-toggle]');
  const links = document.getElementById('nav-links');
  if (toggle && links) {
    toggle.innerHTML = ICONS.menu;
    const mq = window.matchMedia('(max-width: 820px)');
    const sync = () => {
      if (mq.matches) {
        links.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
      } else {
        links.hidden = false;
      }
    };
    sync();
    mq.addEventListener('change', sync);
    toggle.addEventListener('click', () => {
      const open = links.hidden;
      links.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
    });
  }

  const here = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('#nav-links a').forEach((a) => {
    const target = a.getAttribute('href');
    if (target === here || (here === '' && target === 'index.html')) a.setAttribute('aria-current', 'page');
  });
}

function initFooter() {
  const y = document.querySelector('[data-year]');
  if (y) y.textContent = String(new Date().getFullYear());
}

initTheme();
initNav();
initFooter();
