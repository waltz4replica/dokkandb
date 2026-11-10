// Reads what a card's skills do (passive, super attacks, active skill) from their English text,
// so the Cards screen can filter by effect. Uses each skill's highest level (SEZA > EZA > base)
// and includes transformations. Increases show as "▲" and decreases as "▼" in the text;
// boosts that stay for the whole battle carry the "permanente" tag.
// Tests: tests/effects-check.mjs

const plain = (html = '') => html.replace(/<[^>]+>/g, ' ')
  .replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/’/g, "'").replace(/\s+/g, ' ').trim();

const top = (o) => (o ? o.seza || o.eza || o.base || o.desc || '' : '');

// "ATK", "DEF", "ATK & DEF", "DEF & ATK"
const statRe = (stat) => `(?:ATK (?:&|and) DEF|DEF (?:&|and) ATK|${stat})`;

// Super attack that raises the stat for the battle ("Raises ATK", no duration) or for 2+ turns,
// or a passive boost marked "permanente" ("For every attack performed - permanente ATK 50% ▲ (up to 200%)").
const stacks = (stat) => (T) =>
  new RegExp(`raises? ${statRe(stat)}(?!(?: (?:&|and) (?:ATK|DEF))?(?: by \\d+%)? (?:for 1 turn|temporarily))`, 'i').test(T.s)
  || new RegExp(`permanente ${statRe(stat)}`, 'i').test(T.p);

// "lowers ATK" (super attack), "All enemies' DEF 50% ▼", "Attacked enemy's ATK & DEF 20% ▼".
const lowersEnemy = (stat) => (T) =>
  new RegExp(`(?:lowers?|reduces?) (?:the )?(?:(?:all |attacked |target )?enem(?:y|ies)'?s? )?${statRe(stat)}`, 'i').test(`${T.s} | ${T.p} | ${T.a}`)
  || new RegExp(`enem(?:y|ies)'?s? ${statRe(stat)} \\d+% ▼`, 'i').test(`${T.p} | ${T.a}`);

const any = (re, where = 'psa') => (T) => [...where].some((k) => re.test(T[k]));

// [id, label, test(texts, card)]
export const EFFECT_GROUPS = [
  ['Ataque', [
    ['atk-stack', 'Acumula ATK', stacks('ATK')],
    ['aoe', 'Ataca a todos los enemigos', any(/damage to all enem/i)],
    ['extra', 'Ataques adicionales', any(/additional (?:super )?attack|attacks? (?:twice|\d+ times)/i, 'p')],
    ['crit', 'Golpe crítico', any(/critical hit/i)],
    ['eff-all', 'Eficaz contra todos los tipos', any(/effective against all types/i)],
  ]],
  ['Defensa', [
    ['def-stack', 'Acumula DEF', stacks('DEF')],
    ['dmg-red', 'Reduce el daño recibido', any(/damage reduction|reduces damage received/i)],
    ['evade', 'Esquiva', any(/evad/i)],
    ['guard', 'Guardia', any(/guards? (?:against )?all attacks|activates? guard/i)],
    ['counter', 'Contraataca', any(/counter/i, 'p')],
    ['heal', 'Recupera vida', any(/recovers? (?:\d+% )?(?:of )?(?:\d+ )?HP/i)],
  ]],
  ['Contra el enemigo', [
    ['enemy-atk', 'Baja ATK del enemigo', lowersEnemy('ATK')],
    ['enemy-def', 'Baja DEF del enemigo', lowersEnemy('DEF')],
    ['stun', 'Aturde', any(/\bstun/i)],
    ['seal', 'Sella súper ataques', any(/\bseal/i)],
  ]],
  ['Orbes y apoyo', [
    ['orbs', 'Cambia orbes', (T) => orbTargets(`${T.p} | ${T.a} | ${T.s}`).length > 0],
    ['support', 'Apoya a aliados', any(/allies' (?:Ki|ATK|DEF)|ally's (?:Ki|ATK|DEF)/i, 'p')],
    ['active', 'Habilidad activa', (T) => T.a.length > 0],
    ['transform', 'Se transforma', (T, c) => (c.forms || []).length > 0],
    ['revive', 'Revive', any(/reviv/i)],
  ]],
];

export const EFFECTS = EFFECT_GROUPS.flatMap(([, list]) => list);
export const EFFECT_LABEL = Object.fromEntries(EFFECTS.map(([id, label]) => [id, label]));
export const ORB_TYPES = ['AGL', 'TEQ', 'INT', 'STR', 'PHY', 'Rainbow'];
export const ORB_LABELS = { Rainbow: 'Arcoíris' };

// Which Ki Sphere types a skill turns orbs into:
// "Changes Ki Spheres: AGL to TEQ", "Randomly changes Ki Spheres of a certain Type to Rainbow Ki Spheres".
export function orbTargets(t) {
  const out = new Set();
  const re = /(?:changes?|turns?|converts?)\b[^.;|]*?Ki Spheres?[^.;|]*?\b(?:to|into)\s+(?:an? )?(AGL|TEQ|INT|STR|PHY|Rainbow)\b/gi;
  let m;
  while ((m = re.exec(t))) out.add(ORB_TYPES.find((x) => x.toLowerCase() === m[1].toLowerCase()));
  return [...out].filter(Boolean);
}

const cache = new WeakMap();

/** { fx: Set of effect ids, orbs: Set of orb types } for a card (cached per card object). */
export function cardEffects(c) {
  let hit = cache.get(c);
  if (hit) return hit;
  const forms = c.forms || [];
  const T = {
    p: [c.passive, ...forms.map((f) => f.passive)].map(top).map(plain).filter(Boolean).join(' | '),
    s: [c.superAttack, c.ultraSuperAttack, c.exSuperAttack, ...forms.flatMap((f) => [f.superAttack, f.ultraSuperAttack])].map(top).map(plain).filter(Boolean).join(' | '),
    a: [c.active, ...forms.map((f) => f.active)].map(top).map(plain).filter(Boolean).join(' | '),
  };
  const fx = new Set(EFFECTS.filter(([, , test]) => test(T, c)).map(([id]) => id));
  hit = { fx, orbs: new Set(orbTargets(`${T.p} | ${T.a} | ${T.s}`)) };
  cache.set(c, hit);
  return hit;
}
