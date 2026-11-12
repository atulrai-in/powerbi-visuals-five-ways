// Post 4: interactive Deneb. Click-to-filter tier bars, a Pareto curve with hover readout,
// and a promotion lift chart driven by a native slicer through DAX measures.
// Run: node scripts/build-model.mjs (measures) then node scripts/build-post4.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { id, col, M, proj, str, num, bool, color, card, inFilter, notInFilter, writePage } from './pbir.mjs';
import { denebVisual, registerDeneb } from './deneb.mjs';

// The data starts 1 Jan 2023, so these have no "last year" to compare with (their % would divide by zero).
// The slicer hides them; the chart also shows "n/a" for any phase without a full year before it.
const NO_LY = ['No Promotion', 'New Year Sale 2023', 'Spring Beauty Week 2023', 'Summer Sports Fest 2023', 'Back to School 2023',
  'Toy Days 2023', 'Black Friday 2023', 'Online Flash Sale Spring 2023', 'Online Flash Sale Autumn 2023', 'New Year Sale 2024'];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = path.join(ROOT, 'Brightvale Retail.Report');
const INK = '#1E3A5F', MUTED = '#6B7280', BG = '#F3F4F6';
const PAGE = 'post4interactive';
const v = s => id(`${PAGE}:${s}`);

registerDeneb(REPORT);

const textRun = (value, style = {}) => ({ value, textStyle: { fontSize: '12pt', color: '#374151', ...style } });
const para = (...runs) => ({ textRuns: runs });
const gap = () => para(textRun(' '));
const b = s => textRun(s, { fontWeight: 'bold', color: INK });
const code = s => para(textRun(s, { fontFamily: 'Consolas', fontSize: '10pt', color: INK }));
const textbox = (name, x, y, w, h, paragraphs) => ({ name: v(name), type: 'textbox', x, y, w, h, objects: { general: [{ properties: { paragraphs } }] }, container: card() });

const visuals = [
  {
    name: v('title'), type: 'textbox', x: 40, y: 14, w: 1440, h: 84,
    objects: { general: [{ properties: { paragraphs: [
      para(textRun('Who pays the bills, and what did our biggest sale cost?', { fontWeight: 'bold', fontSize: '26pt', color: INK, fontFamily: 'Segoe UI Semibold' })),
      para(textRun('Brightvale Stores · Three Deneb (Vega-Lite) charts that behave like native visuals: click to filter, hover for detail, driven by a slicer.', { color: MUTED })),
    ] } }] },
    container: { background: [{ properties: { show: bool(false) } }], title: [{ properties: { show: bool(false) } }] },
  },
  denebVisual({
    name: v('tiers'), x: 40, y: 108, w: 600, h: 440, selection: true,
    title: 'Loyalty tiers · click a tier to filter the page',
    fields: [col('Customers', 'LoyaltyTier'), M('Net Sales'), M('Active Customers')],
    specFile: 'post4-tiers.vl.json',
  }),
  denebVisual({
    name: v('pareto'), x: 656, y: 108, w: 824, h: 440, highlight: true,
    title: 'Members ranked by spend · hover the curve for a readout',
    fields: [col('Customers', 'CustomerID'), col('Customers', 'LoyaltyTier'), M('Net Sales')],
    specFile: 'post4-pareto.vl.json',
  }),
  denebVisual({
    name: v('promo'), x: 40, y: 564, w: 1440, h: 496,
    titleExpr: M('Title Promo'),
    fields: [col('Calendar', 'Date'), M('Promo Window Sales'), M('Promo Window Sales LY'), M('Promo Phase')],
    specFile: 'post4-promo.vl.json',
  }),
  {
    name: v('promoSlicer'), type: 'slicer', x: 1500, y: 108, w: 380, h: 96,
    query: { queryState: { Values: { projections: [proj(col('Promotions', 'PromotionName'))] } } },
    objects: {
      data: [{ properties: { mode: str('Dropdown') } }],
      general: [{ properties: { filter: inFilter('Promotions', 'PromotionName', ["'Electronics Mega Week'"]) } }],
      selection: [{ properties: { singleSelect: bool(true), strictSingleSelect: bool(true) } }],
      header: [{ properties: { show: bool(true), text: str('Promotion (drives the bottom chart)'), fontColor: color(MUTED), textSize: num(12), bold: bool(true) } }],
      items: [{ properties: { fontColor: color(INK), textSize: num(13) } }],
    },
    container: card(),
    filterConfig: { filters: [notInFilter(v('f-nopromo'), 'Promotions', 'PromotionName', NO_LY.map(n => `'${n}'`))] },
  },
  textbox('howto', 1500, 220, 380, 328, [
    para(textRun('Try it', { fontWeight: 'bold', fontSize: '14pt', color: INK })),
    gap(),
    para(b('Click a tier'), textRun(': the curve highlights that tier, and the promo chart redraws for those members only. Click again to clear.')),
    gap(),
    para(b('Hover the curve'), textRun(': the readout follows your pointer, "Top 10% → 44%".')),
    gap(),
    para(b('Pick a promotion'), textRun(': the bottom chart redraws for any promotion from 2024 on, compared with the same weekdays a year earlier.')),
  ]),
  textbox('trick', 1500, 564, 380, 496, [
    para(textRun('What it says', { fontWeight: 'bold', fontSize: '14pt', color: INK })),
    gap(),
    para(textRun('Platinum is 4% of members and 26% of sales. Bronze is half the members and 13%.')),
    gap(),
    para(textRun('Electronics Mega Week (30% off) doubled sales vs last year, then sales ran 28% below last year for four weeks. About half the extra sales were borrowed from April.')),
    gap(),
    para(textRun('The trick', { fontWeight: 'bold', fontSize: '14pt', color: INK })),
    gap(),
    para(textRun('Turn on cross-filtering in Deneb. Every row then arrives with a __selected__ field, so one test fades the rest:')),
    code('"opacity": {"condition": {'),
    code('  "test": "datum.__selected__ == \'off\'",'),
    code('  "value": 0.25}, "value": 1}'),
  ]),
];


// The promotion slicer drives the bottom chart only (Format > Edit interactions > None on the top two).
// A tier click highlights the Pareto (other tiers fade) and filters the promo chart.
const interactions = [
  ...['tiers', 'pareto'].map(t => ({ source: v('promoSlicer'), target: v(t), type: 'NoFilter' })),
  { source: v('tiers'), target: v('pareto'), type: 'HighlightFilter' },
];
const dir = writePage(REPORT, { name: PAGE, displayName: 'Post 4 · Interactive', background: BG, interactions }, visuals);
console.log(`Wrote ${visuals.length} visuals to ${dir}`);
