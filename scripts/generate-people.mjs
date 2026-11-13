// People data for Brightvale's sales team (14.2 Org Pulse).
// Run:  node scripts/generate-people.mjs
// Reads data/Stores.csv (never writes it) and adds five CSVs: People, Teams, Positions, OrgTimeline, Movements.
// It has its own seed and its own random stream, so the retail CSVs from generate-retail-data.mjs stay byte-identical.
//
// Model: positions ("seats") are the hierarchy. A seat reports to another seat, and people fill seats over time.
// OrgTimeline has one row per seat per period: who sat in it (blank = open role), its status, where it sat in the
// org, and why the period started. Previous team / previous manager are derived from it, not stored.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');

// ---------- knobs ----------
const SEED = 20261112;
const DAY = 86400000;
const D = s => Date.parse(s + 'T00:00:00Z');
const START = D('2023-01-01');
const END = D('2026-10-31');
const iso = ms => (ms == null ? '' : new Date(ms).toISOString().slice(0, 10));
const YEAR = 365.25;

// ---------- seeded random (own stream) ----------
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rnd = mulberry32(SEED);
const uni = (a, b) => a + (b - a) * rnd();
const int = (a, b) => Math.floor(uni(a, b + 1));
const pick = arr => arr[Math.floor(rnd() * arr.length)];
const expo = mean => -Math.log(1 - rnd()) * mean;
const weighted = (items, w) => { let r = rnd() * w.reduce((a, b) => a + b, 0); for (let i = 0; i < items.length; i++) { r -= w[i]; if (r < 0) return items[i]; } return items[items.length - 1]; };
const nextMonday = t => { const wd = new Date(t).getUTCDay(); return t + ((8 - wd) % 7) * DAY; };
// deterministic per-key variation that doesn't touch the random stream
const hash01 = (...k) => { let h = 2166136261; for (const c of k.join('|')) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return ((h >>> 0) % 100000) / 100000; };

// ---------- read stores ----------
function readCsv(file) {
  const [head, ...lines] = fs.readFileSync(path.join(DATA, file), 'utf8').trim().split(/\r?\n/);
  const cols = head.split(',');
  return lines.map(l => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v])));
}
const STORES = readCsv('Stores.csv').map(r => ({ id: +r.StoreID, name: r.StoreName, city: r.City, region: r.Region, format: r.Format, open: D(r.OpenDate), mgr: r.StoreManager }));
const storeById = Object.fromEntries(STORES.map(s => [s.id, s]));

// ---------- names (own pools; the 37 store-manager names are reserved) ----------
const FIRST = ['Adaeze', 'Adrian', 'Aiko', 'Alana', 'Alejandro', 'Alicia', 'Amara', 'Andre', 'Anika', 'Ari', 'Asha', 'Beatriz', 'Bianca', 'Bilal', 'Brandon', 'Brianna', 'Caleb', 'Camila', 'Cedric', 'Chidi', 'Dana', 'Darius', 'Deepa', 'Diego', 'Dmitri', 'Eli', 'Elif', 'Erin', 'Esther', 'Felix', 'Gabriel', 'Gemma', 'Hana', 'Hector', 'Imani', 'Ines', 'Isaac', 'Jada', 'Jamal', 'Jasmine', 'Javier', 'Jenna', 'Joel', 'Jordan', 'Josefina', 'Julian', 'Kai', 'Kara', 'Keisha', 'Kenji', 'Kiran', 'Lara', 'Layla', 'Lena', 'Logan', 'Luis', 'Malik', 'Marcus', 'Marisol', 'Mason', 'Matteo', 'Megan', 'Mika', 'Miles', 'Nadia', 'Naomi', 'Nathan', 'Nia', 'Nikhil', 'Nina', 'Oscar', 'Paolo', 'Paige', 'Rafael', 'Rania', 'Reggie', 'Renee', 'Riley', 'Rosa', 'Sanjay', 'Sara', 'Selena', 'Seth', 'Shreya', 'Simone', 'Sofia', 'Tamara', 'Tariq', 'Tessa', 'Theo', 'Tomas', 'Trinity', 'Tyler', 'Uma', 'Valeria', 'Victor', 'Wei', 'Xavier', 'Yara', 'Yusuf', 'Zainab', 'Zara'];
const LAST = ['Abara', 'Acosta', 'Ahmed', 'Alvarez', 'Anand', 'Bauer', 'Bell', 'Bishop', 'Boateng', 'Brooks', 'Castillo', 'Chandra', 'Cho', 'Coleman', 'Cruz', 'Dalton', 'Diaz', 'Dubois', 'Duncan', 'Ellis', 'Fernandes', 'Fischer', 'Fleming', 'Ford', 'Foster', 'Gill', 'Gomez', 'Gordon', 'Grant', 'Gupta', 'Hart', 'Hayes', 'Henderson', 'Hoffman', 'Holt', 'Hughes', 'Ibarra', 'Iyer', 'Jensen', 'Joshi', 'Kaur', 'Keller', 'Khan', 'Kowalski', 'Kumar', 'Lam', 'Larsen', 'Lopez', 'Lowe', 'Malik', 'Marsh', 'Mendez', 'Meyer', 'Molina', 'Moreno', 'Murphy', 'Nash', 'Novak', 'Obi', 'Okafor', 'Ortiz', 'Owens', 'Park', 'Pereira', 'Perry', 'Price', 'Quinn', 'Ramos', 'Rao', 'Reed', 'Reyes', 'Rivera', 'Ross', 'Russo', 'Saito', 'Santos', 'Schmidt', 'Shah', 'Silva', 'Singh', 'Sokolov', 'Sullivan', 'Suzuki', 'Tanaka', 'Thompson', 'Tran', 'Vargas', 'Vasquez', 'Vega', 'Wagner', 'Wallace', 'Ward', 'Watts', 'Weber', 'West', 'Wilson', 'Wong', 'Yamamoto', 'Zhang', 'Zimmerman'];
const usedNames = new Set(STORES.map(s => s.mgr));
const RESERVED = new Set(usedNames);
if (RESERVED.size !== STORES.length) throw new Error('Store manager names are not unique');
function newName() { for (;;) { const n = `${pick(FIRST)} ${pick(LAST)}`; if (!usedNames.has(n)) { usedNames.add(n); return n; } } }

// ---------- teams ----------
const teams = new Map();
const team = (id, name, type, parent, region, storeId = null, created = START) => teams.set(id, { id, name, type, parent, region, storeId, created });
team(1, 'Sales Leadership', 'Leadership', null, 'Leadership');
const REGIONS = ['Northeast', 'Southeast', 'Midwest', 'Southwest', 'West'];
REGIONS.forEach((r, i) => team(2 + i, `${r} Region`, 'Region', 1, r));
const regionTeam = r => 2 + REGIONS.indexOf(r);
team(7, 'Online Sales', 'Online', 1, 'Online', 99);
const DISTRICTS = [
  [11, 'NE Metro', 'Northeast', [101, 106, 103, 104]],
  [12, 'New England', 'Northeast', [102, 105, 107]],
  [13, 'Southeast', 'Southeast', [108, 109, 110, 111, 112, 113]],          // split on 6 Jan 2025
  [14, 'Carolinas & Tennessee', 'Southeast', [], D('2025-01-06')],         // gets Charlotte, Nashville, then Raleigh
  [15, 'Great Lakes', 'Midwest', [115, 116, 117, 120]],
  [16, 'Ohio Valley', 'Midwest', [118, 119, 121]],
  [17, 'Texas', 'Southwest', [122, 123, 126, 124]],
  [18, 'Desert Southwest', 'Southwest', [125, 127]],
  [19, 'California', 'West', [128, 129, 133, 135]],
  [20, 'Pacific & Mountain', 'West', [130, 131, 132, 134, 136]],
];
const districtOfStore = {};
for (const [id, name, region, storeIds, created] of DISTRICTS) { team(id, name, 'District', regionTeam(region), region, null, created ?? START); for (const s of storeIds) districtOfStore[s] = id; }
districtOfStore[114] = 14; // Raleigh opens after the split
for (const s of STORES) if (s.id !== 99) team(s.id, s.name, 'Store', districtOfStore[s.id], s.region, s.id, s.open > START ? s.open : START);
team(91, 'Online Customer Advisors', 'Online', 7, 'Online', 99);
team(92, 'Marketplace Sales', 'Online', 7, 'Online', 99);
team(93, 'Live Chat & Video', 'Online', 7, 'Online', 99, D('2024-06-03'));
team(94, 'Personal Shopping', 'Online', 7, 'Online', 99, D('2025-09-01'));
// final parents after the reorg
for (const s of [111, 112, 114]) teams.get(s).parent = 14;

// ---------- seats ----------
// level: 1 CSO, 2 regional director / head of online, 3 district manager, 4 store manager / online lead,
//        5 assistant store manager, 6 lead, 7 associate / advisor
const BAND = { cso: 260000, rd: 165000, headOnline: 155000, dm: 118000, smFlagship: 98000, sm: 80000, smExpress: 70000, onlineLead: 72000,
  asm: 60000, lead: 46000, associate: 33000, beauty: 36000, advisor: 42000 };
const ONLINE_SPAN = 9;
const TARGET_SPAN = { 1: 8, 2: 6, 3: 4, 4: 6, 5: 6, 6: 7 };
const seats = [];
const opening = []; // seats that open after START
function seat(teamId, parent, title, level, band, fte, open = START, opts = {}) {
  const s = { id: 1000 + seats.length + 1, title, level, band, fte, open, close: null, target: opts.target ?? TARGET_SPAN[level] ?? null,
    manual: !!opts.manual, kind: opts.kind ?? '', place: { team: teamId, parent: parent?.id ?? null }, cur: null, segs: [], fillAt: null, frozen: false };
  seats.push(s);
  if (open > START) opening.push(s);
  return s;
}
const ptFte = () => weighted([1, 0.75, 0.6, 0.5], [45, 20, 20, 15]);

const cso = seat(1, null, 'Chief Sales Officer', 1, 'cso', 1, START, { manual: true });
const rdSeat = {};
for (const r of REGIONS) rdSeat[r] = seat(regionTeam(r), cso, `Regional Director, ${r}`, 2, 'rd', 1, START, { manual: true });
const headOnline = seat(7, cso, 'Head of Online Sales', 2, 'headOnline', 1, START, { manual: true, target: 5 });
const dmSeat = {};
for (const [id, name, region, , created] of DISTRICTS) dmSeat[id] = seat(id, rdSeat[region], `District Manager, ${name}`, 3, 'dm', 1, created ?? START, { manual: true });

const smSeat = {}, asmSeat = {}, storeSeats = {};
const TEMPLATE = {
  Flagship: { asm: true, leads: [['Fashion Lead', 7], ['Home & Tech Lead', 6], ['Beauty Lead', 3]] },
  Standard: { asm: true, leads: [['Fashion Lead', 5], ['Home & Tech Lead', 4]] },
  Outlet: { asm: true, leads: [['Floor Lead', 4]], asmAssociates: 4 },
  Express: { asm: false, leads: [['Shift Lead', 0]], smAssociates: 4 },
};
const NEW_STORE_SEATS = { 124: ['2024-02-12', '2024-03-04', '2024-03-11'], 114: ['2025-01-20', '2025-01-27', '2025-02-03'], 136: ['2025-07-21', '2025-08-04', '2025-08-11'] };
for (const st of STORES) {
  if (st.id === 99) continue;
  const [smOpen, asmOpen, crewOpen] = (NEW_STORE_SEATS[st.id] ?? []).map(D);
  const t = TEMPLATE[st.format], list = storeSeats[st.id] = [];
  const sm = smSeat[st.id] = seat(st.id, dmSeat[districtOfStore[st.id] === 14 ? 13 : districtOfStore[st.id]], 'Store Manager', 4,
    st.format === 'Flagship' ? 'smFlagship' : st.format === 'Express' ? 'smExpress' : 'sm', 1, smOpen ?? START, { manual: true });
  if (st.id === 114) sm.place.parent = dmSeat[14].id;
  list.push(sm);
  let asm = null;
  if (t.asm) { asm = asmSeat[st.id] = seat(st.id, sm, 'Assistant Store Manager', 5, 'asm', 1, asmOpen ?? START, { manual: !!asmOpen }); list.push(asm); }
  for (const [title, n] of t.leads) {
    const lead = seat(st.id, sm, title, 6, 'lead', 1, asmOpen ?? START); list.push(lead);
    for (let i = 0; i < n; i++) list.push(seat(st.id, lead, 'Sales Associate', 7, 'associate', ptFte(), crewOpen ?? START, { kind: title.split(' ')[0] }));
  }
  for (let i = 0; i < (t.asmAssociates ?? 0); i++) list.push(seat(st.id, asm, 'Sales Associate', 7, 'associate', ptFte(), crewOpen ?? START));
  for (let i = 0; i < (t.smAssociates ?? 0); i++) list.push(seat(st.id, sm, 'Sales Associate', 7, 'associate', ptFte(), crewOpen ?? START));
}
// Beauty breakout (#3): new Beauty Advisor seats from 3 Mar 2025, slow to fill
const BEAUTY_OPEN = D('2025-03-03');
for (const st of STORES) {
  if (st.format !== 'Flagship' && st.format !== 'Standard') continue;
  const parent = st.format === 'Flagship' ? storeSeats[st.id].find(s => s.title === 'Beauty Lead') : smSeat[st.id];
  const open = Math.max(BEAUTY_OPEN, st.open);
  for (let i = 0; i < (st.format === 'Flagship' ? 2 : 1); i++) storeSeats[st.id].push(seat(st.id, parent, 'Beauty Advisor', 7, 'beauty', 1, open, { kind: 'beauty' }));
}
// Online: two teams at the start, a third in Jun 2024, a fourth in Sep 2025; advisor seats grow with online sales
const onlineLead = {};
onlineLead[91] = seat(91, headOnline, 'Online Team Lead', 4, 'onlineLead', 1, START, { kind: 'onlineLead', target: ONLINE_SPAN });
onlineLead[92] = seat(92, headOnline, 'Online Team Lead', 4, 'onlineLead', 1, START, { kind: 'onlineLead', target: ONLINE_SPAN });
const advisor = (teamId, open) => seat(teamId, onlineLead[teamId], 'Online Sales Advisor', 7, 'advisor', weighted([1, 0.6], [80, 20]), open, { kind: 'advisor' });
for (let i = 0; i < 8; i++) advisor(91, START);
for (let i = 0; i < 7; i++) advisor(92, START);
const onlineSeats = () => seats.filter(s => s.kind === 'advisor' && s.open <= simDay);
let simDay = START;

// ---------- people ----------
const people = [];
const movements = [];
function person(name, hire) { const p = { id: 20001 + people.length, name: name ?? newName(), hire, exit: null, exitReason: '', seat: null, leaveUntil: null, locked: false }; people.push(p); return p; }
const named = {};
const namedPerson = (name, hire) => (named[name] = Object.assign(person(name, hire), { locked: true }));

function setCur(s, d, patch) {
  if (s.cur && d > s.cur.from) s.segs.push({ ...s.cur, to: d - DAY });
  s.cur = { ...(s.cur ?? { team: s.place.team, parent: s.place.parent }), ...patch, from: d };
}
function assign(p, s, d, reason) {
  setCur(s, d, { person: p.id, status: 'Filled', reason });
  p.seat = s; s.fillAt = null; s.frozen = false;
}
const DAYTON = 121, FREEZE = D('2024-06-01');
let daytonFrozen = 0;
function scheduleFill(s, d) {
  s.fillAt = null;
  if (s.manual) return;
  if (s.place.team === DAYTON && d >= FREEZE && s.level >= 6 && daytonFrozen < 5) { s.frozen = true; daytonFrozen++; return; }
  let delay;
  if (s.kind === 'beauty') delay = 35 + expo(140);
  else if (s.open > START && d < s.open + 60 * DAY && s.place.team > 100) delay = uni(7, 35);   // new-store crew, hired before opening
  else if (s.level === 7) delay = 14 + expo(s.place.team === DAYTON ? 60 : 25);
  else if (s.level === 6) delay = 21 + expo(35);
  else delay = 30 + expo(40);
  s.fillAt = nextMonday(d + Math.round(delay) * DAY);
}
function vacate(s, d, reason) { setCur(s, d, { person: null, status: 'Open', reason }); scheduleFill(s, d); }
const teamOf = s => s.cur?.team ?? s.place.team;
function move(p, to, d, detail = '') {
  const from = p.seat;
  const type = to.level < from.level ? 'Promotion' : 'Transfer';
  vacate(from, d, 'Moved out');
  assign(p, to, d, type);
  movements.push({ date: d, person: p.id, type, from: from.id, to: to.id, fromTeam: teamOf(from), toTeam: teamOf(to), detail });
}
function hire(s, d, p = person(null, d)) {
  p.hire = d;
  assign(p, s, d, 'Hire');
  movements.push({ date: d, person: p.id, type: 'Hire', from: null, to: s.id, fromTeam: null, toTeam: teamOf(s), detail: '' });
  return p;
}
function exit(p, d, reason) {
  const s = p.seat;
  p.exit = d - DAY; p.exitReason = reason; p.seat = null;
  vacate(s, d, 'Exit');
  movements.push({ date: d, person: p.id, type: 'Exit', from: s.id, to: null, fromTeam: teamOf(s), toTeam: null, detail: reason });
}
function reparent(s, d, teamId, parentSeat, detail) {
  const fromTeam = teamOf(s);
  s.place = { team: teamId, parent: parentSeat.id };
  setCur(s, d, { team: teamId, parent: parentSeat.id, reason: 'Reorg' });
  if (s.cur.person) movements.push({ date: d, person: s.cur.person, type: 'Reorg', from: s.id, to: s.id, fromTeam, toTeam: teamId, detail });
}

// ---------- initial state, 1 Jan 2023 ----------
const tenureMean = { 1: 3000, 2: 2500, 3: 2200, 4: 1800, 5: 1500, 6: 1100, 7: 650 };
const backHire = s => Math.max(D('2004-01-05'), START - Math.round(expo(tenureMean[s.level]) + 20) * DAY);
// people whose later moves are scripted start in these seats
const leadOf = (store, title) => storeSeats[store].find(s => s.title === title);
const PRESET = new Map([
  [asmSeat[108], 'Kwame Patel'],       // Atlanta ASM → Atlanta SM at the 2025 reorg
  [asmSeat[118], 'Samuel Johnson'],    // Columbus ASM → Dayton SM, Nov 2024
  [asmSeat[101], 'Emma Edwards'],      // New York ASM → Boston SM, Mar 2024
  [asmSeat[110], 'Sophia Walker'],     // Orlando ASM → Miami SM, Feb 2026
  [asmSeat[123], 'Carlos Mendez'],     // Houston ASM → Austin SM (opening) → district manager
  [asmSeat[111], 'Hiro Scott'],        // Charlotte ASM → Raleigh SM (opening)
  [asmSeat[132], 'Fatima Nelson'],     // Denver ASM → Salt Lake City SM (opening)
  [storeSeats[123].find(s => s.title === 'Sales Associate' && s.kind === 'Fashion'), 'Isabella Nelson'], // career path (#6)
  [headOnline, 'Kwame Lee'],
]);
const SCRIPTED_SM = new Set([121, 108, 102, 130, 109]); // these stores change manager on the record; the others keep Stores.csv's name
for (const s of seats) {
  if (s.open > START) continue;
  setCur(s, START, { person: null, status: 'Open', reason: 'In post' });
  const presetName = PRESET.get(s);
  if (!presetName && s.level === 7 && rnd() < 0.03) { s.fillAt = nextMonday(START + int(5, 45) * DAY); continue; } // open at the start
  let p;
  if (presetName) p = namedPerson(presetName, backHire(s));
  else if (s.title === 'Store Manager' && !SCRIPTED_SM.has(s.place.team)) p = namedPerson(storeById[s.place.team].mgr, backHire(s));
  else p = person(null, backHire(s));
  if (presetName === 'Isabella Nelson') p.hire = D('2022-03-14');
  assign(p, s, START, 'In post');
}
for (const p of people) if (p.name === 'Kwame Lee' || (p.seat?.title === 'Store Manager')) p.locked = true;

// ---------- scripted story events ----------
const findSeat = id => seats.find(s => s.id === id);
const SCRIPT = [
  // Houston: Isabella Nelson's first step up (#6)
  ['2023-05-19', () => exit(leadOf(123, 'Fashion Lead').cur.person && people.find(p => p.id === leadOf(123, 'Fashion Lead').cur.person), D('2023-05-19'), 'Resigned')],
  ['2023-06-05', () => move(named['Isabella Nelson'], leadOf(123, 'Fashion Lead'), D('2023-06-05'))],
  // Dayton Riverside (#4): three store managers in fourteen months
  ['2023-09-15', () => exit(people.find(p => p.id === smSeat[121].cur.person), D('2023-09-15'), 'Resigned')],
  ['2023-11-06', () => hire(smSeat[121], D('2023-11-06'))],
  ['2024-08-30', () => exit(people.find(p => p.id === smSeat[121].cur.person), D('2024-08-30'), 'Resigned')],
  ['2024-11-04', () => move(named['Samuel Johnson'], smSeat[121], D('2024-11-04'), 'Ohio Valley: Columbus to Dayton')],
  // Seattle: external hire
  ['2023-10-13', () => exit(people.find(p => p.id === smSeat[130].cur.person), D('2023-10-13'), 'Resigned')],
  ['2023-12-04', () => hire(smSeat[130], D('2023-12-04'), namedPerson('Lucia Allen', D('2023-12-04')))],
  // Boston: New York's ASM steps up
  ['2024-02-29', () => exit(people.find(p => p.id === smSeat[102].cur.person), D('2024-02-29'), 'Retired')],
  ['2024-03-04', () => move(named['Emma Edwards'], smSeat[102], D('2024-03-04'))],
  // Austin opens 15 Apr 2024 (#5): Houston seeds the leadership, three associates transfer in
  ['2024-02-12', () => move(named['Carlos Mendez'], smSeat[124], D('2024-02-12'), 'Austin opening team')],
  ['2024-03-04', () => move(named['Isabella Nelson'], asmSeat[124], D('2024-03-04'), 'Austin opening team')],
  ['2024-03-25', () => seedTransfers(124, [123, 122, 126], D('2024-03-25'))],
  // Online: a third team takes the overflow (#5 online growth)
  ['2024-06-03', () => splitOnline(93, D('2024-06-03'), 6)],
  // Southeast reorg (#2): a six-store district is split; promotions cascade
  ['2025-01-06', () => southeastReorg(D('2025-01-06'))],
  // Raleigh opens 1 Mar 2025
  ['2025-01-20', () => move(named['Hiro Scott'], smSeat[114], D('2025-01-20'), 'Raleigh opening team')],
  ['2025-02-17', () => seedTransfers(114, [111, 111], D('2025-02-17'))],
  // Desert Southwest DM retires; Carlos Mendez steps up and Isabella Nelson takes Austin
  ['2025-05-30', () => exit(people.find(p => p.id === dmSeat[18].cur.person), D('2025-05-30'), 'Retired')],
  ['2025-06-02', () => { move(named['Carlos Mendez'], dmSeat[18], D('2025-06-02')); move(named['Isabella Nelson'], smSeat[124], D('2025-06-02')); }],
  // Salt Lake City opens 20 Sep 2025 (#6 West): the Pacific & Mountain district manager now has five stores
  ['2025-07-21', () => move(named['Fatima Nelson'], smSeat[136], D('2025-07-21'), 'Salt Lake City opening team')],
  ['2025-09-01', () => { seedTransfers(136, [132, 134, 131], D('2025-09-01')); splitOnline(94, D('2025-09-01'), 7); }],
  // Miami: Orlando's ASM steps up
  ['2026-01-16', () => exit(people.find(p => p.id === smSeat[109].cur.person), D('2026-01-16'), 'Resigned')],
  ['2026-02-02', () => move(named['Sophia Walker'], smSeat[109], D('2026-02-02'))],
].map(([d, f]) => [D(d), f]);

function seedTransfers(toStore, fromStores, d) {
  for (const from of fromStores) {
    const target = storeSeats[toStore].find(s => s.level === 7 && s.kind !== 'beauty' && s.cur?.status === 'Open' && s.open <= d);
    const cands = storeSeats[from].filter(s => s.level === 7 && s.cur?.status === 'Filled').map(s => people.find(p => p.id === s.cur.person)).filter(p => !p.locked);
    if (target && cands.length) move(pick(cands), target, d, `${storeById[toStore].city} opening team`);
  }
}
function splitOnline(newTeam, d, take) {
  const lead = onlineLead[newTeam] = seat(newTeam, headOnline, 'Online Team Lead', 4, 'onlineLead', 1, d, { kind: 'onlineLead', target: ONLINE_SPAN });
  setCur(lead, d, { person: null, status: 'Open', reason: 'New role' });
  // take advisor seats one at a time from whichever existing team is biggest
  const teamSeats = t => seats.filter(s => s.kind === 'advisor' && s.place.team === t && s.cur);
  const existing = Object.keys(onlineLead).map(Number).filter(t => t !== newTeam);
  const biggest = () => existing.reduce((a, b) => (teamSeats(b).length > teamSeats(a).length ? b : a));
  const firstDonor = biggest();
  for (let i = 0; i < take; i++) reparent(teamSeats(biggest()).at(-1), d, newTeam, lead, `New team: ${teams.get(newTeam).name}`);
  // most experienced advisor in the biggest donor team becomes the lead
  const cands = seats.filter(s => s.kind === 'advisor' && s.place.team === firstDonor && s.cur?.status === 'Filled')
    .map(s => people.find(p => p.id === s.cur.person)).filter(p => !p.locked).sort((a, b) => a.hire - b.hire);
  move(cands[0], lead, d, `Leads the new ${teams.get(newTeam).name} team`);
}
function southeastReorg(d) {
  const atlantaSm = people.find(p => p.id === smSeat[108].cur.person);
  setCur(dmSeat[14], d, { person: null, status: 'Open', reason: 'New role' });
  for (const st of [111, 112]) reparent(smSeat[st], d, st, dmSeat[14], 'Southeast district split');
  move(atlantaSm, dmSeat[14], d, 'Southeast district split');
  move(named['Kwame Patel'], smSeat[108], d, 'Southeast district split');
}

// ---------- daily simulation ----------
const EXIT_RATE = s => s.kind === 'advisor' ? 0.22 : s.kind === 'beauty' ? 0.30 : s.level === 7 ? (s.fte < 1 ? 0.36 : 0.26) : s.level === 6 ? 0.15 : s.level === 5 ? 0.11 : s.kind === 'onlineLead' ? 0.10 : 0;
const EXIT_REASON = s => weighted(['Resigned', 'Dismissed', 'Retired', 'Contract ended'], [72, 9, 4, s.level === 7 && s.fte < 1 ? 15 : 0]);
const onlineTarget = d => Math.round(15 * Math.pow(1.27, (d - START) / DAY / YEAR));
const onlineMix = d => d >= D('2025-09-01') ? [[91, 35], [92, 20], [93, 25], [94, 20]] : d >= D('2024-06-03') ? [[91, 45], [92, 25], [93, 30]] : [[91, 60], [92, 40]];
const dmOfStore = st => smSeat[st].cur?.parent ?? smSeat[st].place.parent;

let si = 0;
SCRIPT.sort((a, b) => a[0] - b[0]);
for (let d = START + DAY; d <= END; d += DAY) {
  simDay = d;
  while (si < SCRIPT.length && SCRIPT[si][0] <= d) SCRIPT[si++][1]();
  // seats opening today
  for (const s of opening) if (s.open === d && !s.cur) { setCur(s, d, { person: null, status: 'Open', reason: 'New role' }); scheduleFill(s, d); }
  // online growth: add advisor seats on the first Monday of each month
  if (new Date(d).getUTCDay() === 1 && new Date(d).getUTCDate() <= 7) {
    while (onlineSeats().length < onlineTarget(d)) {
      const s = advisor(weighted(...(() => { const m = onlineMix(d); return [m.map(x => x[0]), m.map(x => x[1])]; })()), d);
      opening.splice(opening.indexOf(s), 1);
      setCur(s, d, { person: null, status: 'Open', reason: 'New role' }); scheduleFill(s, d);
    }
  }
  // people: leave, exits, transfers
  for (const s of seats) {
    if (!s.cur?.person) continue;
    const p = people.find(x => x.id === s.cur.person);
    if (p.locked && s.level <= 4 && s.kind !== 'onlineLead') continue;
    if (s.cur.status === 'On leave') { if (d >= p.leaveUntil) setCur(s, d, { status: 'Filled', reason: 'Back from leave' }); continue; }
    if (p.locked) continue;
    if (d - p.hire > 90 * DAY && rnd() < 0.09 / YEAR) { p.leaveUntil = d + int(42, 140) * DAY; setCur(s, d, { status: 'On leave', reason: 'Leave' }); continue; }
    let rate = EXIT_RATE(s);
    if (s.place.team === DAYTON && d >= D('2023-07-01')) rate *= 2.2;
    if (s.open > START && d < s.open + 240 * DAY) rate *= 1.3;
    if (rnd() < rate / YEAR) { exit(p, d, EXIT_REASON(s)); continue; }
    if (s.level === 7 && s.place.team > 100 && s.place.team < 200 && s.kind !== 'beauty' && rnd() < 0.05 / YEAR) {
      const dm = dmOfStore(s.place.team);
      const targets = seats.filter(t => t.level === 7 && t.kind !== 'beauty' && t.cur?.status === 'Open' && !t.frozen && t.place.team !== s.place.team && t.place.team > 100 && t.place.team < 200 && dmOfStore(t.place.team) === dm);
      if (targets.length) move(p, pick(targets), d, 'Moved stores');
    }
  }
  // fill open seats that are due
  for (const s of seats) {
    if (s.cur?.status !== 'Open' || s.frozen || s.fillAt == null || s.fillAt > d) continue;
    let cands = [];
    const free = p => p && !p.locked && p.seat?.cur?.status === 'Filled' && d - p.hire > 300 * DAY;
    const occupants = list => list.filter(t => t.cur?.person).map(t => people.find(p => p.id === t.cur.person)).filter(free);
    if (s.kind === 'onlineLead') cands = occupants(seats.filter(t => t.kind === 'advisor'));
    else if (s.level === 6 && rnd() < 0.55) cands = occupants(storeSeats[s.place.team].filter(t => t.level === 7));
    else if (s.level === 5 && rnd() < 0.6) { const dm = dmOfStore(s.place.team); cands = occupants(seats.filter(t => t.level === 6 && t.place.team > 100 && t.place.team < 200 && dmOfStore(t.place.team) === dm)); }
    if (cands.length) move(pick(cands), s, d); else hire(s, d);
  }
}

// ---------- write ----------
function writeCsv(name, header, rows) {
  const esc = v => { if (v === null || v === undefined) return ''; const s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  fs.writeFileSync(path.join(DATA, name), [header.join(','), ...rows.map(r => r.map(esc).join(','))].join('\n') + '\n');
  console.log(`  ${name.padEnd(18)} ${rows.length.toLocaleString().padStart(7)} rows`);
}
const REGION_MULT = { Northeast: 1.08, West: 1.1 };
const cost = (s, seg) => { if (!seg.person) return null; const t = teams.get(seg.team); return Math.round(BAND[s.band] * s.fte * (REGION_MULT[t.region] ?? 1) * (0.93 + 0.14 * hash01(seg.person, s.id)) / 100) * 100; };
const timeline = [];
for (const s of seats) {
  if (!s.cur) continue;
  for (const seg of [...s.segs, { ...s.cur, to: null }]) {
    if (seg.to != null && seg.to < seg.from) continue;
    timeline.push([0, s.id, seg.parent, seg.team, seg.person, iso(seg.from), iso(seg.to), seg.status, seg.reason, s.fte, cost(s, seg)]);
  }
}
timeline.sort((a, b) => a[5].localeCompare(b[5]) || a[1] - b[1]);
timeline.forEach((r, i) => { r[0] = i + 1; });

console.log(`Writing people CSVs to ${DATA}`);
writeCsv('People.csv', ['PersonID', 'PersonName', 'HireDate', 'ExitDate', 'ExitReason'], people.map(p => [p.id, p.name, iso(p.hire), iso(p.exit), p.exitReason]));
writeCsv('Teams.csv', ['TeamID', 'TeamName', 'TeamType', 'ParentTeamID', 'Region', 'StoreID', 'CreatedDate'], [...teams.values()].map(t => [t.id, t.name, t.type, t.parent, t.region, t.storeId, iso(t.created)]));
writeCsv('Positions.csv', ['PositionID', 'Title', 'Level', 'TargetSpan', 'OpenDate'], seats.filter(s => s.cur).map(s => [s.id, s.title, s.level, s.target, iso(s.open)]));
writeCsv('OrgTimeline.csv', ['RowID', 'PositionID', 'ReportsToPositionID', 'TeamID', 'PersonID', 'ValidFrom', 'ValidTo', 'Status', 'ChangeReason', 'FTE', 'AnnualCost'], timeline);
movements.sort((a, b) => a.date - b.date || a.person - b.person);
writeCsv('Movements.csv', ['MovementID', 'MoveDate', 'PersonID', 'MoveType', 'FromPositionID', 'ToPositionID', 'FromTeamID', 'ToTeamID', 'Detail'],
  movements.map((m, i) => [i + 1, iso(m.date), m.person, m.type, m.from, m.to, m.fromTeam, m.toTeam, m.detail]));

// ---------- story check ----------
const rows = timeline.map(r => ({ pos: r[1], parent: r[2], team: r[3], person: r[4], from: D(r[5]), to: r[6] ? D(r[6]) : Infinity, status: r[7], fte: r[9] }));
const at = d => rows.filter(r => r.from <= d && r.to >= d);
const staffing = (d, f = () => true) => { const a = at(d).filter(f); const plan = a.reduce((s, r) => s + r.fte, 0), eff = a.filter(r => r.status === 'Filled').reduce((s, r) => s + r.fte, 0); return { plan, eff, pct: eff / plan, heads: a.filter(r => r.person).length, open: a.filter(r => r.status === 'Open').length, leave: a.filter(r => r.status === 'On leave').length }; };
const span = (d, seatId) => at(d).filter(r => r.parent === seatId && r.person).length;
const pct = x => (100 * x).toFixed(0) + '%';
console.log('\nDate        Heads  Plan FTE  Eff FTE  Staffed  Open  Leave');
for (const ds of ['2023-01-01', '2023-12-31', '2024-12-31', '2025-12-31', '2026-10-31']) { const s = staffing(D(ds)); console.log(`${ds}  ${String(s.heads).padStart(5)}  ${s.plan.toFixed(0).padStart(8)}  ${s.eff.toFixed(0).padStart(7)}  ${pct(s.pct).padStart(7)}  ${String(s.open).padStart(4)}  ${String(s.leave).padStart(5)}`); }
for (const y of [2023, 2024, 2025, 2026]) {
  const m = movements.filter(x => new Date(x.date).getUTCFullYear() === y), c = t => m.filter(x => x.type === t).length;
  const avgHeads = (staffing(D(`${y}-01-01`)).heads + staffing(Math.min(END, D(`${y}-12-31`))).heads) / 2;
  console.log(`${y}: hires ${c('Hire')}, exits ${c('Exit')} (${pct(c('Exit') / avgHeads * (y === 2026 ? 12 / 10 : 1))} a year), promotions ${c('Promotion')}, transfers ${c('Transfer')}, reorg ${c('Reorg')}`);
}
console.log('\nDayton Riverside staffed (effective FTE / plan):', ['2023-06-30', '2023-12-31', '2024-06-30', '2024-12-31', '2025-06-30', '2025-12-31', '2026-10-31'].map(ds => `${ds.slice(0, 7)} ${pct(staffing(D(ds), r => r.team === DAYTON).pct)}`).join(' · '));
console.log('Company excl. Dayton, 2026-10-31:', pct(staffing(END, r => r.team !== DAYTON).pct));
console.log('Dayton store managers:', [...new Set(rows.filter(r => r.pos === smSeat[121].id && r.person).map(r => people.find(p => p.id === r.person).name))].join(' → '));
console.log('Southeast DM span: 2024-12-31', span(D('2024-12-31'), dmSeat[13].id), '→ 2025-01-31', span(D('2025-01-31'), dmSeat[13].id), '+ new district', span(D('2025-03-31'), dmSeat[14].id));
console.log('Pacific & Mountain DM span: 2025-06-30', span(D('2025-06-30'), dmSeat[20].id), '→ 2025-10-31', span(D('2025-10-31'), dmSeat[20].id), '→ 2026-10-31', span(END, dmSeat[20].id));
console.log('Online heads:', ['2023-01-01', '2024-05-31', '2024-06-30', '2025-08-31', '2025-09-30', '2026-10-31'].map(ds => `${ds.slice(0, 7)} ${at(D(ds)).filter(r => teams.get(r.team).storeId === 99 && r.person).length} (lead spans ${[91, 92, 93, 94].filter(t => onlineLead[t] && onlineLead[t].open <= D(ds)).map(t => span(D(ds), onlineLead[t].id)).join('/')})`).join(' · '));
const beauty = seats.filter(s => s.kind === 'beauty').map(s => s.id);
console.log('Beauty Advisor seats open:', ['2025-03-31', '2025-06-30', '2025-09-30', '2026-03-31', '2026-10-31'].map(ds => `${ds.slice(0, 7)} ${at(D(ds)).filter(r => beauty.includes(r.pos) && r.status === 'Open').length}/${at(D(ds)).filter(r => beauty.includes(r.pos)).length}`).join(' · '));
const isa = named['Isabella Nelson'];
console.log('Isabella Nelson:', rows.filter(r => r.person === isa.id).sort((a, b) => a.from - b.from).map(r => `${iso(r.from)} ${findSeat(r.pos).title}, ${teams.get(r.team).name}`).filter((x, i, a) => a.indexOf(x) === i).join(' → '));
const mismatch = STORES.filter(st => { const cur = smSeat[st.id === 99 ? null : st.id]; const occ = st.id === 99 ? headOnline.cur.person : cur?.cur.person; return people.find(p => p.id === occ)?.name !== st.mgr; });
console.log(mismatch.length ? `MISMATCH with Stores.csv managers: ${mismatch.map(s => s.name).join(', ')}` : 'All 37 managers in Stores.csv match the 31 Oct 2026 org.');
