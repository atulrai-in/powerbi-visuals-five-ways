// Deneb (AppSource) visual helper for PBIR pages.
// IDs and property names were read from Deneb 2.0.1's own capabilities (see NOTES.md, "Deneb lessons").
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { proj, str, num, bool, card } from './pbir.mjs';

export const DENEB = { guid: 'deneb7E15AEF80B9E4D4F8E12924291ECE89A', version: '2.0.1.0', vegaLite: '6.4.3' };
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'deneb');
const readJson = f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));

// Desktop only writes publicCustomVisuals on save, so register the visual ourselves (idempotent)
export function registerDeneb(reportDir) {
  const file = path.join(reportDir, 'definition', 'report.json');
  const report = JSON.parse(fs.readFileSync(file, 'utf8'));
  if ((report.publicCustomVisuals ?? []).includes(DENEB.guid)) return;
  report.publicCustomVisuals = [...(report.publicCustomVisuals ?? []), DENEB.guid];
  fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
}

// selection: true = clicking a mark cross-filters the page (simple mode; rows get __selected__)
// highlight: true = accept cross-highlights; each measure gets a '<measure>__highlight' field
export function denebVisual({ name, x, y, w, h, title, titleExpr, fields, specFile, configFile = 'post3.config.json', selection = false, highlight = false, titleColor = '#1E3A5F' }) {
  return {
    name, type: DENEB.guid, x, y, w, h,
    query: { queryState: { dataset: { projections: fields.map(proj) } } },
    objects: {
      vega: [{ properties: {
        provider: str('vegaLite'),
        version: str(DENEB.vegaLite),
        jsonSpec: str(JSON.stringify(readJson(specFile), null, 2)),
        jsonConfig: str(JSON.stringify(readJson(configFile), null, 2)),
        renderMode: str('svg'),
        enableTooltips: bool(true),
        enableContextMenu: bool(true),
        enableSelection: bool(selection),
        ...(selection ? { selectionMode: str('simple'), selectionMaxDataPoints: num(50) } : {}),
        enableHighlight: bool(highlight),
      } }],
      developer: [{ properties: { version: str(DENEB.version) } }],
    },
    container: card({ title, titleExpr, titleSize: 15, titleColor }),
  };
}
