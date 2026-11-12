// Synthetic retail dataset for "Brightvale Stores" (a fictional multi-channel lifestyle retailer).
// Run:  node scripts/generate-retail-data.mjs
// Output: ../data/*.csv  (deterministic: same SEED -> same data)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'data');
fs.mkdirSync(OUT, { recursive: true });

// ---------- knobs ----------
const SEED = 20261111;
const VOLUME = 0.6;                       // scales order counts (~0.6 -> ~275k sales lines)
const DAY = 86400000;
const D = s => Date.parse(s + 'T00:00:00Z');
const START = D('2023-01-01');
const END = D('2026-10-31');              // last day with actual sales
const CAL_END = D('2026-12-31');          // calendar + targets run to year end
const iso = ms => new Date(ms).toISOString().slice(0, 10);
const yrs = (ms, ref = START) => (ms - ref) / (365.25 * DAY);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const r2 = x => Math.round(x * 100) / 100;

// ---------- seeded random ----------
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rnd = mulberry32(SEED);
const uni = (a, b) => a + (b - a) * rnd();
const int = (a, b) => Math.floor(uni(a, b + 1));
const pick = arr => arr[Math.floor(rnd() * arr.length)];
const gauss = () => Math.sqrt(-2 * Math.log(rnd() || 1e-12)) * Math.cos(2 * Math.PI * rnd());
function sampler(items, weights) {
  const cum = new Float64Array(weights.length); let s = 0;
  for (let i = 0; i < weights.length; i++) { s += weights[i]; cum[i] = s; }
  return () => { const r = rnd() * s; let lo = 0, hi = cum.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < r) lo = m + 1; else hi = m; } return items[lo]; };
}
const weighted = (items, weights) => sampler(items, weights)();
function poisson(l) {
  if (l <= 0) return 0;
  if (l < 30) { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= rnd(); } while (p > L); return k - 1; }
  return Math.max(0, Math.round(l + gauss() * Math.sqrt(l)));
}
const randDate = (a, b) => a + Math.floor(rnd() * ((b - a) / DAY + 1)) * DAY;

function writeCsv(name, header, rows) {
  const esc = v => { if (v === null || v === undefined) return ''; const s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const lines = [header.join(',')];
  for (const r of rows) lines.push(r.map(esc).join(','));
  fs.writeFileSync(path.join(OUT, name), lines.join('\n') + '\n');
  console.log(`  ${name.padEnd(22)} ${rows.length.toLocaleString().padStart(9)} rows`);
}

// ---------- categories & products ----------
const CATS = [
  { id: 1, name: 'Apparel', dept: 'Fashion', share: { Store: 22, Online: 20 }, margin: .58, qtyW: [72, 20, 8],
    season: [.9, .85, 1.1, 1.15, 1.05, .95, .9, 1.1, 1.2, 1.1, 1.05, 1.15], n: 60,
    brands: ['Halden', 'Mira & Co', 'Urbanline', 'Kestrel', 'Thornfield'],
    adj: ['Classic', 'Relaxed', 'Slim', 'Linen', 'Cotton', 'Heritage', 'Everyday', 'Studio', 'Weekend', 'Tailored'],
    subs: { Tops: [['Tee', 'Oxford Shirt', 'Blouse', 'Polo', 'Hoodie', 'Knit Sweater'], [15, 70]], Bottoms: [['Jeans', 'Chinos', 'Pleated Skirt', 'Shorts', 'Joggers'], [30, 110]], Outerwear: [['Rain Jacket', 'Wool Coat', 'Puffer', 'Gilet'], [70, 240]], Dresses: [['Midi Dress', 'Maxi Dress', 'Shirt Dress', 'Wrap Dress'], [40, 140]] } },
  { id: 2, name: 'Footwear', dept: 'Fashion', share: { Store: 12, Online: 15 }, margin: .50, qtyW: [90, 9, 1],
    season: [.95, .85, 1.0, 1.1, 1.1, 1.05, 1.0, 1.15, 1.05, 1.0, 1.05, 1.1], n: 45,
    brands: ['Stridewell', 'Peakstep', 'Lumo', 'Cobble & Lace'],
    adj: ['Cloud', 'Trail', 'Court', 'Classic', 'Leather', 'Canvas', 'Runner', 'City'],
    subs: { Sneakers: [['Sneaker', 'Runner', 'Trainer'], [50, 160]], Boots: [['Chelsea Boot', 'Hiking Boot', 'Ankle Boot'], [80, 220]], Sandals: [['Slide', 'Sandal', 'Espadrille'], [20, 70]], Formal: [['Loafer', 'Derby', 'Oxford'], [70, 190]] } },
  { id: 3, name: 'Home & Kitchen', dept: 'Home', share: { Store: 14, Online: 12 }, margin: .45, qtyW: [70, 22, 8],
    season: [1.1, .9, .95, 1.0, 1.0, .95, .9, .95, 1.0, 1.05, 1.2, 1.3], n: 55,
    brands: ['Hearthly', 'Nestform', 'Oakmere', 'Linden Home'],
    adj: ['Ceramic', 'Oak', 'Linen', 'Nordic', 'Cast Iron', 'Marble', 'Woven', 'Glass'],
    subs: { Kitchen: [['Skillet', 'Knife Set', 'Mixing Bowls', 'Kettle', 'Cutting Board'], [12, 180]], Bedding: [['Duvet Cover', 'Pillow Pair', 'Throw Blanket', 'Sheet Set'], [25, 160]], Decor: [['Vase', 'Candle', 'Wall Mirror', 'Table Lamp'], [10, 120]], Storage: [['Basket', 'Jar Set', 'Shelf Unit'], [15, 140]] } },
  { id: 4, name: 'Electronics', dept: 'Tech', share: { Store: 12, Online: 17 }, margin: .24, qtyW: [92, 7, 1], nameStyle: 'brand-noun-adj',
    season: [.9, .8, .9, .9, .9, .85, .9, 1.2, 1.0, 1.0, 1.7, 1.6], n: 50,
    brands: ['Voltra', 'Sonique', 'Pixelon', 'Arcwave'],
    adj: ['Pro', 'Max', 'Mini', 'Air', 'Plus', 'Ultra', 'Lite', 'S'],
    subs: { Audio: [['Wireless Earbuds', 'Headphones', 'Bluetooth Speaker', 'Soundbar'], [25, 450]], Wearables: [['Smartwatch', 'Fitness Band'], [40, 400]], Computing: [['Tablet', 'Laptop Stand', 'Keyboard', 'Mouse', 'Webcam'], [20, 650]], 'Home Tech': [['Smart Plug', 'Security Camera', 'Streaming Stick'], [15, 180]] } },
  { id: 5, name: 'Beauty', dept: 'Health & Beauty', share: { Store: 10, Online: 12 }, margin: .62, qtyW: [55, 30, 15],
    season: [.9, 1.15, 1.0, 1.0, 1.1, .95, .95, .95, 1.0, 1.0, 1.2, 1.5], n: 55,
    brands: ['Lumiere Lab', 'Verdance', 'Glowry', 'Petal & Pine'],
    adj: ['Hydrating', 'Vitamin C', 'Matte', 'Radiance', 'Calming', 'Overnight', 'Daily', 'Botanical'],
    subs: { Skincare: [['Serum', 'Moisturiser', 'Cleanser', 'Face Mask', 'Sunscreen'], [9, 70]], Makeup: [['Lipstick', 'Foundation', 'Mascara', 'Palette'], [8, 55]], Haircare: [['Shampoo', 'Conditioner', 'Hair Oil'], [7, 40]], Fragrance: [['Eau de Parfum', 'Body Mist'], [25, 110]] } },
  { id: 6, name: 'Sports & Outdoors', dept: 'Leisure', share: { Store: 10, Online: 9 }, margin: .42, qtyW: [80, 15, 5],
    season: [1.15, .95, 1.0, 1.15, 1.35, 1.5, 1.4, 1.05, .9, .8, .8, .9], n: 45,
    brands: ['Trailborn', 'Apexa', 'Fitcore', 'Ridgeway'],
    adj: ['Trail', 'Summit', 'Core', 'Aero', 'Flex', 'All-Weather', 'Ultralight'],
    subs: { Fitness: [['Yoga Mat', 'Dumbbell Set', 'Resistance Bands', 'Kettlebell'], [12, 150]], Camping: [['Tent', 'Sleeping Bag', 'Camp Stove', 'Headlamp'], [15, 380]], Cycling: [['Helmet', 'Bike Lights', 'Cycling Gloves'], [15, 120]], 'Team Sports': [['Football', 'Basketball', 'Tennis Racket'], [12, 180]] } },
  { id: 7, name: 'Toys & Games', dept: 'Leisure', share: { Store: 7, Online: 6 }, margin: .40, qtyW: [75, 18, 7],
    season: [.6, .6, .7, .7, .75, .8, .8, .8, .85, 1.1, 2.0, 2.8], n: 40,
    brands: ['Brightbox', 'Tinker & Co', 'Playforge'],
    adj: ['Junior', 'Deluxe', 'Mega', 'Classic', 'Explorer', 'Wooden'],
    subs: { Building: [['Block Set', 'Marble Run', 'Construction Kit'], [15, 120]], Games: [['Board Game', 'Card Game', 'Puzzle 1000pc'], [10, 50]], Outdoor: [['Scooter', 'Kite', 'Water Blaster'], [15, 110]], Plush: [['Plush Bear', 'Plush Dragon'], [10, 35]] } },
  { id: 8, name: 'Accessories', dept: 'Fashion', share: { Store: 13, Online: 9 }, margin: .60, qtyW: [78, 17, 5],
    season: [.9, 1.1, 1.0, 1.0, 1.05, 1.0, 1.0, 1.05, 1.0, 1.0, 1.2, 1.5], n: 50,
    brands: ['Carryall', 'Ledgerline', 'Solace', 'Marlow'],
    adj: ['Leather', 'Canvas', 'Minimal', 'Vintage', 'Everyday', 'Travel'],
    subs: { Bags: [['Tote', 'Backpack', 'Crossbody', 'Weekender'], [30, 220]], 'Small Leather': [['Wallet', 'Card Holder', 'Belt'], [15, 90]], Jewellery: [['Necklace', 'Bracelet', 'Earrings'], [12, 140]], Eyewear: [['Sunglasses', 'Reading Glasses'], [15, 160]] } },
];
const catById = Object.fromEntries(CATS.map(c => [c.id, c]));

const products = [];
for (const c of CATS) {
  const subNames = Object.keys(c.subs); const used = new Set(); const mine = [];
  for (let i = 0; i < c.n; i++) {
    const sub = subNames[i % subNames.length]; const [nouns, [lo, hi]] = c.subs[sub];
    let name;
    do { const b = pick(c.brands), a = pick(c.adj), nn = pick(nouns); name = c.nameStyle === 'brand-noun-adj' ? `${b} ${nn} ${a}` : `${b} ${a} ${nn}`; } while (used.has(name));
    used.add(name);
    const price = Math.max(4.99, Math.floor(Math.exp(uni(Math.log(lo), Math.log(hi)))) + 0.99);
    const cost = r2(price * (1 - c.margin) * uni(0.9, 1.1));
    const launch = rnd() < 0.82 ? randDate(D('2019-01-01'), D('2022-12-31')) : randDate(D('2023-02-01'), D('2026-08-31'));
    const brand = name.startsWith('Mira & Co') ? 'Mira & Co' : c.brands.find(b => name.startsWith(b));
    mine.push({ id: 0, name, catId: c.id, sub, brand, price, cost, launch, lo });
  }
  // price tier = tercile within subcategory
  for (const sub of subNames) {
    const s = mine.filter(p => p.sub === sub).sort((a, b) => a.price - b.price);
    s.forEach((p, i) => { p.tier = i < s.length / 3 ? 'Good' : i < 2 * s.length / 3 ? 'Better' : 'Best'; });
  }
  // popularity: zipf over a random rank, cheaper items a bit more popular
  const ranks = mine.map((_, i) => i).sort(() => rnd() - 0.5);
  mine.forEach((p, i) => { p.pop = (1 / Math.pow(ranks[i] + 1, 0.85)) * Math.pow(p.lo / p.price, 0.25); });
  products.push(...mine);
}
products.forEach((p, i) => { p.id = 1001 + i; });
const prodSamplerByCat = {};
for (const c of CATS) { const ps = products.filter(p => p.catId === c.id); prodSamplerByCat[c.id] = sampler(ps, ps.map(p => p.pop)); }

// ---------- stores ----------
const CITY = [
  ['New York', 'NY', 'Northeast', 40.71, -74.01, 'Flagship'], ['Boston', 'MA', 'Northeast', 42.36, -71.06, 'Standard'], ['Philadelphia', 'PA', 'Northeast', 39.95, -75.17, 'Standard'],
  ['Pittsburgh', 'PA', 'Northeast', 40.44, -79.99, 'Outlet'], ['Hartford', 'CT', 'Northeast', 41.76, -72.67, 'Express'], ['Newark', 'NJ', 'Northeast', 40.74, -74.17, 'Express'], ['Providence', 'RI', 'Northeast', 41.82, -71.41, 'Express'],
  ['Atlanta', 'GA', 'Southeast', 33.75, -84.39, 'Standard'], ['Miami', 'FL', 'Southeast', 25.76, -80.19, 'Standard'], ['Orlando', 'FL', 'Southeast', 28.54, -81.38, 'Outlet'], ['Charlotte', 'NC', 'Southeast', 35.23, -80.84, 'Standard'],
  ['Nashville', 'TN', 'Southeast', 36.16, -86.78, 'Standard'], ['Tampa', 'FL', 'Southeast', 27.95, -82.46, 'Express'], ['Raleigh', 'NC', 'Southeast', 35.78, -78.64, 'Express'],
  ['Chicago', 'IL', 'Midwest', 41.88, -87.63, 'Flagship'], ['Detroit', 'MI', 'Midwest', 42.33, -83.05, 'Standard'], ['Minneapolis', 'MN', 'Midwest', 44.98, -93.27, 'Standard'], ['Columbus', 'OH', 'Midwest', 39.96, -83.00, 'Standard'],
  ['Indianapolis', 'IN', 'Midwest', 39.77, -86.16, 'Standard'], ['Milwaukee', 'WI', 'Midwest', 43.04, -87.91, 'Express'], ['Dayton', 'OH', 'Midwest', 39.76, -84.19, 'Standard'],
  ['Dallas', 'TX', 'Southwest', 32.78, -96.80, 'Flagship'], ['Houston', 'TX', 'Southwest', 29.76, -95.37, 'Standard'], ['Austin', 'TX', 'Southwest', 30.27, -97.74, 'Standard'],
  ['Phoenix', 'AZ', 'Southwest', 33.45, -112.07, 'Standard'], ['San Antonio', 'TX', 'Southwest', 29.42, -98.49, 'Outlet'], ['Albuquerque', 'NM', 'Southwest', 35.08, -106.65, 'Express'],
  ['Los Angeles', 'CA', 'West', 34.05, -118.24, 'Flagship'], ['San Francisco', 'CA', 'West', 37.77, -122.42, 'Standard'], ['Seattle', 'WA', 'West', 47.61, -122.33, 'Standard'], ['Portland', 'OR', 'West', 45.52, -122.68, 'Standard'],
  ['Denver', 'CO', 'West', 39.74, -104.99, 'Standard'], ['San Diego', 'CA', 'West', 32.72, -117.16, 'Standard'], ['Las Vegas', 'NV', 'West', 36.17, -115.14, 'Outlet'], ['Sacramento', 'CA', 'West', 38.58, -121.49, 'Express'],
  ['Salt Lake City', 'UT', 'West', 40.76, -111.89, 'Standard'],
];
const NEW_STORES = { Austin: '2024-04-15', Raleigh: '2025-03-01', 'Salt Lake City': '2025-09-20' };
const FIRST = ['Olivia', 'Liam', 'Emma', 'Noah', 'Ava', 'Elijah', 'Sophia', 'James', 'Isabella', 'Lucas', 'Mia', 'Mateo', 'Amelia', 'Ethan', 'Harper', 'Aiden', 'Priya', 'Arjun', 'Mei', 'Hiro', 'Fatima', 'Omar', 'Chloe', 'Daniel', 'Grace', 'Samuel', 'Zoe', 'Leo', 'Nora', 'Carlos', 'Lucia', 'Kwame', 'Aisha', 'Ivan', 'Elena', 'Ben', 'Ruby', 'Jack', 'Maya', 'Owen'];
const LAST = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Lee', 'Patel', 'Nguyen', 'Kim', 'Chen', 'Walker', 'Hall', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Green', 'Baker', 'Adams', 'Nelson', 'Hill', 'Campbell', 'Mitchell', 'Roberts', 'Carter', 'Phillips', 'Evans', 'Turner', 'Torres', 'Parker', 'Collins', 'Edwards', 'Stewart', 'Morris'];
const FORMAT = { Flagship: { base: 7, sq: [45000, 60000] }, Standard: { base: 3.6, sq: [18000, 28000] }, Express: { base: 2.2, sq: [6000, 9000] }, Outlet: { base: 3.2, sq: [22000, 32000] } };
const STD_LABEL = ['Central', 'Mall', 'Plaza', 'Crossing', 'Commons', 'Galleria'];

const stores = CITY.map(([city, st, region, lat, lon, format], i) => {
  const label = format === 'Standard' ? (city === 'Dayton' ? 'Riverside' : pick(STD_LABEL)) : format;
  const open = NEW_STORES[city] ? D(NEW_STORES[city]) : randDate(D('2008-01-01'), D('2021-12-31'));
  return { id: 101 + i, name: `${city} ${label}`, city, st, region, format, open, sqft: Math.round(uni(...FORMAT[format].sq) / 100) * 100, lat, lon, mgr: `${pick(FIRST)} ${pick(LAST)}`, base: FORMAT[format].base };
});
const ONLINE = { id: 99, name: 'Brightvale Online', city: 'Online', st: '', region: 'Online', format: 'Online', open: D('2015-03-01'), sqft: 0, lat: null, lon: null, mgr: `${pick(FIRST)} ${pick(LAST)}`, base: 20 };
const allLocs = [...stores, ONLINE];

// ---------- customers ----------
const NCUST = 18000;
const customers = [{ id: 0, name: 'Guest', gender: 'Unspecified', age: 'Unknown', segment: 'Unknown', join: START, home: 0, city: '', st: '', act: 0, spend: 0 }];
const homeW = allLocs.map(s => s.format === 'Online' ? 55 : s.base);
const homeSampler = sampler(allLocs, homeW);
for (let i = 1; i <= NCUST; i++) {
  const home = homeSampler();
  const lo = Math.max(D('2018-01-01'), home.open);
  const join = home.open > D('2018-01-01') ? randDate(home.open, D('2026-09-30')) : (rnd() < 0.72 ? randDate(lo, D('2022-12-31')) : randDate(D('2023-01-01'), D('2026-09-30')));
  const cityStore = home.format === 'Online' ? pick(stores) : home;
  customers.push({ id: 100000 + i, name: `${pick(FIRST)} ${pick(LAST)}`, gender: weighted(['Female', 'Male', 'Unspecified'], [52, 45, 3]),
    age: weighted(['18-24', '25-34', '35-44', '45-54', '55-64', '65+'], [12, 24, 22, 18, 14, 10]), segment: weighted(['Value', 'Mainstream', 'Premium'], [35, 45, 20]),
    join, home: home.id, city: cityStore.city, st: cityStore.st, act: Math.exp(gauss() * 1.1), spend: 0 });
}
const realCust = customers.slice(1);
const custByHome = {};
for (const c of realCust) (custByHome[c.home] ||= []).push(c);
const homeSamplers = Object.fromEntries(Object.entries(custByHome).map(([k, arr]) => [k, sampler(arr, arr.map(c => c.act))]));
const onlineCustSampler = sampler(realCust, realCust.map(c => c.act * (c.home === 99 ? 3 : 0.5)));
const anyCustSampler = sampler(realCust, realCust.map(c => c.act));

// ---------- promotions ----------
const promos = [{ id: 0, name: 'No Promotion', type: 'None', start: START, end: CAL_END, pct: 0, cats: [], channels: ['Store', 'Online'], lift: 1 }];
const addPromo = (name, type, s, e, pct, cats, lift, channels = ['Store', 'Online']) => promos.push({ id: promos.length, name, type, start: D(s), end: D(e), pct, cats, channels, lift });
const thanksgiving = y => { const w = new Date(Date.UTC(y, 10, 1)).getUTCDay(); return Date.UTC(y, 10, 1 + ((4 - w + 7) % 7) + 21); };
for (const y of [2023, 2024, 2025, 2026]) {
  addPromo(`New Year Sale ${y}`, 'Seasonal Sale', `${y - 1}-12-26`, `${y}-01-08`, 0.30, [1, 2, 3], 1.6);
  addPromo(`Spring Beauty Week ${y}`, 'Category Event', `${y}-03-15`, `${y}-03-21`, 0.20, [5], 1.7);
  addPromo(`Summer Sports Fest ${y}`, 'Category Event', `${y}-06-01`, `${y}-06-14`, 0.20, [6], 1.8);
  addPromo(`Back to School ${y}`, 'Seasonal Sale', `${y}-08-01`, `${y}-08-20`, 0.15, [1, 4, 8], 1.4);
  addPromo(`Toy Days ${y}`, 'Category Event', `${y}-10-10`, `${y}-10-20`, 0.25, [7], 1.9);
  const tg = thanksgiving(y);
  addPromo(`Black Friday ${y}`, 'Doorbuster', iso(tg + DAY), iso(tg + 4 * DAY), 0.25, [1, 2, 3, 4, 5, 6, 7, 8], 1.5);
  addPromo(`Online Flash Sale Spring ${y}`, 'Flash Sale', `${y}-04-${String(int(5, 25)).padStart(2, '0')}`, '', 0.20, [3, 8], 2.0, ['Online']);
  addPromo(`Online Flash Sale Autumn ${y}`, 'Flash Sale', `${y}-09-${String(int(5, 25)).padStart(2, '0')}`, '', 0.20, [3, 8], 2.0, ['Online']);
}
for (const p of promos) if (Number.isNaN(p.end)) p.end = p.start + 2 * DAY; // flash sales: 3 days
addPromo('Electronics Mega Week', 'Clearance', '2025-03-10', '2025-03-23', 0.30, [4], 3.0);
const MEGA_DIP = [D('2025-03-24'), D('2025-04-20')]; // pull-forward hangover

// ---------- demand shape ----------
const MONTH_F = [.80, .78, .90, .95, 1.0, .98, .97, 1.08, .95, 1.0, 1.25, 1.55];
const WD_STORE = [1.0, .8, .8, .85, .95, 1.15, 1.45];   // Sun..Sat
const WD_ONLINE = [1.0, 1.15, 1.1, 1.05, 1.0, .9, .85];
const HOURS_STORE = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
const H_STORE_WD = [3, 5, 7, 10, 10, 7, 6, 7, 10, 11, 8, 5, 3];
const H_STORE_WE = [4, 7, 9, 10, 10, 10, 9, 9, 8, 7, 5, 3, 2];
const HOURS_ONLINE = [...Array(24).keys()];
const H_ONLINE = [2, 1, 1, .5, .5, .5, 1, 2, 3, 4, 4, 5, 5, 5, 4, 4, 5, 6, 7, 8, 10, 10, 7, 4];
const hStoreWd = sampler(HOURS_STORE, H_STORE_WD), hStoreWe = sampler(HOURS_STORE, H_STORE_WE), hOnline = sampler(HOURS_ONLINE, H_ONLINE);

function dayFactor(t, channel) {
  const d = new Date(t), m = d.getUTCMonth(), dom = d.getUTCDate(), y = d.getUTCFullYear(), tg = thanksgiving(y);
  let f = MONTH_F[m];
  if (t === tg) return channel === 'Store' ? 0 : f * 1.4;                 // stores closed Thanksgiving
  if (m === 11 && dom === 25) return channel === 'Store' ? 0 : f * 0.5;   // Christmas Day
  if (t === tg + DAY) f *= 3.2;                                           // Black Friday
  else if (t > tg + DAY && t <= tg + 3 * DAY) f *= 1.9;
  else if (t === tg + 4 * DAY) f *= channel === 'Online' ? 3.0 : 1.2;     // Cyber Monday
  if (m === 11 && dom >= 18 && dom <= 24) f *= 1.5;
  if (m === 11 && dom === 26) f *= 1.6;
  if (m === 0 && dom === 1) f *= 0.5;
  return f;
}
function locTrend(s, t) {
  if (s.id === 99) return Math.pow(1.30, yrs(t));                         // online grows ~30%/yr
  let f = Math.pow(1.025, yrs(t));
  if (s.city === 'Dayton') f *= 1 - 0.58 * clamp((t - D('2023-07-01')) / (END - D('2023-07-01')), 0, 1); // failing store
  if (s.region === 'West' && t >= D('2026-01-01')) f *= 0.86;             // West slowdown in 2026
  if (NEW_STORES[s.city]) f *= 0.45 + 0.55 * clamp((t - s.open) / (180 * DAY), 0, 1); // new-store ramp
  return f;
}
const beautyBoom = t => 1 + 0.55 * Math.max(0, yrs(t, D('2024-07-01')));    // breakout category
const priceInfl = t => Math.pow(1.025, yrs(t));
const costInfl = (catId, t) => Math.pow(catId === 4 ? 1.06 : 1.01, yrs(t));  // electronics margin squeeze

function activePromos(t, channel) { return promos.filter(p => p.id > 0 && t >= p.start && t <= p.end && p.channels.includes(channel)); }

// ---------- returns ----------
const RET_REASON = {
  default: [['Changed mind', 'Damaged', 'Not as described', 'Defective'], [45, 20, 20, 15]],
  1: [['Wrong size', 'Changed mind', 'Not as described', 'Damaged'], [50, 25, 18, 7]],
  2: [['Wrong size', 'Uncomfortable', 'Changed mind', 'Damaged'], [55, 20, 18, 7]],
  4: [['Defective', 'Changed mind', 'Not as described', 'Damaged'], [45, 25, 20, 10]],
};
function returnRate(catId, channel, t) {
  let r = 0.035;
  if (catId === 2) r = channel === 'Online' ? 0.24 : 0.06;
  else if (catId === 1) r = channel === 'Online' ? 0.15 : 0.06;
  else if (catId === 4) r = 0.05 + (t >= D('2025-03-10') && t <= D('2025-04-30') ? 0.05 : 0); // promo buyers' remorse
  else if (channel === 'Online') r = 0.06;
  return r;
}

// ---------- main generation ----------
console.log('Generating sales...');
const sales = [], returns = [];
const agg = new Map(); // `${store}|${cat}|${yyyymm}` -> {sales, units, cost}
let orderId = 500000, lineId = 1, returnId = 1;

for (let t = START; t <= END; t += DAY) {
  const d = new Date(t), m = d.getUTCMonth(), wd = d.getUTCDay(), weekend = wd === 0 || wd === 6;
  const ym = d.getUTCFullYear() * 100 + m + 1;
  const catSamplers = {}, promoByCat = {};
  for (const ch of ['Store', 'Online']) {
    const act = activePromos(t, ch);
    promoByCat[ch] = {};
    const w = CATS.map(c => {
      let x = c.share[ch] * c.season[m];
      if (c.id === 5) x *= beautyBoom(t);
      if (c.id === 4 && t >= MEGA_DIP[0] && t <= MEGA_DIP[1]) x *= 0.55;
      const best = act.filter(p => p.cats.includes(c.id)).sort((a, b) => b.pct - a.pct)[0];
      if (best) { x *= best.lift; promoByCat[ch][c.id] = best; }
      return x;
    });
    catSamplers[ch] = sampler(CATS, w);
  }

  for (const s of allLocs) {
    if (t < s.open) continue;
    const ch = s.id === 99 ? 'Online' : 'Store';
    const lam = s.base * dayFactor(t, ch) * (ch === 'Online' ? WD_ONLINE[wd] : WD_STORE[wd]) * locTrend(s, t) * VOLUME;
    const nOrders = poisson(lam);
    for (let o = 0; o < nOrders; o++) {
      orderId++;
      const hour = ch === 'Online' ? hOnline() : (weekend ? hStoreWe() : hStoreWd());
      let cust = customers[0];
      if (ch === 'Online' ? rnd() < 0.85 : rnd() < 0.62) {
        for (let k = 0; k < 4; k++) {
          const c = ch === 'Online' ? onlineCustSampler() : (rnd() < 0.85 && homeSamplers[s.id] ? homeSamplers[s.id]() : anyCustSampler());
          if (c.join <= t) { cust = c; break; }
        }
      }
      const nLines = ch === 'Online' ? weighted([1, 2, 3, 4, 5], [40, 30, 17, 9, 4]) : weighted([1, 2, 3, 4], [45, 30, 15, 10]);
      const seen = new Set();
      for (let l = 0; l < nLines; l++) {
        const cat = catSamplers[ch]();
        let p = null;
        for (let k = 0; k < 6; k++) {
          const cand = prodSamplerByCat[cat.id]();
          if (cand.launch > t || seen.has(cand.id)) continue;
          if (cust.segment === 'Premium' && cand.tier === 'Good' && rnd() < 0.5) continue;
          if (cust.segment === 'Value' && cand.tier === 'Best' && rnd() < 0.5) continue;
          p = cand; break;
        }
        if (!p) continue;
        seen.add(p.id);
        const qty = weighted([1, 2, 3], cat.qtyW);
        const promo = promoByCat[ch][cat.id];
        let disc = promo ? promo.pct : 0;
        if (s.format === 'Outlet') disc = 1 - (1 - disc) * 0.75;
        disc = Math.round(disc * 1000) / 1000;
        const unit = r2(p.price * priceInfl(t));
        const net = r2(qty * unit * (1 - disc));
        const cost = r2(qty * p.cost * costInfl(cat.id, t));
        sales.push([lineId, orderId, iso(t), hour, s.id, ch, cust.id, p.id, promo ? promo.id : 0, qty, unit, disc, net, cost]);
        cust.spend += net;
        const key = `${s.id}|${cat.id}|${ym}`; const a = agg.get(key) || { sales: 0, units: 0, cost: 0 };
        a.sales += net; a.units += qty; a.cost += cost; agg.set(key, a);

        if (rnd() < returnRate(cat.id, ch, t)) {
          const rd = t + int(1, ch === 'Online' ? 30 : 21) * DAY;
          if (rd <= END) {
            const [reasons, rw] = RET_REASON[cat.id] || RET_REASON.default;
            const rq = qty === 1 ? 1 : int(1, qty);
            returns.push([returnId++, lineId, iso(rd), s.id, ch, cust.id, p.id, rq, r2(net / qty * rq), weighted(reasons, rw)]);
          }
        }
        lineId++;
      }
    }
  }
}

// loyalty tier from actual spend (top 3% Platinum, next 10% Gold, next 25% Silver)
const ranked = [...realCust].sort((a, b) => b.spend - a.spend);
ranked.forEach((c, i) => { const q = i / ranked.length; c.tier = c.spend === 0 ? 'Bronze' : q < 0.03 ? 'Platinum' : q < 0.13 ? 'Gold' : q < 0.38 ? 'Silver' : 'Bronze'; });
customers[0].tier = 'None';

// ---------- targets (monthly, store x category, through Dec 2026) ----------
const targets = [];
for (let y = 2023; y <= 2026; y++) for (let mo = 1; mo <= 12; mo++) {
  const ym = y * 100 + mo, prev = (y - 1) * 100 + mo, monthStart = `${y}-${String(mo).padStart(2, '0')}-01`;
  for (const s of allLocs) {
    if (D(monthStart) < s.open - 31 * DAY && s.open > START) continue;
    for (const c of CATS) {
      const cur = agg.get(`${s.id}|${c.id}|${ym}`), pr = agg.get(`${s.id}|${c.id}|${prev}`);
      let tgt;
      if (y === 2023) { if (!cur) continue; tgt = cur.sales * uni(0.95, 1.07); }
      else if (pr && D(monthStart) >= s.open + 365 * DAY) tgt = pr.sales * (s.id === 99 ? 1.20 : 1.05) * uni(0.98, 1.02);
      else if (cur) tgt = cur.sales * uni(0.95, 1.08);
      else continue;
      targets.push([monthStart, s.id, c.id, Math.round(tgt)]);
    }
  }
}

// ---------- inventory (month-end snapshot, store x category) ----------
const inventory = [];
for (let y = 2023; y <= 2026; y++) for (let mo = 1; mo <= 12; mo++) {
  const ym = y * 100 + mo; const monthEnd = Date.UTC(y, mo, 0);
  if (monthEnd > END) continue;
  for (const s of allLocs) for (const c of CATS) {
    const a = agg.get(`${s.id}|${c.id}|${ym}`); if (!a || a.units === 0) continue;
    const weekly = a.units / 4.33;
    const beautySqueeze = c.id === 5 && monthEnd >= D('2025-01-31');
    let woc = beautySqueeze ? uni(1.2, 3.0) : (c.id === 7 && mo >= 9 && mo <= 10) ? uni(8, 12) : uni(3, 7);
    if (s.format === 'Outlet' && c.id === 4) woc *= 1.6; // electronics overstock at outlets
    const units = Math.max(0, Math.round(weekly * woc));
    const stockout = beautySqueeze ? int(3, 10) : weighted([0, 1, 2, 3], [70, 15, 10, 5]);
    inventory.push([iso(monthEnd), s.id, c.id, units, r2(units * a.cost / a.units), stockout, Math.round(woc * 10) / 10]);
  }
}

// ---------- calendar ----------
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function isoWeek(t) { const d = new Date(t); const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day + 3); const fy = Date.UTC(d.getUTCFullYear(), 0, 4); return 1 + Math.round(((d - fy) / DAY - 3 + ((new Date(fy).getUTCDay() + 6) % 7)) / 7); }
const calendar = [];
for (let t = START; t <= CAL_END; t += DAY) {
  const d = new Date(t), y = d.getUTCFullYear(), m = d.getUTCMonth(), dom = d.getUTCDate(), wd = d.getUTCDay(), tg = thanksgiving(y);
  const event = t === tg ? 'Thanksgiving' : t === tg + DAY ? 'Black Friday' : t === tg + 4 * DAY ? 'Cyber Monday' : (m === 11 && dom === 24) ? 'Christmas Eve' : (m === 11 && dom === 25) ? 'Christmas Day' : (m === 11 && dom === 26) ? 'Boxing Day' : (m === 0 && dom === 1) ? "New Year's Day" : (m === 1 && dom === 14) ? "Valentine's Day" : '';
  const fy = m >= 1 ? y + 1 : y; const fm = m >= 1 ? m : 12;
  calendar.push([iso(t), y, `Q${Math.floor(m / 3) + 1}`, m + 1, MONTHS[m], MONTHS[m].slice(0, 3), y * 100 + m + 1, `${MONTHS[m].slice(0, 3)} ${y}`, dom, isoWeek(t), wd === 0 ? 7 : wd, DAYS[wd], DAYS[wd].slice(0, 3), wd === 0 || wd === 6 ? 1 : 0, event, `FY${fy}`, fm, t <= END ? 1 : 0]);
}

// ---------- write ----------
console.log(`Writing CSVs to ${OUT}`);
writeCsv('Sales.csv', ['OrderLineID', 'OrderID', 'OrderDate', 'OrderHour', 'StoreID', 'Channel', 'CustomerID', 'ProductID', 'PromotionID', 'Quantity', 'UnitPrice', 'DiscountPct', 'NetSales', 'CostAmount'], sales);
writeCsv('Returns.csv', ['ReturnID', 'OrderLineID', 'ReturnDate', 'StoreID', 'Channel', 'CustomerID', 'ProductID', 'ReturnQty', 'RefundAmount', 'ReturnReason'], returns);
writeCsv('Products.csv', ['ProductID', 'ProductName', 'CategoryID', 'Subcategory', 'Brand', 'PriceTier', 'ListPrice', 'UnitCost', 'LaunchDate'], products.map(p => [p.id, p.name, p.catId, p.sub, p.brand, p.tier, p.price, p.cost, iso(p.launch)]));
writeCsv('Categories.csv', ['CategoryID', 'Category', 'Department'], CATS.map(c => [c.id, c.name, c.dept]));
writeCsv('Stores.csv', ['StoreID', 'StoreName', 'City', 'State', 'Region', 'Format', 'OpenDate', 'SquareFeet', 'Latitude', 'Longitude', 'StoreManager'], allLocs.map(s => [s.id, s.name, s.city, s.st, s.region, s.format, iso(s.open), s.sqft, s.lat, s.lon, s.mgr]));
writeCsv('Customers.csv', ['CustomerID', 'CustomerName', 'Gender', 'AgeBand', 'Segment', 'LoyaltyTier', 'JoinDate', 'HomeStoreID', 'City', 'State'], customers.map(c => [c.id, c.name, c.gender, c.age, c.segment, c.tier, iso(c.join), c.home, c.city, c.st]));
writeCsv('Promotions.csv', ['PromotionID', 'PromotionName', 'PromotionType', 'StartDate', 'EndDate', 'DiscountPct', 'Categories', 'Channels'], promos.map(p => [p.id, p.name, p.type, iso(p.start), iso(p.end), p.pct, p.cats.map(id => catById[id].name).join('; '), p.channels.join('; ')]));
writeCsv('Targets.csv', ['MonthStart', 'StoreID', 'CategoryID', 'TargetSales'], targets);
writeCsv('Inventory.csv', ['SnapshotDate', 'StoreID', 'CategoryID', 'OnHandUnits', 'OnHandCost', 'StockoutDays', 'WeeksOfCover'], inventory);
writeCsv('Calendar.csv', ['Date', 'Year', 'Quarter', 'MonthNo', 'MonthName', 'MonthShort', 'YearMonth', 'MonthYear', 'DayOfMonth', 'ISOWeek', 'WeekdayNo', 'WeekdayName', 'WeekdayShort', 'IsWeekend', 'RetailEvent', 'FiscalYear', 'FiscalMonthNo', 'HasActuals'], calendar);

// ---------- quick story check ----------
const byYear = {};
for (const r of sales) { const y = r[2].slice(0, 4); const b = byYear[y] ||= { net: 0, online: 0, beauty: 0, elecNet: 0, elecCost: 0 }; b.net += r[12]; if (r[5] === 'Online') b.online += r[12]; const cat = products[r[7] - 1001].catId; if (cat === 5) b.beauty += r[12]; if (cat === 4) { b.elecNet += r[12]; b.elecCost += r[13]; } }
console.log('\nYear  NetSales      Online%  Beauty      ElecMargin%');
for (const [y, b] of Object.entries(byYear)) console.log(`${y}  ${Math.round(b.net).toLocaleString().padStart(12)}  ${(100 * b.online / b.net).toFixed(1).padStart(6)}  ${Math.round(b.beauty).toLocaleString().padStart(10)}  ${(100 * (1 - b.elecCost / b.elecNet)).toFixed(1).padStart(6)}`);
const retNet = returns.reduce((s, r) => s + r[8], 0);
console.log(`Returns: ${returns.length.toLocaleString()} lines, refund ${Math.round(retNet).toLocaleString()} (${(100 * retNet / sales.reduce((s, r) => s + r[12], 0)).toFixed(1)}% of sales)`);
