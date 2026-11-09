// Readers for DOKKAN.FYI (https://dokkan.fyi), whose card data comes from the game itself.
// The site offers every character page as Markdown (add ".md" to the URL) and allows automated
// reading in its robots.txt. If the site changes its layout, fix the matching function here.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => s.replace(/[&<>"']/g, (c) => ESC[c]);
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s = '') => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);

/** Thumbnail id used by the game's image files: the card id with its last digit set to 0. */
export const thumbId = (id) => String(Math.floor(+id / 10) * 10);
export const thumbUrl = (id) => {
  const t = thumbId(id);
  return `https://cdn.dokkan.fyi/assets/en/character/thumb/card_${t}_thumb/card_${t}_thumb.png`;
};

// ---------- listing + timeline (HTML) ----------

/** Character listing page -> [{ id, rarity }] in page order (newest first). */
export function parseListing(html) {
  const out = [];
  const seen = new Set();
  const re = /href="\/characters\/(\d{7})"/g;
  let m;
  while ((m = re.exec(html))) {
    const id = m[1];
    if (seen.has(id)) continue;
    const before = html.slice(Math.max(0, m.index - 2500), m.index);
    const rar = [...before.matchAll(/cha_rare_sm_([a-z]+)\./g)].pop()?.[1];
    if (!rar) continue; // links outside the card grid (menus, news)
    seen.add(id);
    out.push({ id, rarity: rar.toUpperCase() });
  }
  return out;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** Release timeline page -> [{ id, date: 'YYYY-MM-DD', kind: 'new' | 'eza' | 'seza' }]. */
export function parseTimeline(html) {
  const out = [];
  for (const month of html.split(/data-testid="timeline-month"/).slice(1)) {
    const head = decode(month.slice(0, 3000).replace(/<[^>]+>/g, ' ')).match(/([A-Z][a-z]+)\s+(\d{4})/);
    if (!head) continue;
    const mon = MONTHS.indexOf(head[1].toLowerCase());
    if (mon < 0) continue;
    const year = head[2];
    for (const day of month.split(/<h3\b/).slice(1)) {
      const d = /^[^>]*>(?:<!--[^>]*-->)*\s*(\d{1,2})\s+[A-Z][a-z]{2}/.exec(day)?.[1];
      if (!d) continue;
      const date = `${year}-${String(mon + 1).padStart(2, '0')}-${d.padStart(2, '0')}`;
      for (const entry of day.split(/data-testid="timeline-entry"/).slice(1)) {
        const id = /href="\/characters\/(\d{7})"/.exec(entry)?.[1];
        if (!id) continue;
        const badges = [...entry.matchAll(/timeline-entry-badge"[^>]*>(?:<!--[^>]*-->)*(?:<span>)?(?:<!--[^>]*-->)*([A-Z]+)/g)].map((b) => b[1]);
        if (!badges.length) out.push({ id, date, kind: 'new' });
        for (const b of badges) if (b === 'EZA' || b === 'SEZA') out.push({ id, date, kind: b.toLowerCase() });
      }
    }
  }
  return out;
}

// ---------- character page (Markdown) ----------

const ICONS = [
  [/up/i, '<span class="ic up">▲</span>'],
  [/down/i, '<span class="ic down">▼</span>'],
  [/once/i, '<span class="tag once">1 vez</span>'],
  [/forever|perm/i, '<span class="tag perm">permanente</span>'],
];

/** Converts a block of skill Markdown into the small, safe HTML the app shows. */
export function mdToHtml(md = '') {
  if (!md.trim()) return '';
  const keep = [];
  const hold = (h) => `\u0001${keep.push(h) - 1}\u0002`;
  let s = md.replace(/!\[([^\]]*)\]\([^)]*\)/g, (_, alt) => hold((ICONS.find(([re]) => re.test(alt)) || [, ''])[1]));
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\\([[\]*_])/g, '$1');

  // Join wrapped lines: an italic heading or list item can continue on the next line(s).
  const lines = [];
  let open = false; // inside a multi-line *heading*
  for (const raw of s.split('\n')) {
    const line = raw.trim();
    if (!line) { open = false; continue; }
    const isHeadStart = /^\*[^*]/.test(line);
    if (open) { lines[lines.length - 1] += ' ' + line; if (/[^*]\*$/.test(line)) open = false; continue; }
    if (isHeadStart) { lines.push(line); open = !/[^*]\*$/.test(line); continue; }
    if (/^- /.test(line) || !lines.length) lines.push(line);
    else lines[lines.length - 1] += ' ' + line; // continuation of the previous item
  }

  const parts = lines.map((line) => {
    let t = esc(line)
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    if (/^\*[^*].*\*$/.test(line)) return { head: true, html: '<b>' + t.slice(1, -1).replace(/\*(.+?)\*/g, '$1') + '</b>' };
    t = t.replace(/(^|\s)\*([^*]+)\*(?=\s|$|[.,;:])/g, '$1<i>$2</i>');
    return { head: false, html: t };
  });
  let html = '';
  parts.forEach((p, i) => {
    if (i) html += p.head ? '<hr>' : '<br>';
    html += p.html;
  });
  return html.replace(/\u0001(\d+)\u0002/g, (_, i) => keep[+i]);
}

const plain = (md = '') => md.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/\\([[\]*_])/g, '$1').replace(/\*+/g, '').replace(/\s+/g, ' ').trim();

// Splits Markdown into { heading: body } for the given heading level ("##" or "###").
function sections(md, level) {
  const out = {};
  const re = new RegExp(`^${level} (.+)$`, 'gm');
  const heads = [...md.matchAll(re)];
  heads.forEach((h, i) => {
    const end = i + 1 < heads.length ? heads[i + 1].index : md.length;
    out[h[1].trim()] = md.slice(h.index + h[0].length, end).trim();
  });
  return out;
}

// "- **Name** (12 Ki, Normal): description" -> [{ name, ki, kind, desc }]
function superAttacks(body = '') {
  const out = [];
  for (const m of body.matchAll(/^- \*\*(.+?)\*\*\s*\(([^)]*)\):\s*([\s\S]*?)(?=\n- \*\*|$)/gm)) {
    const [ki, kind] = m[2].split(',').map((x) => x.trim());
    out.push({ name: plain(m[1]), ki, kind: (kind || '').toLowerCase(), desc: mdToHtml(m[3]) });
  }
  return out;
}

// "**Name**\n\nbody" -> { name, html }
function namedBlock(body = '') {
  const m = /^\*\*(.+?)\*\*\s*\n([\s\S]*)$/.exec(body.trim());
  return m ? { name: plain(m[1]), html: mdToHtml(m[2]) } : { name: '', html: mdToHtml(body) };
}

function activeSkill(body) {
  if (!body) return null;
  const { name, html: _ } = namedBlock(body);
  const rest = body.trim().replace(/^\*\*.+?\*\*\s*/, '');
  const cond = /^Condition:\s*([\s\S]*)$/m.exec(rest);
  const desc = cond ? rest.slice(0, cond.index) : rest;
  return { name, desc: mdToHtml(desc), condition: cond ? mdToHtml(cond[1]) : '' };
}

const num = (s) => { const n = parseInt(String(s || '').replace(/[^\d]/g, ''), 10); return Number.isFinite(n) ? n : null; };

function stats(body = '') {
  const rows = {};
  for (const line of body.split('\n')) {
    const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
    if (cells.length >= 3 && /^(HP|ATK|DEF)$/.test(cells[0])) rows[cells[0].toLowerCase()] = [num(cells[1]), num(cells[cells.length - 1])];
  }
  return { hp: rows.hp || [null, null], atk: rows.atk || [null, null], def: rows.def || [null, null] };
}

/** Transformation targets listed on the page: [{ id, title, name, condition }]. */
function transformations(body = '') {
  const out = [];
  for (const m of body.matchAll(/^- \[\\\[(.+?)\\\]\s*(.+?)\]\(https:\/\/dokkan\.fyi\/characters\/(\d{7})\)\s*(?:\(([^)]*)\))?:?\s*(.*)$/gm)) {
    out.push({ id: m[3], title: m[1], name: m[2], how: m[4] || '', condition: mdToHtml(m[5] || '') });
  }
  return out;
}

/**
 * Character Markdown -> card object in the shape the app uses.
 * Same fields as the old wiki reader, so the screens keep working.
 */
export function parseCharacterMd(md, id) {
  md = md.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  // The title can wrap onto a second line ("... (Angel) &\nSuper Saiyan Vegeta (Angel)").
  const titleLine = (/^# ([\s\S]+?)\n\s*\n/.exec(md)?.[1] || '').replace(/\s*\n\s*/g, ' ').trim();
  const tm = /^\\?\[(.+?)\\?\]\s*(.+)$/.exec(titleLine);
  const info = (label) => new RegExp(`^- ${label}:\\s*(.+)$`, 'm').exec(md)?.[1]?.trim() || '';
  // "LR Super AGL", or just "SSR TEQ" for cards without a class.
  const rtWords = info('Rarity and Type').split(/\s+/);
  const rt = rtWords.length === 2 ? [rtWords[0], '', rtWords[1]] : rtWords;
  const top = sections(md, '##');
  const eza = top['Extreme Z-Awakening'] ? sections(top['Extreme Z-Awakening'], '###') : null;
  const seza = top['Super Extreme Z-Awakening'] ? sections(top['Super Extreme Z-Awakening'], '###') : null;

  const sa = superAttacks(top['Super Attacks']);
  const pickSa = (list, kind) => list.find((x) => x.kind === kind);
  const level = (getter) => {
    const o = { base: getter(top) || '' };
    if (eza && getter(eza)) o.eza = getter(eza);
    if (seza && getter(seza)) o.seza = getter(seza);
    return o;
  };
  const saLevels = (kind) => {
    const base = pickSa(sa, kind);
    if (!base) return null;
    const o = { name: base.name, base: base.desc };
    const e = eza && pickSa(superAttacks(eza['Super Attacks']), kind);
    const z = seza && pickSa(superAttacks(seza['Super Attacks']), kind);
    if (e) o.eza = e.desc;
    if (z) o.seza = z.desc;
    return o;
  };
  const passive = level((s) => s['Passive Skill'] && namedBlock(s['Passive Skill']).html);
  const leader = level((s) => s['Leader Skill'] && mdToHtml(s['Leader Skill'].replace(/\n(?!\n)/g, '\n\n')));
  const normal = saLevels('normal') || saLevels(sa[0]?.kind) || { name: '', base: '' };

  const card = {
    page: id,
    id: thumbId(id),
    title: tm ? decode(tm[1]) : '',
    name: tm ? decode(tm[2]) : titleLine,
    rarity: (rt[0] || '').toUpperCase(),
    cls: rt[1] === 'Extreme' ? 'Extreme' : rt[1] === 'Super' ? 'Super' : '',
    type: (rt[2] || '').toUpperCase(),
    cost: num(info('Cost')),
    maxLevel: num(info('Max Level')),
    leader,
    superAttack: normal,
    ultraSuperAttack: saLevels('ultra'),
    exSuperAttack: null,
    passive: { name: top['Passive Skill'] ? namedBlock(top['Passive Skill']).name : '', ...passive },
    active: activeSkill(top['Active Skill']),
    transformation: '',
    forms: transformations(top['Transformation Path']),
    links: [...(top['Link Skills'] || '').matchAll(/^- \*\*(.+?)\*\*/gm)].map((m) => plain(m[1])),
    categories: [...(top.Categories || '').matchAll(/^- \[(.+?)\]\(/gm)].map((m) => plain(m[1])),
    stats: stats(top.Stats),
    ki12: '',
    eza: !!eza,
    seza: !!seza,
    dates: { jp: '', glb: info('Released'), jpEza: '', glbEza: '', jpSeza: '', glbSeza: '' },
    image: thumbUrl(id),
    source: `https://dokkan.fyi/characters/${id}`,
  };
  // Earlier forms of this card (what banners and the wiki usually show), by image id.
  card.awakensFrom = [...new Set([...(top['Awakening Path'] || '').matchAll(/characters\/(\d{7})\)/g)]
    .map((m) => thumbId(m[1])))].filter((t) => t !== card.id);
  card.released = card.dates.glb;
  card.search = [card.title, card.name, card.rarity, card.type, card.cls, ...card.categories, ...card.links].join(' ').toLowerCase();
  return card;
}

/** Short version of a transformed form (passive, attacks, links) to show inside its base card. */
export function parseFormMd(md, id) {
  const c = parseCharacterMd(md, id);
  return {
    id, title: c.title, name: c.name, type: c.type, cls: c.cls, image: c.image,
    superAttack: c.superAttack, ultraSuperAttack: c.ultraSuperAttack, passive: c.passive, active: c.active,
    links: c.links, stats: c.stats, eza: c.eza, seza: c.seza,
  };
}
