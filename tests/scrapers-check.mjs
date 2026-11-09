// Checks the site readers against saved pages (or live ones with --live).
// Run: node tests/scrapers-check.mjs <folder with ds-tier.html, ds-events.html, fyi-news.html>
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseDokkanStatsTierList, parseDokkanStatsEvents, parseDokkanStatsSummonDetail, parseFyiNews } from '../scripts/scrapers.mjs';

const dir = process.argv[2];
const load = (f) => readFile(join(dir, f), 'utf8');
let fail = 0;
const check = (label, ok) => { console.log(ok ? '  ok  ' : '  FAIL', label); if (!ok) fail++; };

const tiers = parseDokkanStatsTierList(await load('ds-tier.html'));
console.log('Tier list:', tiers.map((t) => `${t.tier}:${t.units.length}`).join(' '));
console.log('  #1:', JSON.stringify(tiers[0]?.units[0]));
check('10 tiers', tiers.length === 10);
check('~90 units', tiers.reduce((n, t) => n + t.units.length, 0) >= 80);
check('names parsed', tiers.every((t) => t.units.every((u) => u.name)));

const events = parseDokkanStatsEvents(await load('ds-events.html'));
const active = events.filter((e) => e.active);
console.log(`Events: ${events.length} total, ${active.length} active`);
console.log('  first active:', JSON.stringify(active[0]));
check('events found', events.length > 100);
check('some active', active.length > 0 && active.length < events.length);
check('event images', active.every((e) => e.image.startsWith('https://')));

const news = parseFyiNews(await load('fyi-news.html'));
console.log(`News: ${news.length}`);
console.log('  first:', JSON.stringify(news[0]));
check('news found', news.length >= 6);
check('news dates', news.every((n) => n.iso));

// Saved from https://dokkanstats.com/en/summons/12600/ (Great Saiyaman 2 Dokkan Festival).
const g = parseDokkanStatsSummonDetail(await load('ds-summon-12600.html'));
console.log('Banner groups:', g && [g.main.length, g.featured.length, g.secondary.length, g.unfeatured].join('/'));
check('banner main units', g?.main.join() === '1034720,1034940');
check('banner featured / secondary', g?.featured.length === 8 && g?.secondary.length === 10);
check('banner unfeatured count', g?.unfeatured === 546);

process.exit(fail ? 1 : 0);
