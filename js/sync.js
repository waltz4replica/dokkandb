// Keeps the local database in step with the Dokkan Wiki.
// First run: downloads everything. Afterwards: only pages changed since the last sync.

import * as db from './db.js';
import { pagesInCategory, categoryAddedTimes, pagesByTitle, changedSince } from './wiki.js';
import { parseCard, parseBanner } from './parse.js';

export const CARD_CATEGORIES = ['LR', 'UR', 'SSR'];
export const BANNER_CATEGORIES = [
  'Dokkan Festivals', 'Extreme Z Dokkan Festivals', 'Step-Up Dokkan Festivals', 'Carnivals',
  'Legendary Summons', 'Type, Class and Category Summons', 'Crossover/Collaboration Summons',
  'Ticket Summons', 'Miscellaneous Summons',
];
const SCHEMA = 1;            // bump when parse.js output changes, to force a full re-download
const FULL_AFTER_DAYS = 80;  // the wiki only keeps ~90 days of change history

// In-memory copy used by the screens.
export const store = { cards: new Map(), banners: new Map(), lastSync: null, loaded: false };
const listeners = new Set();
export const onChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const emit = (info) => listeners.forEach((fn) => fn(info));

export async function loadLocal() {
  const [cards, banners, lastSync] = await Promise.all([db.getAll('cards'), db.getAll('banners'), db.getMeta('lastSync')]);
  store.cards = new Map(cards.map((c) => [c.page, c]));
  store.banners = new Map(banners.map((b) => [b.page, b]));
  store.lastSync = lastSync;
  store.loaded = true;
  emit({ type: 'loaded' });
}

let running = null;
export const isSyncing = () => !!running;

/** Runs a sync (only one at a time). Returns a summary of what changed. */
export function sync(opts = {}) {
  if (!running) running = doSync(opts).finally(() => { running = null; });
  return running;
}

async function doSync({ full = false, onProgress = () => {} }) {
  const startedAt = new Date().toISOString();
  const last = await db.getMeta('lastSync');
  const schema = await db.getMeta('schema');
  const tooOld = last && (Date.now() - Date.parse(last)) / 864e5 > FULL_AFTER_DAYS;
  const doFull = full || !last || tooOld || schema !== SCHEMA;
  emit({ type: 'sync-start', full: doFull });
  try {
    const result = doFull ? await fullSync(onProgress) : await incrementalSync(last, onProgress);
    await db.setMeta('lastSync', startedAt);
    await db.setMeta('schema', SCHEMA);
    store.lastSync = startedAt;
    emit({ type: 'sync-done', ...result });
    return result;
  } catch (err) {
    emit({ type: 'sync-error', error: err });
    throw err;
  }
}

async function fullSync(onProgress) {
  const firstEver = store.cards.size === 0;
  const now = new Date().toISOString();
  const cards = [];
  const seen = new Set();
  for (const cat of CARD_CATEGORIES) {
    for await (const batch of pagesInCategory(cat)) {
      for (const p of batch) {
        if (seen.has(p.title)) continue;
        seen.add(p.title);
        const c = parseCard(p);
        if (c) cards.push(withFirstSeen(c, firstEver ? '' : now));
      }
      onProgress(`Descargando cartas ${cat}… (${cards.length})`);
    }
  }
  const banners = [];
  for (const cat of BANNER_CATEGORIES) {
    const added = await categoryAddedTimes(cat);
    for await (const batch of pagesInCategory(cat)) {
      for (const p of batch) {
        const b = parseBanner({ ...p, category: cat, added: added[p.title] || '' });
        if (b) banners.push(b);
      }
      onProgress(`Descargando banners… (${banners.length})`);
    }
  }
  if (cards.length < 100) throw new Error('La wiki devolvió muy pocas cartas; se mantiene la base de datos anterior.');
  const newCards = firstEver ? [] : cards.filter((c) => !store.cards.has(c.page));
  const newBanners = store.banners.size === 0 ? [] : banners.filter((b) => !store.banners.has(b.page));
  await db.clear('cards');
  await db.putMany('cards', cards);
  await db.clear('banners');
  await db.putMany('banners', banners);
  store.cards = new Map(cards.map((c) => [c.page, c]));
  store.banners = new Map(banners.map((b) => [b.page, b]));
  return { full: true, newCards, newBanners, updated: cards.length + banners.length };
}

async function incrementalSync(since, onProgress) {
  onProgress('Buscando cambios en la wiki…');
  const titles = await changedSince(since);
  if (!titles.length) return { full: false, newCards: [], newBanners: [], updated: 0 };
  onProgress(`Revisando ${titles.length} páginas cambiadas…`);
  const now = new Date().toISOString();
  const pages = await pagesByTitle(titles, [...CARD_CATEGORIES, ...BANNER_CATEGORIES]);
  const cards = [], banners = [];
  for (const p of pages) {
    if (p.categories.some((c) => CARD_CATEGORIES.includes(c))) {
      const c = parseCard(p);
      if (c) cards.push(withFirstSeen(c, now));
    }
    const bannerCat = p.categories.find((c) => BANNER_CATEGORIES.includes(c));
    if (bannerCat) {
      const prev = store.banners.get(p.title);
      const b = parseBanner({ ...p, category: bannerCat, added: prev?.added || now });
      if (b) banners.push(b);
    }
  }
  const newCards = cards.filter((c) => !store.cards.has(c.page));
  const newBanners = banners.filter((b) => !store.banners.has(b.page));
  await db.putMany('cards', cards);
  await db.putMany('banners', banners);
  cards.forEach((c) => store.cards.set(c.page, c));
  banners.forEach((b) => store.banners.set(b.page, b));
  return { full: false, newCards, newBanners, updated: cards.length + banners.length };
}

// Keeps the date we first saw a card, so "new" badges survive later edits.
function withFirstSeen(card, fallback) {
  card.firstSeen = store.cards.get(card.page)?.firstSeen ?? fallback;
  return card;
}
