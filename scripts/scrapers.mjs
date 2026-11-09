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
