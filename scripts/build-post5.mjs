// Post 5: a real custom visual. "Demand vs Stock" is written in TypeScript + D3 (visuals/demandVsStock)
// and packaged as a .pbiviz. This page uses it for story #3: Beauty is growing fast and can't stay in stock.
// Run: (cd visuals/demandVsStock && npx pbiviz package), then node scripts/build-post5.mjs.
// The script registers the packaged visual in the report itself (no manual import needed). Restart Desktop after a new package.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { id, col, M, proj, bool, card, writePage } from './pbir.mjs';
import { registerPbiviz } from './custom-visual.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = path.join(ROOT, 'Brightvale Retail.Report');
const INK = '#1E3A5F', MUTED = '#6B7280', BG = '#F3F4F6';
const PAGE = 'post5pbiviz';
// newest package from visuals/demandVsStock/dist (run npx pbiviz package there first)
const DIST = path.join(ROOT, 'visuals', 'demandVsStock', 'dist');
const PBIVIZ = fs.readdirSync(DIST).filter(f => f.endsWith('.pbiviz')).map(f => path.join(DIST, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
if (!PBIVIZ) throw new Error('No .pbiviz in ' + DIST + ': run npx pbiviz package in visuals/demandVsStock');
const { guid: DVS, version } = registerPbiviz(REPORT, PBIVIZ);
console.log(`Registered custom visual ${DVS} v${version}`);
const v = s => id(`${PAGE}:${s}`);

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
      para(textRun('Our fastest-growing category is the one we can\'t keep on the shelf', { fontWeight: 'bold', fontSize: '26pt', color: INK, fontFamily: 'Segoe UI Semibold' })),
      para(textRun('Brightvale Stores · "Demand vs Stock", a custom visual written in TypeScript and D3 and packaged as a .pbiviz. Drop in five fields and it draws the rest.', { color: MUTED })),
    ] } }] },
    container: { background: [{ properties: { show: bool(false) } }], title: [{ properties: { show: bool(false) } }] },
  },
  {
    name: v('dvs'), type: DVS, x: 40, y: 108, w: 1440, h: 680,
    query: { queryState: {
      category: { projections: [proj(col('Categories', 'Category'))] },
      month: { projections: [proj(col('Calendar', 'MonthYear'))] },
      sales: { projections: [proj(M('Net Sales'))] },
      cover: { projections: [proj(M('Avg Weeks of Cover'))] },
      stockouts: { projections: [proj(M('Avg Stockout Days'))] },
    } },
    container: card({ title: 'Demand vs stock by category, Jan 2023 – Oct 2026 · click a row to filter, hover a bar for the month', titleSize: 15, titleColor: INK }),
  },
  textbox('why', 40, 804, 1440, 256, [
    para(textRun('Why a custom visual, when Deneb exists?', { fontWeight: 'bold', fontSize: '14pt', color: INK })),
    gap(),
    para(b('It\'s reusable by people who don\'t write code.'), textRun(' Five named field wells (Category, Month, Sales, Weeks of cover, Stockout days), and thresholds, colours and sort order in the Format pane. No JSON to edit.')),
    gap(),
    para(b('It behaves like a native visual.'), textRun(' Click a row to cross-filter the page, right-click for the usual menu, tooltips on every bar, and a landing message until the fields are filled in.')),
    gap(),
    para(b('It ships as one 28 KB file.'), textRun(' Import the .pbiviz into any report, or publish it to your organisation\'s visuals so everyone gets the same version.')),
  ]),
  textbox('says', 1500, 108, 380, 440, [
    para(textRun('What it says', { fontWeight: 'bold', fontSize: '14pt', color: INK })),
    gap(),
    para(b('Beauty'), textRun(' sales grew 50% in 2025 and are still up 36% on the year before. No other category grew more than 10%.')),
    gap(),
    para(b('The stock didn\'t follow.'), textRun(' Beauty carries 2.1 weeks of cover, against about 5 everywhere else, and is out of stock 6.4 days a month (other categories: under 1).')),
    gap(),
    para(b('Red from January 2025'), textRun(': every month since, Beauty ended with less than 3 weeks of stock.')),
  ]),
  textbox('trick', 1500, 564, 380, 496, [
    para(textRun('The trick', { fontWeight: 'bold', fontSize: '14pt', color: INK })),
    gap(),
    para(textRun('The drawing is plain D3. The Power BI part is small: read the data view, and turn a click into a selection.')),
    gap(),
    code('const id = host.createSelectionIdBuilder()'),
    code('  .withCategory(categoryColumn, i)'),
    code('  .createSelectionId();'),
    gap(),
    code('row.on("click", e =>'),
    code('  selectionManager.select(id,'),
    code('    e.ctrlKey || e.metaKey));'),
    gap(),
    para(textRun('Packaging is one command: ', { color: MUTED }), textRun('pbiviz package', { fontFamily: 'Consolas', fontSize: '11pt', color: INK })),
  ]),
];

const dir = writePage(REPORT, { name: PAGE, displayName: 'Post 5 · Custom visual', background: BG }, visuals);
console.log(`Wrote ${visuals.length} visuals to ${dir}`);
