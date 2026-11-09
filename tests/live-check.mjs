// Fetches a few real wiki pages and prints what the parser extracts.
// Run: npm run check
import { parseCard, parseBanner } from '../js/parse.js';

const API = 'https://dbz-dokkanbattle.fandom.com/api.php';

async function pages(titles) {
  const url = `${API}?action=query&format=json&formatversion=2&prop=revisions|pageimages|info&rvprop=content&rvslots=main&piprop=thumbnail|name&pithumbsize=240&titles=${encodeURIComponent(titles.join('|'))}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'DokkanMobileApp-check/0.1' } });
  const json = await res.json();
  return json.query.pages.map((p) => ({
    title: p.title,
    wikitext: p.revisions?.[0]?.slots?.main?.content || '',
    image: p.thumbnail?.source || '',
    imageName: p.pageimage || '',
    touched: p.touched,
  }));
}

let failures = 0;
const check = (label, ok) => { if (!ok) { failures++; console.log('  FAIL:', label); } };

const cards = await pages([
  'Transcendent Existence Buu (Kid)',
  'Open The Gates of Hell Cooler (Final Form)',
  'Blinding Radiance of the Decisive Strike Gohan (Beast)',
]);
for (const p of cards) {
  const c = parseCard(p);
  console.log(`\n== ${p.title}`);
  console.log(JSON.stringify({ id: c.id, title: c.title, name: c.name, rarity: c.rarity, cls: c.cls, type: c.type, cost: c.cost, links: c.links.length, categories: c.categories.length, stats: c.stats, eza: c.eza, seza: c.seza, dates: c.dates, image: c.image.slice(0, 80) }, null, 1));
  console.log('  leader:', c.leader.base.slice(0, 160));
  console.log('  passive:', c.passive.name, '|', c.passive.base.slice(0, 200));
  check('rarity', ['LR', 'UR', 'SSR', 'SR', 'R', 'N'].includes(c.rarity));
  check('type', !!c.type);
  check('links', c.links.length > 0);
  check('categories', c.categories.length > 0);
  check('leader', c.leader.base.length > 10);
  check('passive', c.passive.base.length > 10);
  check('stats', c.stats.hp[0] > 0);
  check('no raw wiki markup', !/\[\[|\{\{|<ref/.test(c.passive.base + c.leader.base));
}
const cooler = parseCard(cards.find((p) => p.title.includes('Cooler')));
check('cooler id', cooler.id === '1009090');
check('cooler seza', cooler.seza && !!cooler.passive.seza);

const [banner] = await pages(['Dokkan Festival: Super Saiyan Gohan (Youth)']);
const b = parseBanner(banner);
console.log('\n== banner', b.name, '| new:', b.newCards.map((x) => x.id).join(','), '| featured:', b.featured.length);
check('banner new cards', b.newCards.length === 2 && b.newCards[0].id === '1034050');
check('banner featured', b.featured.length > 5);

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
