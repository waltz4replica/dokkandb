// Checks the team builder logic against the real card database.
// Run: node tests/teams-check.mjs
import { readFile } from 'node:fs/promises';
import { leaderClauses, coverage, sharedLinks, rotation, optimizeOrder, suggestLeaders, sharedCategories, encodeTeam, decodeTeam } from '../js/teams.js';

const { cards } = JSON.parse(await readFile(new URL('../data/cards.json', import.meta.url), 'utf8'));
const byId = new Map(cards.map((c) => [c.page, c]));
let fail = 0;
const check = (label, ok) => { console.log(ok ? '  ok  ' : '  FAIL', label); if (!ok) fail++; };

// Category leader with an extra clause
const goku = byId.get('1034031'); // "Golden Fighters" or "Planet Namek Saga" Category … +220%
const gc = leaderClauses(goku);
console.log('Goku clauses:', JSON.stringify(gc.map(({ text, ...c }) => c)));
check('category leader', gc.length >= 1 && gc[0].categories.includes('Golden Fighters') && gc[0].pct === 220 && gc[0].ki === 3);
check('covers himself', coverage(goku, goku).covered && coverage(goku, goku).pct === 220);

// Type leader with class
const cooler = byId.get('1009091'); // Extreme PHY Type … ; Super PHY Type …
const cc = leaderClauses(cooler);
console.log('Cooler clauses:', JSON.stringify(cc.map(({ text, ...c }) => c)));
const ephy = cards.find((c) => c.cls === 'Extreme' && c.type === 'PHY' && c.page !== '1009091');
const sagl = cards.find((c) => c.cls === 'Super' && c.type === 'AGL');
check('type leader covers Extreme PHY', coverage(cooler, ephy).covered);
check('type leader skips Super AGL', !coverage(cooler, sagl).covered);

// Every LR/UR leader should be readable unless it isn't a team leader
const unread = cards.filter((c) => c.rarity !== 'SSR' && !leaderClauses(c).length);
console.log(`Leaders not read: ${unread.length}/${cards.filter((c) => c.rarity !== 'SSR').length}`);
unread.slice(0, 8).forEach((c) => console.log('   ', c.page, c.leader.base.replace(/<[^>]+>/g, '').slice(0, 120)));
check('almost all leaders read', unread.length < 40);

// Links, rotation, optimise
const team = ['1034031', '1034201', '1034071', '1034121', '1034091', '1034761', '1034031'].map((id) => byId.get(id));
check('shared links', sharedLinks(team[0], team[1]).length > 0);
const rot = rotation(team);
check('7 turns', rot.length === 7 && rot[2].units.join() === '6,0,1');
const opt = optimizeOrder(team);
console.log('rotation links:', rot.reduce((n, t) => n + t.links, 0), '-> optimised:', opt.score);
check('optimise never worse', opt.score >= rot.reduce((n, t) => n + t.links, 0));
check('leader & friend fixed', opt.order[0] === team[0] && opt.order[6] === team[6]);

const sug = suggestLeaders(team.slice(1, 6), cards, 5);
console.log('suggested leaders:', sug.map((s) => `${s.card.name} (${s.covered}/5, ${s.pct}%)`).join(' | '));
check('suggest leaders', sug.length > 0 && sug[0].covered >= 3);
check('shared categories', sharedCategories(team).length > 0);
check('share code round trip', decodeTeam(encodeTeam(['1034031', null, '1034201'])).join() === '1034031,,1034201,,,,');

process.exit(fail ? 1 : 0);
