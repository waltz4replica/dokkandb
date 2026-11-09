// Checks the DOKKAN.FYI readers against saved pages.
// Run: node tests/fyi-check.mjs <folder with fyi-*.md, fyi-chars.html, fyi-timeline.html>
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseCharacterMd, parseListing, parseTimeline } from '../scripts/fyi.mjs';

const dir = process.argv[2];
const load = (f) => readFile(join(dir, f), 'utf8');
let fail = 0;
const check = (label, ok) => { console.log(ok ? '  ok  ' : '  FAIL', label); if (!ok) fail++; };

const goku = parseCharacterMd(await load('fyi-1034031.md'), '1034031');
console.log('Goku:', goku.title, '|', goku.name, goku.rarity, goku.cls, goku.type, goku.cost, goku.released, JSON.stringify(goku.stats));
console.log('  leader:', goku.leader.base);
console.log('  SA:', goku.superAttack.name, '|', goku.superAttack.base, '|| USA:', goku.ultraSuperAttack?.name);
console.log('  passive:', goku.passive.name, '|', goku.passive.base.slice(0, 400));
console.log('  active:', JSON.stringify(goku.active).slice(0, 250));
console.log('  forms:', JSON.stringify(goku.forms));
check('goku name', goku.title === "Furious Fighter's Immense Power" && goku.name === 'Super Saiyan Goku');
check('goku basics', goku.rarity === 'LR' && goku.type === 'AGL' && goku.cls === 'Super' && goku.id === '1034030');
check('goku stats', goku.stats.hp[0] === 6087 && goku.stats.hp[1] === 20088);
check('goku links/cats', goku.links.length === 7 && goku.categories.length === 17);
check('goku USA', goku.ultraSuperAttack?.name === 'Super Kamehameha');
check('goku active', goku.active?.name === 'Goku, Fighter of Fury' && goku.active.condition.length > 20);
check('goku form', goku.forms.length === 1 && goku.forms[0].id === '4034041');
check('no markdown left', !/\*\*|!\[|\]\(/.test(goku.passive.base + goku.leader.base));

const cooler = parseCharacterMd(await load('fyi-1009091.md'), '1009091');
console.log('Cooler seza passive:', cooler.passive.seza?.slice(0, 300));
check('cooler seza', cooler.seza && cooler.passive.seza.includes('200%') && cooler.leader.seza.includes('130%'));
check('cooler multi-line heading', /<b>When there are 3 [^<]*attacking in the same turn<\/b>/.test(cooler.passive.seza));
check('cooler stats use awakened max', cooler.stats.hp[1] === 14653);

const bulma = parseCharacterMd(await load('fyi-1026611.md'), '1026611');
check('bulma eza', bulma.eza && !!bulma.passive.eza);

const list = parseListing(await load('fyi-chars.html'));
console.log(`Listing: ${list.length} entries`, list.slice(0, 5));
check('listing 12 per page', list.length === 12);
check('listing rarities', list.every((x) => ['LR', 'UR', 'SSR', 'SR', 'R', 'N'].includes(x.rarity)));

const tl = parseTimeline(await load('fyi-timeline.html'));
console.log(`Timeline: ${tl.length} entries`, tl.slice(0, 4));
check('timeline entries', tl.length >= 20);
check('timeline eza', tl.some((x) => x.kind === 'eza') && tl.some((x) => x.kind === 'seza'));
check('timeline dates', tl.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.date)));

process.exit(fail ? 1 : 0);
