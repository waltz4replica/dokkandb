// Readers for the fan sites. Each one takes a page's HTML and returns plain data.
// If a site changes its design, only the matching function here needs fixing.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export function decode(s = '') {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}
const text = (html = '') => decode(html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const attr = (tag, name) => { const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag); return m ? decode(m[1]) : ''; };
const absolute = (url, base) => { try { return new URL(url, base).href; } catch { return ''; } };

/** Splits "[Title] Name" into its two parts. */
// Dual units have two "[Title] Name" parts joined by "+"; keep the first title and both names.
function splitTitle(full) {
  const clean = full.replace(/\s+/g, ' ').trim();
  const title = /^\[([^\]]+)\]/.exec(clean)?.[1] || '';
  const name = clean.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').replace(/\s*\+\s*/g, ' + ').trim();
  return { title, name: name || clean };
}

/**
 * DokkanStats community tier list (https://dokkanstats.com/en/tierlists/community-tierlist/).
 * Returns [{ tier, ranks, units: [{ id, cardId, title, name, trend }] }].
 * `cardId` ends in 0, matching the Dokkan Wiki image ids.
 */
export function parseDokkanStatsTierList(html) {
  const tiers = [];
  const cols = html.split(/<div class="community-tier-col"/).slice(1);
  for (const col of cols) {
    const tier = attr('<x' + col.slice(0, col.indexOf('>') + 1), 'data-tier');
    const ranks = text((/<h3>([\s\S]*?)<\/h3>/.exec(col) || [])[1] || '');
    const units = [];
    for (const chunk of col.split(/<div class="community-unit-card"/).slice(1)) {
      const open = '<x' + chunk.slice(0, chunk.indexOf('>') + 1);
      const id = attr(open, 'data-unit-id');
      if (!/^\d{7}$/.test(id)) continue;
      const link = /<a class="community-card-link"[^>]*>/.exec(chunk)?.[0] || '';
      const trend = /class="tier-trend (up|down|same)"/.exec(chunk)?.[1] || 'same';
      units.push({ id, cardId: String(Math.floor(+id / 10) * 10), ...splitTitle(attr(link, 'title')), trend });
    }
    if (tier && units.length) tiers.push({ tier, ranks, units });
  }
  return tiers;
}

/**
 * DokkanStats events list (https://dokkanstats.com/en/events/).
 * Returns every event button with whether the site marks it as active now.
 */
export function parseDokkanStatsEvents(html, base = 'https://dokkanstats.com/') {
  const out = [];
  const seen = new Set();
  const re = /<a\s[^>]*class="event-button"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0].slice(0, m[0].indexOf('>') + 1);
    const href = attr(tag, 'href');
    if (!href || seen.has(href)) continue;
    seen.add(href);
    const img = /<img\s[^>]*src="([^"]*banners[^"]*)"/.exec(m[1])?.[1] || '';
    const stones = /class="stone-badge"[^>]*title="(\d+)/.exec(m[1])?.[1];
    out.push({
      title: attr(tag, 'title'),
      group: attr(tag, 'data-tab'),
      active: attr(tag, 'data-active') === 'true',
      url: absolute(href, base),
      image: img ? absolute(decode(img), base) : '',
      stones: stones ? +stones : 0,
    });
  }
  return out;
}

/**
 * DokkanStats summons (https://dokkanstats.com/en/summons/): current and upcoming banners.
 * Returns [{ id, name, desc, image, start, end, cards: [image ids ending in 0], url }].
 */
export function parseDokkanStatsSummons(html, base = 'https://dokkanstats.com/') {
  const out = [];
  const seen = new Set();
  const re = /<a\s[^>]*class="summon-home-card"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0].slice(0, m[0].indexOf('>') + 1);
    const href = attr(tag, 'href');
    const id = /\/summons\/(\d+)/.exec(href)?.[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const times = [...m[1].matchAll(/<time\b[^>]*datetime="([^"]+)"/g)].map((t) => t[1]);
    const img = /<div class="summon-banner">\s*<img\s[^>]*src="([^"]+)"/.exec(m[1])?.[1] || '';
    out.push({
      id,
      name: text(/<h3 class="summon-home-name">([\s\S]*?)<\/h3>/.exec(m[1])?.[1] || ''),
      desc: text(/<p class="summon-home-desc">([\s\S]*?)<\/p>/.exec(m[1])?.[1] || ''),
      image: img ? absolute(decode(img), base) : '',
      start: times[0] || '',
      end: times[1] || '',
      cards: attr(tag, 'data-cards').split(/\s+/).filter((x) => /^\d{7}$/.test(x)),
      url: absolute(href, base),
    });
  }
  return out;
}

/**
 * DokkanStats banner page (https://dokkanstats.com/en/summons/<id>/).
 * Splits the "Featured Characters" section into three groups:
 *   main      — the banner's headline units (marked NEW or highlighted by the site)
 *   featured  — the other rate-up SSR units
 *   secondary — rate-up SR / R units
 * plus how many units can come out without a rate-up ("Unfeatured (N)").
 * Returns null when the page has no featured section.
 */
export function parseDokkanStatsSummonDetail(html) {
  const heads = [...html.matchAll(/<h2 class="summon-section-title"[^>]*>([\s\S]*?)<\/h2>/g)];
  const feat = heads.find((h) => /^featured/i.test(text(h[1])));
  if (!feat) return null;
  const from = feat.index + feat[0].length;
  const next = heads.find((h) => h.index > feat.index);
  const section = html.slice(from, next ? next.index : html.indexOf('summon-courses', from) >>> 0);
  // `names`: the card title the site shows for each id (e.g. "Worth 1,000,000 Zeni" for a Hercule Statue),
  // used for cards that are not in the app's own database.
  const out = { main: [], featured: [], secondary: [], unfeatured: 0, names: {} };
  const seen = new Set();
  for (const item of section.split('class="summon-chargrid-item"').slice(1)) {
    const id = /card_(\d{7})_thumb/.exec(item)?.[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const title = /class="card-thumb-character"[^>]*alt="([^"]*)"|alt="([^"]*)"[^>]*class="card-thumb-character"/.exec(item);
    if (title) out.names[id] = decode(title[1] ?? title[2]);
    const rarity = /cha_rare_sm_(\w+)\.png/.exec(item)?.[1] || '';
    if (/cha_icon_new\.png/.test(item) || item.includes('<canvas')) out.main.push(id);
    else if (/^(ssr|ur|lr)$/i.test(rarity)) out.featured.push(id);
    else out.secondary.push(id);
  }
  const unf = heads.find((h) => /^unfeatured/i.test(text(h[1])));
  out.unfeatured = unf ? +(/\((\d+)\)/.exec(text(unf[1]))?.[1] || 0) : 0;
  return out.main.length + out.featured.length + out.secondary.length ? out : null;
}

/**
 * DOKKAN.FYI in-game news (https://dokkan.fyi/news).
 * Returns [{ id, title, url, image, tags, date }] — `date` as written on the page.
 */
export function parseFyiNews(html, base = 'https://dokkan.fyi/') {
  const out = [];
  for (const art of html.split(/<article\b/).slice(1)) {
    const link = /<a\b[^>]*href="((?:https:\/\/dokkan\.fyi)?\/news\/(\d+))"[^>]*>([\s\S]*?)<\/a>/.exec(art);
    if (!link) continue;
    const img = /<img\b[^>]*src="([^"]+)"/.exec(art)?.[1] || '';
    const footer = /<footer\b[\s\S]*?<\/footer>/.exec(art)?.[0] || '';
    const spans = [...footer.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/g)].map((s) => text(s[1])).filter(Boolean);
    const date = spans.find((s) => /\b\d{4}\b/.test(s) && /\d{1,2}:\d{2}|[A-Z][a-z]{2} \d{1,2}/.test(s)) || '';
    const tags = [...new Set(spans.filter((s) => s !== date && !/^read more$/i.test(s)))];
    out.push({ id: link[2], title: text(link[3]), url: absolute(link[1], base), image: img ? absolute(decode(img), base) : '', tags, date, iso: toIso(date) });
  }
  return out;
}

// "Nov 9, 2026, 8:00 AM GMT+0" -> ISO string (or '' if unreadable).
function toIso(s) {
  if (!s) return '';
  const t = Date.parse(s.replace(/,(?=\s*\d{1,2}:)/, '').replace(/GMT\+0\b/, 'GMT'));
  return Number.isFinite(t) ? new Date(t).toISOString() : '';
}
