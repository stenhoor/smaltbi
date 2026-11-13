// Generates the sample dataset in examples/sales/data/: a small retail star schema
// (fact: sales; dimensions: customers, products, stores), five years of a growing coffee and tea business, 2021 to
// 2025. Deterministic (seeded), sample data only.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'examples', 'sales', 'data');
mkdirSync(out, { recursive: true });

let seed = 20261102;
const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
const pick = (a) => a[Math.floor(rand() * a.length)];
const weighted = (pairs) => {
  const t = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rand() * t;
  for (const [v, w] of pairs) if ((r -= w) <= 0) return v;
  return pairs[pairs.length - 1][0];
};
const csv = (rows) => {
  const cols = Object.keys(rows[0]);
  const q = (v) => (typeof v === 'string' && /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return cols.join(',') + '\n' + rows.map((r) => cols.map((c) => q(r[c])).join(',')).join('\n') + '\n';
};

const catalog = {
  Coffee: { Beans: ['Ethiopia Yirgacheffe', 'Colombia Huila', 'Sumatra Mandheling', 'House Espresso', 'Decaf Swiss Water'], Ground: ['Morning Blend', 'French Roast', 'Breakfast Ground'] },
  Tea: { Green: ['Sencha', 'Gyokuro', 'Dragon Well'], Black: ['Earl Grey', 'Assam', 'Darjeeling'], Herbal: ['Chamomile', 'Rooibos', 'Peppermint'] },
  Equipment: { Brewers: ['Pour-over Kit', 'French Press', 'Moka Pot', 'Cold Brew Jar'], Grinders: ['Hand Grinder', 'Burr Grinder'] },
  Accessories: { Cups: ['Ceramic Mug', 'Travel Tumbler', 'Glass Cup'], Filters: ['Paper Filters', 'Steel Filter'] },
};
const products = [];
for (const [category, subs] of Object.entries(catalog))
  for (const [subcategory, names] of Object.entries(subs))
    for (const name of names) {
      const base = category === 'Equipment' ? 25 + rand() * 90 : category === 'Accessories' ? 6 + rand() * 25 : 7 + rand() * 18;
      const price = Math.round(base * 100) / 100;
      products.push({ id: products.length + 1, name, category, subcategory, list_price: price, unit_cost: Math.round(price * (0.45 + rand() * 0.2) * 100) / 100 });
    }

const geo = [
  ['North America', 'United States', ['New York', 'Seattle', 'Austin', 'Chicago']],
  ['North America', 'Canada', ['Toronto', 'Vancouver']],
  ['Europe', 'Germany', ['Berlin', 'Munich']],
  ['Europe', 'France', ['Paris', 'Lyon']],
  ['Europe', 'United Kingdom', ['London', 'Manchester']],
  ['Asia Pacific', 'Japan', ['Tokyo', 'Osaka']],
  ['Asia Pacific', 'Australia', ['Sydney', 'Melbourne']],
];
// Where each city is (degrees, rounded), for the map of stores.
const place = {
  'New York': [40.71, -74.01], Seattle: [47.61, -122.33], Austin: [30.27, -97.74], Chicago: [41.88, -87.63],
  Toronto: [43.65, -79.38], Vancouver: [49.28, -123.12], Berlin: [52.52, 13.41], Munich: [48.14, 11.58],
  Paris: [48.86, 2.35], Lyon: [45.76, 4.84], London: [51.51, -0.13], Manchester: [53.48, -2.24],
  Tokyo: [35.68, 139.69], Osaka: [34.69, 135.5], Sydney: [-33.87, 151.21], Melbourne: [-37.81, 144.96],
};
const stores = [];
for (const [region, country, cities] of geo)
  for (const city of cities)
    stores.push({ id: stores.length + 1, name: `${city} ${pick(['Roastery', 'Corner', 'Market', 'Station'])}`, city, country, region, channel: 'Store', latitude: place[city][0], longitude: place[city][1] });
stores.push({ id: stores.length + 1, name: 'Online Shop', city: 'Online', country: 'Online', region: 'Online', channel: 'Online', latitude: '', longitude: '' });

const first = ['Ada', 'Alan', 'Grace', 'Linus', 'Radia', 'Ken', 'Barbara', 'Edsger', 'Frances', 'Tim', 'Margaret', 'Dennis', 'Hedy', 'Guido', 'Sophie', 'Niklaus', 'Katherine', 'John', 'Annie', 'Donald'];
const last = ['Lovelace', 'Turing', 'Hopper', 'Torvalds', 'Perlman', 'Thompson', 'Liskov', 'Dijkstra', 'Allen', 'Berners', 'Hamilton', 'Ritchie', 'Lamarr', 'Rossum', 'Wilson', 'Wirth', 'Johnson', 'Backus', 'Easley', 'Knuth'];
const customers = [];
for (let i = 1; i <= 600; i++) {
  const [region, country, cities] = pick(geo);
  customers.push({ id: i, name: `${pick(first)} ${pick(last)}`, segment: weighted([['Consumer', 6], ['Small Business', 3], ['Corporate', 1]]), city: pick(cities), country, region, joined: `${2020 + Math.floor(rand() * 5)}-${String(1 + Math.floor(rand() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rand() * 28)).padStart(2, '0')}` });
}

const sales = [];
const start = Date.UTC(2021, 0, 1);
const days = (Date.UTC(2026, 0, 1) - start) / 86400000; // 2021-01-01 … 2025-12-31
for (let d = 0; d < days; d++) {
  const date = new Date(start + d * 86400000);
  const month = date.getUTCMonth();
  const season = 1 + 0.35 * Math.cos(((month - 11) / 12) * Math.PI * 2); // winter peak
  const growth = 1 + d / 700; // a growing business: about 3.6 times the orders by the end of 2025
  const weekend = [0, 6].includes(date.getUTCDay()) ? 1.25 : 1;
  const n = Math.round((6 + rand() * 4) * season * growth * weekend);
  for (let k = 0; k < n; k++) {
    const p = weighted(products.map((x) => [x, x.category === 'Coffee' ? 5 : x.category === 'Tea' ? 4 : x.category === 'Accessories' ? 2 : 1]));
    const c = customers[Math.floor(rand() * customers.length)];
    const online = rand() < 0.3;
    const local = stores.filter((s) => s.country === c.country);
    const s = online || !local.length ? stores[stores.length - 1] : pick(local);
    const qty = weighted([[1, 6], [2, 3], [3, 1.2], [4, 0.5], [6, 0.2]]);
    const discount = weighted([[0, 8], [0.05, 1], [0.1, 1], [0.2, 0.3]]);
    // Store sales leave with the customer; online orders ship two to six days later.
    const ship = new Date(date.getTime() + (s.channel === 'Online' ? weighted([[2, 3], [3, 4], [4, 2], [5, 1], [6, 0.5]]) : 0) * 86400000);
    sales.push({ id: sales.length + 1, order_date: date.toISOString().slice(0, 10), ship_date: ship.toISOString().slice(0, 10), customer_id: c.id, product_id: p.id, store_id: s.id, quantity: qty, unit_price: p.list_price, discount });
  }
}

// Tags, many-to-many with products through product_tags (ADR 0009: a link table). Drawn after everything else, so
// adding them left the rest of the data as it was.
const tags = ['Organic', 'Fair trade', 'Gift idea', 'Bestseller', 'New'].map((name, i) => ({ id: i + 1, name }));
const productTags = [];
for (const p of products)
  for (const t of tags) {
    const chance = { Organic: p.category === 'Tea' || p.category === 'Coffee' ? 0.5 : 0, 'Fair trade': p.category === 'Coffee' ? 0.5 : 0.1, 'Gift idea': p.category === 'Accessories' || p.category === 'Equipment' ? 0.45 : 0.15, Bestseller: 0.2, New: 0.12 }[t.name];
    if (rand() < chance) productTags.push({ product_id: p.id, tag_id: t.id });
  }

writeFileSync(join(out, 'tags.csv'), csv(tags));
writeFileSync(join(out, 'product_tags.csv'), csv(productTags));
writeFileSync(join(out, 'products.csv'), csv(products));
writeFileSync(join(out, 'stores.csv'), csv(stores));
writeFileSync(join(out, 'customers.csv'), csv(customers));
writeFileSync(join(out, 'sales.csv'), csv(sales));
console.log(`examples/sales/data: ${sales.length} sales, ${customers.length} customers, ${products.length} products, ${stores.length} stores, ${productTags.length} product tags`);
