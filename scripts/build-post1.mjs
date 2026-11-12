// Post 1: "The total is lying to you" (built-in visuals only).
// Techniques: field parameters (Metric, Breakdown), a calculation group (Store Scope),
// measure-driven colours and dynamic titles.
// Run: node scripts/build-post1.mjs   (after build-model.mjs)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { id, col, M, role, paramRole, lit, str, num, bool, color, colorExpr, inFilter, card, writePage, queryRef } from './pbir.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = path.join(ROOT, 'Brightvale Retail.Report');

const INK = '#1E3A5F', MUTED = '#6B7280', ACCENT = '#2563EB', ORANGE = '#C2410C', BG = '#F3F4F6';
const PAGE = 'post1native';
const v = s => id(`${PAGE}:${s}`);

// --- slicer factory ---
function slicer(key, field, { x, y, w, h, title, defaultValue, filterProp, horizontal = false }) {
  return {
    name: v(key), type: 'slicer', x, y, w, h,
    query: { queryState: { Values: role(field) } },
    objects: {
      data: [{ properties: { mode: str('Basic') } }],
      general: [{ properties: { orientation: num(horizontal ? 1 : 0), ...(defaultValue ? { filter: inFilter(field.Column.Expression.SourceRef.Entity, filterProp || field.Column.Property, [defaultValue]) } : {}) } }],
      selection: [{ properties: { singleSelect: bool(true), strictSingleSelect: bool(true), selectAllCheckboxEnabled: bool(false) } }],
      header: [{ properties: { show: bool(true), text: str(title), fontColor: color(MUTED), textSize: num(11), bold: bool(true) } }],
      items: [{ properties: { fontColor: color(INK), textSize: num(12), background: color('#FFFFFF') } }],
    },
    container: card(),
  };
}

// --- KPI card factory (classic card, value colour from a measure) ---
function kpi(key, measureName, x, colorMeasure) {
  return {
    name: v(key), type: 'card', x, y: 120, w: 372, h: 135,
    query: { queryState: { Values: role(M(measureName)) } },
    objects: {
      labels: [{ properties: { fontSize: num(30), bold: bool(true), color: colorMeasure ? colorExpr(M(colorMeasure)) : color(INK) } }],
      categoryLabels: [{ properties: { show: bool(true), fontSize: num(12), color: color(MUTED) } }],
    },
    container: card(),
  };
}

const visuals = [
  // Title
  {
    name: v('title'), type: 'textbox', x: 24, y: 16, w: 1500, h: 92,
    objects: { general: [{ properties: { paragraphs: [
      { textRuns: [{ value: 'The total is lying to you', textStyle: { fontWeight: 'bold', fontSize: '26pt', color: INK, fontFamily: 'Segoe UI Semibold' } }] },
      { textRuns: [{ value: 'Brightvale Stores · Every store vs like-for-like stores (open 12+ months) · Built with native Power BI visuals: field parameters, a calculation group, measure-driven colours', textStyle: { fontSize: '12pt', color: MUTED } }] },
    ] } }] },
    container: { background: [{ properties: { show: bool(false) } }], title: [{ properties: { show: bool(false) } }] },
  },

  // Left panel: slicers
  slicer('year', col('Calendar', 'Year'), { x: 24, y: 120, w: 312, h: 100, title: 'Year', defaultValue: '2026L', horizontal: true }),
  slicer('region', col('Stores', 'Region'), { x: 24, y: 232, w: 312, h: 300, title: 'Region', defaultValue: "'West'" }),
  slicer('metric', col('Metric', 'Metric'), { x: 24, y: 544, w: 312, h: 264, title: 'Metric (field parameter)', filterProp: 'Metric Fields', defaultValue: "'''_Measures''[YoY %]'" }),
  slicer('breakdown', col('Breakdown', 'Breakdown'), { x: 24, y: 820, w: 312, h: 236, title: 'Breakdown (field parameter)', filterProp: 'Breakdown Fields', defaultValue: "'''Stores''[StoreName]'" }),

  // KPI cards
  kpi('kpi-sales', 'Net Sales', 360),
  kpi('kpi-yoy', 'YoY %', 748, 'Color YoY'),
  kpi('kpi-lfl', 'LFL YoY %', 1136, 'Color LFL'),
  kpi('kpi-var', 'Variance to Target %', 1524, 'Color Var'),

  // Monthly trend: columns = net sales, lines = total YoY vs LFL YoY
  {
    name: v('trend'), type: 'lineClusteredColumnComboChart', x: 360, y: 271, w: 1536, h: 390,
    query: {
      queryState: {
        Category: role(col('Calendar', 'MonthYear')),
        Y: role(M('Net Sales')),
        Y2: role(M('YoY %'), M('LFL YoY %')),
      },
      sortDefinition: { sort: [{ field: col('Calendar', 'MonthYear'), direction: 'Ascending' }], isDefaultSort: true },
    },
    objects: {
      dataPoint: [
        { properties: { defaultColor: color('#CBD5E1') } },
        { properties: { fill: color('#CBD5E1') }, selector: { metadata: queryRef(M('Net Sales')) } },
        { properties: { fill: color(ACCENT) }, selector: { metadata: queryRef(M('YoY %')) } },
        { properties: { fill: color(ORANGE) }, selector: { metadata: queryRef(M('LFL YoY %')) } },
      ],
      lineStyles: [{ properties: { strokeWidth: num(3), showMarker: bool(true), markerSize: num(5) } }],
      legend: [{ properties: { show: bool(true), position: str('TopRight'), fontSize: num(11) } }],
      labels: [{ properties: { show: bool(false) } }],
      valueAxis: [{ properties: { show: bool(true), gridlineShow: bool(false), labelColor: color(MUTED) } }],
      categoryAxis: [{ properties: { labelColor: color(MUTED), titleShow: bool(false) } }],
    },
    container: card({ titleExpr: M('Title Trend'), titleSize: 15, titleColor: INK }),
  },

  // Breakdown bar: axis = Breakdown field parameter, value = Metric field parameter, colour = measure
  {
    name: v('bars'), type: 'clusteredBarChart', x: 360, y: 677, w: 760, h: 379,
    query: { queryState: {
      Category: paramRole(col('Breakdown', 'Breakdown'), col('Stores', 'StoreName')),
      Y: { ...paramRole(col('Metric', 'Metric'), M('YoY %')), fieldParameters: [{ parameterExpr: col('Metric', 'Metric'), index: 0, length: 1, sortDirection: 'Descending' }] },
    } },
    objects: {
      dataPoint: [{ properties: { fill: colorExpr(M('Metric Color')) }, selector: { data: [{ dataViewWildcard: { matchingOption: 1 } }] } }],
      labels: [{ properties: { show: bool(true), fontSize: num(10), color: color(INK) } }],
      valueAxis: [{ properties: { show: bool(false), gridlineShow: bool(false) } }],
      categoryAxis: [{ properties: { labelColor: color(INK), fontSize: num(11), titleShow: bool(false) } }],
      legend: [{ properties: { show: bool(false) } }],
    },
    container: card({ titleExpr: M('Title Breakdown'), titleSize: 14, titleColor: INK }),
  },

  // Matrix: rows = Breakdown, columns = Store Scope calculation group, values = Metric
  {
    name: v('matrix'), type: 'pivotTable', x: 1136, y: 677, w: 760, h: 379,
    query: { queryState: {
      Rows: paramRole(col('Breakdown', 'Breakdown'), col('Stores', 'StoreName')),
      Columns: role(col('Store Scope', 'Store Scope')),
      Values: paramRole(col('Metric', 'Metric'), M('YoY %')),
    } },
    objects: {
      grid: [{ properties: { gridHorizontal: bool(true), gridHorizontalColor: color('#E5E7EB'), gridVertical: bool(false), rowPadding: num(2), textSize: num(12) } }],
      columnHeaders: [{ properties: { fontColor: color(INK), bold: bool(true), backColor: color('#F9FAFB'), alignment: str('Center') } }],
      rowHeaders: [{ properties: { fontColor: color(INK) } }],
      values: [{ properties: { fontColorPrimary: color(INK) } }],
      subTotals: [{ properties: { rowSubtotals: bool(true), columnSubtotals: bool(false) } }],
    },
    container: card({ titleExpr: M('Title Matrix'), titleSize: 14, titleColor: INK }),
  },
];

const dir = writePage(REPORT, { name: PAGE, displayName: 'Post 1 · Native', background: BG }, visuals, { replaceAll: true });
console.log(`Wrote ${visuals.length} visuals to ${dir}`);
