// Reads tier list, events and news from the fan sites and saves them to data/extra.json.
// Runs on GitHub every few hours (.github/workflows/scrape.yml); you can also run it by hand: npm run scrape
//
// Sources (all allow automated reading for reference use in their robots.txt):
//   - DokkanStats community tier list and events list
//   - DOKKAN.FYI in-game news
// dokkaninfo.com blocks automated requests, so it is not used.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseDokkanStatsTierList, parseDokkanStatsEvents, parseDokkanStatsSummons, parseDokkanStatsSummonDetail, parseFyiNews } from './scrapers.mjs';

const OUT = fileURLToPath(new URL('../data/extra.json', import.meta.url));
const UA = 'DokkanDB-fan-app/1.0 (+https://github.com/waltz4replica/dokkandb)';

const SOURCES = {
  tierlist: {
    url: 'https://dokkanstats.com/en/tierlists/community-tierlist/',
    site: 'DokkanStats',
    read: (html) => {
      const tiers = parseDokkanStatsTierList(html);
      if (tiers.reduce((n, t) => n + t.units.length, 0) < 20) throw new Error('tier list looks empty');
      return { tiers };
    },
  },
  events: {
    url: 'https://dokkanstats.com/en/events/',
    site: 'DokkanStats',
    read: (html) => {
      const items = parseDokkanStatsEvents(html).filter((e) => e.active);
      if (items.length < 5) throw new Error('events list looks empty');
      return { items };
    },
  },
  summons: {
    url: 'https://dokkanstats.com/en/summons/',
    site: 'DokkanStats',
    read: async (html, prev) => {
      const current = parseDokkanStatsSummons(html);
      if (current.length < 3) throw new Error('summons list looks empty');
      // The page only lists current and upcoming banners: keep older ones as history.
      const byId = new Map((prev?.items || []).map((b) => [b.id, b]));
      for (const b of current) {
        const old = byId.get(b.id);
        // Keep the main / featured / secondary split read earlier, unless the card list changed.
        const keep = old?.groups && old.cards.join() === b.cards.join() ? { groups: old.groups } : {};
        byId.set(b.id, { ...b, ...keep });
      }
      const items = [...byId.values()].sort((a, b) => (b.start || '').localeCompare(a.start || '')).slice(0, 300);
      // Read each banner's own page once to split its cards (newest first, a few per run, slowly).
      const todo = items.filter((b) => (!b.groups || !b.groups.names) && b.cards.length && b.url && !(b.end && Date.parse(b.end) < Date.now())).slice(0, 25);
      for (const b of todo) {
        try {
          const groups = parseDokkanStatsSummonDetail(await fetchHtml(b.url));
          if (groups) b.groups = groups;
        } catch (err) {
          console.error(`  banner ${b.id}: ${err.message}`);
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      if (todo.length) console.log(`  banner pages read: ${todo.filter((b) => b.groups).length}/${todo.length}`);
      return { items };
    },
  },
  news: {
    url: 'https://dokkan.fyi/news',
    site: 'DOKKAN.FYI',
    read: (html) => {
      const items = parseFyiNews(html);
      if (items.length < 3) throw new Error('news list looks empty');
      return { items };
    },
  },
};

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

let previous = {};
try { previous = JSON.parse(await readFile(OUT, 'utf8')); } catch { /* first run */ }

const next = { ...previous };
let ok = 0;
for (const [key, src] of Object.entries(SOURCES)) {
  try {
    const data = await src.read(await fetchHtml(src.url), previous[key]);
    const changed = JSON.stringify(data) !== JSON.stringify(stripMeta(previous[key]));
    next[key] = { ...data, source: src.site, url: src.url, updated: changed ? new Date().toISOString() : previous[key]?.updated };
    console.log(`${key}: ok${changed ? ' (changed)' : ''}`);
    ok++;
  } catch (err) {
    // Keep the last good copy so the app never loses data because one site is down.
    console.error(`${key}: FAILED (${err.message}) — keeping previous data`);
  }
}

if (JSON.stringify(next) !== JSON.stringify(previous)) {
  next.generated = new Date().toISOString();
  await mkdir(new URL('../data/', import.meta.url), { recursive: true });
  await writeFile(OUT, JSON.stringify(next, null, 1) + '\n');
  console.log('data/extra.json updated');
} else {
  console.log('no changes');
}
if (!ok) process.exit(1);

function stripMeta(section) {
  if (!section) return section;
  const { source, url, updated, ...rest } = section;
  return rest;
}
