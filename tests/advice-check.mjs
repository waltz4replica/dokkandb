// Checks the automatic card guide (js/advice.js) on real cards.
// Run: node tests/advice-check.mjs
import { readFile } from 'node:fs/promises';
import { cardAdvice } from '../js/advice.js';

const { cards } = JSON.parse(await readFile(new URL('../data/cards.json', import.meta.url), 'utf8'));
const byId = new Map(cards.map((c) => [c.page, c]));
let fail = 0;
const check = (label, ok) => { console.log(ok ? '  ok  ' : '  FAIL', label); if (!ok) fail++; };
const advice = (id) => cardAdvice(byId.get(id), cards);

// Frieza (Full Power): different boosts as 1st and as 2nd/3rd attacker
const frieza = advice('1004251');
check('Frieza: slot 1 defence', frieza.slot.some((s) => /^Slot 1: gana defensa/.test(s)));
check('Frieza: slot 2 o 3 attack and defence', frieza.slot.some((s) => /^Slot 2 o 3: gana ataque y defensa/.test(s)));
check('Frieza: extra effects from turn 5', frieza.timing.some((s) => /turno 5/.test(s)));
check('Frieza: Wicked Bloodline team', frieza.teams.some((t) => t.group === '«Wicked Bloodline»'));

// Nappa/Vegeta: active skill from turn 3, exchange shown once
const nappa = advice('1019401');
check('Nappa: active skill from turn 3', nappa.timing.some((s) => /Habilidad activa.*turno 3/.test(s)));
check('Nappa: exchange listed once', nappa.timing.filter((s) => /intercambia/.test(s)).length === 1);

// Great Saiyaman 2: strong for its first 5 turns
const gs2 = advice('1034731');
check('Great Saiyaman 2: first 5 turns', gs2.timing.some((s) => /primeros 5 turnos/.test(s)));
check('Great Saiyaman 2: own leader skill', gs2.ownLead >= 150);

// Every card gets a guide with something in each section, quickly
const t0 = Date.now();
let empty = 0;
for (const c of cards.slice(0, 200)) {
  const a = cardAdvice(c, cards);
  if (!a.role || !a.events.length || !a.slot.length || !a.timing.length) empty++;
}
const ms = (Date.now() - t0) / 200;
check(`every section filled (${empty} empty of 200)`, empty === 0);
check(`fast enough (${ms.toFixed(1)} ms per card)`, ms < 60);

process.exit(fail ? 1 : 0);
