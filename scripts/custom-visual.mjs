// Register a private custom visual (.pbiviz) in a PBIR report, the way Desktop does on "Import a visual from a file" + save:
//   <Report>/CustomVisuals/<guid>/package.json
//   <Report>/CustomVisuals/<guid>/resources/<guid>.pbiviz.json
//   report.json resourcePackages += { name: <guid>, type: "CustomVisual", items: [{ <guid>.pbiviz.json, CustomVisualMetadata }] }
// A .pbiviz is a zip of exactly those two files, so this unzips it (zlib only, no dependencies).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function unzip(file) {
  const buf = fs.readFileSync(file);
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error(`${file} is not a zip`);
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16); // central directory offset
  const out = {};
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    out[name] = method === 8 ? zlib.inflateRawSync(data) : data;
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

export function registerPbiviz(reportDir, pbivizFile) {
  const files = unzip(pbivizFile);
  const pkg = JSON.parse(files['package.json'].toString('utf8'));
  const guid = pkg.visual.guid;
  const dir = path.join(reportDir, 'CustomVisuals', guid);
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith('/')) continue; // folder entry
    const target = path.join(dir, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(JSON.parse(data.toString('utf8')), null, 2)); // Desktop stores them pretty-printed
  }
  const reportFile = path.join(reportDir, 'definition', 'report.json');
  const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  const entry = { name: guid, type: 'CustomVisual', items: [{ name: `${guid}.pbiviz.json`, path: `${guid}.pbiviz.json`, type: 'CustomVisualMetadata' }] };
  report.resourcePackages = [...(report.resourcePackages ?? []).filter(r => r.name !== guid), entry];
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
  return { guid, version: pkg.version };
}
