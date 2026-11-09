// Builds data/cards.json (the app's card database) from DOKKAN.FYI, whose data comes from the game.
//
//   node scripts/build-cards.mjs          -> quick update: new cards, new EZA/SEZA and a slow rolling refresh
//   node scripts/build-cards.mjs --full   -> read every card again (first load, ~30 min)
//
// It reads one page per second to go easy on the site, and saves progress as it goes, so a run
// that is stopped half-way continues where it left off next time.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseListing, parseTimeline, parseCharacterMd, parseFormMd } from './fyi.mjs';

const DATA = new URL('../data/', import.meta.url);
const CARDS = fileURLToPath(new URL('cards.json', DATA));
const META = fileURLToPath(new URL('cards-meta.json', DATA));
const STATE = fileURLToPath(new URL('cards-state.json', DATA));

const BASE = 'https://dokkan.fyi';
const UA = 'DokkanDB-fan-app/1.0 (+https://github.com/waltz4replica/dokkandb)';
const RARITIES = new Set(['LR', 'UR', 'SSR']);
const SCHEMA = 1;
const PAUSE_MS = 1000;
const ROLLING = 60;                // cards re-read per quick run (all cards every ~2-3 days)
const QUICK_LISTING_PAGES = 3;     // newest listing pages checked on a quick run

const args = process.argv.slice(2);
const started = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = new Date().toISOString();

let requests = 0;
async function get(path, attempt = 1) {
  await sleep(PAUSE_MS);
  requests++;
  try {
    const res = await fetch(BASE + path, { headers: { 'User-Agent': UA } });
    if (res.status === 404) return null;
    if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err) {
    if (attempt >= 4) throw new Error(`${path}: ${err.message}`);
    await sleep(5000 * attempt);
    return get(path, attempt + 1);
  }
}

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}

// ---------- load what we have ----------

const old = await readJson(CARDS, null);
const state = await readJson(STATE, { fetched: {}, firstSeen: {}, ezaDates: {}, pending: [] });
const cards = new Map((old?.schema === SCHEMA ? old.cards : []).map((c) => [c.page, c]));
// During the first load (even if it takes several runs) cards aren't flagged as "new".
const firstLoad = cards.size === 0 || !!state.pendingFull;
const full = args.includes('--full') || cards.size === 0 || (state.pending.length > 0 && !!state.pendingFull);
// Time limit: long for a full read, short for the regular quick update.
const budgetMin = Number(args.find((a) => a.startsWith('--budget='))?.split('=')[1]) || (full ? 120 : 20);
const deadline = started + budgetMin * 60000;

// ---------- decide which cards to read ----------

const targets = new Set(state.pending);
// --ids=1002350,1012931 or --ids=ssr (every SSR) re-reads just those cards.
const onlyIds = args.find((a) => a.startsWith('--ids='))?.split('=')[1];

if (onlyIds) {
  const list = onlyIds === 'ssr' ? [...cards.values()].filter((c) => c.rarity === 'SSR').map((c) => c.page) : onlyIds.split(',');
  list.forEach((id) => targets.add(id.trim()));
} else if (full && !state.pending.length) {
  console.log('Full read: listing every character…');
  for (let p = 1; ; p++) {
    const html = await get(`/characters?page=${p}`);
    const list = html ? parseListing(html) : [];
    if (!list.length) break;
    list.filter((x) => RARITIES.has(x.rarity)).forEach((x) => targets.add(x.id));
    if (p % 20 === 0) console.log(`  page ${p}: ${targets.size} cards so far`);
  }
  // EZA / SEZA dates for every card, from the release timeline.
  console.log('Reading the release timeline…');
  for (let p = 1; ; p++) {
    const html = await get(`/characters/timeline?page=${p}`);
    const entries = html ? parseTimeline(html) : [];
    if (!entries.length) break;
    for (const e of entries) recordTimeline(e);
  }
  state.pendingFull = true;
} else if (!full) {
  for (let p = 1; p <= QUICK_LISTING_PAGES; p++) {
    const html = await get(`/characters?page=${p}`);
    for (const x of html ? parseListing(html) : []) if (RARITIES.has(x.rarity) && !cards.has(x.id)) targets.add(x.id);
  }
  const html = await get('/characters/timeline');
  for (const e of html ? parseTimeline(html) : []) {
    const changed = recordTimeline(e);
    // Re-read a card when the timeline shows something newer than our last read of it.
    if (changed || !cards.has(e.id) || (state.fetched[e.id] || '') < e.date) targets.add(e.id);
  }
  // Rolling refresh: re-read the cards we read longest ago, to pick up text fixes.
  [...cards.keys()].sort((a, b) => (state.fetched[a] || '').localeCompare(state.fetched[b] || ''))
    .slice(0, ROLLING).forEach((id) => targets.add(id));
}

function recordTimeline(e) {
  if (e.kind === 'new') return false;
  const d = (state.ezaDates[e.id] ||= {});
  if (d[e.kind] === e.date) return false;
  d[e.kind] = e.date;
  return true;
}

// ---------- read the cards ----------

const queue = [...targets];
console.log(`Reading ${queue.length} card pages (budget ${budgetMin} min)…`);
const formCache = new Map();
const handled = new Set();
let done = 0, failed = 0;

for (const id of queue) {
  if (Date.now() > deadline) break;
  try {
    const md = await get(`/characters/${id}.md`);
    if (!md) { handled.add(id); cards.delete(id); continue; }
    const card = parseCharacterMd(md, id);
    if (!RARITIES.has(card.rarity)) { handled.add(id); cards.delete(id); continue; }
    for (const f of card.forms) {
      if (!formCache.has(f.id)) {
        const fmd = await get(`/characters/${f.id}.md`);
        formCache.set(f.id, fmd ? parseFormMd(fmd, f.id) : null);
      }
      Object.assign(f, formCache.get(f.id) || {});
    }
    // Link effects go into one shared list instead of being repeated on every card.
    Object.assign(state.linkFx ||= {}, card.linkFx);
    delete card.linkFx;
    cards.set(id, card);
    handled.add(id);
    state.fetched[id] = now;
    state.firstSeen[id] ??= firstLoad ? '' : now;
  } catch (err) {
    failed++;
    console.warn(`  ${id}: ${err.message}`);
    if (failed > 25) { console.error('Too many failures, stopping.'); break; }
    continue;
  }
  done++;
  if (done % 100 === 0) {
    console.log(`  ${done}/${queue.length}`);
    state.pending = queue.filter((x) => !handled.has(x));
    await save(false);
  }
}

state.pending = queue.filter((id) => !handled.has(id));
if (!state.pending.length) state.pendingFull = false;
await save(true);
console.log(`Done: ${done} read, ${failed} failed, ${state.pending.length} left for next run, ${requests} requests.`);
if (!done && failed) process.exit(1);

// ---------- save ----------

async function save(final) {
  const list = [...cards.values()].map((c) => {
    const d = state.ezaDates[c.page] || {};
    c.dates.glbEza = d.eza || '';
    c.dates.glbSeza = d.seza || '';
    c.firstSeen = state.firstSeen[c.page] ?? '';
    return c;
  }).sort((a, b) => a.page.localeCompare(b.page));
  const links = state.linkFx || {};
  const body = JSON.stringify({ schema: SCHEMA, cards: list, links });
  const before = old && old.schema === SCHEMA ? JSON.stringify({ schema: SCHEMA, cards: old.cards, links: old.links || {} }) : '';
  await mkdir(DATA, { recursive: true });
  await writeFile(STATE, JSON.stringify(state) + '\n');
  if (body === before) { if (final) console.log('Cards unchanged.'); return; }
  const generated = new Date().toISOString();
  await writeFile(CARDS, JSON.stringify({ schema: SCHEMA, generated, count: list.length, links, cards: list }) + '\n');
  await writeFile(META, JSON.stringify({ schema: SCHEMA, generated, count: list.length }) + '\n');
  if (final) console.log(`data/cards.json saved (${list.length} cards).`);
}
