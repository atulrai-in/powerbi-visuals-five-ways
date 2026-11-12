// Writes the Brightvale semantic model (tables, relationships, measures) as TMDL
// into an existing PBIP: "<name>.SemanticModel/definition".
// Run:  node scripts/build-model.mjs "Brightvale Retail"
// Re-runnable: it owns the files it writes (tables listed below, relationships.tmdl, expressions.tmdl)
// and patches model.tmdl to reference them. Close Power BI Desktop before running.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { POST2_MEASURES } from './measures-post2.mjs';
import { POST4_MEASURES } from './measures-post4.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PBIP = process.argv[2] || 'Brightvale Retail';
const DEF = path.join(ROOT, `${PBIP}.SemanticModel`, 'definition');
const DATA = path.join(ROOT, 'data') + path.sep;
if (!fs.existsSync(DEF)) { console.error(`Not found: ${DEF}\nSave the report as a PBIP named "${PBIP}" in ${ROOT} first.`); process.exit(1); }
fs.mkdirSync(path.join(DEF, 'tables'), { recursive: true });

// deterministic GUIDs so re-runs don't churn files
const guid = s => { const h = crypto.createHash('md5').update('brightvale:' + s).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`; };
const q = n => /^[A-Za-z_][A-Za-z0-9_]*$/.test(n) ? n : `'${n.replace(/'/g, "''")}'`;
const T = (n = 1) => '\t'.repeat(n);

// ---------- column specs: [name, type, options] ----------
// types: int, text, num, money, date ; options: hidden, fmt, sortBy, sum, cat, key
const M_TYPE = { int: 'Int64.Type', text: 'type text', num: 'type number', money: 'Currency.Type', date: 'type date' };
const TMDL_TYPE = { int: 'int64', text: 'string', num: 'double', money: 'decimal', date: 'dateTime' };
const DEFAULT_FMT = { int: '0', num: '#,0.00', money: '$#,0.00', date: 'yyyy-mm-dd' };

const TABLES = [
  { name: 'Sales', csv: 'Sales.csv', cols: [
    ['OrderLineID', 'int', { hidden: true }], ['OrderID', 'int'], ['OrderDate', 'date', { hidden: true }], ['OrderHour', 'int'],
    ['StoreID', 'int', { hidden: true }], ['Channel', 'text'], ['CustomerID', 'int', { hidden: true }], ['ProductID', 'int', { hidden: true }],
    ['PromotionID', 'int', { hidden: true }], ['Quantity', 'int', { sum: true, fmt: '#,0' }], ['UnitPrice', 'money'], ['DiscountPct', 'num', { fmt: '0.0%' }],
    ['NetSales', 'money', { sum: true }], ['CostAmount', 'money', { sum: true }]] },
  { name: 'Returns', csv: 'Returns.csv', cols: [
    ['ReturnID', 'int', { hidden: true }], ['OrderLineID', 'int', { hidden: true }], ['ReturnDate', 'date', { hidden: true }], ['StoreID', 'int', { hidden: true }],
    ['Channel', 'text'], ['CustomerID', 'int', { hidden: true }], ['ProductID', 'int', { hidden: true }], ['ReturnQty', 'int', { sum: true, fmt: '#,0' }],
    ['RefundAmount', 'money', { sum: true }], ['ReturnReason', 'text']] },
  { name: 'Targets', csv: 'Targets.csv', cols: [
    ['MonthStart', 'date', { hidden: true }], ['StoreID', 'int', { hidden: true }], ['CategoryID', 'int', { hidden: true }], ['TargetSales', 'money', { sum: true, fmt: '$#,0' }]] },
  { name: 'Inventory', csv: 'Inventory.csv', cols: [
    ['SnapshotDate', 'date', { hidden: true }], ['StoreID', 'int', { hidden: true }], ['CategoryID', 'int', { hidden: true }], ['OnHandUnits', 'int', { fmt: '#,0' }],
    ['OnHandCost', 'money'], ['StockoutDays', 'int'], ['WeeksOfCover', 'num', { fmt: '0.0' }]] },
  { name: 'Calendar', csv: 'Calendar.csv', dateTable: true, cols: [
    ['Date', 'date', { key: true }], ['Year', 'int'], ['Quarter', 'text'], ['MonthNo', 'int', { hidden: true }], ['MonthName', 'text', { sortBy: 'MonthNo' }],
    ['MonthShort', 'text', { sortBy: 'MonthNo' }], ['YearMonth', 'int', { hidden: true }], ['MonthYear', 'text', { sortBy: 'YearMonth' }], ['DayOfMonth', 'int'],
    ['ISOWeek', 'int'], ['WeekdayNo', 'int', { hidden: true }], ['WeekdayName', 'text', { sortBy: 'WeekdayNo' }], ['WeekdayShort', 'text', { sortBy: 'WeekdayNo' }],
    ['IsWeekend', 'int'], ['RetailEvent', 'text'], ['FiscalYear', 'text'], ['FiscalMonthNo', 'int'], ['HasActuals', 'int']] },
  { name: 'Products', csv: 'Products.csv', cols: [
    ['ProductID', 'int'], ['ProductName', 'text'], ['CategoryID', 'int', { hidden: true }], ['Subcategory', 'text'], ['Brand', 'text'],
    ['PriceTier', 'text', { sortBy: 'PriceTierOrder' }], ['ListPrice', 'money'], ['UnitCost', 'money'], ['LaunchDate', 'date'], ['PriceTierOrder', 'int', { hidden: true, derived: true }]],
    extra: `Table.AddColumn(Typed, "PriceTierOrder", each List.PositionOf({"Good","Better","Best"}, [PriceTier]), Int64.Type)` },
  { name: 'Categories', csv: 'Categories.csv', cols: [['CategoryID', 'int'], ['Category', 'text'], ['Department', 'text']] },
  { name: 'Stores', csv: 'Stores.csv', cols: [
    ['StoreID', 'int'], ['StoreName', 'text'], ['City', 'text', { cat: 'City' }], ['State', 'text', { cat: 'StateOrProvince' }], ['Region', 'text'], ['Format', 'text'],
    ['OpenDate', 'date'], ['SquareFeet', 'int', { fmt: '#,0' }], ['Latitude', 'num', { cat: 'Latitude', fmt: '0.0000' }], ['Longitude', 'num', { cat: 'Longitude', fmt: '0.0000' }], ['StoreManager', 'text']] },
  { name: 'Customers', csv: 'Customers.csv', cols: [
    ['CustomerID', 'int'], ['CustomerName', 'text'], ['Gender', 'text'], ['AgeBand', 'text'], ['Segment', 'text'], ['LoyaltyTier', 'text', { sortBy: 'LoyaltyTierOrder' }],
    ['JoinDate', 'date'], ['HomeStoreID', 'int', { hidden: true }], ['City', 'text', { cat: 'City' }], ['State', 'text', { cat: 'StateOrProvince' }], ['LoyaltyTierOrder', 'int', { hidden: true, derived: true }]],
    extra: `Table.AddColumn(Typed, "LoyaltyTierOrder", each List.PositionOf({"None","Bronze","Silver","Gold","Platinum"}, [LoyaltyTier]), Int64.Type)` },
  { name: 'Promotions', csv: 'Promotions.csv', cols: [
    ['PromotionID', 'int'], ['PromotionName', 'text'], ['PromotionType', 'text'], ['StartDate', 'date'], ['EndDate', 'date'], ['DiscountPct', 'num', { fmt: '0%' }],
    ['Categories', 'text'], ['Channels', 'text']] },
];

function tableTmdl(t) {
  const L = [`table ${q(t.name)}`];
  if (t.dateTable) L.push(`${T()}dataCategory: Time`);
  L.push('');
  for (const [name, type, o = {}] of t.cols) {
    L.push(`${T()}column ${q(name)}`);
    L.push(`${T(2)}dataType: ${TMDL_TYPE[type]}`);
    if (o.key) L.push(`${T(2)}isKey`);
    if (o.hidden) L.push(`${T(2)}isHidden`);
    const fmt = o.fmt || DEFAULT_FMT[type];
    if (fmt) L.push(`${T(2)}formatString: ${fmt}`);
    if (o.cat) L.push(`${T(2)}dataCategory: ${o.cat}`);
    L.push(`${T(2)}summarizeBy: ${o.sum ? 'sum' : 'none'}`);
    L.push(`${T(2)}sourceColumn: ${name}`);
    if (o.sortBy) L.push(`${T(2)}sortByColumn: ${q(o.sortBy)}`);
    L.push('', `${T(2)}annotation SummarizationSetBy = User`, '');
  }
  const typed = t.cols.filter(([, , o = {}]) => !o.derived).map(([n, ty]) => `{"${n}", ${M_TYPE[ty]}}`).join(', ');
  const m = [
    'let',
    `    Source = Csv.Document(File.Contents(DataFolder & "${t.csv}"), [Delimiter = ",", Encoding = 65001, QuoteStyle = QuoteStyle.Csv]),`,
    '    Promoted = Table.PromoteHeaders(Source, [PromoteAllScalars = true]),',
    `    Typed = Table.TransformColumnTypes(Promoted, {${typed}}, "en-US")${t.extra ? ',' : ''}`,
    ...(t.extra ? [`    Final = ${t.extra}`] : []),
    'in',
    `    ${t.extra ? 'Final' : 'Typed'}`,
  ];
  L.push(`${T()}partition ${q(t.name)} = m`, `${T(2)}mode: import`, `${T(2)}source =`, ...m.map(l => T(4) + l), '');
  return L.join('\n') + '\n';
}

// ---------- measures ----------
const MEASURES = [
  // [folder, name, format, dax]
  ['Sales', 'Net Sales', '$#,0', `SUM(Sales[NetSales])`],
  ['Sales', 'Gross Sales', '$#,0', `SUMX(Sales, Sales[Quantity] * Sales[UnitPrice])`],
  ['Sales', 'Discount Amount', '$#,0', `[Gross Sales] - [Net Sales]`],
  ['Sales', 'Discount %', '0.0%', `DIVIDE([Discount Amount], [Gross Sales])`],
  ['Sales', 'Units', '#,0', `SUM(Sales[Quantity])`],
  ['Sales', 'Orders', '#,0', `DISTINCTCOUNT(Sales[OrderID])`],
  ['Sales', 'Avg Order Value', '$#,0.00', `DIVIDE([Net Sales], [Orders])`],
  ['Sales', 'Active Customers', '#,0', `CALCULATE(DISTINCTCOUNT(Sales[CustomerID]), Sales[CustomerID] <> 0)`],
  ['Sales', 'Online Share %', '0.0%', `DIVIDE(CALCULATE([Net Sales], Sales[Channel] = "Online"), [Net Sales])`],
  ['Sales', 'Promo Share %', '0.0%', `DIVIDE(CALCULATE([Net Sales], Sales[PromotionID] <> 0), [Net Sales])`],
  ['Margin', 'Cost', '$#,0', `SUM(Sales[CostAmount])`],
  ['Margin', 'Margin', '$#,0', `[Net Sales] - [Cost]`],
  ['Margin', 'Margin %', '0.0%', `DIVIDE([Margin], [Net Sales])`],
  ['Time Intelligence', 'Net Sales PY', '$#,0', `-- prior year, limited to dates that have actuals this year (fair YTD comparison)
CALCULATE(
    [Net Sales],
    CALCULATETABLE(SAMEPERIODLASTYEAR('Calendar'[Date]), 'Calendar'[HasActuals] = 1)
)`],
  ['Time Intelligence', 'YoY Change', '$#,0', `VAR _py = [Net Sales PY] RETURN IF(NOT ISBLANK(_py), [Net Sales] - _py)`],
  ['Time Intelligence', 'YoY %', '0.0%', `DIVIDE([YoY Change], [Net Sales PY])`],
  ['Time Intelligence', 'Net Sales YTD', '$#,0', `TOTALYTD([Net Sales], 'Calendar'[Date])`],
  ['Time Intelligence', 'Margin % PY', '0.0%', `CALCULATE([Margin %], CALCULATETABLE(SAMEPERIODLASTYEAR('Calendar'[Date]), 'Calendar'[HasActuals] = 1))`],
  ['Like for Like', 'LFL Net Sales', '$#,0', `-- stores open at least 12 months before the start of the selected period
VAR _cutoff = EDATE(MIN('Calendar'[Date]), -12)
RETURN CALCULATE([Net Sales], KEEPFILTERS(Stores[OpenDate] <= _cutoff))`],
  ['Like for Like', 'LFL Net Sales PY', '$#,0', `VAR _cutoff = EDATE(MIN('Calendar'[Date]), -12)
RETURN CALCULATE([Net Sales PY], KEEPFILTERS(Stores[OpenDate] <= _cutoff))`],
  ['Like for Like', 'LFL YoY %', '0.0%', `DIVIDE([LFL Net Sales] - [LFL Net Sales PY], [LFL Net Sales PY])`],
  ['Target', 'Target', '$#,0', `SUM(Targets[TargetSales])`],
  ['Target', 'Target to Date', '$#,0', `CALCULATE([Target], KEEPFILTERS('Calendar'[HasActuals] = 1))`],
  ['Target', 'Variance to Target', '$#,0', `VAR _t = [Target to Date] RETURN IF(NOT ISBLANK(_t), [Net Sales] - _t)`],
  ['Target', 'Variance to Target %', '0.0%', `DIVIDE([Variance to Target], [Target to Date])`],
  ['Returns', 'Refund Amount', '$#,0', `SUM(Returns[RefundAmount])`],
  ['Returns', 'Return Lines', '#,0', `COUNTROWS(Returns)`],
  ['Returns', 'Return Rate %', '0.0%', `-- returned lines / sold lines
DIVIDE([Return Lines], COUNTROWS(Sales))`],
  ['Returns', 'Refund % of Sales', '0.0%', `DIVIDE([Refund Amount], [Net Sales])`],
  ['Inventory', 'On Hand Units', '#,0', `-- semi-additive: last month-end snapshot in the period
VAR _last = CALCULATE(MAX(Inventory[SnapshotDate]))
RETURN CALCULATE(SUM(Inventory[OnHandUnits]), 'Calendar'[Date] = _last)`],
  ['Inventory', 'On Hand Cost', '$#,0', `VAR _last = CALCULATE(MAX(Inventory[SnapshotDate]))
RETURN CALCULATE(SUM(Inventory[OnHandCost]), 'Calendar'[Date] = _last)`],
  ['Inventory', 'Avg Weeks of Cover', '0.0', `VAR _last = CALCULATE(MAX(Inventory[SnapshotDate]))
RETURN CALCULATE(AVERAGE(Inventory[WeeksOfCover]), 'Calendar'[Date] = _last)`],
  ['Inventory', 'Avg Stockout Days', '0.0', `AVERAGE(Inventory[StockoutDays])`],
];

function measuresTmdl() {
  const L = ['table _Measures', ''];
  for (const [folder, name, fmt, dax, category] of MEASURES) {
    if (dax.includes('\n')) L.push(`${T()}measure ${q(name)} = \`\`\``, ...dax.split('\n').map(l => T(3) + l), `${T(3)}\`\`\``);
    else L.push(`${T()}measure ${q(name)} = ${dax}`);
    if (fmt) L.push(`${T(2)}formatString: ${fmt}`);
    if (category) L.push(`${T(2)}dataCategory: ${category}`);
    L.push(`${T(2)}displayFolder: ${folder}`, '');
  }
  L.push(`${T()}column Placeholder`, `${T(2)}dataType: string`, `${T(2)}isHidden`, `${T(2)}summarizeBy: none`, `${T(2)}sourceColumn: Placeholder`, '',
    `${T(2)}annotation SummarizationSetBy = User`, '');
  L.push(`${T()}partition _Measures = m`, `${T(2)}mode: import`, `${T(2)}source =`, `${T(4)}#table(type table [Placeholder = text], {})`, '');
  return L.join('\n') + '\n';
}

// ---------- Post 1: field parameters, calculation group, helper measures ----------
const RED = '#C2410C', GREEN = '#15803D', NEUTRAL = '#1E3A5F';
MEASURES.push(
  ['Post 1', 'Title Trend', '', `VAR _region = IF(HASONEVALUE(Stores[Region]), VALUES(Stores[Region]), "All regions")
RETURN _region & ": total sales " & FORMAT([YoY %], "+0.0%;-0.0%") & " YoY, like-for-like stores " & FORMAT([LFL YoY %], "+0.0%;-0.0%")`],
  // field-parameter display columns can't be read alone (composite key), so look labels up by the Order column
  ['Post 1', 'Selected Metric', '', `SWITCH(SELECTEDVALUE(Metric[Metric Order]), 0, "Net Sales", 1, "YoY %", 2, "LFL YoY %", 3, "Variance to Target %", 4, "Margin %", "Metric")`],
  ['Post 1', 'Selected Breakdown', '', `SWITCH(SELECTEDVALUE(Breakdown[Breakdown Order]), 0, "Region", 1, "Store", 2, "Format", 3, "Category", "breakdown")`],
  ['Post 1', 'Title Breakdown', '', `[Selected Metric] & " by " & LOWER([Selected Breakdown])`],
  ['Post 1', 'Title Matrix', '', `[Selected Metric] & ": all stores vs like-for-like vs new stores"`],
  ['Post 1', 'Metric Color', '', `-- bars: neutral for absolute metrics, red/green for growth and variance metrics
VAR _order = SELECTEDVALUE(Metric[Metric Order], 0)
VAR _v = SWITCH(_order, 1, [YoY %], 2, [LFL YoY %], 3, [Variance to Target %])
RETURN IF(_order IN {0, 4}, "${NEUTRAL}", IF(_v < 0, "${RED}", "${GREEN}"))`],
  ['Post 1', 'Color YoY', '', `IF([YoY %] < 0, "${RED}", "${GREEN}")`],
  ['Post 1', 'Color LFL', '', `IF([LFL YoY %] < 0, "${RED}", "${GREEN}")`],
  ['Post 1', 'Color Var', '', `IF([Variance to Target %] < 0, "${RED}", "${GREEN}")`],
);

MEASURES.push(...POST2_MEASURES, ...POST4_MEASURES);

function fieldParamTmdl(name, rows) {
  const n = q(name), f = q(`${name} Fields`), o = q(`${name} Order`);
  return [
    `table ${n}`, '',
    `${T()}column ${n}`, `${T(2)}dataType: string`, `${T(2)}summarizeBy: none`, `${T(2)}sourceColumn: [Value1]`, `${T(2)}sortByColumn: ${o}`, '',
    `${T(2)}relatedColumnDetails`, `${T(3)}groupByColumn: ${f}`, '', `${T(2)}annotation SummarizationSetBy = Automatic`, '',
    `${T()}column ${f}`, `${T(2)}dataType: string`, `${T(2)}isHidden`, `${T(2)}summarizeBy: none`, `${T(2)}sourceColumn: [Value2]`, `${T(2)}sortByColumn: ${o}`, '',
    `${T(2)}extendedProperty ParameterMetadata =`, `${T(4)}{`, `${T(4)}  "version": 3,`, `${T(4)}  "kind": 2`, `${T(4)}}`, '',
    `${T(2)}annotation SummarizationSetBy = Automatic`, '',
    `${T()}column ${o}`, `${T(2)}dataType: int64`, `${T(2)}isHidden`, `${T(2)}formatString: 0`, `${T(2)}summarizeBy: sum`, `${T(2)}sourceColumn: [Value3]`, '',
    `${T(2)}annotation SummarizationSetBy = Automatic`, '',
    `${T()}partition ${n} = calculated`, `${T(2)}mode: import`, `${T(2)}source =`, `${T(4)}{`,
    ...rows.map(([label, ref], i) => `${T(4)}    ("${label}", NAMEOF(${ref}), ${i})${i < rows.length - 1 ? ',' : ''}`), `${T(4)}}`, '',
  ].join('\n') + '\n';
}
const FIELD_PARAMS = {
  Metric: [['Net Sales', "'_Measures'[Net Sales]"], ['YoY %', "'_Measures'[YoY %]"], ['LFL YoY %', "'_Measures'[LFL YoY %]"], ['Variance to Target %', "'_Measures'[Variance to Target %]"], ['Margin %', "'_Measures'[Margin %]"]],
  Breakdown: [['Region', "'Stores'[Region]"], ['Store', "'Stores'[StoreName]"], ['Format', "'Stores'[Format]"], ['Category', "'Categories'[Category]"]],
};

const CALC_GROUPS = {
  'Store Scope': [
    ['All stores', 'SELECTEDMEASURE()'],
    ['Like-for-like', `-- stores open at least 12 months before the period starts
VAR _cutoff = EDATE(MIN('Calendar'[Date]), -12)
RETURN CALCULATE(SELECTEDMEASURE(), KEEPFILTERS(Stores[OpenDate] <= _cutoff))`],
    ['New stores', `VAR _cutoff = EDATE(MIN('Calendar'[Date]), -12)
RETURN CALCULATE(SELECTEDMEASURE(), KEEPFILTERS(Stores[OpenDate] > _cutoff))`],
  ],
};
function calcGroupTmdl(name, items) {
  const L = [`table ${q(name)}`, '', `${T()}calculationGroup`, `${T(2)}precedence: 10`, ''];
  items.forEach(([item, dax], i) => {
    if (dax.includes('\n')) L.push(`${T(2)}calculationItem ${q(item)} = \`\`\``, ...dax.split('\n').map(l => T(4) + l), `${T(4)}\`\`\``);
    else L.push(`${T(2)}calculationItem ${q(item)} = ${dax}`);
    L.push(`${T(3)}ordinal: ${i}`, '');
  });
  L.push(`${T()}column ${q(name)}`, `${T(2)}dataType: string`, `${T(2)}summarizeBy: none`, `${T(2)}sourceColumn: Name`, `${T(2)}sortByColumn: Ordinal`, '',
    `${T(2)}annotation SummarizationSetBy = Automatic`, '',
    `${T()}column Ordinal`, `${T(2)}dataType: int64`, `${T(2)}isHidden`, `${T(2)}formatString: 0`, `${T(2)}summarizeBy: sum`, `${T(2)}sourceColumn: Ordinal`, '',
    `${T(2)}annotation SummarizationSetBy = Automatic`, '',
    `${T()}partition ${q(name)} = calculationGroup`, '');
  return L.join('\n') + '\n';
}

// ---------- relationships ----------
const RELS = [
  ['Sales', 'OrderDate', 'Calendar', 'Date'], ['Sales', 'StoreID', 'Stores', 'StoreID'], ['Sales', 'ProductID', 'Products', 'ProductID'],
  ['Sales', 'CustomerID', 'Customers', 'CustomerID'], ['Sales', 'PromotionID', 'Promotions', 'PromotionID'],
  ['Returns', 'ReturnDate', 'Calendar', 'Date'], ['Returns', 'StoreID', 'Stores', 'StoreID'], ['Returns', 'ProductID', 'Products', 'ProductID'],
  ['Returns', 'CustomerID', 'Customers', 'CustomerID'],
  ['Targets', 'MonthStart', 'Calendar', 'Date'], ['Targets', 'StoreID', 'Stores', 'StoreID'], ['Targets', 'CategoryID', 'Categories', 'CategoryID'],
  ['Inventory', 'SnapshotDate', 'Calendar', 'Date'], ['Inventory', 'StoreID', 'Stores', 'StoreID'], ['Inventory', 'CategoryID', 'Categories', 'CategoryID'],
  ['Products', 'CategoryID', 'Categories', 'CategoryID'],
];
const relTmdl = RELS.map(([ft, fc, tt, tc]) => [`relationship ${guid(`${ft}.${fc}>${tt}.${tc}`)}`, `${T()}fromColumn: ${q(ft)}.${q(fc)}`, `${T()}toColumn: ${q(tt)}.${q(tc)}`, ''].join('\n')).join('\n') + '\n';

const exprTmdl = [`expression DataFolder = "${DATA}" meta [IsParameterQuery = true, Type = "Text", IsParameterQueryRequired = true]`, '',
  `${T()}annotation PBI_ResultType = Text`, ''].join('\n') + '\n';

// ---------- write ----------
const OWNED = [...TABLES.map(t => t.name), '_Measures', ...Object.keys(FIELD_PARAMS), ...Object.keys(CALC_GROUPS)];
for (const t of TABLES) fs.writeFileSync(path.join(DEF, 'tables', `${t.name}.tmdl`), tableTmdl(t));
fs.writeFileSync(path.join(DEF, 'tables', '_Measures.tmdl'), measuresTmdl());
for (const [n, rows] of Object.entries(FIELD_PARAMS)) fs.writeFileSync(path.join(DEF, 'tables', `${n}.tmdl`), fieldParamTmdl(n, rows));
for (const [n, items] of Object.entries(CALC_GROUPS)) fs.writeFileSync(path.join(DEF, 'tables', `${n}.tmdl`), calcGroupTmdl(n, items));
fs.writeFileSync(path.join(DEF, 'relationships.tmdl'), relTmdl);
fs.writeFileSync(path.join(DEF, 'expressions.tmdl'), exprTmdl);

// patch model.tmdl: table refs, query order, turn off auto date/time
const modelPath = path.join(DEF, 'model.tmdl');
let model = fs.readFileSync(modelPath, 'utf8').replace(/\r\n/g, '\n');
model = model.replace(/^annotation __PBI_TimeIntelligenceEnabled = .*\n/m, '').replace(/^annotation PBI_QueryOrder = .*\n/m, '');
model = model.replace(/^ref table .*\n/gm, '');
// calculation groups require implicit measures to be discouraged
if (!/^\tdiscourageImplicitMeasures/m.test(model)) model = model.replace(/^model (.*)\n/m, 'model $1\n\tdiscourageImplicitMeasures\n');
// drop auto date/time tables Desktop may have created
for (const f of fs.readdirSync(path.join(DEF, 'tables'))) if (/^(LocalDateTable_|DateTableTemplate_)/.test(f)) fs.rmSync(path.join(DEF, 'tables', f));
const anno = `annotation __PBI_TimeIntelligenceEnabled = 0\n\nannotation PBI_QueryOrder = ${JSON.stringify(['DataFolder', ...OWNED])}\n\n`;
const refs = OWNED.map(n => `ref table ${q(n)}`).join('\n') + '\n\n';
const firstRef = model.search(/^ref /m);
model = firstRef >= 0 ? model.slice(0, firstRef) + anno + refs + model.slice(firstRef) : model.trimEnd() + '\n\n' + anno + refs;
model = model.replace(/\n{3,}/g, '\n\n');
fs.writeFileSync(modelPath, model);

console.log(`Wrote ${OWNED.length} tables, ${RELS.length} relationships, ${MEASURES.length} measures into\n  ${DEF}`);
