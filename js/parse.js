// Turns Dokkan Wiki wikitext into clean data objects.
// Works in the browser and in Node (used by the tests).

/** Finds the first {{Name ...}} template and returns its fields as an object. */
export function parseTemplate(wikitext, name) {
  const start = findTemplateStart(wikitext, name);
  if (start < 0) return null;
  const body = sliceBalanced(wikitext, start);
  if (body == null) return null;
  const inner = body.slice(2 + name.length, -2); // drop "{{Name" and "}}"
  const fields = {};
  for (const part of splitTopLevel(inner, '|').slice(1)) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    if (key) fields[key] = part.slice(eq + 1).trim();
  }
  return fields;
}

function findTemplateStart(text, name) {
  const re = new RegExp('\\{\\{\\s*' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*[|}\\n]', 'i');
  const m = re.exec(text);
  return m ? m.index : -1;
}

// Returns text from `start` up to the matching close of the "{{" found there.
function sliceBalanced(text, start) {
  let depth = 0;
  for (let i = start; i < text.length - 1; i++) {
    const two = text[i] + text[i + 1];
    if (two === '{{') { depth++; i++; }
    else if (two === '}}') { depth--; i++; if (depth === 0) return text.slice(start, i + 1); }
  }
  return null;
}

// Splits on `sep` only where it isn't inside [[...]] or {{...}}.
function splitTopLevel(text, sep) {
  const out = [];
  let depth = 0, last = 0;
  for (let i = 0; i < text.length; i++) {
    const two = text[i] + (text[i + 1] || '');
    if (two === '{{' || two === '[[') { depth++; i++; continue; }
    if ((two === '}}' || two === ']]') && depth > 0) { depth--; i++; continue; }
    if (text[i] === sep && depth === 0) { out.push(text.slice(last, i)); last = i + 1; }
  }
  out.push(text.slice(last));
  return out;
}

const TYPE_NAMES = { PHY: 'PHY', STR: 'STR', AGL: 'AGL', TEQ: 'TEQ', INT: 'INT' };

/** "EINT" -> { cls: 'Extreme', type: 'INT' } */
export function splitType(raw = '') {
  const t = raw.trim().toUpperCase();
  const m = /^([SE])?(PHY|STR|AGL|TEQ|INT)$/.exec(t);
  if (!m) return { cls: '', type: '' };
  return { cls: m[1] === 'E' ? 'Extreme' : m[1] === 'S' ? 'Super' : '', type: TYPE_NAMES[m[2]] };
}

/** "[[A]] - [[B (Category)|B]]" -> ["A", "B"] */
export function parseLinkList(raw = '') {
  const names = [];
  const re = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  let m;
  while ((m = re.exec(raw))) names.push((m[2] || m[1]).trim());
  if (names.length) return names;
  return raw.split(/\s+-\s+/).map((s) => plainText(s)).filter(Boolean);
}

/** Card id from "[[File:Card 1009090 thumb.png|120px]]" or "Card_1009090_thumb.png". */
export function cardIdFrom(raw = '') {
  const m = /Card[ _](\d{7})[ _]/i.exec(raw);
  return m ? m[1] : '';
}

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** "29 Aug 2017" -> "2017-08-29" (or '' if it can't be read). */
export function parseDate(raw = '') {
  const m = /(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})/.exec(raw);
  if (!m) return '';
  const mon = MONTHS[m[2].toLowerCase()];
  if (mon == null) return '';
  return `${m[3]}-${String(mon + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function num(raw) {
  const n = parseInt(String(raw || '').replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

const PASSIVE_ICONS = {
  uparrow: '<span class="ic up">▲</span>',
  downarrow: '<span class="ic down">▼</span>',
  onetime: '<span class="tag once">1 vez</span>',
  permanent: '<span class="tag perm">permanente</span>',
};

/**
 * Converts wikitext to safe, minimal HTML.
 * Only <b>, <i>, <br>, <hr> and our own icon spans survive; everything else is escaped.
 */
export function wikiToHtml(raw = '') {
  if (!raw) return '';
  const keep = [];
  const hold = (html) => `\u0001${keep.push(html) - 1}\u0002`;
  let s = raw
    .replace(/<ref[^>]*\/>/gi, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\{\{\s*Passive\s*\|\s*([^}|]+)[^}]*\}\}/gi, (_, k) => hold(PASSIVE_ICONS[k.trim().toLowerCase()] || ''))
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\[\[File:([^\]|]+?)(?:\|[^\]]*)?\]\]/gi, (_, f) => {
      const t = /^([SE])?(PHY|STR|AGL|TEQ|INT) icon/i.exec(f.trim());
      return t ? hold(`<span class="type t-${t[2].toLowerCase()}">${t[2].toUpperCase()}</span>`) : '';
    })
    .replace(/\[\[Category:[^\]]*\]\]/gi, '')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/'''(.+?)'''/g, (_, t) => hold('<b>') + t + hold('</b>'))
    .replace(/''(.+?)''/g, (_, t) => hold('<i>') + t + hold('</i>'))
    .replace(/<\s*(\/?)\s*(b|i|strong|em)\s*>/gi, (_, c, t) => hold(`<${c}${t.toLowerCase() === 'strong' ? 'b' : t.toLowerCase() === 'em' ? 'i' : t.toLowerCase()}>`))
    .replace(/<\s*br\s*\/?\s*>/gi, () => hold('<br>'))
    .replace(/<\s*hr\s*\/?\s*>/gi, () => hold('<hr>'))
    .replace(/<[^>]+>/g, '');
  s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  s = s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  s = s.replace(/\u0001(\d+)\u0002/g, (_, i) => keep[+i]);
  s = s.replace(/\n{2,}/g, '<br>').replace(/\n/g, ' ').replace(/(<br>\s*){3,}/g, '<br><br>').trim();
  return s.replace(/^(<br>|<hr>|\s)+|(<br>|<hr>|\s)+$/g, '');
}

/** Wikitext -> plain text (for names, search). */
export function plainText(raw = '') {
  return wikiToHtml(raw).replace(/<br>|<hr>/g, ' ').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

// Picks the most awakened version of a field: SZ (Super EZA) > Z (EZA) > base.
function levels(f, key) {
  const base = f[key] || '';
  const z = f[key + ' Z'] || '';
  const sz = f[key + ' SZ'] || '';
  const out = { base: wikiToHtml(base) };
  if (z) out.eza = wikiToHtml(z);
  if (sz) out.seza = wikiToHtml(sz);
  return out;
}

/**
 * Builds a card object from a wiki page.
 * page = { title, wikitext, image } (image = thumbnail url from the API, optional)
 */
export function parseCard(page) {
  const f = parseTemplate(page.wikitext || '', 'Characters');
  if (!f) return null;
  const { cls, type } = splitType(f.type);
  const id = cardIdFrom(f.thumb) || cardIdFrom(f.artwork) || cardIdFrom(f.Quotes) || cardIdFrom(page.imageName || '');
  const title = plainText(f.name1);
  const name = plainText(f.name2) || page.title;
  const hasEza = Object.keys(f).some((k) => / Z$/.test(k) && f[k]) || !!f.GLBdateEZA || !!f.JPdateEZA;
  const hasSeza = Object.keys(f).some((k) => / SZ$/.test(k) && f[k]) || !!f.GLBdateSEZA || !!f.JPdateSEZA;
  const card = {
    page: page.title,
    id,
    title,
    name,
    rarity: (f.rarity || '').trim().toUpperCase(),
    cls,
    type,
    cost: num(f.cost),
    series: plainText(f.Series),
    leader: levels(f, 'LS description'),
    superAttack: { name: plainText(f['SA name']), ...levels(f, 'SA description') },
    ultraSuperAttack: f['UltraSA description'] ? { name: plainText(f['UltraSA name']), ...levels(f, 'UltraSA description') } : null,
    exSuperAttack: f['EXSA description'] ? { name: plainText(f['EXSA name']), desc: wikiToHtml(f['EXSA description']), condition: wikiToHtml(f['EXSA condition']) } : null,
    passive: { name: plainText(f['PS name']), ...levels(f, 'PS description') },
    active: f['Active skill'] ? { name: plainText(f['Active skill name']), desc: wikiToHtml(f['Active skill']), condition: wikiToHtml(f['Active skill condition']) } : null,
    transformation: f['Transformation condition'] ? wikiToHtml(f['Transformation condition']) : '',
    links: parseLinkList(f['Link skill']),
    categories: parseLinkList(f.Category),
    stats: {
      hp: [num(f['HP base']), num(f['HP max'])],
      atk: [num(f['ATK base']), num(f['ATK max'])],
      def: [num(f['DEF base']), num(f['DEF max'])],
    },
    ki12: plainText(f['12 ki']),
    eza: hasEza,
    seza: hasSeza,
    dates: {
      jp: parseDate(f.JPdate), glb: parseDate(f.GLBdate),
      jpEza: parseDate(f.JPdateEZA), glbEza: parseDate(f.GLBdateEZA),
      jpSeza: parseDate(f.JPdateSEZA), glbSeza: parseDate(f.GLBdateSEZA),
    },
    image: page.image || '',
    updated: page.touched || '',
  };
  card.released = card.dates.glb || card.dates.jp || '';
  card.search = [card.title, card.name, card.rarity, card.type, card.cls, ...card.categories, ...card.links].join(' ').toLowerCase();
  return card;
}

/** Builds a banner object from a wiki page using the {{Gacha}} template. */
export function parseBanner(page) {
  const f = parseTemplate(page.wikitext || '', 'Gacha');
  if (!f) return null;
  const cardsIn = (raw = '') => {
    const out = [];
    const re = /\[\[File:([^\]|]+)[^\]]*?link=([^\]|]+)[^\]]*\]\]/gi;
    let m;
    while ((m = re.exec(raw))) out.push({ id: cardIdFrom(m[1]), page: m[2].trim() });
    return out;
  };
  return {
    page: page.title,
    name: page.title.replace(/^[^:]+:\s*/, ''),
    kind: page.title.includes(':') ? page.title.split(':')[0].trim() : (page.category || ''),
    category: page.category || '',
    image: (f['Gacha Image'] || '').trim(),
    coins: plainText(f['Gacha Coins']),
    newCards: cardsIn(f['New Cards']),
    featured: cardsIn(f['Featured Cards']),
    added: page.added || '',
    updated: page.touched || '',
  };
}
