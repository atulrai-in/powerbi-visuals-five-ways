// Post 2: "Spot the problem store in 3 seconds" (DAX-drawn SVG in a native table).
// Run: node scripts/build-post2.mjs   (after build-model.mjs)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { id, col, M, proj, str, num, bool, color, colorExpr, inFilter, notInFilter, card, writePage, queryRef } from './pbir.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = path.join(ROOT, 'Brightvale Retail.Report');
const INK = '#1E3A5F', MUTED = '#6B7280', BG = '#F3F4F6';
const PAGE = 'post2svg';
const v = s => id(`${PAGE}:${s}`);

const p = (field, displayName) => ({ ...proj(field), ...(displayName ? { displayName } : {}) });
const COLS = [
  [col('Stores', 'StoreName'), 'Store', 240],
  [col('Stores', 'Region'), 'Region', 130],
  [col('Stores', 'Format'), 'Format', 120],
  [M('Net Sales'), 'Net sales YTD', 150],
  [M('SVG Sparkline'), '12-month sales trend', 210],
  [M('YoY %'), 'YoY', 110],
  [M('SVG Bullet'), 'Sales vs target', 210],
  [M('SVG Status'), 'Status', 200],
];

const textRun = (value, style = {}) => ({ value, textStyle: { fontSize: '12pt', color: '#374151', ...style } });
const para = (...runs) => ({ textRuns: runs });

const visuals = [
  {
    name: v('title'), type: 'textbox', x: 40, y: 14, w: 1440, h: 84,
    objects: { general: [{ properties: { paragraphs: [
      para(textRun('Spot the problem store in 3 seconds', { fontWeight: 'bold', fontSize: '26pt', color: INK, fontFamily: 'Segoe UI Semibold' })),
      para(textRun('Brightvale Stores · Every mini-chart in this table is an SVG image returned by a DAX measure. No custom visuals.', { color: MUTED })),
    ] } }] },
    container: { background: [{ properties: { show: bool(false) } }], title: [{ properties: { show: bool(false) } }] },
  },

  // Scorecard table
  {
    name: v('scorecard'), type: 'tableEx', x: 40, y: 108, w: 1440, h: 952,
    query: {
      queryState: { Values: { projections: COLS.map(([f, n]) => p(f, n)) } },
      sortDefinition: { sort: [{ field: M('YoY %'), direction: 'Ascending' }] },
    },
    objects: {
      grid: [{ properties: { gridHorizontal: bool(true), gridHorizontalColor: color('#EEF0F3'), gridVertical: bool(false), rowPadding: num(1), textSize: num(11), imageHeight: num(20), imageWidth: num(143) } }],
      columnHeaders: [{ properties: { fontColor: color(INK), backColor: color('#F9FAFB'), bold: bool(true), wordWrap: bool(true) } }],
      values: [
        { properties: { fontColorPrimary: color('#1F2937'), backColorPrimary: color('#FFFFFF'), fontColorSecondary: color('#1F2937'), backColorSecondary: color('#FAFBFC') } },
        { properties: { fontColor: colorExpr(M('Color YoY')) }, selector: { data: [{ dataViewWildcard: { matchingOption: 1 } }], metadata: queryRef(M('YoY %')) } },
      ],
      columnWidth: COLS.map(([f, , w]) => ({ properties: { value: num(w) }, selector: { metadata: queryRef(f) } })),
      total: [{ properties: { totals: bool(false) } }],
    },
    container: card({ titleExpr: M('Title Scorecard'), titleSize: 15, titleColor: INK }),
    filterConfig: { filters: [notInFilter(v('f-online'), 'Stores', 'Region', ["'Online'"])] },
  },

  // Right panel: year + how to read
  {
    name: v('year'), type: 'slicer', x: 1500, y: 108, w: 380, h: 100,
    query: { queryState: { Values: { projections: [proj(col('Calendar', 'Year'))] } } },
    objects: {
      data: [{ properties: { mode: str('Basic') } }],
      general: [{ properties: { orientation: num(1), filter: inFilter('Calendar', 'Year', ['2026L']) } }],
      selection: [{ properties: { singleSelect: bool(true), strictSingleSelect: bool(true) } }],
      header: [{ properties: { show: bool(true), text: str('Year (YTD to Oct)'), fontColor: color(MUTED), textSize: num(12), bold: bool(true) } }],
      items: [{ properties: { fontColor: color(INK), textSize: num(12) } }],
    },
    container: card(),
  },
  {
    name: v('howto'), type: 'textbox', x: 1500, y: 224, w: 380, h: 440,
    objects: { general: [{ properties: { paragraphs: [
      para(textRun('How to read a row', { fontWeight: 'bold', fontSize: '14pt', color: INK })),
      para(textRun(' ')),
      para(textRun('Sparkline', { fontWeight: 'bold', color: INK }), textRun(': rolling 12-month net sales, Jan 2025 to Oct 2026. Rolling strips out the Black Friday spike so the trend shows. Red when the store is down on last year. New stores start partway along.')),
      para(textRun(' ')),
      para(textRun('Bullet', { fontWeight: 'bold', color: INK }), textRun(': the bar is sales so far, the navy tick is target to date. The darker band ends at 90% of target. Green means at or above target, amber within 5%, red further behind.')),
      para(textRun(' ')),
      para(textRun('Status', { fontWeight: 'bold', color: INK }), textRun(': Ramping = open less than 12 months. Declining ≤ −10% YoY. Slipping −3% to −10%. Steady ±3%. Growing ≥ +3%.')),
      para(textRun(' ')),
      para(textRun('Sorted worst first', { fontWeight: 'bold', color: INK }), textRun(', so the store that needs a visit is always on the top row.')),
    ] } }] },
    container: card(),
  },
  {
    name: v('code'), type: 'textbox', x: 1500, y: 680, w: 380, h: 380,
    objects: { general: [{ properties: { paragraphs: [
      para(textRun('The trick', { fontWeight: 'bold', fontSize: '14pt', color: INK })),
      para(textRun(' ')),
      para(textRun('A measure returns text like', { color: '#374151' })),
      para(textRun('"data:image/svg+xml;utf8,<svg …>"', { fontFamily: 'Consolas', fontSize: '11pt', color: '#B45309' })),
      para(textRun(' ')),
      para(textRun('Set its data category to Image URL and any table or matrix draws it, one picture per row, recalculated with every filter.', { color: '#374151' })),
      para(textRun(' ')),
      ...[
        'SVG Status =',
        '"data:image/svg+xml;utf8,"',
        '& "<svg viewBox=\'0 0 200 28\'>"',
        '& "<rect rx=\'12\' fill=\'%23FEE2E2\' …/>"',
        '& "<text …>" & [Store Status]',
        '& "</text></svg>"',
      ].map(line => para(textRun(line, { fontFamily: 'Consolas', fontSize: '10pt', color: '#1E3A5F' }))),
    ] } }] },
    container: card(),
  },
];

const dir = writePage(REPORT, { name: PAGE, displayName: 'Post 2 · DAX SVG', background: BG }, visuals);
console.log(`Wrote ${visuals.length} visuals to ${dir}`);
