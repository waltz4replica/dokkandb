// Checks the skill-effect reader (js/effects.js) on sample texts and on the real card data.
// Run: node tests/effects-check.mjs
import { readFile } from 'node:fs/promises';
import { cardEffects, orbTargets, EFFECTS } from '../js/effects.js';

let fail = 0;
const check = (label, ok) => { console.log(ok ? '  ok  ' : '  FAIL', label); if (!ok) fail++; };
const fake = (sa, passive = '', extra = {}) => ({ superAttack: { base: sa }, passive: { base: passive }, ...extra });
const has = (card, id) => cardEffects(card).fx.has(id);

// Stacking from super attacks
check('"Raises ATK" stacks', has(fake('Raises ATK and causes supreme damage to enemy'), 'atk-stack'));
check('"raises ATK for 3 turns" stacks', has(fake('Causes supreme damage to all enemies and raises ATK for 3 turns'), 'atk-stack'));
check('"Raises ATK for 1 turn" does not', !has(fake('Raises ATK for 1 turn and causes supreme damage to enemy'), 'atk-stack'));
check('"Raises ATK & DEF for 1 turn" does not', !has(fake('Raises ATK & DEF for 1 turn and causes immense damage'), 'atk-stack'));
check('"Raises ATK & DEF by 35% for 1 turn" does not', !has(fake('Raises ATK & DEF by 35% for 1 turn and causes damage'), 'def-stack'));
check('"raises DEF by 30% for 6 turns" stacks DEF', has(fake('Causes supreme damage to enemy and raises DEF by 30% for 6 turns'), 'def-stack'));
check('passive "permanente ATK" stacks', has(fake('Causes damage', 'For every attack performed - <span class="tag">permanente</span> ATK 50% ▲ (up to 200%)'), 'atk-stack'));

// Against the enemy
check('SA "lowers ATK"', has(fake('Causes supreme damage to enemy and lowers ATK'), 'enemy-atk'));
check('passive "All enemies\' DEF 50% ▼"', has(fake('x', 'All enemies&#39; DEF 50% ▼'), 'enemy-def'));
check('"lowers ATK" is not "lowers DEF"', !has(fake('Causes supreme damage to enemy and lowers ATK'), 'enemy-def'));

// Area attacks and orbs
check('damage to all enemies', has(fake('Causes mass damage to all enemies'), 'aoe'));
check('orbs AGL to TEQ', orbTargets('Changes Ki Spheres: AGL to TEQ').join() === 'TEQ');
check('orbs to Rainbow', orbTargets('Randomly changes Ki Spheres of a certain Type to Rainbow Ki Spheres').join() === 'Rainbow');
check('using orbs is not changing them', orbTargets('For every INT Ki Sphere obtained - Recovers 2000 HP').length === 0);

// Real data: every effect finds some cards, none finds (almost) all of them
const { cards } = JSON.parse(await readFile(new URL('../data/cards.json', import.meta.url), 'utf8'));
for (const [id, label] of EFFECTS) {
  const n = cards.filter((c) => cardEffects(c).fx.has(id)).length;
  check(`${label}: ${n} cartas`, n >= 5 && n < cards.length * 0.8);
}

process.exit(fail ? 1 : 0);
