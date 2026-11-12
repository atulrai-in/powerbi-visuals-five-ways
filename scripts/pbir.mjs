// Tiny helpers for writing Power BI report (PBIR) pages and visuals as JSON.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const SCHEMA = {
  page: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.1.0/schema.json',
  visual: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.0.0/schema.json',
  pages: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/pagesMetadata/1.1.0/schema.json',
};

export const id = s => crypto.createHash('md5').update('bv:' + s).digest('hex').slice(0, 20);

// ---- field references ----
const src = e => ({ Expression: { SourceRef: { Entity: e } } });
export const col = (e, p) => ({ Column: { ...src(e), Property: p } });
export const meas = (e, p) => ({ Measure: { ...src(e), Property: p } });
export const M = p => meas('_Measures', p);
export function proj(field) {
  const k = field.Column ? 'Column' : 'Measure';
  const e = field[k].Expression.SourceRef.Entity, p = field[k].Property;
  return { field, queryRef: `${e}.${p}`, nativeQueryRef: p };
}
export const role = (...fields) => ({ projections: fields.map(proj) });
// field parameter in a field well: `resolved` = the field(s) the parameter currently selects
export const paramRole = (paramField, ...resolved) => ({
  projections: resolved.map(f => ({ ...proj(f), active: true })),
  fieldParameters: [{ parameterExpr: paramField, index: 0, length: resolved.length }],
});
export const queryRef = field => proj(field).queryRef;

// ---- literal/expr values ----
export const lit = v => ({ expr: { Literal: { Value: v } } });
export const str = s => lit(`'${s.replace(/'/g, "''")}'`);
export const num = n => lit(`${n}D`);
export const bool = b => lit(b ? 'true' : 'false');
export const color = hex => ({ solid: { color: str(hex) } });
export const colorExpr = measureField => ({ solid: { color: { expr: measureField } } });
export const exprOf = field => ({ expr: field });

export function inFilter(entity, prop, literalValues) {
  return { filter: { Version: 2, From: [{ Name: 'f', Entity: entity, Type: 0 }],
    Where: [{ Condition: { In: { Expressions: [{ Column: { Expression: { SourceRef: { Source: 'f' } }, Property: prop } }], Values: literalValues.map(v => [{ Literal: { Value: v } }]) } } }] } };
}

// ---- container styling ----
export function card({ title, titleExpr, bg = '#FFFFFF', radius = 10, titleSize = 13, titleColor = '#1F2937', shadow = true } = {}) {
  const o = {
    background: [{ properties: { show: bool(true), color: color(bg), transparency: num(0) } }],
    border: [{ properties: { show: bool(true), color: color('#E5E7EB'), radius: num(radius) } }],
    padding: [{ properties: { top: num(10), bottom: num(10), left: num(14), right: num(14) } }],
    dropShadow: [{ properties: { show: bool(shadow), preset: str('Custom'), shadowSpread: num(0), shadowBlur: num(8), angle: num(90), shadowDistance: num(2), transparency: num(88), color: color('#000000') } }],
  };
  o.subTitle = [{ properties: { show: bool(false) } }];
  if (title || titleExpr) o.title = [{ properties: { show: bool(true), text: titleExpr ? exprOf(titleExpr) : str(title), fontSize: num(titleSize), fontColor: color(titleColor), bold: bool(true) } }];
  else o.title = [{ properties: { show: bool(false) } }];
  return o;
}

// ---- writers ----
export function writeVisual(pageDir, v) {
  const name = v.name;
  const dir = path.join(pageDir, 'visuals', name);
  fs.mkdirSync(dir, { recursive: true });
  const body = {
    $schema: SCHEMA.visual,
    name,
    position: { x: v.x, y: v.y, z: v.z ?? 0, width: v.w, height: v.h, tabOrder: v.z ?? 0 },
    visual: {
      visualType: v.type,
      ...(v.query ? { query: v.query } : {}),
      ...(v.objects ? { objects: v.objects } : {}),
      ...(v.container ? { visualContainerObjects: v.container } : {}),
      drillFilterOtherVisuals: true,
    },
    ...(v.filterConfig ? { filterConfig: v.filterConfig } : {}),
  };
  fs.writeFileSync(path.join(dir, 'visual.json'), JSON.stringify(body, null, 2) + '\n');
}

export function writePage(reportDir, page, visuals, { replaceAll = false } = {}) {
  const pagesDir = path.join(reportDir, 'definition', 'pages');
  const meta = JSON.parse(fs.readFileSync(path.join(pagesDir, 'pages.json'), 'utf8'));
  const stale = replaceAll ? meta.pageOrder.filter(p => p !== page.name) : [];
  if (replaceAll) meta.pageOrder = meta.pageOrder.filter(p => p === page.name);
  // overwrite in place (never delete-then-write) so Desktop's auto-reload never sees a missing page
  const pageDir = path.join(pagesDir, page.name);
  fs.mkdirSync(path.join(pageDir, 'visuals'), { recursive: true });
  const keep = new Set(visuals.map(v => v.name));
  for (const d of fs.readdirSync(path.join(pageDir, 'visuals'))) if (!keep.has(d)) fs.rmSync(path.join(pageDir, 'visuals', d), { recursive: true, force: true });
  const body = { $schema: SCHEMA.page, name: page.name, displayName: page.displayName, displayOption: 'FitToPage', height: page.height ?? 1080, width: page.width ?? 1920 };
  if (page.background) body.objects = { background: [{ properties: { color: color(page.background), transparency: num(0) } }] };
  // Edit interactions: [{ source, target, type: 'NoFilter' | 'DataFilter' | 'HighlightFilter' | 'Default' }]
  if (page.interactions?.length) body.visualInteractions = page.interactions;
  fs.writeFileSync(path.join(pageDir, 'page.json'), JSON.stringify(body, null, 2) + '\n');
  visuals.forEach((v, i) => writeVisual(pageDir, { z: i * 1000, ...v }));
  if (!meta.pageOrder.includes(page.name)) meta.pageOrder.push(page.name);
  meta.activePageName = page.name;
  meta.$schema = SCHEMA.pages;
  fs.writeFileSync(path.join(pagesDir, 'pages.json'), JSON.stringify(meta, null, 2) + '\n');
  for (const p of stale) fs.rmSync(path.join(pagesDir, p), { recursive: true, force: true }); // only after pages.json no longer points at them
  return pageDir;
}

// visual-level filter: exclude values of a column
export function notInFilter(name, entity, prop, literalValues) {
  return { name, field: col(entity, prop), type: 'Categorical',
    filter: { Version: 2, From: [{ Name: 'f', Entity: entity, Type: 0 }],
      Where: [{ Condition: { Not: { Expression: { In: { Expressions: [{ Column: { Expression: { SourceRef: { Source: 'f' } }, Property: prop } }], Values: literalValues.map(v => [{ Literal: { Value: v } }]) } } } } }] } };
}
