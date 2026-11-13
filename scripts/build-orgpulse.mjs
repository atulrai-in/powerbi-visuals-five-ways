// 14.2 Org Pulse: the report page. KPI cards read the disconnected 'As Of' table; the Org Pulse visual
// filters it when playback pauses (hybrid time control), so the cards follow the visual.
// All visual fields come from OrgTimeline (Person Name / Team Name / Region / Title / Target Span are RELATED columns):
// fields from several tables plus an always-non-blank measure would cross-join.
// Run: (cd visuals/orgPulse && npx pbiviz package), close Desktop, node scripts/build-model.mjs, node scripts/build-orgpulse.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { id, col, M, proj, card, writePage, str, bool } from './pbir.mjs';
import { registerPbiviz } from './custom-visual.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = path.join(ROOT, 'Brightvale Retail.Report');
const DIST = path.join(ROOT, 'visuals', 'orgPulse', 'dist');
const PBIVIZ = fs.readdirSync(DIST).filter(f => f.endsWith('.pbiviz')).map(f => path.join(DIST, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
const { guid: OP, version } = registerPbiviz(REPORT, PBIVIZ);
console.log(`Registered ${OP} v${version}`);

const PAGE = 'orgpulse';
const OLD = 'orgpulseSpike';
const v = s => id(`${PAGE}:${s}`);
const T = 'OrgTimeline';
const c = name => ({ projections: [proj(col(T, name))] });

const KPIS = [['asof', 'As Of Label'], ['heads', 'Headcount'], ['open', 'Open Roles'], ['staffed', 'Staffed %'], ['attr', 'Attrition % 12m'], ['hires', 'Hires 90d']];
const W = 298, GAP = 16, X0 = 24;
const visuals = [
  ...KPIS.map(([key, measure], k) => ({
    name: v(key), type: 'card', x: X0 + k * (W + GAP), y: 20, w: W, h: 110,
    query: { queryState: { Values: { projections: [proj(M(measure))] } } },
    container: card(), // no container title: the card's own label already names the measure (both didn't fit in 110 px)
  })),
  {
    name: v('pulse'), type: OP, x: X0, y: 146, w: 1872, h: 912,
    query: { queryState: {
      position: c('PositionID'), reportsTo: c('ReportsToPositionID'), person: c('PersonID'), name: c('Person Name'),
      validFrom: c('ValidFrom'), validTo: c('ValidTo'), team: c('Team Name'), group: c('Region'), title: c('Title'),
      status: c('Status'), reason: c('ChangeReason'), fte: c('FTE'), targetSpan: c('Target Span'),
      asOfPage: { projections: [proj(M('As Of Date'))] },
    } },
    objects: { display: [{ properties: { title: str('Brightvale · Sales organisation') } }], sync: [{ properties: { enabled: bool(true) } }] },
    container: card({ bg: '#0C1324', radius: 14 }),
  },
];
const dir = writePage(REPORT, { name: PAGE, displayName: '14.2 · Org Pulse', background: '#F3F4F6' }, visuals);
console.log(`Wrote ${visuals.length} visuals to ${dir}`);

// retire the as-of sync spike page (its test role no longer exists in the visual)
const pagesDir = path.join(REPORT, 'definition', 'pages');
const metaFile = path.join(pagesDir, 'pages.json');
const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
if (meta.pageOrder.includes(OLD)) {
  meta.pageOrder = meta.pageOrder.filter(p => p !== OLD);
  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2) + '\n');
  fs.rmSync(path.join(pagesDir, OLD), { recursive: true, force: true });
  console.log(`Removed the spike page (${OLD})`);
}
