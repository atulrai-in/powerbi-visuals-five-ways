// Post 3: "When do customers actually shop?" Two Deneb (Vega-Lite) heatmaps Power BI doesn't ship.
// Run: node scripts/build-post3.mjs
// Specs live in scripts/deneb/*.vl.json so they can be edited, tested and shared as plain JSON.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { id, col, M, str, bool, card, writePage } from './pbir.mjs';
import { denebVisual, registerDeneb } from './deneb.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = path.join(ROOT, 'Brightvale Retail.Report');
const INK = '#1E3A5F', MUTED = '#6B7280', BG = '#F3F4F6';
const PAGE = 'post3deneb';
const v = s => id(`${PAGE}:${s}`);

registerDeneb(REPORT);
const deneb = denebVisual;

const textRun = (value, style = {}) => ({ value, textStyle: { fontSize: '12pt', color: '#374151', ...style } });
const para = (...runs) => ({ textRuns: runs });
const gap = () => para(textRun(' '));
const b = s => textRun(s, { fontWeight: 'bold', color: INK });
const code = s => para(textRun(s, { fontFamily: 'Consolas', fontSize: '10pt', color: INK }));

const visuals = [
  {
    name: v('title'), type: 'textbox', x: 40, y: 14, w: 1440, h: 84,
    objects: { general: [{ properties: { paragraphs: [
      para(textRun('When do customers actually shop?', { fontWeight: 'bold', fontSize: '26pt', color: INK, fontFamily: 'Segoe UI Semibold' })),
      para(textRun('Brightvale Stores · Two heatmaps Power BI doesn\'t ship, written in Vega-Lite and rendered by Deneb. No code to compile or package.', { color: MUTED })),
    ] } }] },
    container: { background: [{ properties: { show: bool(false) } }], title: [{ properties: { show: bool(false) } }] },
  },
  deneb({
    name: v('rhythm'), x: 40, y: 108, w: 1440, h: 412,
    title: 'Orders by hour and weekday, Jan 2023 – Oct 2026 · each panel coloured against its own busiest hour',
    fields: [col('Sales', 'Channel'), col('Calendar', 'WeekdayShort'), col('Sales', 'OrderHour'), M('Orders')],
    specFile: 'post3-rhythm.vl.json',
  }),
  deneb({
    name: v('calendar'), x: 40, y: 536, w: 1440, h: 524,
    title: 'Net sales every day of 2024 and 2025 · darker = bigger day · outlined = retail event',
    fields: [col('Calendar', 'Date'), col('Calendar', 'Year'), col('Calendar', 'RetailEvent'), M('Net Sales')],
    specFile: 'post3-calendar.vl.json',
  }),
  {
    name: v('findings'), type: 'textbox', x: 1500, y: 108, w: 380, h: 560,
    objects: { general: [{ properties: { paragraphs: [
      para(textRun('What the heatmaps say', { fontWeight: 'bold', fontSize: '14pt', color: INK })),
      gap(),
      para(b('In store'), textRun(': Saturday 12–3pm is the rush, 7.5× busier than the quietest open hour (Sunday 9pm).')),
      gap(),
      para(b('Online'), textRun(': Monday 9pm is the busiest hour, and 47% of online orders arrive after 6pm, just as stores close.')),
      gap(),
      para(b('Black Friday'), textRun(' is the biggest day every year: $58k in 2025, 3.4× an average day.')),
      gap(),
      para(b('The surprise'), textRun(': the Saturday before Christmas is almost as big ($54k in 2025). Staff it like Black Friday.')),
      gap(),
      para(b('Pale gaps'), textRun(': stores close on Thanksgiving and Christmas Day, so only online sales remain.')),
    ] } }] },
    container: card(),
  },
  {
    name: v('trick'), type: 'textbox', x: 1500, y: 684, w: 380, h: 376,
    objects: { general: [{ properties: { paragraphs: [
      para(textRun('The trick', { fontWeight: 'bold', fontSize: '14pt', color: INK })),
      gap(),
      para(textRun('Drop fields into Deneb, describe the chart in Vega-Lite JSON, and it behaves like any visual: slicers, filters and tooltips all work.')),
      gap(),
      code('"mark": "rect",'),
      code('"encoding": {'),
      code('  "x": {"field": "OrderHour"},'),
      code('  "y": {"field": "WeekdayShort"},'),
      code('  "color": {"field": "Orders"}'),
      code('}'),
    ] } }] },
    container: card(),
  },
];

const dir = writePage(REPORT, { name: PAGE, displayName: 'Post 3 · Deneb', background: BG }, visuals);
console.log(`Wrote ${visuals.length} visuals to ${dir}`);
