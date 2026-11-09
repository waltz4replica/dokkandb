// Keeps the phone's local database up to date.
//
//   Cards        -> data/cards.json, built every 3 h on GitHub from DOKKAN.FYI (data from the game).
//                   The app checks the small data/cards-meta.json first and only downloads the
//                   big file when it has changed.
//   Banners, tier list, events, news -> data/extra.json (fan sites, collected by scripts/scrape.mjs).
//   (The wiki banner code below is no longer called: the wiki was months behind.)

import * as db from './db.js';
import { pagesInCategory, categoryAddedTimes, pagesByTitle, changedSince } from './wiki.js';
import { parseBanner } from './parse.js';

export const BANNER_CATEGORIES = [
  'Dokkan Festivals', 'Extreme Z Dokkan Festivals', 'Step-Up Dokkan Festivals', 'Carnivals',
  'Legendary Summons', 'Type, Class and Category Summons', 'Crossover/Collaboration Summons',
  'Ticket Summons', 'Miscellaneous Summons',
];
const SCHEMA = 3;            // bump to force a fresh download on every phone (2 = cards from DOKKAN.FYI)
const FULL_AFTER_DAYS = 80;  // the wiki only keeps ~90 days of change history

// In-memory copy used by the screens.
export const store = { cards: new Map(), banners: new Map(), extra: null, lastSync: null, cardsVersion: null, loaded: false };

let byId = null, byEarlier = null, byName = null;
const nameKey = (title, name) => `${title}|${name}`.toLowerCase().replace(/[^a-z0-9|]+/g, '');
/**
 * Finds a card from another site's reference: by image id (ending in 0, like 1034030),
 * then by an earlier awakening form's id (banners show the card as you summon it),
 * then by "[title] name".
 */
export function cardById(id, title = '', name = '') {
  if (!byId) {
    byId = new Map();
    byEarlier = new Map();
    byName = new Map();
    for (const c of store.cards.values()) {
      if (c.id && !byId.has(c.id)) byId.set(c.id, c);
      for (const e of c.awakensFrom || []) if (!byEarlier.has(e)) byEarlier.set(e, c);
      const k = nameKey(c.title, c.name);
      if (!byName.has(k)) byName.set(k, c);
    }
  }
  id = String(id);
  return byId.get(id) || byEarlier.get(id) || (name ? byName.get(nameKey(title, name)) : null) || null;
}

const listeners = new Set();
export const onChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const emit = (info) => listeners.forEach((fn) => fn(info));

export async function loadLocal() {
  const schema = await db.getMeta('schema');
  if (schema !== SCHEMA) {
    // Data from an older version of the app: start clean.
    await Promise.all([db.clear('cards'), db.clear('banners'), db.setMeta('lastSync', null), db.setMeta('cardsVersion', null)]);
    await db.setMeta('schema', SCHEMA);
  }
  const [cards, banners, lastSync, extra, cardsVersion] = await Promise.all([
    db.getAll('cards'), db.getAll('banners'), db.getMeta('lastSync'), db.getMeta('extra'), db.getMeta('cardsVersion'),
  ]);
  store.cards = new Map(cards.map((c) => [c.page, c]));
  store.banners = new Map(banners.map((b) => [b.page, b]));
  store.extra = extra;
  store.lastSync = lastSync;
  store.cardsVersion = cardsVersion;
  byId = null;
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
  emit({ type: 'sync-start', full });
  try {
    const result = { full, newCards: [], newBanners: [], newNews: [] };
    result.newCards = await syncCards(full, onProgress);
    byId = null;

    // Banners now come with data/extra.json (DokkanStats); the wiki's were months behind.
    const before = new Set((store.extra?.summons?.items || []).map((b) => b.id));
    result.newNews = await syncExtra().catch((err) => { console.warn('extra data:', err); return []; });
    if (before.size) result.newBanners = (store.extra?.summons?.items || []).filter((b) => !before.has(b.id));
    await db.setMeta('lastSync', startedAt);
    store.lastSync = startedAt;
    emit({ type: 'sync-done', ...result });
    return result;
  } catch (err) {
    emit({ type: 'sync-error', error: err });
    throw err;
  }
}

// ---------- cards (data/cards.json) ----------

async function syncCards(force, onProgress) {
  onProgress('Comprobando cartas…');
  const meta = await getJson('data/cards-meta.json');
  if (!force && meta.generated === store.cardsVersion && store.cards.size) return [];
  onProgress(`Descargando ${meta.count} cartas…`);
  const data = await getJson('data/cards.json');
  if (!Array.isArray(data.cards) || data.cards.length < 20) throw new Error('El archivo de cartas está incompleto; se mantiene la base de datos anterior.');
  const hadCards = store.cards.size > 0;
  const newCards = hadCards ? data.cards.filter((c) => !store.cards.has(c.page)) : [];
  await db.clear('cards');
  await db.putMany('cards', data.cards);
  store.cards = new Map(data.cards.map((c) => [c.page, c]));
  store.cardsVersion = data.generated;
  await db.setMeta('cardsVersion', data.generated);
  return newCards;
}

async function getJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

// ---------- banners (Dokkan Wiki) ----------

async function fullBanners(onProgress) {
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
  if (banners.length < 20) throw new Error('La wiki devolvió muy pocos banners; se mantienen los anteriores.');
  const newBanners = store.banners.size ? banners.filter((b) => !store.banners.has(b.page)) : [];
  await db.clear('banners');
  await db.putMany('banners', banners);
  store.banners = new Map(banners.map((b) => [b.page, b]));
  return newBanners;
}

async function changedBanners(since, onProgress) {
  onProgress('Buscando banners nuevos…');
  const titles = await changedSince(since);
  if (!titles.length) return [];
  const now = new Date().toISOString();
  const pages = await pagesByTitle(titles, BANNER_CATEGORIES);
  const banners = [];
  for (const p of pages) {
    const cat = p.categories.find((c) => BANNER_CATEGORIES.includes(c));
    if (!cat) continue;
    const prev = store.banners.get(p.title);
    const b = parseBanner({ ...p, category: cat, added: prev?.added || now });
    if (b) banners.push(b);
  }
  const newBanners = banners.filter((b) => !store.banners.has(b.page));
  await db.putMany('banners', banners);
  banners.forEach((b) => store.banners.set(b.page, b));
  return newBanners;
}

// ---------- tier list / events / news (data/extra.json) ----------

// Returns the news items that weren't there before.
async function syncExtra() {
  const extra = await getJson('data/extra.json');
  const known = new Set((store.extra?.news?.items || []).map((n) => n.id));
  const fresh = store.extra ? (extra.news?.items || []).filter((n) => !known.has(n.id)) : [];
  await db.setMeta('extra', extra);
  store.extra = extra;
  return fresh;
}
